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
    await mockHandlers.EDIT_PROXY(event, { id: "p1", proxy: { deleted }, links: { steamAccountIds: [] } });
    expect(event.reply).not.toHaveBeenCalled();
    expect(LinksStorage.Get().steamAccounts.a1).toBe("p1");
});
it("explicit EDIT_PROXY account-list removal still unlinks", async () => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    await mockHandlers.EDIT_PROXY({ reply: jest.fn() }, { id: "p1", proxy: { host: "proxy2.test" }, links: { steamAccountIds: [] } });
    expect(account.proxyState).toBe("none");
});
it("invalid proxy edit immediately blocks linked clients", async () => {
    links("p1");
    const account = new SteamAccount(params());
    steamAccountManager.addNew(account);
    const event = { reply: jest.fn() };
    await mockHandlers.EDIT_PROXY(event, { id: "p1", proxy: { host: "" }, links: { steamAccountIds: ["a1"] } });
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.objectContaining({ code: "PROXY_UNAVAILABLE" }));
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
    await mockHandlers.EDIT_PROXY({ reply: jest.fn() }, { id: "p1", proxy: {}, links: { steamAccountIds: [] } });
    expect(account.proxyState).toBe("none");
});
