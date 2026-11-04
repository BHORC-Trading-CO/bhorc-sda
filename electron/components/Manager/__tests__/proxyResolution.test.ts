jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
const mockHandlers: Record<string, Function> = {};
jest.mock("../../application/trustedIpc", () => ({ onTrusted: (channel: string, handler: Function) => { mockHandlers[channel] = handler; } }));

import Manager from "../Manager";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import ProxyStorage from "../../newStorage/ProxyStorage";
import LinksStorage from "../../newStorage/LinksStorage";
import proxyManager from "../../Proxy/proxyManager";
import Proxy from "../../Proxy/Proxy";
import SteamAccount from "../../SteamAccount/SteamAccount";
import steamAccountManager, { SteamAccountManager } from "../../SteamAccount/steamAccountManager";
import editListener from "../../SteamAccount/Listeners/steamAccountEditListener";
import proxiesRouter from "../../application/listenersRouters/proxiesListenersRouter";
import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";

const proxy = { id: "p1", host: "proxy.test", port: "8080", username: "", password: "", deleted: false } as any;
const params = () => ({ id: "a1", accountName: "test", maFile: {}, secondary: {}, changableSecondary: { steam: {} } } as any);
const links = (id?: string | null) => LinksStorage.Save({ steamAccounts: id === undefined ? {} : { a1: id }, profiles: {}, groups: {} });
beforeEach(() => {
    new (require("electron-store"))().clear();
    links();
    SteamAccountStorage.Save("a1", params());
    ProxyStorage.Save("p1", { ...proxy });
    proxyManager.objects = [new Proxy({ ...proxy })];
    steamAccountManager.objects = [];
    jest.spyOn(proxyManager, "sendProxiesToFront").mockImplementation(() => undefined);
    proxiesRouter();
});
afterEach(() => jest.restoreAllMocks());

it.each([
    [undefined, "none"], [null, "none"], ["p1", "ok"], ["gone", "missing"], ["", "missing"]
])("stored link %s resolves to %s", (id, state) => {
    links(id);
    expect(Manager.GetSteamAccountLinkedData("a1")).toMatchObject({ proxyState: state, proxyId: id ?? null });
});
it.each([{ host: "" }, { port: "" }])("stored incomplete proxy %o is missing and still loads", patch => {
    proxyManager.objects = [new Proxy({ ...proxy, ...patch })];
    links("p1");
    const account = new SteamAccount(params());
    expect(account.proxyState).toBe("missing");
    expect(SteamAccountManager.CompileObject(account)).toMatchObject({ proxyState: "missing", proxyId: "p1" });
});
it("DELETE_PROXY preserves dangling link and rebuilds both clients as blocked", async () => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    const { session, community } = account;
    const event = { reply: jest.fn() };
    await mockHandlers.DELETE_PROXY(event, "p1");
    expect(event.reply).not.toHaveBeenCalled();
    expect(LinksStorage.Get().steamAccounts.a1).toBe("p1");
    expect(Manager.GetSteamAccountLinkedData("a1")).toEqual({ proxy: null, proxyId: "p1", proxyState: "missing" });
    expect(account.proxyState).toBe("missing");
    expect(account.session).not.toBe(session);
    expect(account.community).not.toBe(community);
    expect(() => account.proxyUrl()).toThrow(expect.objectContaining({ code: "PROXY_UNAVAILABLE" }));
    expect(application.sendToMain).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_EDIT_PROXY, { id: "a1", proxy: null, proxyId: "p1", proxyState: "missing" });
});
it("explicit unlink is none; relink is ok and rebuilds clients", () => {
    links("gone");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    const blocked = account.community;
    Manager.LinkProxyToSteamAccount("a1", null);
    expect(account.proxyState).toBe("none");
    expect(account.proxyUrl()).toBeNull();
    expect(account.community).not.toBe(blocked);
    const direct = { community: account.community, session: account.session };
    Manager.LinkProxyToSteamAccount("a1", "p1");
    expect(account.proxyState).toBe("ok");
    expect(account.proxyUrl()).toBe("http://:@proxy.test:8080");
    expect(account.community).not.toBe(direct.community);
    expect(account.session).not.toBe(direct.session);
});
it("invalid relink rejects and retains the previous link", () => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    expect(() => Manager.LinkProxyToSteamAccount("a1", "gone")).toThrow(expect.objectContaining({ code: "PROXY_UNAVAILABLE" }));
    expect(LinksStorage.Get().steamAccounts.a1).toBe("p1");
});
it.each([true, false])("account archive/restore without links retains the route (%s)", async deleted => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    const event = { reply: jest.fn() };
    await editListener(event as any, { id: "a1", steamAccountParams: { deleted } });
    expect(event.reply).not.toHaveBeenCalled();
    expect(LinksStorage.Get().steamAccounts.a1).toBe("p1");
    expect(account.proxyState).toBe("ok");
});
it.each([true, false])("proxy archive/restore does not unlink accounts (%s)", async deleted => {
    links("p1");
    steamAccountManager.addNew(new SteamAccount(params()));
    const event = { reply: jest.fn() };
    await mockHandlers.EDIT_PROXY(event, { id: "p1", proxy: { deleted }, links: { steamAccountIds: [], originalSteamAccountIds: ["a1"] } });
    expect(event.reply).not.toHaveBeenCalled();
    expect(LinksStorage.Get().steamAccounts.a1).toBe("p1");
});
it("explicit EDIT_PROXY account-list removal still unlinks", async () => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    await mockHandlers.EDIT_PROXY({ reply: jest.fn() }, { id: "p1", proxy: { host: "proxy2.test" }, links: { steamAccountIds: [], originalSteamAccountIds: ["a1"] } });
    expect(account.proxyState).toBe("none");
});
it("invalid proxy edit immediately blocks linked clients", async () => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    const event = { reply: jest.fn() };
    await mockHandlers.EDIT_PROXY(event, { id: "p1", proxy: { host: "" }, links: { steamAccountIds: ["a1"] } });
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringContaining("ProxyUnavailableError"));
    expect(account.proxyState).toBe("missing");
    expect(LinksStorage.Get().steamAccounts.a1).toBe("p1");
});
it("reloading proxies blocks live accounts whose proxy disappeared from storage", () => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    jest.spyOn(ProxyStorage, "GetAll").mockReturnValue({});
    proxyManager.load();
    expect(account.proxyState).toBe("missing");
    expect(LinksStorage.Get().steamAccounts.a1).toBe("p1");
});
it("an explicit account-list-only edit still unlinks", async () => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    await mockHandlers.EDIT_PROXY({ reply: jest.fn() }, { id: "p1", proxy: {}, links: { steamAccountIds: [], originalSteamAccountIds: ["a1"] } });
    expect(account.proxyState).toBe("none");
});

function addLinked(id: string, proxyId: string | null = "p1") {
    const data = { ...params(), id };
    SteamAccountStorage.Save(id, data);
    const stored = LinksStorage.Get();
    LinksStorage.Save({ ...stored, steamAccounts: { ...stored.steamAccounts, [id]: proxyId } });
    const account = new SteamAccount(data);
    steamAccountManager.addNew(account);
    return account;
}
it.each(["link", "delete"])("R2 F4 accounts Refresh retains the browser owner before %s", async action => {
    const account = addLinked("a1", action === "link" ? null : "p1");
    const chrome = account.chrome;
    const browser = { close: jest.fn().mockResolvedValue(undefined) };
    chrome.browser = browser as any;
    chrome.workStatus = "working";
    jest.spyOn(account, "initSession").mockResolvedValue(undefined);
    SteamAccountStorage.EditData("a1", { password: "updated", useSteamCookies: true });
    await steamAccountManager.load();
    const reloaded = steamAccountManager.getById("a1")!;
    expect(reloaded.chrome).toBe(chrome);
    expect(chrome.params).toMatchObject({ password: "updated", useSteamCookies: true });
    expect(browser.close).not.toHaveBeenCalled();
    if (action === "link") Manager.LinkProxyToSteamAccount("a1", "p1");
    else proxyManager.delete("p1");
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(chrome.workStatus).toBe("notworking");
});
it("R2 F4 accounts Refresh detects an externally changed route during a pending start", async () => {
    const account = addLinked("a1", null);
    account.chrome.workStatus = "load";
    const stop = jest.spyOn(account.chrome, "stop");
    links("gone");
    await steamAccountManager.load();
    expect(steamAccountManager.getById("a1")).toBe(account);
    expect(account.proxyState).toBe("missing");
    expect(stop).toHaveBeenCalledWith("routeChanged");
});
it("R2 F4 accounts Refresh stops browsers belonging to removed records", async () => {
    const account = addLinked("a1", null);
    const browser = { close: jest.fn().mockResolvedValue(undefined) };
    account.chrome.browser = browser as any;
    account.chrome.workStatus = "working";
    SteamAccountStorage.Delete("a1");
    await steamAccountManager.load();
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(steamAccountManager.getById("a1")).toBeNull();
});
it("R2 N2 a route edit affecting multiple browsers emits one non-blocking notice per event", async () => {
    const accounts = [addLinked("a1"), addLinked("a2")];
    for (const account of accounts) {
        account.chrome.browser = { close: jest.fn().mockResolvedValue(undefined) } as any;
        account.chrome.workStatus = "working";
    }
    proxyManager.edit("p1", { host: "replacement.test" });
    await Promise.resolve();
    const notices = () => (application.sendToMain as jest.Mock).mock.calls.filter(([channel]) => channel === SteamAccountChannels.BROWSER_ROUTE_CHANGED);
    expect(notices()).toHaveLength(1);
    expect(notices()[0][1]).toEqual(expect.any(String));
    expect(application.sendToMain).not.toHaveBeenCalledWith("ERROR", expect.anything());
    for (const account of accounts) {
        account.chrome.browser = { close: jest.fn().mockResolvedValue(undefined) } as any;
        account.chrome.workStatus = "working";
    }
    proxyManager.delete("p1");
    await Promise.resolve();
    expect(notices()).toHaveLength(2);
});
it("R2 N7 failed client rebuild publishes the blocked state immediately and on table refresh", () => {
    const account = addLinked("a1", null);
    jest.spyOn(account, "setProxy").mockImplementationOnce(() => { throw new Error("rebuild failed"); });
    expect(() => Manager.LinkProxyToSteamAccount("a1", "p1")).toThrow("rebuild failed");
    expect(application.sendToMain).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_EDIT_PROXY,
        { id: "a1", proxyId: "p1", proxyState: "missing", proxy: null });
    expect(SteamAccountManager.CompileObject(account)).toMatchObject({ proxyId: "p1", proxyState: "missing", proxy: null });
});
it("F3 validates every requested id before changing endpoint or links", async () => {
    const a1 = addLinked("a1"), a2 = addLinked("a2");
    const event = { reply: jest.fn() };
    await mockHandlers.EDIT_PROXY(event, { id: "p1", proxy: { host: "other.test" }, links: {
        steamAccountIds: ["a1", "ghost", "a2"], originalSteamAccountIds: ["a1", "a2"]
    } });
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringContaining("ghost"));
    expect(proxyManager.getById("p1")?.params.host).toBe("proxy.test");
    expect([a1.proxyState, a2.proxyState]).toEqual(["ok", "ok"]);
    expect(LinksStorage.Get().steamAccounts).toEqual({ a1: "p1", a2: "p1" });
});
it("F3 snapshot diff preserves accounts linked after the form opened", async () => {
    const removed = addLinked("a1"), retained = addLinked("a2"), late = addLinked("late");
    const oldCommunity = retained.community;
    const save = jest.spyOn(LinksStorage, "Save");
    await mockHandlers.EDIT_PROXY({ reply: jest.fn() }, { id: "p1", proxy: {}, links: {
        steamAccountIds: ["a2"], originalSteamAccountIds: ["a1", "a2"]
    } });
    expect(save).toHaveBeenCalledTimes(1);
    expect(LinksStorage.Get().steamAccounts).toEqual({ a1: null, a2: "p1", late: "p1" });
    expect(retained.community).toBe(oldCommunity);
    expect(removed.proxyState).toBe("none");
    expect(late.proxyState).toBe("ok");
});
it("F3 a failed link save changes no account to direct", async () => {
    const a1 = addLinked("a1"), a2 = addLinked("a2");
    jest.spyOn(LinksStorage, "Save").mockImplementationOnce(() => { throw new Error("write failed"); });
    const event = { reply: jest.fn() };
    await mockHandlers.EDIT_PROXY(event, { id: "p1", proxy: {}, links: {
        steamAccountIds: ["a2"], originalSteamAccountIds: ["a1", "a2"]
    } });
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringContaining("write failed"));
    expect(LinksStorage.Get().steamAccounts).toEqual({ a1: "p1", a2: "p1" });
    expect([a1.proxyState, a2.proxyState]).toEqual(["ok", "ok"]);
});
it("F3 one client failure blocks it and still refreshes the other committed additions", () => {
    const a1 = addLinked("a1", null), a2 = addLinked("a2", null);
    jest.spyOn(a1, "setProxy").mockImplementationOnce(() => { throw new Error("rebuild failed"); });
    const apply = Manager.PlanProxyAccountLinks("p1", ["a1", "a2"], []);
    expect(apply).toThrow("rebuild failed");
    expect(LinksStorage.Get().steamAccounts).toEqual({ a1: "p1", a2: "p1" });
    expect(a1.proxyState).toBe("missing");
    expect(a2.proxyState).toBe("ok");
});
it("F3 no snapshot grants additions only, never implicit removals", () => {
    addLinked("a1");
    Manager.PlanProxyAccountLinks("p1", [])();
    expect(LinksStorage.Get().steamAccounts.a1).toBe("p1");
});
it("F6 refresh/reload keeps session identity, cookies and in-flight login on an unchanged route", () => {
    const account = addLinked("a1");
    account.community.setCookies(["steamLoginSecure=76561198000000001%7C%7Ctest", "sessionid=abc"]);
    const { session, community } = account;
    const cancel = jest.spyOn(session, "cancelLoginAttempt");
    jest.spyOn(ProxyStorage, "GetAll").mockReturnValue({ p1: { ...proxy } });
    proxyManager.load();
    expect(account.session).toBe(session);
    expect(account.community).toBe(community);
    expect(cancel).not.toHaveBeenCalled();
    expect((community as any)._jar.getCookieString("https://steamcommunity.com/")).toContain("sessionid=abc");
});
it("F6 route change reinitializes cookies once; metadata edits preserve them", async () => {
    const account = addLinked("a1");
    const init = jest.spyOn(account, "initSession").mockResolvedValue(undefined);
    const original = account.community;
    proxyManager.edit("p1", { host: "replacement.test" });
    expect(account.community).not.toBe(original);
    expect(init).toHaveBeenCalledTimes(1);
    const rerouted = account.community;
    proxyManager.edit("p1", { deleted: true });
    expect(account.community).toBe(rerouted);
    expect(init).toHaveBeenCalledTimes(1);
});
it("F6 relinking missing to ok reinitializes and reports failures as strings", async () => {
    const account = addLinked("a1", "gone");
    const init = jest.spyOn(account, "initSession").mockRejectedValue(new Error("cookie failure"));
    Manager.LinkProxyToSteamAccount("a1", "p1");
    await Promise.resolve();
    expect(init).toHaveBeenCalledTimes(1);
    expect(application.sendToMain).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR,
        { id: "a1", err: "Error: cookie failure" });
});
it.each(["link", "unlink", "delete", "endpoint", "credentials"])("F4 route transition %s stops the running browser", async transition => {
    const account = addLinked("a1", transition === "link" ? null : "p1");
    account.chrome.workStatus = "working";
    const stop = jest.spyOn(account.chrome, "stop").mockResolvedValue(undefined);
    if (transition === "link") Manager.LinkProxyToSteamAccount("a1", "p1");
    if (transition === "unlink") Manager.LinkProxyToSteamAccount("a1", null);
    if (transition === "delete") proxyManager.delete("p1");
    if (transition === "endpoint") proxyManager.edit("p1", { host: "replacement.test" });
    if (transition === "credentials") proxyManager.edit("p1", { password: "changed" });
    expect(stop).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(application.sendToMain).toHaveBeenCalledWith(SteamAccountChannels.BROWSER_ROUTE_CHANGED, expect.any(String));
    expect(application.sendToMain).not.toHaveBeenCalledWith("ERROR", expect.anything());
});
it("F4/F6 unchanged route keeps the running browser", () => {
    const account = addLinked("a1");
    account.chrome.workStatus = "working";
    const stop = jest.spyOn(account.chrome, "stop").mockResolvedValue(undefined);
    Manager.RefreshAllAccountProxies();
    expect(stop).not.toHaveBeenCalled();
});
it("F8 missing account unrelated edit succeeds with omitted or unchanged links", async () => {
    const account = addLinked("a1", "gone");
    const event = { reply: jest.fn() };
    await editListener(event as any, { id: "a1", steamAccountParams: { password: "changed" } });
    await editListener(event as any, { id: "a1", steamAccountParams: { password: "changed-again" }, links: { proxyId: "gone", profileId: null } });
    expect(event.reply).not.toHaveBeenCalled();
    expect(LinksStorage.Get().steamAccounts.a1).toBe("gone");
    expect(account.proxyState).toBe("missing");
});
it("F3/F4 delete continues blocking and stopping other accounts after one rebuild fails", () => {
    const a1 = addLinked("a1"), a2 = addLinked("a2");
    for (const account of [a1, a2]) account.chrome.workStatus = "working";
    const stop1 = jest.spyOn(a1.chrome, "stop").mockResolvedValue(undefined);
    const stop2 = jest.spyOn(a2.chrome, "stop").mockResolvedValue(undefined);
    jest.spyOn(a1, "setProxy").mockImplementationOnce(() => { throw new Error("rebuild failed"); });
    expect(() => proxyManager.delete("p1")).toThrow("rebuild failed");
    expect([a1.proxyState, a2.proxyState]).toEqual(["missing", "missing"]);
    expect(stop1).toHaveBeenCalled();
    expect(stop2).toHaveBeenCalled();
});
