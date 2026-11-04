jest.mock("fs/promises", () => ({ access: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../resolveBrowserPath", () => ({ __esModule: true, default: jest.fn().mockResolvedValue("/fake/browser") }));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
import Chrome, { BrowserStartCancelledError, BROWSER_CLOSE_TIMEOUT_MS } from "../Chrome";
import resolveBrowserPath from "../resolveBrowserPath";
import puppeteer from "puppeteer-extra";
import LinksStorage from "../../../newStorage/LinksStorage";
import application from "../../../application/application";
import SteamAccountChannels from "../../../../interfaces/IpcChannels/SteamAccountChannels";

const make = () => new Chrome({ id: "a1", secondary: {} } as any);
beforeEach(() => LinksStorage.Save({ steamAccounts: { a1: null }, groups: {}, profiles: {} }));
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
it("F4 stop closes the live browser and removes stale handles", async () => {
    const chrome = make();
    const browser = { close: jest.fn().mockResolvedValue(undefined) };
    chrome.browser = browser as any;
    chrome.workStatus = "working";
    await chrome.stop();
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(chrome.browser).toBeNull();
    expect(chrome.workStatus).toBe("notworking");
});
it("F4 failed browser close kills only its own child process", async () => {
    const chrome = make();
    const kill = jest.fn();
    chrome.browser = { close: jest.fn().mockRejectedValue(new Error("disconnected")), process: () => ({ kill }) } as any;
    await expect(chrome.stop()).rejects.toThrow("disconnected");
    expect(kill).toHaveBeenCalledWith("SIGKILL");
});
it("F4 route change while resolving executable prevents launch", async () => {
    let resolvePath!: (path: string) => void;
    (resolveBrowserPath as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolvePath = resolve; }));
    const launch = jest.spyOn(puppeteer, "launch");
    const chrome = make();
    const start = chrome.start();
    await Promise.resolve();
    expect(chrome.workStatus).toBe("load");
    await chrome.stop();
    resolvePath("/fake/browser");
    await expect(start).rejects.toThrow();
    expect(launch).not.toHaveBeenCalled();
});
it("F4 route change during pending launch closes the returned browser before opening a page", async () => {
    let resolveLaunch!: (browser: any) => void;
    let launchStarted!: () => void;
    const started = new Promise<void>(resolve => { launchStarted = resolve; });
    jest.spyOn(puppeteer, "launch").mockImplementationOnce(() => new Promise(resolve => {
        resolveLaunch = resolve; launchStarted();
    }) as any);
    const chrome = make();
    const start = chrome.start();
    await started;
    await chrome.stop();
    const browser = { close: jest.fn().mockResolvedValue(undefined), newPage: jest.fn() };
    resolveLaunch(browser);
    await expect(start).rejects.toThrow();
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(browser.newPage).not.toHaveBeenCalled();
    expect(chrome.browser).toBeNull();
});

function launched() {
    const page = {
        authenticate: jest.fn().mockResolvedValue(undefined),
        evaluateOnNewDocument: jest.fn().mockResolvedValue(undefined),
        setCookie: jest.fn().mockResolvedValue(undefined),
        goto: jest.fn().mockResolvedValue(undefined)
    };
    const browser = {
        on: jest.fn(), newPage: jest.fn().mockResolvedValue(page),
        close: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(puppeteer, "launch").mockResolvedValue(browser as any);
    return { browser, page };
}
it.each(["goto", "authenticate", "setCookie"] as const)("R2 N1 post-launch %s failure leaves the browser working", async method => {
    const { browser, page } = launched();
    const chrome = make();
    chrome.params.useSteamCookies = true;
    jest.spyOn(chrome, "setupProxy").mockImplementation(async () => {
        chrome.proxy = { server: "proxy.test:8080", username: "fake", password: "fake" };
    });
    page[method].mockRejectedValueOnce(new Error(`${method} failed`));
    await expect(chrome.start(["sessionid=fake"])).rejects.toThrow(`${method} failed`);
    expect(browser.close).not.toHaveBeenCalled();
    expect(chrome.browser).toBe(browser);
    expect(chrome.workStatus).toBe("working");
    expect(application.sendToMain).toHaveBeenLastCalledWith(SteamAccountChannels.GET_BROWSER_STARTUS, { id: "a1", status: "working" });
});
it("R2 N1 pre-launch failure resets the loading status", async () => {
    (resolveBrowserPath as jest.Mock).mockRejectedValueOnce(new Error("no executable"));
    const chrome = make();
    await expect(chrome.start()).rejects.toThrow("no executable");
    expect(chrome.browser).toBeNull();
    expect(chrome.workStatus).toBe("notworking");
});
it("R2 N2 loading status is immediate and a second Start silently supersedes the first", async () => {
    let resolvePath!: (path: string) => void;
    (resolveBrowserPath as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolvePath = resolve; }));
    const { browser } = launched();
    const chrome = make();
    const first = chrome.start();
    const rejected = expect(first).rejects.toMatchObject({ reason: "superseded" });
    expect(application.sendToMain).toHaveBeenCalledWith(SteamAccountChannels.GET_BROWSER_STARTUS, { id: "a1", status: "load" });
    expect(resolveBrowserPath).not.toHaveBeenCalled();
    await Promise.resolve();
    await chrome.start();
    resolvePath("/fake/browser");
    await rejected;
    expect(browser.close).not.toHaveBeenCalled();
    expect(chrome.browser).toBe(browser);
    expect(chrome.workStatus).toBe("working");
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
});
it("R2 N2 a cancelled pending launch cannot replace or close its successor", async () => {
    let resolveFirst!: (browser: any) => void;
    let started!: () => void;
    const pending = new Promise<void>(resolve => { started = resolve; });
    const { browser: current } = launched();
    (puppeteer.launch as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; started(); }));
    const chrome = make();
    const first = chrome.start();
    const rejected = expect(first).rejects.toBeInstanceOf(BrowserStartCancelledError);
    await pending;
    await chrome.start();
    const stale = { close: jest.fn().mockResolvedValue(undefined), newPage: jest.fn() };
    resolveFirst(stale);
    await rejected;
    expect(stale.close).toHaveBeenCalledTimes(1);
    expect(stale.newPage).not.toHaveBeenCalled();
    expect(current.close).not.toHaveBeenCalled();
    expect(chrome.browser).toBe(current);
});
it("R2 N3 a hung close times out and kills only its captured browser child", async () => {
    jest.useFakeTimers();
    const chrome = make();
    const kill = jest.fn();
    chrome.browser = { close: () => new Promise(() => {}), process: () => ({ kill }) } as any;
    const stopped = chrome.stop("routeChanged");
    const rejected = expect(stopped).rejects.toThrow();
    const successorKill = jest.fn();
    chrome.browser = { process: () => ({ kill: successorKill }) } as any;
    jest.advanceTimersByTime(BROWSER_CLOSE_TIMEOUT_MS - 1);
    expect(kill).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await rejected;
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    expect(successorKill).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});
