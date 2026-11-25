// SDA-64: удаление аккаунта навсегда закрывает его браузер и отменяет запуск. Строка исчезает вместе
// с кнопкой «Стоп», поэтому браузер без владельца уже не закрыть из приложения. И смена маршрута:
// прямой браузер не должен пережить привязку прокси, даже если связь с ним пропала.
jest.mock("../../application/application", () => ({ __esModule: true, default: {
    sendToMain: jest.fn(), images: { invalidateRoute: jest.fn(), removeAccount: jest.fn().mockResolvedValue(undefined) }
} }));
jest.mock("fs/promises", () => ({ access: jest.fn().mockResolvedValue(undefined), readdir: jest.fn().mockResolvedValue([]), rename: jest.fn().mockResolvedValue(undefined), rm: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../Chrome/resolveBrowserPath", () => ({ __esModule: true, default: jest.fn().mockResolvedValue("/fake/browser") }));
jest.mock("../Chrome/secureDnsPref", () => ({ ensureSecureDnsOff: jest.fn().mockResolvedValue(undefined), writeLocalState: jest.fn() }));

import { EventEmitter } from "events";
import fsp from "fs/promises";
import puppeteer from "puppeteer-extra";
import resolveBrowserPath from "../Chrome/resolveBrowserPath";
import { ensureSecureDnsOff } from "../Chrome/secureDnsPref";
import { BROWSER_CLOSE_TIMEOUT_MS, BROWSER_SHUTDOWN_MS, BrowserStartCancelledError } from "../Chrome/Chrome";
import { setMainLanguage } from "../../../i18n";
import application from "../../application/application";
import Manager from "../../Manager/Manager";
import proxyManager from "../../Proxy/proxyManager";
import Proxy from "../../Proxy/Proxy";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import startBrowser from "../Listeners/steamAccountStartBrowser";
import deleteListener from "../Listeners/steamAccountDeleteListener";
import SteamAccount from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import LinksStorage from "../../newStorage/LinksStorage";

const params = { id: "a1", accountName: "fixture", maFile: {}, secondary: {}, changableSecondary: { steam: {} }, useSteamCookies: false } as any;
let account: SteamAccount;
const replies: unknown[][] = [];
const remove = () => {
    const event = { reply: jest.fn((...args: unknown[]) => { replies.push(args); }) };
    return deleteListener(event as any, "a1");
};
const errorText = () => replies.map(([channel, err]) => [channel, (err as Error).message]);
const isGone = () => steamAccountManager.getById("a1") === null && !("a1" in SteamAccountStorage.GetAll());
const isKept = () => steamAccountManager.getById("a1") === account && "a1" in SteamAccountStorage.GetAll();
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

/** Процесс браузера: завершается по kill, если не сказано, что он не убивается. */
function makeProcess(killable = true) {
    const child: any = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
    child.exit = () => { child.exitCode = 0; child.emit("exit"); };
    child.kill = jest.fn(() => { if (killable) child.exit(); return killable; });
    return child;
}
function makeBrowser(child: any, close: () => Promise<unknown>) {
    const target = { url: () => "about:blank" };
    const page = {
        authenticate: async () => undefined, evaluateOnNewDocument: async () => undefined, setCookie: async () => undefined,
        goto: async () => undefined, close: async () => undefined, target: () => target, url: () => "about:blank",
    };
    const listeners: Record<string, () => void> = {};
    return { on: jest.fn((event: string, listener: () => void) => { listeners[event] = listener; }), disconnect: () => listeners.disconnected(), newPage: jest.fn(async () => page), pages: async () => [page], targets: () => [target], close: jest.fn(close), process: () => child };
}
async function running(child: any, close: () => Promise<unknown>) {
    const browser = makeBrowser(child, close);
    jest.spyOn(puppeteer, "launch").mockResolvedValueOnce(browser as any);
    await account.chrome.start();
    expect(account.chrome.browser).toBe(browser);
    return browser;
}

beforeEach(() => {
    new (require("electron-store"))().clear();
    LinksStorage.Save({ steamAccounts: { a1: null }, groups: {}, profiles: {} });
    SteamAccountStorage.Save("a1", { ...params });
    steamAccountManager.objects = [];
    account = new SteamAccount({ ...params });
    steamAccountManager.addNew(account);
    jest.spyOn(console, "log").mockImplementation(() => {});
    (resolveBrowserPath as jest.Mock).mockResolvedValue("/fake/browser");
    // restoreAllMocks сбрасывает и их: без этого запуск 5 секунд ждал бы вкладки прошлого сеанса.
    for (const name of ["access", "rename", "rm"] as const) (fsp[name] as jest.Mock).mockResolvedValue(undefined);
    (fsp.readdir as unknown as jest.Mock).mockResolvedValue([]);
    (ensureSecureDnsOff as jest.Mock).mockResolvedValue(undefined);
    replies.length = 0;
    setMainLanguage("en");
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it("the record is removed only after the browser process has exited", async () => {
    const child = makeProcess();
    let closed!: () => void;
    const browser = await running(child, () => new Promise<void>(resolve => { closed = () => { child.exit(); resolve(); }; }));
    const deletion = remove();
    await settle();
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(isKept()).toBe(true);
    closed();
    await deletion;
    expect(isGone()).toBe(true);
    expect(replies).toEqual([]);
    expect(child.kill).not.toHaveBeenCalled();
});

it("a browser that does not close is killed; the confirmed exit lets the deletion through", async () => {
    const child = makeProcess();
    await running(child, () => Promise.reject(new Error("disconnected")));
    await remove();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(isGone()).toBe(true);
    expect(replies).toEqual([]);
});

it("a browser that cannot be stopped keeps the account; the deletion can be repeated", async () => {
    const child = makeProcess(false);
    await running(child, () => new Promise(() => {}));
    jest.useFakeTimers();
    const deletion = remove();
    for (let passed = 0; passed < BROWSER_SHUTDOWN_MS; passed += 500) {
        await settle();
        expect(isKept()).toBe(true);
        jest.advanceTimersByTime(500);
    }
    await deletion;
    expect(BROWSER_CLOSE_TIMEOUT_MS).toBeLessThan(BROWSER_SHUTDOWN_MS);
    expect(errorText()).toEqual([["ERROR", expect.stringContaining("its browser could not be stopped")]]);
    expect(isKept()).toBe(true);
    expect(account.chrome.launchesBlocked).toBe(false);
    jest.useRealTimers();
    // Владелец остался: повторное удаление добивает тот же процесс.
    child.kill.mockImplementation(() => { child.exit(); return true; });
    await remove();
    expect(isGone()).toBe(true);
});

it("a storage failure leaves the account in the manager and it can be started again", async () => {
    jest.spyOn(SteamAccountStorage, "Delete").mockImplementationOnce(() => { throw new Error("disk"); });
    await remove();
    expect(errorText()).toEqual([["ERROR", expect.stringContaining("disk")]]);
    expect(isKept()).toBe(true);
    await running(makeProcess(), async () => undefined);
});

it("no launch starts while the account is being deleted, and a second delete waits for the first", async () => {
    const child = makeProcess();
    let closed!: () => void;
    await running(child, () => new Promise<void>(resolve => { closed = () => { child.exit(); resolve(); }; }));
    const launch = jest.spyOn(puppeteer, "launch").mockClear();
    const deletion = remove();
    await settle();
    const event = { reply: jest.fn() };
    await startBrowser(event as any, "a1");
    await remove();
    expect(isKept()).toBe(true);
    closed();
    await deletion;
    expect(isGone()).toBe(true);
    expect(launch).not.toHaveBeenCalled();
    expect(event.reply).not.toHaveBeenCalled();
    expect(replies).toEqual([]);
});

it("cancels a launch that has not reached Chromium", async () => {
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
    expect(isGone()).toBe(true);
});

it("a launch caught inside puppeteer is waited for and its browser is closed before the record goes", async () => {
    const child = makeProcess();
    const browser = makeBrowser(child, async () => child.exit());
    let launched!: () => void;
    jest.spyOn(puppeteer, "launch").mockImplementationOnce(() => new Promise(resolve => { launched = () => resolve(browser as any); }) as any);
    const start = account.chrome.start();
    const cancelled = expect(start).rejects.toBeInstanceOf(BrowserStartCancelledError);
    await settle();
    const deletion = remove();
    await settle();
    expect(isKept()).toBe(true);
    launched();
    await Promise.all([deletion, cancelled]);
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(child.exitCode).toBe(0);
    expect(isGone()).toBe(true);
});

it("a launch still waiting for its cookies never starts a browser", async () => {
    let cookies!: (value: string[]) => void;
    account.params.useSteamCookies = true;
    jest.spyOn(account, "getBrowserCookies").mockImplementationOnce(() => new Promise(resolve => { cookies = resolve; }));
    const launch = jest.spyOn(puppeteer, "launch");
    const event = { reply: jest.fn() };
    const started = startBrowser(event as any, "a1");
    await remove();
    cookies([]);
    await started;
    await settle();
    expect(isGone()).toBe(true);
    expect(launch).not.toHaveBeenCalled();
    expect(event.reply).not.toHaveBeenCalled();
});

it("a second Start does not hide the first: both pending launches are waited for", async () => {
    const [first, second] = [makeProcess(), makeProcess()];
    const browsers = [makeBrowser(first, async () => first.exit()), makeBrowser(second, async () => second.exit())];
    const launched: (() => void)[] = [];
    jest.spyOn(puppeteer, "launch").mockImplementation(() => new Promise(resolve => {
        const browser = browsers[launched.length];
        launched.push(() => resolve(browser as any));
    }) as any);
    const starts = [account.chrome.start()];
    const cancelled = [expect(starts[0]).rejects.toBeInstanceOf(BrowserStartCancelledError)];
    await settle();
    starts.push(account.chrome.start());
    cancelled.push(expect(starts[1]).rejects.toBeInstanceOf(BrowserStartCancelledError));
    await settle();
    expect(launched).toHaveLength(2);
    const deletion = remove();
    await settle();
    launched[1]();
    await settle();
    expect(second.exitCode).toBe(0);
    expect(isKept()).toBe(true);
    launched[0]();
    await Promise.all([deletion, ...cancelled]);
    expect(first.exitCode).toBe(0);
    expect(isGone()).toBe(true);
});

describe("the connection to the browser is lost while its process lives", () => {
    const noticeSent = () => (application.sendToMain as jest.Mock).mock.calls.some(([channel]) => channel === SteamAccountChannels.BROWSER_ROUTE_CHANGED);
    const linkProxy = async () => {
        Manager.LinkProxyToSteamAccount("a1", "p1");
        await settle();
    };
    beforeEach(() => {
        proxyManager.objects = [new Proxy({ id: "p1", number: 1, host: "proxy.test", port: "8080", username: "", password: "", deleted: false })];
        jest.spyOn(account, "startSession").mockResolvedValue(undefined);
        (application.sendToMain as jest.Mock).mockClear();
    });

    it("deletion waits for the process, not for the connection", async () => {
        const child = makeProcess(false);
        const browser = await running(child, async () => undefined);
        browser.disconnect();
        expect([account.chrome.browser, account.chrome.workStatus]).toEqual([null, "notworking"]);
        const deletion = remove();
        await settle();
        expect(child.kill).toHaveBeenCalledWith("SIGKILL");
        expect(isKept()).toBe(true);
        child.exit();
        await deletion;
        expect(isGone()).toBe(true);
    });

    it("a direct browser does not survive direct -> proxy", async () => {
        const child = makeProcess();
        const browser = await running(child, async () => undefined);
        browser.disconnect();
        expect(account.chrome.isRunning).toBe(true);
        await linkProxy();
        expect(child.kill).toHaveBeenCalledWith("SIGKILL");
        expect(account.chrome.isRunning).toBe(false);
        expect(noticeSent()).toBe(true);
    });

    it("a browser the operator closed is not killed while it finishes, and is no news after it has", async () => {
        const child = makeProcess();
        const browser = await running(child, async () => undefined);
        browser.disconnect();
        await account.chrome.stop();
        expect(child.kill).not.toHaveBeenCalled();
        child.exit();
        expect(account.chrome.isRunning).toBe(false);
        await linkProxy();
        expect(noticeSent()).toBe(false);
    });

    it("a browser that is closing normally is not killed by another route change", async () => {
        const child = makeProcess();
        let closed!: () => void;
        const browser = await running(child, () => new Promise<void>(resolve => { closed = () => { child.exit(); resolve(); }; }));
        await linkProxy();
        expect(browser.close).toHaveBeenCalledTimes(1);
        Manager.LinkProxyToSteamAccount("a1", null);
        await account.chrome.stop("routeChanged");
        expect(child.kill).not.toHaveBeenCalled();
        closed();
        await settle();
        expect(account.chrome.isRunning).toBe(false);
    });

    it("a process that survived its close counts as running again", async () => {
        const child = makeProcess(false);
        await running(child, () => Promise.reject(new Error("disconnected")));
        await expect(account.chrome.stop()).rejects.toThrow("disconnected");
        await settle();
        expect(account.chrome.isRunning).toBe(true);
        child.kill.mockClear();
        await linkProxy();
        expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    });
});
