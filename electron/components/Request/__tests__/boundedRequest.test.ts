import http from "http";
import net, { AddressInfo } from "net";
import request from "request";
import SteamCommunity from "steamcommunity";
import boundedRequest, { REQUEST_DEADLINES } from "../boundedRequest";

// Настоящие сокеты на 127.0.0.1: молчащий прокси нельзя честно изобразить моком request.
const servers: net.Server[] = [];
const sockets = new Set<net.Socket>();
const originalDeadlines = { ...REQUEST_DEADLINES };

function listen(server: net.Server): Promise<number> {
    servers.push(server);
    server.on("connection", (socket: net.Socket) => {
        sockets.add(socket);
        socket.on("error", () => undefined).on("close", () => sockets.delete(socket));
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

// Принимает соединение и никогда не отвечает на CONNECT
const silentProxy = () => listen(net.createServer((socket) => socket.resume()));

const call = (req: any, options: any) =>
    new Promise<{ err: any; response: any; body: any }>((resolve) =>
        req(options, (err: any, response: any, body: any) => resolve({ err, response, body })));

beforeEach(() => Object.assign(REQUEST_DEADLINES, { connectMs: 150, totalMs: 400 }));
afterEach(async () => {
    Object.assign(REQUEST_DEADLINES, originalDeadlines);
    for (const socket of sockets) socket.destroy();
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("boundedRequest: прокси молчит на CONNECT", () => {
    it("запрос завершается ошибкой, соединение с прокси закрыто", async () => {
        const proxy = `http://u:p@127.0.0.1:${await silentProxy()}`;
        const { err } = await call(boundedRequest({ proxy }), { url: "https://steamcommunity.com/market/" });
        expect(String(err)).toContain("Proxy connection timed out");
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(sockets.size).toBe(0);
    });

    it("post и defaults() поверх (так оборачивает steamcommunity) тоже ограничены", async () => {
        const proxy = `http://127.0.0.1:${await silentProxy()}`;
        const post = await call(boundedRequest({ proxy }).post, { url: "https://login.steampowered.com/jwt/finalizelogin" });
        expect(String(post.err)).toContain("Proxy connection timed out");
        const nested = await call(boundedRequest({ proxy }).defaults({ timeout: 50_000 }), { url: "https://steamcommunity.com/" });
        expect(String(nested.err)).toContain("Proxy connection timed out");
    });

    it("SteamCommunity поверх такого клиента отвечает ошибкой", async () => {
        const proxy = `http://127.0.0.1:${await silentProxy()}`;
        const community = new SteamCommunity({ request: boundedRequest({ proxy }) as never });
        const err = await new Promise((resolve) => (community as any).httpRequestGet("https://steamcommunity.com/market/", resolve));
        expect(String(err)).toContain("Proxy connection timed out");
    });

    it("контроль: обычный request с timeout на том же прокси не завершается", async () => {
        const proxy = `http://127.0.0.1:${await silentProxy()}`;
        let settled = false;
        const req = request.defaults({ proxy, timeout: 100 }).get({ url: "https://steamcommunity.com/" }, () => { settled = true; });
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(settled).toBe(false);
        req.abort();
    });

    it("поток без callback получает error ровно один раз", async () => {
        const proxy = `http://127.0.0.1:${await silentProxy()}`;
        const errors: unknown[] = [];
        boundedRequest({ proxy }).get({ url: "https://avatars.steamstatic.com/x.jpg" }).on("error", (err) => errors.push(err));
        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(errors.map(String)).toEqual([expect.stringContaining("Proxy connection timed out")]);
    });
});

describe("boundedRequest: запрос целиком", () => {
    it("ответ, который капает по байту, обрывается по общему сроку", async () => {
        const port = await listen(http.createServer((_req, res) => {
            res.write("x");
            const drip = setInterval(() => res.write("x"), 50);
            res.on("close", () => clearInterval(drip));
        }));
        const results: any[] = [];
        await new Promise<void>((resolve) => boundedRequest().get({ url: `http://127.0.0.1:${port}/` }, (err) => { results.push(err); resolve(); }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ code: "ETIMEDOUT" });
    });

    it("обычный ответ приходит как есть, таймеры сняты", async () => {
        const port = await listen(http.createServer((_req, res) => res.end("ok")));
        const { err, response, body } = await call(boundedRequest(), { url: `http://127.0.0.1:${port}/` });
        expect(err).toBeNull();
        expect([response.statusCode, body]).toEqual([200, "ok"]);
    });

    it("медленный, но живой CONNECT-прокси не обрывается раньше срока", async () => {
        const target = await listen(net.createServer((socket) => socket.end()));
        const proxyServer = http.createServer();
        proxyServer.on("connect", (_req, client) => setTimeout(() => {
            const upstream = net.connect(target, "127.0.0.1", () => {
                client.write("HTTP/1.1 200 OK\r\n\r\n");
                upstream.pipe(client).pipe(upstream);
            });
            upstream.on("error", () => client.destroy());
            client.on("error", () => upstream.destroy());
        }, 80));
        const proxy = `http://127.0.0.1:${await listen(proxyServer)}`;
        const { err } = await call(boundedRequest({ proxy }), { url: "https://steamcommunity.com/" });
        // Туннель построен, а TLS с заглушкой не состоится: важно, что это не наш срок CONNECT
        expect(String(err)).not.toContain("Proxy connection timed out");
    });
});
