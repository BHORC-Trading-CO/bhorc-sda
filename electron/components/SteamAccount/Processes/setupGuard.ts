import SteamTotp from "steam-totp";
import { ipcMain } from "electron";
import SteamCommunity from "steamcommunity";
import CreationStepType from "../../../interfaces/SteamAccount/CreationStepType";
import MaFileInterface from "../../../interfaces/SteamAccount/MaFileInterface";
import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import application from "../../application/application";
import askSmsCode from "../../application/askInfo/askSmsCode";
import askMailCode from "../../application/askInfo/askMailCode";
import { getSecondaries } from "./loadSteamAccountData";
import { v4 as uuidv4 } from "uuid";
import TwoFactorResponseInterface from "../../../interfaces/SteamAccount/TwoFactorResponseInterface";
import ProxySetupInterface from "../../../interfaces/Proxy/ProxySetupInterface";
import buildProxyUrl from "../../Proxy/proxyUrl";
import applyCommunityCookies from "../Functions/applyCommunityCookies";
import finalizeAddAuthenticator from "../Functions/finalizeAddAuthenticator";
import savePendingAuthenticator from "../Functions/savePendingAuthenticator";
import request from "request";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import SteamAccountSetupInterface from "../../../interfaces/SteamAccount/SteamAccountSetupInterface";
import {
  LoginSession,
  EAuthTokenPlatformType,
  EAuthSessionGuardType,
} from "steam-session";
import { STEAM_MOBILE_USER_AGENT, STEAM_WEB_HEADERS } from "../Functions/steamUserAgent";
import { writeUnredacted } from "../../Functions/redactSecrets";

type AbortChannelType =
  | SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_ABORT
  | SteamAccountChannels.GUARD_SETUP_PROCESS_ABORT;
type StepType =
  | SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_STEP
  | SteamAccountChannels.GUARD_SETUP_PROCESS_STEP;

export default async function setupGuard(
  steamAccountParams: {
    accountName: string;
    password: string;
  },
  proxy?: ProxySetupInterface
): Promise<SmaFileInterface> {
  return new Promise(async (resolve, reject) => {
    // Прокси опционален: если передан — весь трафик идёт через него, если нет —
    // напрямую с реального IP (осознанный выбор пользователя).
    const proxyUrl = buildProxyUrl(proxy);
    const session = new LoginSession(EAuthTokenPlatformType.MobileApp, { httpProxy: proxyUrl ? proxyUrl : undefined });
    const communityRequest = proxyUrl
      ? request.defaults({ proxy: proxyUrl, headers: STEAM_WEB_HEADERS })
      : request.defaults({ headers: STEAM_WEB_HEADERS });
    const community = new SteamCommunity({ request: communityRequest, userAgent: STEAM_MOBILE_USER_AGENT });
    const EResult = SteamCommunity.EResult;

    ipcMain.on("ABORT_SETUP_GUARD", () => {
      reject("abort");
    });

    const nextStep = (step: CreationStepType) => {
      application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_STEP, step);
    };

    const doLogin = (
      accountName: string,
      password: string
    ): Promise<MaFileInterface> => {
      return new Promise<MaFileInterface>((resolve, reject) => {
        nextStep("loginByPassword");
        session
          .startWithCredentials({
            accountName,
            password
          })
          .then(async ({ actionRequired, validActions }) => {
            if (actionRequired) {
              if (validActions) {
                const emailPromt = validActions
                  .filter(
                    (action) => action.type === EAuthSessionGuardType.EmailCode
                  )
                  .pop();
                const guardPromt = validActions
                  .filter(
                    (action) => action.type === EAuthSessionGuardType.DeviceCode
                  )
                  .pop();
                if (guardPromt) {
                  return reject(
                    new Error(
                      "This account already has two-factor authentication enabled."
                    )
                  );
                } else if (emailPromt) {
                  console.log(
                    `An email has been sent to your address at ${emailPromt.detail}`
                  );
                  const promtEmailCode = async () => {
                    nextStep("askEmailCode");
                    const code = await askMailCode(
                      uuidv4(),
                      steamAccountParams.accountName
                    );
                    nextStep("tryEmailCode");
                    try {
                      await session.submitSteamGuardCode(code);
                    } catch (error) {
                      if (error.message === "InvalidLoginAuthCode") {
                        await promtEmailCode();
                      } else {
                        throw error;
                      }
                    }
                  };
                  await promtEmailCode();
                } else {
                  return reject(
                    `Failed to log in, action required: ${validActions}`
                  );
                }
              }
            }
          })
          .catch((error) => {
            return reject(error);
          });
        session.on("authenticated", async () => {
          try {
            // Cookie берём именно для steamcommunity.com: getWebCookies() отдаёт cookie
            // случайного домена, и тогда loggedIn() ниже вернёт false. См. applyCommunityCookies.
            await applyCommunityCookies(community, session, proxyUrl, steamAccountParams.accountName);
          } catch (err) {
            return reject(err);
          }
          community.loggedIn((error, loggedIn, familyView) => {
            // reject, а не throw: throw из колбэка request'а не реджектит промис,
            // а улетает необработанным исключением — процесс подключения guard'а зависал.
            if (error) return reject(error);
            if (!loggedIn) return reject(new Error("Not logged in"));
            if (familyView) return reject(new Error("Family view"));
            //@ts-ignore
            community.setMobileAppAccessToken(session.accessToken);
            community.enableTwoFactor(async (err, response) => {
              nextStep("enableTwoFactor");
              if (err) {
                if (err.eresult == EResult.Fail) {
                  return reject(
                    new Error(
                      "Failed to enable two-factor authentication. Perhaps the phone number is not attached."
                    )
                  );
                }
                if (err.eresult == EResult.RateLimitExceeded) {
                  return reject(
                    new Error("RateLimitExceeded. Try again later.")
                  );
                }
                return reject(err);
              }
              if (response.status != EResult.OK) {
                return reject(new Error(`Status ${response.status}`));
              }
              //@ts-ignore
              const rawMaFile: TwoFactorResponseInterface = response;
              // Секреты на диск ПЕРВЫМ делом: Steam отдаёт shared_secret и revocation_code
              // ровно один раз, и всё, что идёт ниже (ввод кода, finalize), может оборваться.
              const backupFile = savePendingAuthenticator(
                steamAccountParams.accountName,
                rawMaFile,
                session.steamID.getSteamID64()
              );
              console.log(
                backupFile
                  ? `${steamAccountParams.accountName} - секреты аутентификатора сохранены: ${backupFile}`
                  : `${steamAccountParams.accountName} - ВНИМАНИЕ: секреты НЕ сохранены на диск, они только в логе ниже`
              );
              // Секреты в лог — только запасной путь, когда на диск записать не удалось:
              // иначе revocation_code потеряется. В остальных случаях им в логе не место.
              // secret-log-ok: резервная копия при сбое записи на диск (мимо маскировки console)
              if (!backupFile) writeUnredacted(`${steamAccountParams.accountName} - секреты аутентификатора:`, rawMaFile);

              // Код подтверждения приходит на ПОЧТУ, если телефон к аккаунту не привязан,
              // и в SMS, если привязан. Эндпоинт и поле activation_code одни и те же,
              // поэтому спрашиваем код одинаково — различается только источник.
              console.log(
                `${steamAccountParams.accountName} - код подтверждения придёт ` +
                (rawMaFile.phone_number_hint ? `в SMS (${rawMaFile.phone_number_hint})` : "на почту (телефон не привязан)")
              );

              const promtActivationCode = async () => {
                nextStep("askSmsCode");
                const code = await askSmsCode(
                  uuidv4(),
                  steamAccountParams.accountName
                );
                nextStep("trySmsCode");
                try {
                  await finalizeAddAuthenticator({
                    accessToken: session.accessToken,
                    steamID64: session.steamID.getSteamID64(),
                    sharedSecret: rawMaFile.shared_secret,
                    activationCode: code,
                    serverTime: Number(rawMaFile.server_time),
                    proxyUrl,
                  });
                } catch (error) {
                  if (error.message == "Invalid activation code") {
                    await promtActivationCode();
                  } else {
                    throw error;
                  }
                }
              };

              try {
                await promtActivationCode();
              } catch (error) {
                return reject(error);
              }
              const maFile: MaFileInterface = {
                ...rawMaFile,
                Session: {
                  AccessToken: session.accessToken,
                  RefreshToken: session.refreshToken,
                  SessionID: "",
                  SteamID: session.steamID.toString()
                },
                device_id: SteamTotp.getDeviceID(session.steamID),
                fully_enrolled: true,
              };
              resolve(maFile);
            });
          });
        });
      });
    };

    doLogin(steamAccountParams.accountName, steamAccountParams.password)
      .then((maFile) => {
        nextStep("loadData");
        getSecondaries(community)
          .then((secondaries) => {
            const sMaFile: SmaFileInterface = {
              accountName: steamAccountParams.accountName,
              password: steamAccountParams.password,
              maFile: maFile,
              secondary: secondaries,
              familyViewPin: null,
              useSteamCookies: true,
            };
            resolve(sMaFile);
          })
          .catch((err) => {
            reject(err);
          });
      })
      .catch((err) => {
        reject(err);
      });
  });
}
