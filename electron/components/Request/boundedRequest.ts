import request, { CoreOptions } from "request";

/**
 * request с гарантией, что вызов когда-нибудь завершится (SDA-60).
 *
 * `timeout` библиотеки request ставится на событие socket, а при HTTPS через HTTP-прокси сокет
 * появляется только ПОСЛЕ ответа прокси на CONNECT. Прокси, который принял соединение и молчит,
 * не завершал запрос никогда, с любым timeout: аккаунт навсегда оставался «загружается», окно
 * подтверждений крутило спиннер, браузер не стартовал, очередь обновления теряла место.
 *
 * Здесь два срока:
 *  - CONNECT: сколько ждать, пока прокси построит туннель. Запрос в Steam ещё не отправлен,
 *    поэтому обрыв безопасен и для привязки Guard.
 *  - запрос целиком: ответ, который капает по байту, тоже когда-нибудь закончится.
 */
export const REQUEST_DEADLINES = { connectMs: 20_000, totalMs: 90_000 };

export type BoundedRequest = ReturnType<typeof request.defaults>;

export default function boundedRequest(options: CoreOptions = {}): BoundedRequest {
    // Второй аргумент defaults — requester: через него проходит каждый вызов, включая get/post
    // и defaults() поверх (так делает steamcommunity).
    return request.defaults({ timeout: 50_000, ...options }, requester as never);
}

function requester(options: any, callback?: request.RequestCallback) {
    const req = callback ? request(options, (...args) => settle(...args)) : request(options);

    let settled = false;
    const settle: request.RequestCallback = (...args) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback?.(...args);
    };
    const timer = setTimeout(() => {
        if (settled) return;
        req.abort();
        const err = Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" });
        // После abort() request не зовёт callback и не шлёт error: завершаем сами.
        if (callback) return settle(err, undefined as never, undefined);
        settled = true;
        req.emit("error", err);
    }, REQUEST_DEADLINES.totalMs);
    const stop = () => {
        if (!callback) settled = true;
        clearTimeout(timer);
    };
    req.on("error", stop).on("complete", stop);

    watchTunnel(req);
    // Редирект на другой адрес строит новый туннель
    req.on("redirect", () => watchTunnel(req));
    return req;
}

// Агент туннеля (tunnel-agent) создаётся на каждый запрос, до его старта. Срок вешаем на сам запрос
// CONNECT: его обрыв tunnel-agent передаёт дальше как обычную ошибку запроса и закрывает сокет.
function watchTunnel(req: request.Request) {
    const agent = (req as unknown as { agent?: { proxyOptions?: unknown; request?: (...args: any[]) => any } }).agent;
    if (!agent?.proxyOptions || typeof agent.request !== "function") return;
    const open = agent.request;
    agent.request = function (this: unknown, ...args: any[]) {
        const connect = open.apply(this, args);
        const timer = setTimeout(
            () => connect.destroy(new Error("Proxy connection timed out")), REQUEST_DEADLINES.connectMs);
        const stop = () => clearTimeout(timer);
        // Наши слушатели первые: в onConnect tunnel-agent снимает все
        connect.once("connect", stop).once("error", stop).once("close", stop);
        return connect;
    };
}
