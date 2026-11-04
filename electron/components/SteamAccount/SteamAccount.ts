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
import { getSecondaries, getChangableSecondaries } from './Processes/loadSteamAccountData';
import CConfirmation from "steamcommunity/classes/CConfirmation";
import SecondaryInterface from "../../interfaces/SteamAccount/SecondaryInterface";
import ProxyInterface from "../../interfaces/Proxy/ProxyInterface";
import buildProxyUrl from "../Proxy/proxyUrl";
import ProxyUnavailableError from "../Proxy/ProxyUnavailableError";
import { blockedAgent, blockedSession } from "../Proxy/blockedTransport";
import { ProxyState } from "../../interfaces/Proxy/ProxyState";
import request from "request";
import Manager from "../manager/manager";
import askFamilyPin from "../application/askInfo/askFamilyPin";
import Chrome from './Chrome/Chrome';
import { EAuthSessionGuardType, EAuthTokenPlatformType, LoginSession } from "steam-session";
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
const SteamTotp = require('steam-totp');

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


    async initSession() {
        this.proxyUrl();
        if (this.params.maFile.Session?.AccessToken && this.params.maFile.Session.RefreshToken) {
            this.session.accessToken = this.params.maFile.Session.AccessToken;
            this.session.refreshToken = this.params.maFile.Session.RefreshToken;
            await this.session.refreshAccessToken();
            await this.setCommunityCookies(
                this.session.refreshToken,
                this.session.steamID ? this.session.steamID.getSteamID64() : null
            );
        }
    }

    async getBrowserCookies(): Promise<string[]> {
        this.proxyUrl();
        const refreshToken = this.params.maFile.Session ? this.params.maFile.Session.RefreshToken : undefined;
        if (!refreshToken) return [];

        // steamID нужен для settoken; берём из JWT refresh-токена
        this.session.refreshToken = refreshToken;
        const steamID = this.session.steamID ? this.session.steamID.getSteamID64() : null;

        // Основной путь: получаем cookie именно для steamcommunity.com (aud: web:community)
        if (steamID) {
            try {
                return await getCommunityWebCookies(refreshToken, steamID, this.proxyUrl());
            } catch (err) {
                console.log(`${this.params.id} - getCommunityWebCookies failed, fallback to getWebCookies: ${err}`);
            }
        }

        // Фолбэк: старый путь (cookie случайного домена)
        try {
            await this.session.refreshAccessToken();
            return await this.session.getWebCookies();
        } catch (err) {
            console.log(`${this.params.id} - cant get web cookies for browser: ${err}`);
            return [];
        }
    }

    // Устанавливает в this.community cookie именно для steamcommunity.com (aud: web:community).
    // steamLoginSecure доменно-специфичен. session.getWebCookies() возвращает cookie СЛУЧАЙНОГО
    // домена (promiseAny — кто первый ответил), и через прокси гонка чаще выигрывается не-community
    // доменом → getConfirmations()/loggedIn() = "Not Logged In". Поэтому повторяем целевой поток
    // finalizelogin -> settoken через getCommunityWebCookies, с фолбэком на старый путь.
    private async setCommunityCookies(refreshToken?: string, steamID64?: string | null): Promise<void> {
        this.proxyUrl();
        if (refreshToken && steamID64) {
            try {
                const cookies = await getCommunityWebCookies(refreshToken, steamID64, this.proxyUrl());
                this.community.setCookies(cookies);
                return;
            } catch (err) {
                console.log(`${this.params.id} - getCommunityWebCookies failed, fallback to getWebCookies: ${err}`);
            }
        }
        const cookies = await this.session.getWebCookies();
        this.community.setCookies(cookies);
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
        const proxyUrl = this.proxyUrl();
        if (proxyUrl) {
            return new LoginSession(EAuthTokenPlatformType.MobileApp, { httpProxy: proxyUrl });
        }
        return new LoginSession(EAuthTokenPlatformType.MobileApp);
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
        const req = proxyUrl
            ? request.defaults({ proxy: proxyUrl, headers: STEAM_WEB_HEADERS })
            : request.defaults({ headers: STEAM_WEB_HEADERS });
        return new SteamCommunity({ request: req, userAgent: STEAM_MOBILE_USER_AGENT });
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
        try {
            this.session.cancelLoginAttempt?.();
            this.session = this.buildSession();
            this.community = this.buildCommunity();
        } catch (err) {
            // Never retain a previously direct client if rebuilding the route fails.
            this.blockProxy();
            throw err;
        }
        if (this.proxyState !== "missing") {
            this.initSession().catch(err => application.sendToMain(
                SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, { id: this.params.id, err: String(err) }
            ));
        }
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
        this.proxyId = Manager.GetSteamAccountLinkedData(this.params.id).proxyId;
        this.proxy = null;
        this.proxyState = "missing";
        this.routeKey = "missing:";
        this.session = blockedSession(this.proxyId);
        this.community = this.buildCommunity();
    }

    loginByPassword(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            // Весь блок в try/catch: без него ошибка внутри async-исполнителя (мёртвый прокси,
            // 429, битый shared_secret) не реджектит промис, и обновление сессии висит вечно.
            try {
                // Свежий LoginSession на каждый логин: старый после первой попытки больше
                // не принимает startWithCredentials, см. buildSession.
                this.proxyUrl();
                const session = this.buildSession();
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
                        await this.setCommunityCookies(refreshToken, steamID ? steamID.getSteamID64() : null);
                        //const oldSession = convertCookiesToSession(cookies);
                        const newSession: SessionInterface = {
                            AccessToken: accessToken,
                            RefreshToken: refreshToken,
                            SteamID: steamID.toString(),
                            SessionID: ""
                        }
                        this.saveSession(newSession);
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
                    if (result.validActions.map(el => el.type).includes(EAuthSessionGuardType.EmailCode)) {
                        const code = await askMailCode(this.params.accountName, this.params.accountName);
                        await session.submitSteamGuardCode(code);
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
    getSecondary(): Promise<SecondaryInterface> {
        return new Promise((resolve, reject) => {
            getSecondaries(this.community, this.params.secondary)
                .then((data) => {
                    try {
                        this.editParams({ secondary: data });
                        resolve(data);
                    } catch (err) {
                        reject(err);
                    }
                })
                .catch(err => {
                    reject(err);
                });
        });
    }
    getChangableSecondary(): Promise<ChangableSecondaryInterface> {
        return new Promise((resolve, reject) => {
            getChangableSecondaries(this.community)
                .then(data => {
                    try {
                        // console.log(`#${this.params.number} successful get changable secondary!`);
                        this.editParams({ changableSecondary: data });
                        resolve(data);
                    } catch (err) {
                        reject(err);
                    }
                })
                .catch(err => {
                    //console.log(`#${this.params.number} UNSUCCESSFUL get changable secondary (${err})`);
                    reject(err);
                });
        });
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
            useSteamCookies: this.params.useSteamCookies
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
    getConfirmations(): Promise<CConfirmation[]> {
        return new Promise((resolve, reject) => {
            this.proxyUrl();
            const time = Number((Number(new Date()) / 1000).toFixed(0));
            const key = SteamTotp.generateConfirmationKey(this.params.maFile.identity_secret, time, "conf");
            this.community.getConfirmations(time, key, (err, confirmations) => {
                if (err) return reject(err);
                resolve(confirmations);
            });
        });
    }
    confirmItems(ids: number[], keys: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            this.proxyUrl();
            const time = Math.floor(Number(new Date()) / 1000);
            const key = SteamTotp.getConfirmationKey(this.params.maFile.identity_secret, time, 'allow');
            this.community.respondToConfirmation(ids, keys, time, key, true, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
    cancelItems(ids: number[], keys: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            this.proxyUrl();
            const time = Math.floor(Number(new Date()) / 1000);
            const key = SteamTotp.getConfirmationKey(this.params.maFile.identity_secret, time, 'cancel');
            this.community.respondToConfirmation(ids, keys, time, key, false, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
    editParams(newParams: { [K in keyof SteamAccountInterface]?: SteamAccountInterface[K] }) {
        newParams = stripLegacyMarketData(newParams);
        for (var i in this.params) {
            if (typeof (newParams[i]) !== 'undefined') {
                this.params[i] = newParams[i];
            }
        }
        SteamAccountStorage.EditData(this.params.id, newParams);
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
