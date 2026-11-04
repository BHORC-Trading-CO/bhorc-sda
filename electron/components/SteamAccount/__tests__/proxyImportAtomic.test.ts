// Real conf in a temporary directory: exercise its single atomic config write.
jest.mock("electron-store", () => {
    const Conf = require("conf");
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sda-proxy-import-"));
    return class Store extends Conf {
        static testDirectory = dir;
        constructor() { super({ cwd: dir, configName: "config", configFileMode: 0o600 }); }
    };
});
jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
jest.mock("../../SuperMethods/SuperMethods", () => ({ __esModule: true, default: { Sleep: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../Processes/maFileLogin", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../Processes/setupGuard", () => ({ __esModule: true, default: jest.fn() }));

import fs from "fs";
import nock from "nock";
import net from "net";
import createListener from "../Listeners/steamAccountCreateProcessListener";
import guardListener from "../Listeners/guardSetupProcessListener";
import steamAccountImport from "../Processes/steamAccountImport";
import maFileLogin from "../Processes/maFileLogin";
import setupGuard from "../Processes/setupGuard";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import LinksStorage from "../../newStorage/LinksStorage";
import ProxyStorage from "../../newStorage/ProxyStorage";
import proxyManager from "../../Proxy/proxyManager";
import Proxy from "../../Proxy/Proxy";
import steamAccountManager from "../steamAccountManager";
import SteamAccount from "../SteamAccount";
import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";

const Store = require("electron-store");
const Conf = require("conf");
const file = () => ({ accountName: "fake", password: "fake", maFile: { revocation_code: "R-TEST", Session: { SteamID: "76561198000000001" } }, secondary: {} } as any);
const proxy = { id: "p1", host: "proxy.test", port: "8080", username: "", password: "" } as any;
const params = () => ({ steamAccount: {}, accountName: "fake", password: "fake", links: { proxyMode: "savedProxy", proxyId: "p1", newProxy: null } } as any);
let connect: jest.SpyInstance;
beforeEach(() => {
    new Store().clear();
    proxyManager.objects = [new Proxy({ ...proxy })];
    ProxyStorage.Save("p1", proxy);
    steamAccountManager.objects = [];
    nock.disableNetConnect();
    connect = jest.spyOn(net.Socket.prototype, "connect").mockImplementation(() => { throw new Error("Unexpected socket"); });
});
afterEach(() => { expect(connect).not.toHaveBeenCalled(); jest.restoreAllMocks(); nock.enableNetConnect(); });
afterAll(() => fs.rmSync(Store.testDirectory, { recursive: true, force: true }));

it.each([[createListener, maFileLogin], [guardListener, setupGuard]])("F1 vanished proxy persists a blocked import, never a direct account (%#)", async (listener, flow) => {
    (flow as jest.Mock).mockImplementationOnce(async () => { proxyManager.delete("p1"); return file(); });
    const event = { reply: jest.fn() };
    await listener(event as any, params());
    expect(event.reply).not.toHaveBeenCalled();
    const [saved] = Object.values(SteamAccountStorage.GetAll());
    expect(LinksStorage.Get().steamAccounts[saved.id]).toBe("p1");
    expect(new SteamAccount(saved).proxyState).toBe("missing");
    expect(steamAccountManager.objects[0].proxyState).toBe("missing");
    if (listener === guardListener) expect(application.sendToMain).toHaveBeenCalledWith(
        SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT, expect.objectContaining({ revocationCode: "R-TEST" })
    );
});
it("F1 account and link are passed to one conf write", () => {
    const write = jest.spyOn(Conf.prototype, "set");
    const saved = steamAccountImport(file(), "gone");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
        [`steamAccounts.${saved.id}`]: expect.objectContaining({ id: saved.id }),
        links: expect.objectContaining({ steamAccounts: { [saved.id]: "gone" } })
    }));
    expect(steamAccountManager.objects[0].proxyState).toBe("missing");
});
it("F1 failed atomic write leaves neither a stored nor a live direct account", () => {
    jest.spyOn(Conf.prototype, "set").mockImplementationOnce(() => { throw new Error("write failed"); });
    expect(() => steamAccountImport(file(), "gone")).toThrow("write failed");
    expect(SteamAccountStorage.GetAll()).toEqual({});
    expect(LinksStorage.Get().steamAccounts).toEqual({});
    expect(steamAccountManager.objects).toEqual([]);
});
it("F1 Guard recovery result precedes local import failure", async () => {
    (setupGuard as jest.Mock).mockResolvedValueOnce(file());
    jest.spyOn(SteamAccountStorage, "SaveWithProxyLink").mockImplementationOnce(() => {
        expect(application.sendToMain).toHaveBeenCalledWith(SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT,
            expect.objectContaining({ revocationCode: "R-TEST" }));
        throw new Error("write failed");
    });
    const event = { reply: jest.fn() };
    await guardListener(event as any, params());
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, expect.stringContaining("write failed"));
    expect(SteamAccountStorage.GetAll()).toEqual({});
});
it("F1 Guard recovery survives failure after Steam returned the one-time code", async () => {
    (setupGuard as jest.Mock).mockImplementationOnce(async (_params, _proxy, onRecovery) => {
        onRecovery("R-TEST", "76561198000000001");
        throw new Error("secondary fetch failed");
    });
    const event = { reply: jest.fn() };
    await guardListener(event as any, params());
    expect(application.sendToMain).toHaveBeenCalledWith(SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT,
        expect.objectContaining({ revocationCode: "R-TEST" }));
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, expect.any(String));
});
it.each([new Error("login failed"), "abort"])("R2 N5 Create login failure %s leaves no new proxy", async failure => {
    const before = ProxyStorage.GetAll();
    (maFileLogin as jest.Mock).mockRejectedValueOnce(failure);
    await createListener({ reply: jest.fn() } as any, {
        steamAccount: {} as any,
        links: { proxyMode: "newProxy", proxyId: null, newProxy: { host: "new.test", port: "8080", username: "", password: "" } }
    });
    expect(ProxyStorage.GetAll()).toEqual(before);
    expect(proxyManager.objects).toHaveLength(1);
    expect(steamAccountManager.objects).toHaveLength(0);
});
it("R2 N5 new proxy is saved after successful login and before the atomic account import", async () => {
    let selected: any;
    (maFileLogin as jest.Mock).mockImplementationOnce(async (_params, _channels, proxy) => {
        selected = proxy;
        expect(ProxyStorage.GetAll()).not.toHaveProperty(proxy.id);
        return file();
    });
    const event = { reply: jest.fn() };
    await createListener(event as any, {
        steamAccount: {} as any,
        links: { proxyMode: "newProxy", proxyId: null, newProxy: { host: "new.test", port: "8080", username: "", password: "" } }
    });
    expect(event.reply).not.toHaveBeenCalled();
    expect(ProxyStorage.GetAll()[selected.id]).toMatchObject({ host: "new.test" });
    const account = steamAccountManager.objects[0];
    expect(LinksStorage.Get().steamAccounts[account.params.id]).toBe(selected.id);
    expect(account.proxyState).toBe("ok");
});
