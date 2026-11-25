import boundedRequest from "../../Request/boundedRequest";
import SteamTotp from "steam-totp";
import { STEAM_MOBILE_USER_AGENT, STEAM_ACCEPT_ENCODING } from "./steamUserAgent";
import { isLostResponse, unknownOutcome } from "./guardOutcome";
import { t } from "../../../i18n";

/**
 * Завершает подключение аутентификатора (ITwoFactorService/FinalizeAddAuthenticator).
 *
 * Почему свой запрос, а не community.finalizeTwoFactor():
 *  1. Библиотека не шлёт validate_sms_code, без которого Steam не проверяет
 *     activation_code. Код подтверждения приходит на почту (если телефон к аккаунту
 *     не привязан) или в SMS (если привязан) — эндпоинт и поле одни и те же.
 *  2. Библиотека берёт сдвиг времени отдельным запросом (SteamTotp.getTimeOffset)
 *     МИМО прокси. Здесь сдвиг считаем из server_time, который Steam уже вернул
 *     в AddAuthenticator, — лишнего запроса нет вообще.
 *
 * want_more означает "код TOTP не подошёл, пришли следующий": Steam сверяет код по
 * своим часам, поэтому сдвигаем время на 30 секунд и пробуем снова.
 */

const MAX_ATTEMPTS = 30;

// Steam мог уже включить Guard: обрыв ожидания выглядел бы ошибкой. Срок — только на CONNECT (SDA-60).
const NO_RESPONSE_DEADLINE = { wholeRequest: false, idle: false };

export default function finalizeAddAuthenticator(params: {
    accessToken: string;
    steamID64: string;
    sharedSecret: string;
    /** Код подтверждения из письма или SMS. */
    activationCode: string;
    /** server_time из ответа AddAuthenticator — база для сдвига часов. */
    serverTime: number;
    proxyUrl?: string | null;
    /** Отмена мастера: новый запрос не отправляется, ответ на отправленный дожидаемся (SDA-63). */
    signal?: AbortSignal;
}): Promise<void> {
    const { accessToken, steamID64, sharedSecret, activationCode, serverTime, proxyUrl, signal } = params;

    const defaults = {
        gzip: true,
        headers: {
            "user-agent": STEAM_MOBILE_USER_AGENT,
            "accept-encoding": STEAM_ACCEPT_ENCODING,
        },
    };
    const req = proxyUrl
        ? boundedRequest({ proxy: proxyUrl, ...defaults }, NO_RESPONSE_DEADLINE)
        : boundedRequest(defaults, NO_RESPONSE_DEADLINE);

    const now = () => Math.floor(Date.now() / 1000);
    let offset = Number(serverTime) - now();

    return new Promise<void>((resolve, reject) => {
        let attemptsLeft = MAX_ATTEMPTS;

        const attempt = () => {
            if (signal?.aborted) return reject("abort");
            const steamTime = now() + offset;
            req.post(
                {
                    url: `https://api.steampowered.com/ITwoFactorService/FinalizeAddAuthenticator/v1/?access_token=${accessToken}`,
                    form: {
                        steamid: steamID64,
                        authenticator_code: SteamTotp.generateAuthCode(sharedSecret, offset),
                        authenticator_time: steamTime,
                        activation_code: activationCode,
                        validate_sms_code: 1,
                    },
                    json: true,
                },
                (err: any, resp: any, body: any) => {
                    if (err) return reject(isLostResponse(err) ? unknownOutcome(err) : err);

                    const response = body && body.response;
                    // Ни успеха, ни кода отказа: чем кончился запрос, Steam не сказал
                    if (!response || (!response.success && !response.want_more && response.status === undefined)) {
                        const failed = resp?.statusCode >= 400
                            ? Object.assign(new Error(`HTTP error ${resp.statusCode}`), { code: resp.statusCode })
                            : new Error("Malformed response");
                        return reject(isLostResponse(failed) ? unknownOutcome(failed) : failed);
                    }

                    if (response.server_time) {
                        offset = Number(response.server_time) - now();
                    }

                    // 89 — введён неверный код подтверждения; наверх, чтобы переспросить.
                    if (response.status == 89) {
                        return reject(new Error("Invalid activation code"));
                    }

                    if (response.want_more) {
                        attemptsLeft--;
                        if (attemptsLeft <= 0) {
                            return reject(new Error(t("errors.totpNotAccepted")));
                        }
                        offset += 30;
                        return attempt();
                    }

                    if (!response.success) {
                        return reject(new Error(`Error ${response.status}`));
                    }

                    resolve();
                }
            );
        };

        attempt();
    });
}
