jest.mock("fs/promises", () => ({
    access: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined),
    rename: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue([]),
}));
jest.mock("../resolveBrowserPath", () => ({ __esModule: true, default: jest.fn().mockResolvedValue("/fake/browser") }));
jest.mock("../secureDnsPref", () => ({ ensureSecureDnsOff: jest.fn().mockResolvedValue(undefined), writeLocalState: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
import Chrome, {
    BrowserStartCancelledError, BROWSER_CLOSE_TIMEOUT_MS, SESSION_REMOVE_ATTEMPTS, SESSION_REMOVE_RETRY_MS, sessionDiscardPrefix, SessionFolder,
} from "../Chrome";
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

// SDA-33: with "restore tabs" off (the default) the last session's tabs are dropped before the
// launch, inside the same serialized preparation as SDA-26: a superseded start never drops them
// (the next start may be the one that restores them), and the next start drops them only after
// the superseded one has finished with the profile. Round 3: dropping is one rename of each session
// folder to a discard folder that Chromium does not read; the discard folder is deleted later.
// Round 4: two session folders, Sessions first, then Sessions_Encrypted.
const SESSION_DISCARD_PREFIX = sessionDiscardPrefix("Sessions");
const ENCRYPTED_DISCARD_PREFIX = sessionDiscardPrefix("Sessions_Encrypted");
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const discardPath = (chrome: Chrome, folder: SessionFolder) =>
    new RegExp(`^${escapeRe(chrome.profileDir)}/Default/${escapeRe(sessionDiscardPrefix(folder))}\\d+-\\d+$`);
const isDiscard = (chrome: Chrome, target: string) =>
    [SESSION_DISCARD_PREFIX, ENCRYPTED_DISCARD_PREFIX].some(prefix => target.startsWith(`${chrome.profileDir}/Default/${prefix}`));
const resetFsMocks = () => {
    (fsp.rm as jest.Mock).mockReset().mockResolvedValue(undefined);
    (fsp.rename as jest.Mock).mockReset().mockResolvedValue(undefined);
    (fsp.readdir as jest.Mock).mockReset().mockResolvedValue([]);
};
it("SDA-33 the last session's tabs are dropped inside the serialized preparation, never by a superseded start", async () => {
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
    (fsp.rename as jest.Mock).mockImplementation(async (from: string) => { order.push(`drop ${from.slice(chrome.profileDir.length)}`); });
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
            "B: secure DNS off", "drop /Default/Sessions", "drop /Default/Sessions_Encrypted", "B: launch",
        ]);
        expect(fsp.rename).toHaveBeenCalledTimes(2);
        const [[from, to], [encryptedFrom, encryptedTo]] = (fsp.rename as jest.Mock).mock.calls;
        expect(from).toBe(`${chrome.profileDir}/Default/Sessions`);
        expect(to).toMatch(discardPath(chrome, "Sessions"));
        expect(encryptedFrom).toBe(`${chrome.profileDir}/Default/Sessions_Encrypted`);
        expect(encryptedTo).toMatch(discardPath(chrome, "Sessions_Encrypted"));
        // The discard folders are garbage: deleted afterwards, and nothing else is.
        await flushAll();
        expect((fsp.rm as jest.Mock).mock.calls).toEqual([[to, { recursive: true, force: true }], [encryptedTo, { recursive: true, force: true }]]);
        expect(chrome.browser).toBe(browser);
    } finally {
        (ensureSecureDnsOff as jest.Mock).mockReset().mockResolvedValue(undefined);
        resetFsMocks();
    }
});
const flushAll = async (turns = 20) => { for (let i = 0; i < turns; i++) await new Promise(resolve => setImmediate(resolve)); };
const busy = () => Object.assign(new Error("EBUSY: resource busy or locked, rename '/Users/someone/browser_profiles/a1/Default/Sessions'"), { code: "EBUSY" });
/** Waits for a promise while advancing fake timers (removal retry pauses, the wait for restored tabs). */
async function settleOnFakeTimers<T>(promise: Promise<T>): Promise<T> {
    let done = false;
    promise.then(() => { done = true; }, () => { done = true; });
    for (let i = 0; i < 200 && !done; i++) await jest.advanceTimersByTimeAsync(100);
    return promise;
}
it("SDA-33 a drop that keeps failing is logged once, by error code only, and the browser still starts", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    (fsp.rename as jest.Mock).mockRejectedValue(busy());
    const { browser, page } = launched();
    const chrome = make();
    try {
        await settleOnFakeTimers(chrome.start());
        // Both session folders, SESSION_REMOVE_ATTEMPTS each.
        expect(fsp.rename).toHaveBeenCalledTimes(2 * SESSION_REMOVE_ATTEMPTS);
        expect(fsp.rm).not.toHaveBeenCalled();
        const lines = log.mock.calls.map(call => String(call[0])).filter(line => line.includes("EBUSY"));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain("a1");
        expect(lines[0]).toContain("Sessions: EBUSY");
        expect(lines[0]).toContain("Sessions_Encrypted: EBUSY");
        expect(lines[0]).not.toMatch(/[\\/]/);
        expect(chrome.browser).toBe(browser);
        expect(chrome.workStatus).toBe("working");
        // Nothing came back from the last session, so the start page opens as usual.
        expect(page.goto).toHaveBeenCalledWith("https://steamcommunity.com/my/");
    } finally {
        resetFsMocks();
    }
});
// Review round 2: a recursive fs.rm reads the folder and then unlinks file by file, so a Stop that
// landed during the directory read was followed by new unlinks of the session files. A rename is
// one call: once the start is cancelled, nothing that changes Default/Sessions is started.
it("SDA-33 Stop while the session is being dropped: after the cancel only the discard folder is touched", async () => {
    const calls: { op: string; path: string; afterStop: boolean }[] = [];
    let stopped = false;
    let finishRename!: () => void;
    (fsp.rename as jest.Mock).mockImplementation((from: string) => {
        calls.push({ op: "rename", path: from, afterStop: stopped });
        return new Promise<void>(resolve => { finishRename = resolve; });
    });
    (fsp.rm as jest.Mock).mockImplementation(async (target: string) => { calls.push({ op: "rm", path: target, afterStop: stopped }); });
    (fsp.readdir as jest.Mock).mockImplementation(async (dir: string) => {
        calls.push({ op: "readdir", path: dir, afterStop: stopped });
        return [`${SESSION_DISCARD_PREFIX}1-2`];
    });
    const launch = jest.spyOn(puppeteer, "launch");
    const chrome = make();
    try {
        const started = chrome.start();
        const rejected = expect(started).rejects.toMatchObject({ reason: "stopped" });
        for (let i = 0; i < 100 && !calls.some(call => call.op === "rename"); i++) await flushAll(1);
        stopped = true;
        await chrome.stop();
        finishRename();
        await rejected;
        await flushAll();
        const sessions = `${chrome.profileDir}/Default/Sessions`;
        expect(calls.filter(call => call.op === "rename")).toEqual([{ op: "rename", path: sessions, afterStop: false }]);
        const later = calls.filter(call => call.afterStop);
        expect(later.length).toBeGreaterThan(0);
        for (const call of later) {
            expect({ call, discard: isDiscard(chrome, call.path) }).toEqual({ call, discard: true });
        }
        expect(launch).not.toHaveBeenCalled();
    } finally {
        resetFsMocks();
    }
});
// Review round 1, finding 1: fs.rm's own retries went on deleting after the start was cancelled,
// possibly under a next start that restores the tabs. Every attempt now checks the start first.
it("SDA-33 a drop that hit EBUSY makes no further attempt once the start is superseded during the pause", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    const order: string[] = [];
    const chrome = make();
    (fsp.rename as jest.Mock)
        .mockImplementationOnce(async () => { order.push("A: drop, EBUSY"); throw busy(); })
        .mockImplementation(async (from: string) => { order.push(`drop ${from.slice(chrome.profileDir.length)}`); });
    (ensureSecureDnsOff as jest.Mock).mockImplementation(async () => { order.push("secure DNS off"); });
    const { browser } = launched();
    try {
        const first = chrome.start();
        const rejected = expect(first).rejects.toMatchObject({ reason: "superseded" });
        for (let i = 0; i < 100 && !order.includes("A: drop, EBUSY"); i++) await flushAll(1);
        expect(order).toEqual(["secure DNS off", "A: drop, EBUSY"]);
        // A now waits SESSION_REMOVE_RETRY_MS (fake timer) before its second attempt; a new Start arrives.
        await settleOnFakeTimers(chrome.start());
        await rejected;
        // No further attempt by A (neither folder): the next drops are B's own, after B's preparation.
        expect(order).toEqual([
            "secure DNS off", "A: drop, EBUSY",
            "secure DNS off", "drop /Default/Sessions", "drop /Default/Sessions_Encrypted",
        ]);
        expect(fsp.rename).toHaveBeenCalledTimes(3);
        expect(chrome.browser).toBe(browser);
    } finally {
        (ensureSecureDnsOff as jest.Mock).mockReset().mockResolvedValue(undefined);
        resetFsMocks();
    }
});
// Round 4: a start superseded between the two renames must not start the second one.
it("SDA-33 a start superseded after its first rename never starts the second one", async () => {
    const order: string[] = [];
    let finishFirstRename!: () => void;
    const chrome = make();
    (fsp.rename as jest.Mock)
        .mockImplementationOnce((from: string) => new Promise<void>(resolve => {
            order.push(`A: drop ${from.slice(chrome.profileDir.length)}`);
            finishFirstRename = resolve;
        }))
        .mockImplementation(async (from: string) => { order.push(`drop ${from.slice(chrome.profileDir.length)}`); });
    (ensureSecureDnsOff as jest.Mock).mockImplementation(async () => { order.push("secure DNS off"); });
    const { browser } = launched();
    try {
        const first = chrome.start();
        const rejected = expect(first).rejects.toMatchObject({ reason: "superseded" });
        for (let i = 0; i < 100 && !order.includes("A: drop /Default/Sessions"); i++) await flushAll(1);
        const second = chrome.start();
        finishFirstRename();
        await second;
        await rejected;
        expect(order).toEqual([
            "secure DNS off", "A: drop /Default/Sessions",
            "secure DNS off", "drop /Default/Sessions", "drop /Default/Sessions_Encrypted",
        ]);
        expect(chrome.browser).toBe(browser);
    } finally {
        (ensureSecureDnsOff as jest.Mock).mockReset().mockResolvedValue(undefined);
        resetFsMocks();
    }
});
it("SDA-33 Stop during a drop retry pause: nothing more is renamed and nothing is launched", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    (fsp.rename as jest.Mock).mockRejectedValue(busy());
    const launch = jest.spyOn(puppeteer, "launch");
    const chrome = make();
    try {
        const started = chrome.start();
        const rejected = expect(started).rejects.toMatchObject({ reason: "stopped" });
        for (let i = 0; i < 100 && (fsp.rename as jest.Mock).mock.calls.length === 0; i++) await flushAll(1);
        expect(fsp.rename).toHaveBeenCalledTimes(1);
        await chrome.stop();
        await jest.advanceTimersByTimeAsync(SESSION_REMOVE_RETRY_MS * SESSION_REMOVE_ATTEMPTS);
        await rejected;
        expect(fsp.rename).toHaveBeenCalledTimes(1);
        expect(fsp.rm).not.toHaveBeenCalled();
        expect(launch).not.toHaveBeenCalled();
    } finally {
        resetFsMocks();
    }
});
// Review round 1, finding 2a: stop() lets go of this.browser before Chromium has closed, and the next
// start used to prepare (and now clean) the profile while the old browser still held it.
it("SDA-33 a start prepares the profile only after the account's previous browser has finished closing", async () => {
    const order: string[] = [];
    let finishClose!: () => void;
    const chrome = make();
    chrome.browser = {
        close: () => new Promise<void>(resolve => { finishClose = () => { order.push("previous browser closed"); resolve(); }; }),
    } as any;
    jest.spyOn(chrome as any, "migrateLegacyProfile").mockImplementation(async () => { order.push("prepare profile"); });
    const { browser } = launched();
    const stopped = chrome.stop();
    const started = chrome.start();
    await flushAll();
    expect(order).toEqual([]);
    finishClose();
    await stopped;
    await started;
    expect(order).toEqual(["previous browser closed", "prepare profile"]);
    expect(chrome.browser).toBe(browser);
});
it("SDA-33 the next start also waits for the browser of a cancelled launch to close", async () => {
    const order: string[] = [];
    let resolveLaunch!: (browser: any) => void;
    let launchStarted!: () => void;
    const launching = new Promise<void>(resolve => { launchStarted = resolve; });
    let finishClose!: () => void;
    const cancelled = {
        targets: () => [],
        close: () => new Promise<void>(resolve => { finishClose = () => { order.push("cancelled launch's browser closed"); resolve(); }; }),
    };
    const { browser } = launched();
    (puppeteer.launch as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveLaunch = resolve; launchStarted(); }));
    const chrome = make();
    const first = chrome.start();
    const rejected = expect(first).rejects.toMatchObject({ reason: "stopped" });
    await launching;
    await chrome.stop();
    resolveLaunch(cancelled);
    await flushAll();
    jest.spyOn(chrome as any, "migrateLegacyProfile").mockImplementation(async () => { order.push("prepare profile"); });
    const second = chrome.start();
    await flushAll();
    expect(order).toEqual([]);
    finishClose();
    await second;
    await rejected;
    expect(order).toEqual(["cancelled launch's browser closed", "prepare profile"]);
    expect(chrome.browser).toBe(browser);
});
it("SDA-33 a close that fails (route change, killed child) does not block the next start", async () => {
    const chrome = make();
    chrome.browser = { close: jest.fn().mockRejectedValue(new Error("disconnected")), process: () => ({ kill: jest.fn() }) } as any;
    await expect(chrome.stop("routeChanged")).rejects.toThrow("disconnected");
    const { browser } = launched();
    await chrome.start();
    expect(chrome.browser).toBe(browser);
});
it("SDA-33 after the browser crashed (disconnected) the next start waits for no close", async () => {
    const { browser } = launched();
    const chrome = make();
    await chrome.start();
    const onDisconnected = browser.on.mock.calls.find(([event]: [string]) => event === "disconnected")[1];
    onDisconnected();
    expect(chrome.browser).toBeNull();
    const next = launched();
    await chrome.start();
    expect(chrome.browser).toBe(next.browser);
    expect(browser.close).not.toHaveBeenCalled();
});
it("SDA-33 a session folder that is already gone is not an error", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    (fsp.rename as jest.Mock).mockRejectedValue(Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }));
    const { browser } = launched();
    const chrome = make();
    try {
        await chrome.start();
        // Neither session folder exists: one rename attempt each, nothing to delete.
        expect(fsp.rename).toHaveBeenCalledTimes(2);
        expect(fsp.rm).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalledWith(expect.stringContaining("ENOENT"));
        expect(chrome.browser).toBe(browser);
        // Nothing to drop is a success: no wait for restored tabs.
        expect(browser.pages).toHaveBeenCalledTimes(1);
    } finally {
        resetFsMocks();
    }
});
