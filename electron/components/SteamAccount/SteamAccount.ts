import RequestPromise from "../Request/Request";
import SteamAccountInterface from "../../interfaces/SteamAccount/SteamAccountInterface";
import SteamAccountSetupInterface from "../../interfaces/SteamAccount/SteamAccountSetupInterface";
import SteamAccountStorage from "../newStorage/SteamAccountStorage";
import { v4 as uuidv4 } from 'uuid';
import SmaFile from "../../interfaces/SteamAccount/SmaFileInterface";
import ChangableSecondaryInterface from "../../interfaces/SteamAccount/ChangableSecondaryInterface";
import steamAccountManager from "./steamAccountManager";
import SteamCommunity from "steamcommunity";
import Session from "../../interfaces/SteamAccount/SessionInterface";
import { getAccountData, getChangableSecondaries, AccountData } from './Processes/loadSteamAccountData';
import type { MobileConfirmation, MobileConfirmationRef, MobileConfirmationResult } from "../../interfaces/SteamAccount/MobileConfirmationInterface";
import { fetchConfirmations, respondToConfirmations } from "./Functions/mobileConfirmations";
import ProxyInterface from "../../interfaces/Proxy/ProxyInterface";
import buildProxyUrl from "../Proxy/proxyUrl";
import ProxyUnavailableError from "../Proxy/ProxyUnavailableError";
import { blockedAgent, blockedSession } from "../Proxy/blockedTransport";
import { ProxyState } from "../../interfaces/Proxy/ProxyState";
import request from "request";
import boundedRequest from "../Request/boundedRequest";
import Manager from "../Manager/Manager";
import askFamilyPin from "../application/askInfo/askFamilyPin";
import Chrome from './Chrome/Chrome';
import { EAuthSessionGuardType, LoginSession } from "steam-session";
import createLoginSession from "../Proxy/loginSession";
import maFileLogin from "./Processes/maFileLogin";
import getCommunityWebCookies from "./Functions/getCommunityWebCookies";
import { STEAM_MOBILE_USER_AGENT, STEAM_WEB_HEADERS } from "./Functions/steamUserAgent";
import askMailCode from "../application/askInfo/askMailCode";
import SessionInterface from "../../interfaces/SteamAccount/SessionInterface";
import stripLegacyMarketData from "../Functions/stripLegacyMarketData";
import sanitizeSmaFile from "../Functions/sanitizeSmaFile";
import { t } from "../../i18n";
import application from "../application/application";
import SteamAccountChannels from "../../interfaces/IpcChannels/SteamAccountChannels";
import notifyBrowserRouteChanged from "./Chrome/notifyBrowserRouteChanged";
import { isDeadTokenError, isRefreshTokenExpired } from "./Functions/sessionExpiry";
import { errorText, isStaleOperation, SessionExpiredError, StaleOperationError } from "./Functions/accountErrors";
import TaskQueue from "../Functions/taskQueue";
import withDeadline from "../Functions/withDeadline";
const SteamTotp = require('steam-totp');

// Сколько аккаунтов одновременно входят в Steam и сколько одновременно обновляются (SDA-61).
// Общие на приложение: список из 43 аккаунтов на старте, массовые действия и кнопки в строках
// идут через одни и те же места.
export const ACCOUNT_LIMITS = { logins: 5, passwordLogins: 5, dataLoads: 4 };
const loginQueue = new TaskQueue(ACCOUNT_LIMITS.logins);
// Отдельно от входов по токенам: вход по паролю может ждать код из письма
const passwordQueue = new TaskQueue(ACCOUNT_LIMITS.passwordLogins);
const dataQueue = new TaskQueue(ACCOUNT_LIMITS.dataLoads);
// Объект, а не константы: тесты подменяют сроки.
export const SESSION_TIMING = {
    // Вход по сохранённым токенам целиком: у steam-session нет общего срока на ответ
    loginMs: 60_000,
    // Не повторять неудачный вход сразу же (например, сразу после «Перезагрузить все данные»)
    retryFloorMs: 15_000,
    // Вход по паролю целиком, вместе с ожиданием кода из письма: место в очереди не занимают навсегда
    passwordLoginMs: 5 * 60_000,
    // Сколько чтение данных ждёт входа (очередь на старте из десятков аккаунтов укладывается)
    waitForLoginMs: 3 * 60_000,
    // Сколько окно подтверждений ждёт входа: очередь, прокси или неотвеченный запрос кода из письма
    confirmationsWaitMs: 40_000,
};

/**
 * Попытка входа. У аккаунта в каждый момент одна: новая отменяет прежнюю, а всё, что прежняя получит
 * потом (cookie, токены), уже никому не принадлежит и не применяется.
 */
interface LoginAttempt {
    kind: "tokens" | "password";
    /** Место в очереди входов: у каждой попытки своё */
    queueKey: object;
    settled: boolean;
    promise: Promise<void>;
    cancel(): void;
}

const loginTimedOut = () => Object.assign(new Error(t("errors.loginTimedOut")), { code: "LOGIN_TIMED_OUT" });

class SteamAccount {
    params: SteamAccountInterface;
    setupParams: SteamAccountSetupInterface;
    community: SteamCommunity;
    isAskingFamilyPin: boolean;
    chrome: Chrome;
    session: LoginSession;
    proxy: ProxyInterface | null;
    proxyState: ProxyState;
    proxyId: string | null;
    private routeKey: string;
    // Последняя попытка входа (SDA-59, SDA-61): обновление данных ждёт её, иначе запросы шли бы
    // параллельно со входом со старыми cookie. Об ошибке сообщает тот, кто вход запустил.
    private login: LoginAttempt | null = null;
    sessionError: unknown = null;
    private sessionFailedAt = 0;
    // Номер маршрута: клиенты прежнего маршрута запросов больше не шлют
    private route = 0;
    // Растёт, когда начатые загрузки становятся не нужны: сменился маршрут, архив, удаление
    private operations = 0;
    // Порядок загрузок: результат, начатый раньше уже записанного, не записывается поверх него
    private loadTicket = 0;
    private written = { full: 0, balance: 0 };
    // Одинаковые запросы данных, которые уже в пути, не дублируем
    private readonly inFlight = new Map<string, { operations: number, login: LoginAttempt | null, promise: Promise<unknown> }>();

    constructor(params: SteamAccountInterface) {
        params = stripLegacyMarketData(params);
        this.setupParams = {
            accountName: params.accountName,
            password: params.password,
            maFile: params.maFile,
            familyViewPin: params.familyViewPin,
            useSteamCookies: params.useSteamCookies
        };
        this.chrome = new Chrome(params);
        this.params = params;

        this.isAskingFamilyPin = false;
        // Прокси резолвим ДО создания сетевых клиентов: если он привязан, ни один
        // клиент не должен ни на мгновение существовать в "прямом" виде.
        const links = Manager.GetSteamAccountLinkedData(this.params.id);
        this.proxy = links.proxy;
        this.proxyState = links.proxyState;
        this.proxyId = links.proxyId;
        this.routeKey = this.resolvedRouteKey(links);
        this.session = this.buildSession();
        this.community = this.buildCommunity();
    }


    /**
     * Вход по сохранённым токенам для загрузки списка, смены прокси и восстановления из архива.
     * Архивный аккаунт в Steam не ходит (SDA-59): раньше «Перезагрузить все данные» входила во все
     * архивные аккаунты, и просроченные токены давали «AccessDenied» про скрытые аккаунты.
     * Вход, который уже идёт (в том числе по паролю), не заменяется: ждём его.
     */
    startSession(urgent: boolean = false): Promise<void> {
        if (this.params.deleted) return Promise.resolve();
        if (this.login && !this.login.settled) {
            if (urgent) loginQueue.promote(this.login.queueKey);
            return this.login.promise;
        }
        return this.beginLogin("tokens", (isLive, cancelled, queueKey) => loginQueue.run(() => {
            if (!isLive()) return cancelled;
            return Promise.race([cancelled,
                withDeadline(this.initSession(isLive), SESSION_TIMING.loginMs, loginTimedOut)]);
        }, { urgent, key: queueKey }));
    }
    /** startSession для мест, где ждать нечего: ошибка уходит в окно. */
    startSessionInBackground(): void {
        this.startSession().catch(err => {
            if (isStaleOperation(err)) return;
            application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, { id: this.params.id, err: errorText(err) });
        });
    }

    private beginLogin(kind: LoginAttempt["kind"],
        run: (isLive: () => boolean, cancelled: Promise<never>, queueKey: object) => Promise<void>): Promise<void> {
        this.login?.cancel();
        let reject!: (err: Error) => void;
        const cancelled = new Promise<never>((_, rej) => { reject = rej; });
        cancelled.catch(() => undefined);
        const login: LoginAttempt = {
            kind, queueKey: {}, settled: false, promise: Promise.resolve(),
            cancel: () => {
                if (login.settled) return;
                login.settled = true;
                reject(new StaleOperationError());
            },
        };
        this.login = login;
        const isLive = () => this.login === login && !login.settled;
        login.promise = Promise.race([run(isLive, cancelled, login.queueKey), cancelled]).then(
            () => {
                login.settled = true;
                if (this.login === login) this.setSessionError(null);
            },
            (err) => {
                login.settled = true;
                if (this.login === login && !isStaleOperation(err)) {
                    this.sessionFailedAt = Date.now();
                    this.setSessionError(err);
                }
                throw err;
            },
        );
        login.promise.catch(() => undefined);
        return login.promise;
    }

    private setSessionError(err: unknown) {
        if (err === null && this.sessionError === null) return;
        this.sessionError = err;
        application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_SESSION_STATE, {
            id: this.params.id, sessionError: this.sessionErrorText()
        });
    }
    /** Текст последней ошибки входа для строки таблицы; null — вход удался или его не было. */
    sessionErrorText(): string | null {
        return this.sessionError === null ? null : errorText(this.sessionError);
    }
    private startNewRoute() {
        this.route++;
        this.invalidateOperations();
        this.setSessionError(null);
    }
    /** Всё начатое больше не нужно: сменился маршрут, аккаунт ушёл в архив или удалён. */
    invalidateOperations() {
        this.operations++;
        this.login?.cancel();
        this.login = null;
        // Останавливает опрос входа по паролю, сам он об этом не сообщает
        this.session.cancelLoginAttempt?.();
    }

    /**
     * Перед запросами к Steam: дождаться входа, а неудачный повторить (прокси мог не работать на
     * старте, и раньше аккаунт оставался без сессии до ручного входа). Мёртвый токен не повторяем.
     */
    private async ensureSession(urgent: boolean): Promise<void> {
        // Вход ещё ждёт своей очереди за десятками других, а человек уже открыл этот аккаунт
        if (urgent && this.login) loginQueue.promote(this.login.queueKey);
        // Пока ждали один вход, его мог заменить другой (по паролю). Вход по паролю может ждать код из
        // письма сколько угодно: чтение данных ждёт его ограниченно и место никому не держит.
        await withDeadline((async () => {
            while (this.login && !this.login.settled) await this.login.promise.catch(() => undefined);
        })(), SESSION_TIMING.waitForLoginMs, loginTimedOut);
        if (this.sessionError !== null && !(this.sessionError instanceof SessionExpiredError)
            && Date.now() - this.sessionFailedAt >= SESSION_TIMING.retryFloorMs) {
            await this.startSession(urgent).catch(() => undefined);
        }
        // Cookie прежнего удачного входа этого же клиента ещё могут действовать: тогда решает Steam
        if (this.sessionError !== null && !this.community.steamID) throw this.sessionError;
    }

    async initSession(isLive: () => boolean = () => true) {
        this.proxyUrl();
        const saved = this.params.maFile.Session;
        const refreshToken = saved?.RefreshToken;
        // Без refresh-токена входить нечем: раньше это молча считалось удачным входом
        if (!refreshToken) throw new SessionExpiredError(t("errors.sessionMissing"));
        // Просроченный по exp токен Steam всё равно отвергнет: не отправляем его вовсе
        if (isRefreshTokenExpired(refreshToken)) throw new SessionExpiredError();
        const { session, community } = this;
        if (saved.AccessToken) session.accessToken = saved.AccessToken;
        session.refreshToken = refreshToken;
        try {
            await session.refreshAccessToken();
        } catch (err) {
            // Отозванный токен (смена пароля, выход на всех устройствах) — та же история
            if (isDeadTokenError(err)) throw new SessionExpiredError();
            throw err;
        }
        await this.setCommunityCookies(
            isLive, community, session,
            session.refreshToken,
            session.steamID ? session.steamID.getSteamID64() : null
        );
    }

    /** Маршрут на момент вызова; бросает, если он уже другой. Проверяется перед каждым шагом. */
    captureRoute(): () => void {
        const { route } = this;
        return () => { if (this.route !== route) throw new StaleOperationError(); };
    }
    async getBrowserCookies(): Promise<string[]> {
        const proxyUrl = this.proxyUrl();
        const assertRoute = this.captureRoute();
        const refreshToken = this.params.maFile.Session ? this.params.maFile.Session.RefreshToken : undefined;
        if (!refreshToken) return [];

        // steamID нужен для settoken; берём из JWT refresh-токена
        const { session } = this;
        session.refreshToken = refreshToken;
        const steamID = session.steamID ? session.steamID.getSteamID64() : null;

        // Основной путь: получаем cookie именно для steamcommunity.com (aud: web:community)
        if (steamID) {
            try {
                return await getCommunityWebCookies(refreshToken, steamID, proxyUrl, assertRoute);
            } catch (err) {
                console.log(`${this.params.id} - getCommunityWebCookies failed, fallback to getWebCookies: ${err}`);
            }
        }

        // Фолбэк: старый путь (cookie случайного домена)
        try {
            return await withDeadline((async () => {
                assertRoute();
                await session.refreshAccessToken();
                assertRoute();
                return session.getWebCookies();
            })(), SESSION_TIMING.loginMs, loginTimedOut);
        } catch (err) {
            // Сменился прокси: запускать браузер со старыми cookie нельзя
            if (isStaleOperation(err)) throw err;
            console.log(`${this.params.id} - cant get web cookies for browser: ${err}`);
            return [];
        }
    }

    // Устанавливает в this.community cookie именно для steamcommunity.com (aud: web:community).
    // steamLoginSecure доменно-специфичен. session.getWebCookies() возвращает cookie СЛУЧАЙНОГО
    // домена (promiseAny — кто первый ответил), и через прокси гонка чаще выигрывается не-community
    // доменом → getConfirmations()/loggedIn() = "Not Logged In". Поэтому повторяем целевой поток
    // finalizelogin -> settoken через getCommunityWebCookies, с фолбэком на старый путь.
    // Клиенты и владельца передаём явно: пока идёт обмен, у аккаунта мог смениться прокси, а попытка
    // входа — закончиться по сроку. Cookie такой попытки не должны попасть в клиент (SDA-61).
    private async setCommunityCookies(isLive: () => boolean, community: SteamCommunity, session: LoginSession, refreshToken?: string, steamID64?: string | null): Promise<void> {
        const proxyUrl = this.proxyUrl();
        const assertLive = () => {
            if (this.community !== community || !isLive()) throw new StaleOperationError();
        };
        assertLive();
        let cookies: string[] | null = null;
        if (refreshToken && steamID64) {
            try {
                cookies = await getCommunityWebCookies(refreshToken, steamID64, proxyUrl, assertLive);
            } catch (err) {
                console.log(`${this.params.id} - getCommunityWebCookies failed, fallback to getWebCookies: ${err}`);
            }
        }
        assertLive();
        if (!cookies) cookies = await session.getWebCookies();
        assertLive();
        community.setCookies(cookies);
    }
    /** URL привязанного прокси или null. Единственный источник для всех клиентов аккаунта. */
    proxyUrl(): string | null {
        if (this.proxyState === "missing") throw new ProxyUnavailableError(this.proxyId);
        return buildProxyUrl(this.proxy);
    }
    // steam-session запрещает повторный запуск логина на одном и том же LoginSession
    // ("A session has already been started on this LoginSession object"), поэтому
    // перед каждым логином нужен свежий объект — с текущим прокси, если он привязан.
    private buildSession(): LoginSession {
        if (this.proxyState === "missing") return blockedSession(this.proxyId);
        return createLoginSession(this.proxyUrl(), this.captureRoute());
    }
    private buildCommunity(): SteamCommunity {
        if (this.proxyState === "missing") {
            const community = new SteamCommunity({
                request: request.defaults({ agent: blockedAgent(this.proxyId), proxy: null, headers: STEAM_WEB_HEADERS }),
                userAgent: STEAM_MOBILE_USER_AGENT
            });
            const proxyId = this.proxyId;
            // Surface the routing error before library retries or HTTP interception.
            return Object.assign(community, {
                onPreHttpRequest: (_id: number, _source: string, _options: unknown, callback: (err: Error) => void) => {
                    callback(new ProxyUnavailableError(proxyId));
                    return true;
                }
            });
        }
        const proxyUrl = this.proxyUrl();
        // Редирект request выполняет сам, мимо onPreHttpRequest: после смены прокси за ним не идём
        const assertRoute = this.captureRoute();
        const followRedirect = () => {
            try { assertRoute(); return true; } catch { return false; }
        };
        const req = proxyUrl
            ? boundedRequest({ proxy: proxyUrl, headers: STEAM_WEB_HEADERS, followRedirect })
            : boundedRequest({ headers: STEAM_WEB_HEADERS, followRedirect });
        const community = new SteamCommunity({ request: req, userAgent: STEAM_MOBILE_USER_AGENT });
        // Клиент, который уже заменён (сменился прокси), запросов больше не шлёт: обновление из
        // нескольких запросов раньше доводило остальные старым маршрутом (SDA-61).
        return Object.assign(community, {
            onPreHttpRequest: (_id: number, _source: string, _options: unknown, callback: (err: Error) => void) => {
                // Архивный аккаунт в Steam тоже не ходит
                if (this.community === community && !this.params.deleted) return false;
                callback(new StaleOperationError());
                return true;
            }
        });
    }
    reloadParams(params: SteamAccountInterface) {
        this.params = stripLegacyMarketData(params);
        this.setupParams = {
            accountName: this.params.accountName, password: this.params.password,
            maFile: this.params.maFile, familyViewPin: this.params.familyViewPin,
            useSteamCookies: this.params.useSteamCookies
        };
        this.chrome.params = this.params;
        return this.setProxy();
    }
    private resolvedRouteKey(links: ReturnType<typeof Manager.GetSteamAccountLinkedData>) {
        return `${links.proxyState}:${links.proxyState === "ok" ? buildProxyUrl(links.proxy) : ""}`;
    }
    setProxy() {
        const links = Manager.GetSteamAccountLinkedData(this.params.id);
        const routeKey = this.resolvedRouteKey(links);
        this.proxy = links.proxy;
        this.proxyId = links.proxyId;
        if (routeKey === this.routeKey) return false;
        this.proxyState = links.proxyState;
        this.routeKey = routeKey;
        this.stopBrowserForRouteChange();
        this.startNewRoute();
        try {
            this.session = this.buildSession();
            this.community = this.buildCommunity();
        } catch (err) {
            // Never retain a previously direct client if rebuilding the route fails.
            this.blockProxy();
            throw err;
        }
        if (this.proxyState !== "missing") this.startSessionInBackground();
        return true;
    }
    private stopBrowserForRouteChange() {
        // A launch in progress is cancelled too; Chromium cannot switch routes live.
        if (this.chrome.workStatus !== "notworking" || this.chrome.browser) {
            this.chrome.stop("routeChanged").catch(err => console.log(`Browser stop after route change: ${String(err)}`));
            notifyBrowserRouteChanged();
        }
    }
    blockProxy() {
        this.stopBrowserForRouteChange();
        this.startNewRoute();
        // Сначала закрыть сеть: чтение связей тоже может упасть
        this.proxy = null;
        this.proxyState = "missing";
        this.routeKey = "missing:";
        this.session = blockedSession(this.proxyId);
        this.community = this.buildCommunity();
        this.proxyId = Manager.GetSteamAccountLinkedData(this.params.id).proxyId;
    }

    /** Вход по паролю. Второе нажатие, пока вход идёт, ждёт тот же вход: код из письма один. */
    loginByPassword(): Promise<void> {
        if (this.login && !this.login.settled && this.login.kind === "password") return this.login.promise;
        return this.beginLogin("password", (isLive, cancelled) => passwordQueue.run(() => {
            if (!isLive()) return cancelled;
            return Promise.race([cancelled,
                withDeadline(this.runPasswordLogin(isLive), SESSION_TIMING.passwordLoginMs, loginTimedOut)]);
        }));
    }
    private runPasswordLogin(isLive: () => boolean): Promise<void> {
        return new Promise(async (resolve, reject) => {
            // Весь блок в try/catch: без него ошибка внутри async-исполнителя (мёртвый прокси,
            // 429, битый shared_secret) не реджектит промис, и обновление сессии висит вечно.
            try {
                // Свежий LoginSession на каждый логин: старый после первой попытки больше
                // не принимает startWithCredentials, см. buildSession.
                this.proxyUrl();
                const session = this.buildSession();
                const { community } = this;
                this.session = session;

                // Листенеры вешаем ДО startWithCredentials: событие может прийти сразу.
                // once — чтобы они не накапливались на повторных логинах.
                session.once("error", (err) => {
                    reject(err);
                });
                session.once("timeout", () => {
                    reject("timeout");
                });
                session.once("authenticated", async () => {
                    try {
                        const accessToken = session.accessToken;
                        const refreshToken = session.refreshToken;
                        const steamID = session.steamID;
                        // Берём cookie именно для steamcommunity.com (aud: web:community), иначе confirmations
                        // упадут с "Not Logged In" (особенно через прокси). См. setCommunityCookies.
                        await this.setCommunityCookies(isLive, community, session, refreshToken, steamID ? steamID.getSteamID64() : null);
                        //const oldSession = convertCookiesToSession(cookies);
                        const newSession: SessionInterface = {
                            AccessToken: accessToken,
                            RefreshToken: refreshToken,
                            SteamID: steamID.toString(),
                            SessionID: ""
                        }
                        // Без await человек видел успех, а на диске оставался старый токен
                        await this.saveSession(newSession);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                const result = await session.startWithCredentials({
                    accountName: this.params.accountName,
                    password: this.params.password,
                    steamGuardCode: SteamTotp.generateAuthCode(this.params.maFile.shared_secret)
                });

                if (result.actionRequired && result.validActions) {
                    const actions = result.validActions.map(el => el.type);
                    if (actions.includes(EAuthSessionGuardType.EmailCode)) {
                        const code = await askMailCode(this.params.accountName, this.params.accountName);
                        // Пока ждали код, вход отменили (прокси, архив) или вышел его срок
                        if (!isLive()) throw new StaleOperationError();
                        await session.submitSteamGuardCode(code);
                    } else if (!actions.includes(EAuthSessionGuardType.DeviceConfirmation)
                        && !actions.includes(EAuthSessionGuardType.EmailConfirmation)) {
                        // Steam не принял код из maFile. Опрос входа без подтверждения не начинается, и
                        // его срок не сработает: без reject вход крутился бы вечно.
                        reject(new Error(t("errors.guardCodeRejected")));
                    }
                }
            } catch (err) {
                reject(err);
            }
        });
    }
    isLogin(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.community.loggedIn(async (err, loggedIn, familyView) => {
                //console.log(`#${this.params.number} err: ${err}, loggedIn: ${loggedIn}, familyView: ${familyView}`);
                if (err) return reject(err);
                if (loggedIn) {
                    if (familyView) {
                        try {
                            if (this.params.familyViewPin) {
                                await this.setPin(this.params.familyViewPin)
                                    .then(() => {
                                        resolve(true);
                                    })
                                    .catch(async err => {
                                        try {
                                            const pin = await askFamilyPin(this.params.id, this.params.accountName);
                                            await this.setPin(pin);
                                            resolve(true);
                                        } catch (err) {
                                            reject(`famliy pin is not applied: ${err}`);
                                        }
                                    });
                            } else {
                                try {
                                    const pin = await askFamilyPin(this.params.id, this.params.accountName);
                                    await this.setPin(pin);
                                    resolve(true);
                                } catch (err) {
                                    reject(`famliy pin is not applied: ${err}`);
                                }
                            }
                        } catch (err) {
                            reject(`famliy pin is not applied: ${err}`);
                        }
                    } else {
                        resolve(true);
                    }
                } else {
                    resolve(false);
                }
            });
        });
    }
    // Полное обновление аккаунта: профиль, статусы и баланс за одну загрузку /market/ (SDA-38).
    getSecondary(): Promise<AccountData> {
        return this.loadData("full", true,
            (community) => getAccountData(community, this.params.secondary?.registeredAt),
            (data, ticket) => {
                if (ticket < this.written.full) throw new StaleOperationError();
                this.written.full = ticket;
                const balanceIsNewer = ticket < this.written.balance;
                if (!balanceIsNewer) this.written.balance = ticket;
                // Более поздний баланс уже записан: и в окно уходит он, а не этот
                else data = { ...data, changableSecondary: this.params.changableSecondary };
                return { params: { secondary: data.secondary, changableSecondary: data.changableSecondary }, data };
            });
    }
    getChangableSecondary(): Promise<ChangableSecondaryInterface> {
        // Полное обновление в пути принесёт и баланс: вторая загрузка /market/ не нужна
        const full = this.joinable("full");
        if (full) return (full as Promise<AccountData>).then(data => data.changableSecondary);
        return this.loadData("balance", false,
            (community) => getChangableSecondaries(community),
            (data, ticket) => {
                if (ticket < this.written.balance) throw new StaleOperationError();
                this.written.balance = ticket;
                return { params: { changableSecondary: data }, data };
            });
    }
    // Такой же запрос в пути; после нового входа прежний не годится: вход мог исправить причину ошибки
    private joinable(key: string): Promise<unknown> | null {
        const same = this.inFlight.get(key);
        return same && same.operations === this.operations && same.login === this.login ? same.promise : null;
    }
    /**
     * Загрузка данных: ждёт входа, идёт через общую очередь, одинаковый запрос в пути не дублирует.
     * Если за это время сменился прокси, аккаунт ушёл в архив или удалён, или записан результат более
     * поздней загрузки, этот результат отбрасывается (SDA-56).
     */
    private loadData<T>(key: string, urgent: boolean, load: (community: SteamCommunity) => Promise<T>,
        accept: (data: T, ticket: number) => { params: { [K in keyof SteamAccountInterface]?: SteamAccountInterface[K] }, data: T }): Promise<T> {
        const same = this.joinable(key);
        if (same) return same as Promise<T>;
        const { community, operations } = this;
        const ticket = ++this.loadTicket;
        const assertCurrent = () => {
            if (this.operations !== operations || this.params.deleted) throw new StaleOperationError();
        };
        const run = async () => {
            assertCurrent();
            await this.ensureSession(urgent);
            // Ожидание могло само начать вход заново: присоединяться можно и к нему
            if (this.inFlight.get(key) === entry) entry.login = this.login;
            const loaded = await dataQueue.run(async () => {
                assertCurrent();
                return load(community);
            }, { urgent });
            assertCurrent();
            const { params, data } = accept(loaded, ticket);
            this.editParams(params);
            return data;
        };
        const entry: { operations: number, login: LoginAttempt | null, promise: Promise<unknown> } =
            { operations, login: this.login, promise: Promise.resolve() };
        this.inFlight.set(key, entry);
        const promise = run();
        entry.promise = promise;
        const forget = () => { if (this.inFlight.get(key) === entry) this.inFlight.delete(key); };
        promise.then(forget, forget);
        return promise;
    }
    setPin(pin: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.proxyUrl();
            this.community.parentalUnlock(pin, (err) => {
                if (err) return reject('pin incorrect');

                try {
                    //console.log(`successful set pin: ${pin} (#${this.params.number})`);
                    this.editParams({ familyViewPin: Number(pin) });
                } catch (err) {
                    reject(err);
                }
            });
        });
    }
    getSmaFile() {
        const smaFile: SmaFile = {
            secondary: this.params.secondary,
            accountName: this.params.accountName,
            password: this.params.password,
            maFile: this.params.maFile,
            familyViewPin: this.params.familyViewPin,
            useSteamCookies: this.params.useSteamCookies,
            // Без этих полей копия теряла почту и имя профиля, хотя импорт их принимает (SDA-62)
            profileName: this.params.profileName,
            mail: this.params.mail,
            mailPassword: this.params.mailPassword
        }
        return stripLegacyMarketData(smaFile);
    }
    async saveSession(session: Session) {
        try {
            this.params.maFile.Session = session;
            this.editParams({ maFile: this.params.maFile });
        } catch (err) {
            throw new Error(t('errors.saveSession', { error: String(err) }));
        }
    }
    getConfirmations(): Promise<MobileConfirmation[]> {
        return new Promise((resolve, reject) => {
            this.proxyUrl();
            const { community } = this;
            // Сразу после запуска, импорта или сбоя прокси вход ещё идёт: без ожидания окно
            // подтверждений отвечало «Not Logged In» (SDA-61)
            withDeadline(this.ensureSession(true), SESSION_TIMING.confirmationsWaitMs, loginTimedOut)
                .then(() => {
                    this.proxyUrl();
                    if (this.community !== community) {
                        throw Object.assign(new Error(t('errors.confirmations.routeChanged')), { code: 'CONFIRMATION_ROUTE_CHANGED' });
                    }
                    return fetchConfirmations(community, this.params.maFile.identity_secret);
                }).then(resolve, reject);
        });
    }
    respondConfirmations(refs: MobileConfirmationRef[], accept: boolean): Promise<MobileConfirmationResult[]> {
        return new Promise((resolve, reject) => {
            this.proxyUrl();
            const { community, operations } = this;
            respondToConfirmations(community, this.params.maFile.identity_secret, refs, accept, () => {
                this.proxyUrl();
                // A queued operation must never use a client from an old route.
                // Archiving in between cancels the rest too, even after a restore.
                if (this.community !== community || this.operations !== operations) {
                    // The code marks the error as ours: its (localized) text is shown as it is.
                    throw Object.assign(new Error(t('errors.confirmations.routeChanged')), { code: 'CONFIRMATION_ROUTE_CHANGED' });
                }
            }).then(resolve, reject);
        });
    }
    editParams(newParams: { [K in keyof SteamAccountInterface]?: SteamAccountInterface[K] }) {
        newParams = stripLegacyMarketData(newParams);
        // В память и в config.json идёт один и тот же набор полей: каждый ключ со значением,
        // в том числе тот, которого у аккаунта ещё не было (SDA-27: почта, добавленная аккаунту
        // без почты, сохранялась на диск, но не в живой объект, и пропадала из окна после
        // следующей рассылки). undefined не применяется ни там, ни там: на диске electron-store
        // стёр бы ключ, а в памяти он остался бы.
        const defined: { [K in keyof SteamAccountInterface]?: SteamAccountInterface[K] } = {};
        for (const key of Object.keys(newParams) as (keyof SteamAccountInterface)[]) {
            if (typeof newParams[key] !== 'undefined') (defined as any)[key] = newParams[key];
        }
        const archived = defined.deleted === true && !this.params.deleted;
        Object.assign(this.params, defined);
        SteamAccountStorage.EditData(this.params.id, defined);
        // Восстановленный аккаунт не должен получить результат загрузки, начатой до архива
        if (archived) this.invalidateOperations();
    }
    static Generate(smaFile: SmaFile, changableSecondary: ChangableSecondaryInterface | null) {
        // Портативный прокси хранится только в LinksStorage, служебные поля файла не принимаем.
        const { proxy, ...account } = sanitizeSmaFile(smaFile);
        // Нумеруем относительно активных аккаунтов: удалённые (архивные) не должны
        // оставлять "дыры" в нумерации. Массив менеджера не мутируем (sort in-place
        // ломал порядок отображения — новые аккаунты оказывались "с хвоста").
        const steamAccountsArray = steamAccountManager.objects
            .map(sa => sa.params)
            .filter(sa => !sa.deleted);
        steamAccountsArray.sort((a, b) => a.number < b.number ? 1 : -1);

        const maxNumber = steamAccountsArray.length === 0 ? 1 : steamAccountsArray[0].number + 1;

        const params: SteamAccountInterface = {
            ...account,
            id: uuidv4(),
            number: maxNumber,
            changableSecondary: changableSecondary ? changableSecondary : {
                steam: {
                    balance: 0,
                    currency: 'RUB',
                    error: null
                }
            },
            deleted: false
        }

        return stripLegacyMarketData(params);
    }
}

export default SteamAccount;
