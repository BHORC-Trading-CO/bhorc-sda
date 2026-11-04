jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));

import nock from "nock";
import net from "net";
import request from "request";
import SteamTotp from "steam-totp";
import SteamAccount from "../SteamAccount";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import LinksStorage from "../../newStorage/LinksStorage";
import proxyManager from "../../Proxy/proxyManager";
import { blockedAgent } from "../../Proxy/blockedTransport";
import { setMainLanguage } from "../../../i18n";

const params = () => ({
    id: "blocked", accountName: "fake", password: "fake", maFile: { shared_secret: "c2hhcmVk", identity_secret: "aWRlbnRpdHk=" },
    secondary: {}, changableSecondary: { steam: {} }
} as any);
const token = (aud: string[]) => `e30.${Buffer.from(JSON.stringify({ sub: "76561198000000001", aud, exp: 2147483647 })).toString("base64")}.fake`;
let connect: jest.SpyInstance;
beforeEach(() => {
    setMainLanguage("en");
    nock.disableNetConnect();
    connect = jest.spyOn(net.Socket.prototype, "connect").mockImplementation(() => { throw new Error("Unexpected socket attempt"); });
    LinksStorage.Save({ steamAccounts: { blocked: "gone" }, profiles: {}, groups: {} });
    proxyManager.objects = [];
    SteamAccountStorage.Save("blocked", params());
});
afterEach(() => {
    expect(connect).not.toHaveBeenCalled();
    jest.restoreAllMocks();
    nock.cleanAll();
    nock.enableNetConnect();
});

it("constructs a missing account without throwing and keeps offline Guard working", () => {
    const account = new SteamAccount(params());
    expect(account.proxyState).toBe("missing");
    expect(() => account.proxyUrl()).toThrow(expect.objectContaining({ code: "PROXY_UNAVAILABLE" }));
    expect(SteamTotp.generateAuthCode(account.params.maFile.shared_secret)).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
});
it.each(["http", "https"])("real community %s requests fail before any socket", async protocol => {
    const account = new SteamAccount(params());
    const error = await new Promise(resolve => account.community.httpRequestGet({ uri: `${protocol}://steamcommunity.com/` }, err => resolve(err)));
    expect(error).toMatchObject({ code: "PROXY_UNAVAILABLE" });
});
it("real session credential login fails through the blocked transport", async () => {
    const account = new SteamAccount(params());
    await expect(account.session.startWithCredentials({ accountName: "fake", password: "fake" })).rejects.toMatchObject({ code: "PROXY_UNAVAILABLE" });
});
it.each(["refreshAccessToken", "getWebCookies"] as const)("real session %s also fails closed", async method => {
    const account = new SteamAccount(params());
    account.session.refreshToken = token(["derive", "mobile"]);
    await expect(account.session[method]()).rejects.toMatchObject({ code: "PROXY_UNAVAILABLE" });
});
it.each([
    (account: SteamAccount) => account.initSession(),
    (account: SteamAccount) => account.getBrowserCookies(),
    (account: SteamAccount) => (account as any).setCommunityCookies(),
    (account: SteamAccount) => account.loginByPassword(),
    (account: SteamAccount) => account.getSecondary(),
    (account: SteamAccount) => account.isLogin(),
    (account: SteamAccount) => account.getConfirmations(),
    (account: SteamAccount) => account.confirmItems([1], ["key"]),
    (account: SteamAccount) => account.cancelItems([1], ["key"]),
    (account: SteamAccount) => account.setPin(1234),
])("account network operation %# fails visibly without a socket", async operation => {
    await expect(operation(new SteamAccount(params()))).rejects.toMatchObject({ code: "PROXY_UNAVAILABLE" });
});
it("balance errors are strings suitable for IPC", async () => {
    const result = await new SteamAccount(params()).getChangableSecondary();
    expect(result.steam.error).toEqual(expect.stringContaining("Proxy #gone is unavailable"));
    expect(typeof result.steam.error).toBe("string");
});
it.each(["http", "https"])("blocked Agent rejects %s even below community's pre-request guard", async protocol => {
    // Nock replaces ClientRequest before an Agent is reached. Temporarily restore
    // native HTTP so this checks the real agent; Socket.connect is still a tripwire.
    nock.restore();
    try {
        const error = await new Promise(resolve => request({ url: `${protocol}://steamcommunity.com/`, proxy: null, agent: blockedAgent("gone") }, err => resolve(err)));
        expect(error).toMatchObject({ code: "PROXY_UNAVAILABLE" });
    } finally {
        nock.activate();
    }
});
