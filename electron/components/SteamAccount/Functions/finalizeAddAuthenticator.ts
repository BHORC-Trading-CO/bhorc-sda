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

// Steam отдаёт время и числом, и строкой цифр
const isServerTime = (value: unknown) =>
    (typeof value === "number" && Number.isFinite(value) && value > 0) || (typeof value === "string" && /^[1-9]\d{0,14}$/.test(value));

/** Ответ, из которого ясен исход: типы верные, поля не спорят, есть успех, просьба о коде или код отказа. */
function isTrustworthy(response: any): boolean {
    if (!response || typeof response !== "object") return false;
    const { success, want_more, status, server_time } = response;
    const isFlag = (value: unknown) => value == null || typeof value === "boolean";
    if (!isFlag(success) || !isFlag(want_more)) return false;
    if (status != null && !Number.isFinite(status)) return false;
    if (server_time != null && !isServerTime(server_time)) return false;
    if (success === true && status === 89) return false;
    return success === true || want_more === true || status != null;
}

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
    // Без времени Steam — по своим часам: из NaN получился бы код 1970 года (SDA-63)
    let offset = isServerTime(serverTime) ? Number(serverTime) - now() : 0;

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
                    const http = resp?.statusCode;
                    if (http < 200 || http >= 300) {
                        const failed = Object.assign(new Error(`HTTP error ${http}`), { code: http });
                        // Отказ — только 4xx, и только если он не спорит с телом
                        const refused = http >= 400 && http < 500 && response?.success !== true;
                        return reject(refused ? failed : unknownOutcome(failed));
                    }
                    if (!isTrustworthy(response)) return reject(unknownOutcome(new Error("Malformed response")));

                    if (response.server_time != null) {
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

                    if (response.success !== true) {
                        return reject(new Error(`Error ${response.status}`));
                    }

                    resolve();
                }
            );
        };

        attempt();
    });
}
