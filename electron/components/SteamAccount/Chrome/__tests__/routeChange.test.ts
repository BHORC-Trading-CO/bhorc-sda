jest.mock("fs/promises", () => ({ access: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../resolveBrowserPath", () => ({ __esModule: true, default: jest.fn().mockResolvedValue("/fake/browser") }));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
import Chrome from "../Chrome";
import resolveBrowserPath from "../resolveBrowserPath";
import puppeteer from "puppeteer-extra";
import LinksStorage from "../../../newStorage/LinksStorage";

const make = () => new Chrome({ id: "a1", secondary: {} } as any);
beforeEach(() => LinksStorage.Save({ steamAccounts: { a1: null }, groups: {}, profiles: {} }));
afterEach(() => jest.restoreAllMocks());
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
