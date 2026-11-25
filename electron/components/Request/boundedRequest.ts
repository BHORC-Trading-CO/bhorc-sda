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
 *  - запрос целиком: ответ, который капает по байту, тоже когда-нибудь закончится. Для запросов,
 *    ответ которых нельзя потерять (секреты Guard), его отключают: wholeRequest: false. idle: false
 *    снимает и срок молчания после отправки.
 */
export const REQUEST_DEADLINES = { connectMs: 20_000, totalMs: 90_000 };

export type BoundedRequest = ReturnType<typeof request.defaults>;

export default function boundedRequest(options: CoreOptions = {}, { wholeRequest = true, idle = true } = {}): BoundedRequest {
    // Второй аргумент defaults — requester: через него проходит каждый вызов, включая get/post
    // и defaults() поверх (так делает steamcommunity).
    const bounded = request.defaults(
        { ...(idle ? { timeout: 50_000 } : {}), ...options },
        ((target: any, callback?: request.RequestCallback) => send(target, callback, wholeRequest)) as never,
    );
    // defaults() пропускает через requester и этот помощник, а он ничего не отправляет
    bounded.cookie = request.cookie;
    return bounded;
}

function send(options: any, callback: request.RequestCallback | undefined, wholeRequest: boolean) {
    const connects = new Set<{ destroy(err?: Error): void }>();
    // Общий срок — только для вызовов с callback: потоковых в приложении через эту функцию нет
    if (!callback || !wholeRequest) return watchTunnels(request(options, callback), connects);

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = function (this: unknown, ...args: Parameters<request.RequestCallback>) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback.apply(this, args);
    };
    // request может позвать callback ещё в конструкторе (неверный адрес)
    const req = watchTunnels(request(options, settle as request.RequestCallback), connects);
    if (settled) return req;
    timer = setTimeout(() => {
        req.abort();
        for (const connect of connects) connect.destroy();
        // После abort() request не зовёт callback и не шлёт error: завершаем сами.
        settle.call(req, Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" }), undefined as never, undefined);
    }, REQUEST_DEADLINES.totalMs);
    timer.unref?.();
    // Запрос отменил сам вызывающий: ответа не будет, срок больше не нужен
    req.on("abort", () => clearTimeout(timer));
    return req;
}

// init() выбирает агента и для первого запроса, и для каждого редиректа (новый адрес — новый
// туннель), до отправки. Первый init() уже прошёл в конструкторе.
function watchTunnels(req: request.Request, connects: Set<{ destroy(err?: Error): void }>): request.Request {
    const internals = req as unknown as { init?: (options?: unknown) => unknown };
    const init = internals.init;
    if (typeof init === "function") {
        internals.init = function (this: unknown, options?: unknown) {
            const result = init.call(this, options);
            watchTunnel(req, connects);
            return result;
        };
    }
    watchTunnel(req, connects);
    return req;
}

// Агент туннеля (tunnel-agent) создаётся на каждый запрос, до его старта. Срок вешаем на сам запрос
// CONNECT: его обрыв tunnel-agent передаёт дальше как обычную ошибку запроса и закрывает сокет.
function watchTunnel(req: request.Request, connects: Set<{ destroy(err?: Error): void }>) {
    const agent = (req as unknown as { agent?: { proxyOptions?: unknown; request?: (...args: any[]) => any; sdaWatched?: boolean } }).agent;
    if (!agent?.proxyOptions || typeof agent.request !== "function" || agent.sdaWatched) return;
    agent.sdaWatched = true;
    const open = agent.request;
    agent.request = function (this: unknown, ...args: any[]) {
        const connect = open.apply(this, args);
        connects.add(connect);
        const timer = setTimeout(
            () => connect.destroy(new Error("Proxy connection timed out")), REQUEST_DEADLINES.connectMs);
        timer.unref?.();
        const stop = () => {
            clearTimeout(timer);
            connects.delete(connect);
        };
        // Наши слушатели первые: в onConnect tunnel-agent снимает все
        connect.once("connect", stop).once("error", stop).once("close", stop);
        return connect;
    };
}
