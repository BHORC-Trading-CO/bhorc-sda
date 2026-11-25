import nock from "nock";
import getCommunityWebCookies from "../getCommunityWebCookies";

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

const finalize = (body: unknown) => nock("https://login.steampowered.com").post("/jwt/finalizelogin").reply(200, body as any);
const transfer = (url: string) => ({ transfer_info: [{ url, params: { nonce: "n" } }] });

it("обмен отменён между запросами (сменился прокси): токен вторым запросом не уходит", async () => {
    finalize(transfer("https://steamcommunity.com/login/settoken"));
    const settoken = nock("https://steamcommunity.com").post("/login/settoken").reply(200, "", { "Set-Cookie": "steamLoginSecure=x" });
    let calls = 0;
    await expect(getCommunityWebCookies("token", "1", null, () => { if (++calls === 2) throw new Error("route changed"); })).rejects.toThrow("route changed");
    expect(settoken.isDone()).toBe(false);
});

it("действующий обмен возвращает cookie", async () => {
    finalize(transfer("https://steamcommunity.com/login/settoken"));
    nock("https://steamcommunity.com").post("/login/settoken").reply(200, "", { "Set-Cookie": "steamLoginSecure=x; path=/" });
    await expect(getCommunityWebCookies("token", "1", null, () => undefined)).resolves.toEqual(["steamLoginSecure=x"]);
});

it.each([
    ["http", transfer("http://steamcommunity.com/login/settoken")],
    ["чужой адрес с подстрокой", transfer("https://evil.test/steamcommunity.com")],
    ["нет списка", {}], ["null", "null"], ["не список", { transfer_info: "x" }],
])("токен не уходит: %s", async (_name, body) => {
    finalize(body);
    await expect(getCommunityWebCookies("token", "1")).rejects.toBeTruthy();
});
