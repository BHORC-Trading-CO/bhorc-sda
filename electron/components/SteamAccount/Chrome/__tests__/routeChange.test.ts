jest.mock("fs/promises", () => ({ access: jest.fn().mockResolvedValue(undefined), rm: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../resolveBrowserPath", () => ({ __esModule: true, default: jest.fn().mockResolvedValue("/fake/browser") }));
jest.mock("../secureDnsPref", () => ({ ensureSecureDnsOff: jest.fn().mockResolvedValue(undefined), writeLocalState: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
import Chrome, { BrowserStartCancelledError, BROWSER_CLOSE_TIMEOUT_MS } from "../Chrome";
import resolveBrowserPath from "../resolveBrowserPath";
import { ensureSecureDnsOff } from "../secureDnsPref";
import puppeteer from "puppeteer-extra";
import LinksStorage from "../../../newStorage/LinksStorage";
import application from "../../../application/application";
import SteamAccountChannels from "../../../../interfaces/IpcChannels/SteamAccountChannels";
import fsp from "fs/promises";

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
    // The browser's own first tab (about:blank): SDA-33 opens the first start page in it.
    const target = { url: () => "about:blank" };
    const page = {
        authenticate: jest.fn().mockResolvedValue(undefined),
        evaluateOnNewDocument: jest.fn().mockResolvedValue(undefined),
        setCookie: jest.fn().mockResolvedValue(undefined),
        goto: jest.fn().mockResolvedValue(undefined),
        target: () => target,
        url: () => "about:blank"
    };
    const browser = {
        on: jest.fn(), newPage: jest.fn().mockResolvedValue(page),
        pages: jest.fn().mockResolvedValue([page]), targets: () => [target],
        close: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(puppeteer, "launch").mockResolvedValue(browser as any);
    return { browser, page };
}
it("R2 N1 + SDA-6 first start page failure is logged, start resolves, browser stays working", async () => {
    const { browser, page } = launched();
    const chrome = make();
    page.goto.mockRejectedValueOnce(new Error("goto failed"));
    await expect(chrome.start([])).resolves.toBeUndefined();
    expect(browser.close).not.toHaveBeenCalled();
    expect(chrome.browser).toBe(browser);
    expect(chrome.workStatus).toBe("working");
});
it.each(["authenticate", "setCookie"] as const)("R2 N1 post-launch %s failure leaves the browser working", async method => {
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

// SDA-26: DNS-over-HTTPS в браузере аккаунта шёл бы мимо прокси, с реального IP.
it("SDA-26 secure DNS is switched off in the profile before the browser is launched", async () => {
    const order: string[] = [];
    (ensureSecureDnsOff as jest.Mock).mockImplementationOnce(async () => { order.push("secure-dns-off"); });
    jest.spyOn(puppeteer, "launch").mockImplementationOnce(async () => {
        order.push("launch");
        throw new Error("stop here");
    });
    const chrome = make();
    await expect(chrome.start()).rejects.toThrow("stop here");
    expect(order).toEqual(["secure-dns-off", "launch"]);
    expect(ensureSecureDnsOff).toHaveBeenLastCalledWith(chrome.profileDir);
});
it("SDA-26 when the profile setting cannot be written the browser is not launched", async () => {
    (ensureSecureDnsOff as jest.Mock).mockRejectedValueOnce(new Error("EACCES: Local State"));
    const launch = jest.spyOn(puppeteer, "launch");
    const chrome = make();
    await expect(chrome.start()).rejects.toThrow("EACCES: Local State");
    expect(launch).not.toHaveBeenCalled();
    expect(chrome.browser).toBeNull();
});

// Третье ревью: отменённый запуск доводит до конца то, что уже начал (например, копирование
// старого профиля), и эти файлы ложились поверх профиля, который успел подготовить новый запуск.
it("SDA-26 a superseded start finishes touching the profile before the next one prepares and launches", async () => {
    const order: string[] = [];
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
    let finishFirstMigration!: () => void;
    const chrome = make();
    jest.spyOn(chrome as any, "migrateLegacyProfile")
        .mockImplementationOnce(() => new Promise<void>(resolve => {
            order.push("A: copying the old profile");
            finishFirstMigration = () => { order.push("A: copy finished"); resolve(); };
        }))
        .mockImplementation(async () => { order.push("B: migration"); });
    (ensureSecureDnsOff as jest.Mock).mockImplementation(async () => { order.push("B: secure DNS off"); });
    const { browser } = launched();
    (puppeteer.launch as jest.Mock).mockImplementation(async () => { order.push("B: launch"); return browser; });
    try {
        const first = chrome.start();
        const rejected = expect(first).rejects.toMatchObject({ reason: "superseded" });
        await flush();
        const second = chrome.start();
        await flush();
        // B ждёт: к профилю не прикасается, браузер не запускает.
        expect(order).toEqual(["A: copying the old profile"]);
        finishFirstMigration();
        await second;
        await rejected;
        expect(order).toEqual(["A: copying the old profile", "A: copy finished", "B: migration", "B: secure DNS off", "B: launch"]);
        expect(chrome.browser).toBe(browser);
    } finally {
        (ensureSecureDnsOff as jest.Mock).mockReset().mockResolvedValue(undefined);
    }
});
it("SDA-26 a failed preparation does not block the next start", async () => {
    const chrome = make();
    (ensureSecureDnsOff as jest.Mock).mockRejectedValueOnce(new Error("EACCES: Local State"));
    await expect(chrome.start()).rejects.toThrow("EACCES: Local State");
    const { browser } = launched();
    await chrome.start();
    expect(chrome.browser).toBe(browser);
});

// SDA-33: with "restore tabs" off (the default) the last session's tabs are removed before the
// launch, inside the same serialized preparation as SDA-26: a superseded start never removes them
// (the next start may be the one that restores them), and the next start removes them only after
// the superseded one has finished with the profile.
it("SDA-33 the last session's tabs are removed inside the serialized preparation, never by a superseded start", async () => {
    const order: string[] = [];
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
    let finishFirstSecureDns!: () => void;
    const chrome = make();
    (ensureSecureDnsOff as jest.Mock)
        .mockImplementationOnce(() => new Promise<void>(resolve => {
            order.push("A: secure DNS off (slow)");
            finishFirstSecureDns = () => { order.push("A: secure DNS done"); resolve(); };
        }))
        .mockImplementation(async () => { order.push("B: secure DNS off"); });
    (fsp.rm as jest.Mock).mockImplementation(async (dir: string) => { order.push(`remove ${dir.slice(chrome.profileDir.length)}`); });
    const { browser } = launched();
    (puppeteer.launch as jest.Mock).mockImplementation(async () => { order.push("B: launch"); return browser; });
    try {
        const first = chrome.start();
        const rejected = expect(first).rejects.toMatchObject({ reason: "superseded" });
        await flush();
        const second = chrome.start();
        await flush();
        expect(order).toEqual(["A: secure DNS off (slow)"]);
        finishFirstSecureDns();
        await second;
        await rejected;
        expect(order).toEqual([
            "A: secure DNS off (slow)", "A: secure DNS done",
            "B: secure DNS off", "remove /Default/Sessions", "B: launch",
        ]);
        expect(fsp.rm).toHaveBeenCalledTimes(1);
        expect(fsp.rm).toHaveBeenCalledWith(`${chrome.profileDir}/Default/Sessions`, expect.objectContaining({ recursive: true, force: true }));
        expect(chrome.browser).toBe(browser);
    } finally {
        (ensureSecureDnsOff as jest.Mock).mockReset().mockResolvedValue(undefined);
        (fsp.rm as jest.Mock).mockReset().mockResolvedValue(undefined);
    }
});
it("SDA-33 a failed removal of the last session's tabs is logged and the browser still starts", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    (fsp.rm as jest.Mock).mockRejectedValueOnce(Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" }));
    const { browser, page } = launched();
    const chrome = make();
    await chrome.start();
    expect(fsp.rm).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("EBUSY: resource busy or locked"));
    expect(chrome.browser).toBe(browser);
    expect(chrome.workStatus).toBe("working");
    expect(page.goto).toHaveBeenCalledWith("https://steamcommunity.com/my/");
});
it("SDA-33 a session folder that is already gone is not an error", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    (fsp.rm as jest.Mock).mockRejectedValueOnce(Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }));
    const { browser } = launched();
    const chrome = make();
    await chrome.start();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("ENOENT"));
    expect(chrome.browser).toBe(browser);
});
