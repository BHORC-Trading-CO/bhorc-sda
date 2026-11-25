import SteamTotp from "steam-totp";
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
import boundedRequest from "../../Request/boundedRequest";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import SteamAccountSetupInterface from "../../../interfaces/SteamAccount/SteamAccountSetupInterface";
import { EAuthSessionGuardType } from "steam-session";
import createLoginSession from "../../Proxy/loginSession";
import { STEAM_MOBILE_USER_AGENT, STEAM_WEB_HEADERS } from "../Functions/steamUserAgent";
import { writeUnredacted } from "../../Functions/redactSecrets";
import { t } from "../../../i18n";

type StepType =
  | SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_STEP
  | SteamAccountChannels.GUARD_SETUP_PROCESS_STEP;

export default async function setupGuard(
  steamAccountParams: {
    accountName: string;
    password: string;
    profileName?: string;
    mail?: string;
    mailPassword?: string;
    useSteamCookies?: boolean;
  },
  proxy?: ProxySetupInterface | null,
  onRecovery?: (revocationCode: string, steamId: string) => void,
  signal?: AbortSignal
): Promise<SmaFileInterface> {
    const proxyUrl = buildProxyUrl(proxy);
  return new Promise(async (resolve, reject) => {
    // Прокси опционален: если передан — весь трафик идёт через него, если нет —
    // напрямую с реального IP (осознанный выбор пользователя).
    const session = createLoginSession(proxyUrl);
    const communityRequest = proxyUrl
      ? boundedRequest({ proxy: proxyUrl, headers: STEAM_WEB_HEADERS }, { wholeRequest: false })
      : boundedRequest({ headers: STEAM_WEB_HEADERS }, { wholeRequest: false });
    const community = new SteamCommunity({ request: communityRequest, userAgent: STEAM_MOBILE_USER_AGENT });
    const EResult = SteamCommunity.EResult;

    const nextStep = (step: CreationStepType) => {
      // Шаги отменённого запуска не попадают в следующий мастер (SDA-63)
      if (!signal?.aborted) application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_STEP, step);
    };

    const doLogin = (
      accountName: string,
      password: string
    ): Promise<MaFileInterface> => {
      return new Promise<MaFileInterface>((resolve, rejectLogin) => {
        const reject = (err: unknown) => {
          session.cancelLoginAttempt();
          rejectLogin(err);
        };
        // Отмена (SDA-63) останавливает мастер до запроса AddAuthenticator. С его отправки Steam мог
        // выдать секреты: ответ дожидаемся и сохраняем, а отмену проверяем перед следующими шагами.
        let enrolling = false;
        signal?.addEventListener("abort", () => {
          if (!enrolling) reject("abort");
        });
        // Все завершающие события — до входа: timeout раньше оставлял мастер крутиться, а error без
        // слушателя бросался мимо промиса.
        session.on("error", reject);
        session.on("timeout", () => reject(new Error(t("errors.steamLoginTimeout"))));
        nextStep("loginByPassword");
        // Сбой или срок опроса входа приходит событием, а не ошибкой startWithCredentials:
        // без слушателей мастер крутился бы вечно (SDA-60)
        session.once("error", reject);
        session.once("timeout", () => reject(new Error("Login attempt timed out")));
        session
          .startWithCredentials({
            accountName,
            password
          })
          .then(async ({ actionRequired, validActions }) => {
            // Библиотека начинает опрос заново, даже если её отменили до ответа Steam
            if (signal?.aborted) return reject("abort");
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
                      steamAccountParams.accountName,
                      signal
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
                  if (signal?.aborted) return reject("abort");
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
            if (signal?.aborted) return reject("abort");
            if (error) return reject(error);
            if (!loggedIn) return reject(new Error("Not logged in"));
            if (familyView) return reject(new Error("Family view"));
            enrolling = true;
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
              onRecovery?.(rawMaFile.revocation_code, session.steamID.getSteamID64());
              console.log(
                backupFile
                  ? `${steamAccountParams.accountName} - секреты аутентификатора сохранены: ${backupFile}`
                  : `${steamAccountParams.accountName} - ВНИМАНИЕ: секреты НЕ сохранены на диск, они только в логе ниже`
              );
              // Секреты в лог — только запасной путь, когда на диск записать не удалось:
              // иначе revocation_code потеряется. В остальных случаях им в логе не место.
              // secret-log-ok: резервная копия при сбое записи на диск (мимо маскировки console)
              if (!backupFile) writeUnredacted(`${steamAccountParams.accountName} - секреты аутентификатора:`, rawMaFile); // i18n-ok: только лог

              // Код подтверждения приходит на ПОЧТУ, если телефон к аккаунту не привязан,
              // и в SMS, если привязан. Эндпоинт и поле activation_code одни и те же,
              // поэтому спрашиваем код одинаково — различается только источник.
              console.log(
                `${steamAccountParams.accountName} - код подтверждения придёт ` +
                (rawMaFile.phone_number_hint ? `в SMS (${rawMaFile.phone_number_hint})` : "на почту (телефон не привязан)")
              );

              const promtActivationCode = async () => {
                // Секреты уже сохранены: отмена закрывает окно кода и не даёт завершить подключение.
                // После отправки кода отменять поздно: Steam мог его принять.
                nextStep("askSmsCode");
                const code = await askSmsCode(
                  uuidv4(),
                  steamAccountParams.accountName,
                  signal
                );
                if (signal?.aborted) throw "abort";
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
              // Заполненное в форме раньше терялось, а куки включались всегда (SDA-62)
              useSteamCookies: steamAccountParams.useSteamCookies ?? true,
              profileName: steamAccountParams.profileName,
              mail: steamAccountParams.mail,
              mailPassword: steamAccountParams.mailPassword,
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
