import { EAuthTokenPlatformType, LoginSession } from "steam-session";
import withDeadline from "../Functions/withDeadline";

// Объект, а не константы: тесты подменяют сроки.
export const LOGIN_DEADLINES = { requestMs: 60_000, cookiesMs: 120_000 };

/**
 * Клиент входа с прокси аккаунта (SDA-60). Закрывает три места steam-session 1.2:
 *  - у её запросов нет срока на ответ (5 с отведено только на CONNECT);
 *  - через прокси она ведёт только HTTPS: адрес с http:// в ответе Steam (список transfer в
 *    getWebCookies) ушёл бы с реального IP вместе с токеном — такие адреса не открываем;
 *  - сбой одного transfer или пустой их список оставляют getWebCookies висеть навсегда.
 */
export default function createLoginSession(proxyUrl: string | null | undefined): LoginSession {
    const session = proxyUrl
        ? new LoginSession(EAuthTokenPlatformType.MobileApp, { httpProxy: proxyUrl })
        : new LoginSession(EAuthTokenPlatformType.MobileApp);

    type Request = (options: { url: string }) => Promise<unknown>;
    const client = (session as unknown as { _webClient?: { request: Request } })._webClient;
    if (client) {
        const send = client.request.bind(client);
        client.request = async (options) => {
            // Ответ без cookie: transfer отклонится как обычный неудачный
            const refused = { statusCode: 400, headers: {} };
            const isTransfer = /\/login\/settoken/i.test(options.url);
            if (!/^https:\/\//i.test(options.url)) {
                if (isTransfer) return refused;
                throw new Error("Only HTTPS is allowed for Steam sign-in");
            }
            const response = withDeadline(send(options), LOGIN_DEADLINES.requestMs, () => new Error("Steam sign-in request timed out"));
            return isTransfer ? response.catch(() => refused) : response;
        };
    }
    const getWebCookies = session.getWebCookies?.bind(session);
    if (getWebCookies) {
        session.getWebCookies = () =>
            withDeadline(getWebCookies(), LOGIN_DEADLINES.cookiesMs, () => new Error("Steam sign-in timed out"));
    }
    return session;
}
