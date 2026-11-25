// SDA-64: удаление аккаунта навсегда закрывает его браузер и отменяет запуск. Строка исчезает вместе
// с кнопкой «Стоп», поэтому браузер без владельца уже не закрыть из приложения.
jest.mock("../../application/application", () => ({ __esModule: true, default: {
    sendToMain: jest.fn(), images: { invalidateRoute: jest.fn(), removeAccount: jest.fn().mockResolvedValue(undefined) }
} }));
jest.mock("fs/promises", () => ({ access: jest.fn().mockResolvedValue(undefined), readdir: jest.fn().mockResolvedValue([]), rename: jest.fn(), rm: jest.fn() }));
jest.mock("../Chrome/resolveBrowserPath", () => ({ __esModule: true, default: jest.fn().mockResolvedValue("/fake/browser") }));
jest.mock("../Chrome/secureDnsPref", () => ({ ensureSecureDnsOff: jest.fn().mockResolvedValue(undefined), writeLocalState: jest.fn() }));

import puppeteer from "puppeteer-extra";
import resolveBrowserPath from "../Chrome/resolveBrowserPath";
import { BrowserStartCancelledError } from "../Chrome/Chrome";
import startBrowser from "../Listeners/steamAccountStartBrowser";
import deleteListener from "../Listeners/steamAccountDeleteListener";
import SteamAccount from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import LinksStorage from "../../newStorage/LinksStorage";

const params = { id: "a1", accountName: "fixture", maFile: {}, secondary: {}, changableSecondary: { steam: {} }, useSteamCookies: false } as any;
let account: SteamAccount;
const remove = async () => {
    const event = { reply: jest.fn() };
    await deleteListener(event as any, "a1");
    expect(event.reply).not.toHaveBeenCalled();
};

beforeEach(() => {
    new (require("electron-store"))().clear();
    LinksStorage.Save({ steamAccounts: { a1: null }, groups: {}, profiles: {} });
    SteamAccountStorage.Save("a1", { ...params });
    steamAccountManager.objects = [];
    account = new SteamAccount({ ...params });
    steamAccountManager.addNew(account);
    jest.spyOn(console, "log").mockImplementation(() => {});
    (resolveBrowserPath as jest.Mock).mockResolvedValue("/fake/browser");
});
afterEach(() => jest.restoreAllMocks());

it("closes the running browser", async () => {
    const browser = { close: jest.fn().mockResolvedValue(undefined) };
    account.chrome.browser = browser as any;
    await remove();
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(account.chrome.browser).toBeNull();
    expect(steamAccountManager.objects).toEqual([]);
    expect(SteamAccountStorage.GetAll()).toEqual({});
});

it("a browser that does not close is killed and the account is deleted all the same", async () => {
    const kill = jest.fn();
    account.chrome.browser = { close: jest.fn().mockRejectedValue(new Error("disconnected")), process: () => ({ kill }) } as any;
    await remove();
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    expect(SteamAccountStorage.GetAll()).toEqual({});
});

it("cancels a launch in progress", async () => {
    let resolvePath!: (path: string) => void;
    (resolveBrowserPath as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolvePath = resolve; }));
    const launch = jest.spyOn(puppeteer, "launch");
    const start = account.chrome.start();
    const cancelled = expect(start).rejects.toBeInstanceOf(BrowserStartCancelledError);
    await Promise.resolve();
    await remove();
    resolvePath("/fake/browser");
    await cancelled;
    expect(launch).not.toHaveBeenCalled();
});

it("a launch still waiting for its cookies never starts a browser", async () => {
    let cookies!: (value: string[]) => void;
    account.params.useSteamCookies = true;
    jest.spyOn(account, "getBrowserCookies").mockImplementationOnce(() => new Promise(resolve => { cookies = resolve; }));
    const start = jest.spyOn(account.chrome, "start");
    const event = { reply: jest.fn() };
    const started = startBrowser(event as any, "a1");
    await remove();
    cookies([]);
    await started;
    expect(start).not.toHaveBeenCalled();
    expect(event.reply).not.toHaveBeenCalled();
});
