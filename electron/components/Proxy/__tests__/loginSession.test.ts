import http from "http";
import { AddressInfo } from "net";
import createLoginSession, { LOGIN_DEADLINES } from "../loginSession";

const deadlines = { ...LOGIN_DEADLINES };
afterEach(() => { Object.assign(LOGIN_DEADLINES, deadlines); });

const token = `e30.${Buffer.from(JSON.stringify({ sub: "76561190000000000", aud: ["web", "renew", "derive", "mobile"], exp: 9999999999 })).toString("base64url")}.c2ln`;

// Настоящий LoginSession, подменён только сетевой вызов под нашей обёрткой
function sessionWith(respond: (url: string) => unknown) {
    const { HttpClient } = jest.requireActual("steam-session/node_modules/@doctormckay/stdlib/http");
    const urls: string[] = [];
    const spy = jest.spyOn(HttpClient.prototype, "request").mockImplementation(async (...args: unknown[]) => {
        const { url } = args[0] as { url: string };
        urls.push(url);
        return respond(url);
    });
    const session = createLoginSession("http://u:p@127.0.0.1:1");
    session.refreshToken = token;
    return { session, urls, spy };
}
const transfers = (...urls: string[]) => ({ jsonBody: { transfer_info: urls.map((url) => ({ url, params: {} })) } });
const cookie = { headers: { "set-cookie": ["steamLoginSecure=x; path=/"] } };
afterEach(() => jest.restoreAllMocks());

it("адрес transfer по http не открывается: токен не уходит мимо прокси", async () => {
    const { session, urls } = sessionWith((url) => /finalizelogin/.test(url)
        ? transfers("http://store.steampowered.com/login/settoken", "https://steamcommunity.com/login/settoken") : cookie);
    await expect(session.getWebCookies()).resolves.toEqual(["steamLoginSecure=x"]);
    expect(urls).toEqual(["https://login.steampowered.com/jwt/finalizelogin", "https://steamcommunity.com/login/settoken"]);
});

it("сбой всех transfer — ошибка, а не вечное ожидание", async () => {
    const { session } = sessionWith((url) => {
        if (/finalizelogin/.test(url)) return transfers("https://a.test/login/settoken", "https://b.test/login/settoken");
        throw new Error("ECONNRESET");
    });
    await expect(session.getWebCookies()).rejects.toBeTruthy();
});

it("transfer с другим путём: сбой не теряется", async () => {
    const { session } = sessionWith((url) => {
        if (/finalizelogin/.test(url)) return transfers("http://steam.tv/login/transfer", "https://steam.tv/login/transfer");
        throw new Error("ECONNRESET");
    });
    await expect(session.getWebCookies()).rejects.toBeTruthy();
});

it("пустой список transfer завершается по сроку", async () => {
    LOGIN_DEADLINES.cookiesMs = 20;
    const { session } = sessionWith(() => transfers());
    await expect(session.getWebCookies()).rejects.toThrow("timed out");
});

it("запрос без ответа завершается по сроку, запрос по http не отправляется", async () => {
    LOGIN_DEADLINES.requestMs = 20;
    const { session } = sessionWith(() => new Promise(() => undefined));
    await expect(session.refreshAccessToken()).rejects.toThrow("timed out");
    const client = (session as unknown as { _webClient: { request(options: { url: string }): Promise<unknown> } })._webClient;
    await expect(client.request({ url: "http://api.steampowered.com/" })).resolves.toEqual({ statusCode: 400, headers: {} });
});

it("контроль: без обёртки LoginSession открывает http-адрес напрямую, мимо прокси", async () => {
    const hits: string[] = [];
    const server = http.createServer((req, res) => { hits.push(req.url!); res.end(); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/login/settoken`;
    const { LoginSession, EAuthTokenPlatformType } = jest.requireActual("steam-session");
    const plain = new LoginSession(EAuthTokenPlatformType.MobileApp, { httpProxy: "http://u:p@127.0.0.1:1" });
    await plain._webClient.request({ method: "GET", url });
    expect(hits).toEqual(["/login/settoken"]);
    const wrapped = createLoginSession("http://u:p@127.0.0.1:1") as unknown as { _webClient: { request(options: object): Promise<unknown> } };
    await wrapped._webClient.request({ method: "GET", url });
    expect(hits).toHaveLength(1);
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
});
