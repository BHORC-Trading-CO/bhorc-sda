const SteamTotp = require('steam-totp');
import SessionInterface from '../../../interfaces/SteamAccount/SessionInterface';
import SteamCommunity from "steamcommunity";
import MaFileInterface from "../../../interfaces/SteamAccount/MaFileInterface";
import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import SteamAccountSetupInterface from "../../../interfaces/SteamAccount/SteamAccountSetupInterface";
import application from "../../application/application";

import SuperMethods from "../../SuperMethods/SuperMethods";
import { getSecondaries } from "./loadSteamAccountData";
import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';
import CreationStepType from '../../../interfaces/SteamAccount/CreationStepType';
import ProxySetupInterface from "../../../interfaces/Proxy/ProxySetupInterface";
import buildProxyUrl from "../../Proxy/proxyUrl";
import applyCommunityCookies from "../Functions/applyCommunityCookies";
import boundedRequest from "../../Request/boundedRequest";
import askFamilyPin from "../../application/askInfo/askFamilyPin";
import { EAuthSessionGuardType } from "steam-session";
import createLoginSession from "../../Proxy/loginSession";
import askMailCode from "../../application/askInfo/askMailCode";
import { STEAM_MOBILE_USER_AGENT, STEAM_WEB_HEADERS } from "../Functions/steamUserAgent";
import { isDeadTokenError, isRefreshTokenExpired } from "../Functions/sessionExpiry";
import assertSameAccount, { isNameless } from "./accountIdentity";
import passwordSignIn from "./passwordSignIn";
import { t } from "../../../i18n";

type StepType = SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_STEP | SteamAccountChannels.GUARD_SETUP_PROCESS_STEP;

export default async function maFileLogin(steamAccountParams: SteamAccountSetupInterface, options?: { signal?: AbortSignal, stepChannel?: StepType, passwordUsed?: boolean }, proxy?: ProxySetupInterface | null): Promise<SmaFileInterface> {
        const proxyUrl = buildProxyUrl(proxy);
        // До первого запроса: чужой maFile не должен ни войти, ни сохраниться (SDA-62).
        assertSameAccount(steamAccountParams.accountName, steamAccountParams.maFile);
    return new Promise<SmaFileInterface>(async (resolve, reject) => {
        // Прокси опционален: если передан — весь трафик идёт через него, если нет —
        // напрямую с реального IP (осознанный выбор пользователя).
        const newLoginSession = () => createLoginSession(proxyUrl);
        const session = newLoginSession();
        const community = new SteamCommunity({
            request: proxyUrl ? boundedRequest({ proxy: proxyUrl, headers: STEAM_WEB_HEADERS }) : boundedRequest({ headers: STEAM_WEB_HEADERS }),
            userAgent: STEAM_MOBILE_USER_AGENT
        });

        // Отмена касается только этого запуска (SDA-63): его шаги и окна ввода, его вход
        const signal = options?.signal;
        const nextStep = (step: CreationStepType) => options?.stepChannel && !signal?.aborted ? application.sendToMain(options.stepChannel, step) : () => { };
        if (signal?.aborted) return reject('abort');
        signal?.addEventListener('abort', () => reject('abort'));

        const checkSession = (accountId: string, maFile: MaFileInterface): Promise<void> => {
            return new Promise<void>(async (resolve, reject) => {
                try {
                    nextStep("checkLoginStatus");
                    // Без имени в maFile его токены ничего не говорят о введённом логине: пароль подтверждает
                    // его у Steam, а SteamID или код Guard — что maFile от этого же аккаунта (SDA-62).
                    if (!options?.passwordUsed && isNameless(maFile)) return reject(new Error("Invalid session"));
                    if (
                        maFile.Session &&
                        maFile.Session?.AccessToken &&
                        maFile.Session.RefreshToken
                    ) {
                        try {
                            // Мёртвый refresh-токен — не отказ: пароль введён, входим по нему (SDA-62).
                            if (isRefreshTokenExpired(maFile.Session.RefreshToken)) return reject(new Error("Invalid session"));
                            session.accessToken = maFile.Session.AccessToken;
                            session.refreshToken = maFile.Session.RefreshToken;
                            try {
                                await session.refreshAccessToken();
                            } catch (err) {
                                return reject(isDeadTokenError(err) ? new Error("Invalid session") : err);
                            }
                            // Cookie именно для steamcommunity.com, иначе loggedIn() ниже = false
                            // на валидной сессии. См. applyCommunityCookies.
                            await applyCommunityCookies(community, session, proxyUrl, accountId);
                            community.loggedIn((err, loggedIn, familyView) => {
                                if (err) return reject(err);
                                if (!loggedIn) return reject(new Error("Not logged in"));
                                if (!familyView) return resolve();
                                familyViewPinLoop(accountId, maFile.account_name).then(resolve, reject);
                            });
                        } catch (err) {
                            reject(err);
                        }
                    } else {
                        reject(new Error("Invalid session"));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        }

        const createSession = async (accountName: string, password: string, shared_secret: string): Promise<SessionInterface> => {
            if (!shared_secret) throw new Error(t('errors.guardSecretMissing'));
            nextStep("loginByPassword");
            // Свежий LoginSession: в прежнем остались мёртвые токены maFile, и токен другого
            // аккаунта бросил бы внутри опроса библиотеки, где ошибку никто не ловит.
            const session = newLoginSession();
            const { guardCodeAccepted } = await passwordSignIn(session, {
                accountName: accountName,
                password: password,
                steamGuardCode: SteamTotp.generateAuthCode(shared_secret)
            }, async (validActions, prompts) => {
                const actions = validActions.map(el => el.type);
                if (actions.includes(EAuthSessionGuardType.EmailCode)) {
                    const code = await askMailCode(accountName, accountName, prompts);
                    if (!prompts.aborted) await session.submitSteamGuardCode(code);
                } else if (actions.includes(EAuthSessionGuardType.DeviceCode)) {
                    // Код Guard мы уже отправили, и Steam его отверг: другого взять негде,
                    // а ждать библиотека стала бы вечно (SDA-63).
                    throw new Error(t('errors.guardCodeRejected'));
                }
                // Подтверждение входа в приложении или по ссылке из письма ждёт сама библиотека (есть timeout)
            }, signal);
            const newSession: SessionInterface = {
                AccessToken: session.accessToken,
                RefreshToken: session.refreshToken,
                SteamID: session.steamID.toString(),
                SessionID: ""
            }
            // Steam мог войти в другой аккаунт, не в тот, чей maFile
            assertSameAccount(accountName, steamAccountParams.maFile, newSession.SteamID, guardCodeAccepted);
            return newSession;
        }

        // Неверный PIN спрашиваем снова: библиотека отдаёт его строкой, и раньше мастер падал (SDA-63)
        const familyViewPinLoop = async (accountId: string, accountName: string): Promise<void> => {
            for (;;) {
                nextStep("askPin");
                const pin = await askFamilyPin(accountId, accountName, signal);
                try {
                    await tryFamilyViewPin(pin);
                    steamAccountParams.familyViewPin = pin;
                    return;
                } catch (err) {
                    if ((err?.message ?? err) !== "Incorrect PIN") throw err;
                    application.sendToMain('ERROR', t('errors.wrongPin'));
                }
            }
        }

        const tryFamilyViewPin = (pin: number): Promise<void> => {
            return new Promise<void>((resolve, reject) => {
                nextStep("tryPin");
                community.parentalUnlock(pin, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        try {
            checkSession(steamAccountParams.accountName, steamAccountParams.maFile)
                .then(() => {
                    if (signal?.aborted) return;
                    nextStep("loadData");
                    getSecondaries(community)
                        .then(data => {
                            const sMaFile: SmaFileInterface = {
                                accountName: steamAccountParams.accountName,
                                password: steamAccountParams.password,
                                // С access-токеном, который Steam выдал при проверке: прежний им заменён
                                maFile: {
                                    ...steamAccountParams.maFile,
                                    Session: { ...steamAccountParams.maFile.Session, AccessToken: session.accessToken }
                                },
                                secondary: data,
                                familyViewPin: steamAccountParams.familyViewPin ? steamAccountParams.familyViewPin : null,
                                useSteamCookies: steamAccountParams.useSteamCookies,
                                // Заполненное в форме раньше терялось (SDA-62)
                                profileName: steamAccountParams.profileName,
                                mail: steamAccountParams.mail,
                                mailPassword: steamAccountParams.mailPassword
                            };
                            resolve(sMaFile);
                        })
                        .catch(err => {
                            reject(err);
                        });
                })
                .catch(async (err) => {
                    // По паролю входим один раз: если и новая сессия не годится, повтор её не исправит.
                    if (!signal?.aborted && !options?.passwordUsed && (err?.message == "Invalid session" || err?.message == "Not logged in")) {
                        console.log("Create session")
                        createSession(steamAccountParams.accountName, steamAccountParams.password, steamAccountParams.maFile.shared_secret)
                            .then(session => {
                                steamAccountParams.maFile.Session = session;
                                // Прокидываем прокси и в рекурсивный ретрай, чтобы повторный
                                // логин шёл через тот же прокси (или напрямую, если его нет).
                                maFileLogin(steamAccountParams, { ...options, passwordUsed: true }, proxy)
                                    .then(smaFile => {
                                        resolve(smaFile);
                                    })
                                    .catch((err) => {
                                        reject(err);
                                    });
                            })
                            .catch(err => {
                                reject(err);
                            });
                    } else {
                        reject(err);
                    }
                });
        } catch (err) {
            reject(err);
        }

    });
}