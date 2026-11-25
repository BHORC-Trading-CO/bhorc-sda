import SteamTotp from "steam-totp";
import SteamCommunity from "steamcommunity";
import CreationStepType from "../../../interfaces/SteamAccount/CreationStepType";
import MaFileInterface from "../../../interfaces/SteamAccount/MaFileInterface";
import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import application from "../../application/application";
import askSmsCode from "../../application/askInfo/askSmsCode";
import askMailCode from "../../application/askInfo/askMailCode";
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
import { isLostResponse, unknownOutcome } from "../Functions/guardOutcome";
import passwordSignIn from "./passwordSignIn";

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
  onRecovery?: (revocationCode: string, steamId: string, backupFile: string | null) => void,
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

    const signIn = (accountName: string, password: string) => {
      nextStep("loginByPassword");
      return passwordSignIn(session, { accountName, password }, async (validActions, prompts) => {
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
          throw new Error(
            "This account already has two-factor authentication enabled."
          );
        }
        if (!emailPromt) throw `Failed to log in, action required: ${validActions}`;
        console.log(
          `An email has been sent to your address at ${emailPromt.detail}`
        );
        const promtEmailCode = async () => {
          if (prompts.aborted) return;
          nextStep("askEmailCode");
          const code = await askMailCode(
            uuidv4(),
            steamAccountParams.accountName,
            prompts
          );
          if (prompts.aborted) return;
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
      }, signal);
    };

    // Подключение идёт после входа и больше от него не зависит.
    const enroll = (): Promise<MaFileInterface> => {
      return new Promise<MaFileInterface>((resolve, reject) => {
        // Отмена (SDA-63) останавливает мастер до запроса AddAuthenticator. С его отправки Steam мог
        // выдать секреты: ответ дожидаемся и сохраняем, а отмену проверяем перед следующими шагами.
        let enrolling = false;
        if (signal?.aborted) return reject("abort");
        signal?.addEventListener("abort", () => {
          if (!enrolling) reject("abort");
        });
        // Cookie берём именно для steamcommunity.com: getWebCookies() отдаёт cookie
        // случайного домена, и тогда loggedIn() ниже вернёт false. См. applyCommunityCookies.
        applyCommunityCookies(community, session, proxyUrl, steamAccountParams.accountName).then(() => {
          community.loggedIn((error, loggedIn, familyView) => {
            // reject, а не throw: throw из колбэка request'а не реджектит промис,
            // а улетает необработанным исключением — процесс подключения guard'а зависал.
            if (signal?.aborted) return reject("abort");
            if (error) return reject(error);
            if (!loggedIn) return reject(new Error("Not logged in"));
            if (familyView) return reject(new Error("Family view"));
            let sent = false;
            try {
              // Библиотека проверяет токен исключениями
              //@ts-ignore
              community.setMobileAppAccessToken(session.accessToken);
              enrolling = true;
              community.enableTwoFactor((err, response) => {
                // Ошибка до возврата из вызова — отказ самой библиотеки, в Steam ничего не ушло
                if (err && sent && isLostResponse(err)) return reject(unknownOutcome(err));
                activate(err, response).then(resolve, reject);
              });
              sent = true;
            } catch (err) {
              reject(err);
            }
          });
        }).catch(reject);
      });
    };

    const activate = async (err: any, response: any): Promise<MaFileInterface> => {
      nextStep("enableTwoFactor");
      if (err) {
        if (err.eresult == EResult.Fail) {
          throw new Error(
            "Failed to enable two-factor authentication. Perhaps the phone number is not attached."
          );
        }
        if (err.eresult == EResult.RateLimitExceeded) {
          throw new Error("RateLimitExceeded. Try again later.");
        }
        throw err;
      }
      if (response.status != EResult.OK) {
        throw new Error(`Status ${response.status}`);
      }
      const rawMaFile: TwoFactorResponseInterface = response;
      // Секреты на диск ПЕРВЫМ делом: Steam отдаёт shared_secret и revocation_code
      // ровно один раз, и всё, что идёт ниже (ввод кода, finalize), может оборваться.
      const backupFile = savePendingAuthenticator(
        steamAccountParams.accountName,
        rawMaFile,
        session.steamID.getSteamID64()
      );
      onRecovery?.(rawMaFile.revocation_code, session.steamID.getSteamID64(), backupFile);
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
        // Ответ на отправленный код дожидаемся: Steam мог его принять.
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
            signal,
          });
        } catch (error) {
          if (error.message == "Invalid activation code") {
            await promtActivationCode();
          } else {
            throw error;
          }
        }
      };

      await promtActivationCode();
      return {
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
    };

    signIn(steamAccountParams.accountName, steamAccountParams.password)
      .then(enroll)
      .then((maFile) => {
        // Guard уже включён: аккаунт отдаём сразу, без профиля. Раньше сбой его загрузки терял
        // аккаунт целиком (SDA-63); профиль догружает слушатель после сохранения.
        const sMaFile: SmaFileInterface = {
          accountName: steamAccountParams.accountName,
          password: steamAccountParams.password,
          maFile: maFile,
          secondary: { nickname: "", level: null, avatarUrl: "", ktState: null, tpState: null, tradeState: null, registeredAt: null },
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
  });
}
