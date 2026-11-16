// Стартовые ссылки и расширения со страницы Browser (SDA-6) в Chrome: флаги запуска,
// опции puppeteer.launch и порядок вкладок. Браузер не запускается: puppeteer замокан.
const mockSettings = { current: { startLinks: [] as string[], extensions: [] as { path: string; enabled: boolean }[], restoreTabs: false } };
jest.mock("../../../newStorage/BrowserSettingsStorage", () => ({
    __esModule: true,
    default: { Get: () => mockSettings.current, Save: jest.fn() },
}));
jest.mock("../resolveBrowserPath", () => ({ __esModule: true, default: jest.fn(async () => "/fake/chromium") }));
// Настройку профиля (SDA-26) здесь не пишем: у теста нет своей папки профиля, файл лёг бы в репозиторий.
jest.mock("../secureDnsPref", () => ({ ensureSecureDnsOff: jest.fn(async () => undefined), writeLocalState: jest.fn(async () => undefined) }));
jest.mock("../../../manager/manager", () => ({
    __esModule: true,
    default: {
        GetSteamAccountLinkedData: () => ({ proxy: { host: "127.0.0.1", port: "9", username: "user", password: "pass" } }),
    },
}));

import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import Chrome, {
    isBlankTabUrl, isRestoredTabUrl, RESTORE_POLL_MS, RESTORE_WAIT_MS, SESSION_REMOVE_ATTEMPTS, sessionDiscardPrefix, SessionFolder,
} from "../Chrome";

const SESSION_DISCARD_PREFIX = sessionDiscardPrefix("Sessions");
const ENCRYPTED_DISCARD_PREFIX = sessionDiscardPrefix("Sessions_Encrypted");
import { DEFAULT_START_LINK } from "../../../Browser/browserSettings";
import { ensureSecureDnsOff } from "../secureDnsPref";

const puppeteer = require("puppeteer-extra");

const tempDirs: string[] = [];
function extensionDir(name: string, manifest: object | null = { manifest_version: 3, name, version: "1.0" }) {
    // Канонический путь, как его сохраняет выбор в диалоге.
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `sda-chrome-ext-${name}-`)));
    tempDirs.push(dir);
    if (manifest) fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    return dir;
}
afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function makeChrome(id = "acc-browser") {
    return new Chrome({ id, useSteamCookies: false, secondary: { nickname: "nick", avatarUrl: "" } } as any);
}

let log: jest.SpyInstance;
beforeEach(() => {
    log = jest.spyOn(console, "log").mockImplementation(() => {});
    mockSettings.current = { startLinks: [DEFAULT_START_LINK], extensions: [], restoreTabs: false };
});
afterEach(() => log.mockRestore());

describe("generateChromeFlags — расширения", () => {
    const extensionFlags = (flags: string[]) => flags.filter((flag) => /^--(disable-extensions-except|load-extension)=/.test(flag));

    it("без расширений флагов нет", () => {
        expect(extensionFlags(makeChrome().generateChromeFlags())).toEqual([]);
    });

    it("одно включённое", () => {
        const a = extensionDir("a");
        mockSettings.current.extensions = [{ path: a, enabled: true }];
        expect(extensionFlags(makeChrome().generateChromeFlags())).toEqual([`--disable-extensions-except=${a}`, `--load-extension=${a}`]);
    });

    it("два включённых по порядку, выключенное не попадает", () => {
        const a = extensionDir("a");
        const off = extensionDir("off");
        const b = extensionDir("b");
        mockSettings.current.extensions = [
            { path: a, enabled: true },
            { path: off, enabled: false },
            { path: b, enabled: true },
        ];
        expect(extensionFlags(makeChrome().generateChromeFlags())).toEqual([
            `--disable-extensions-except=${a},${b}`,
            `--load-extension=${a},${b}`,
        ]);
    });

    it("удалённая или сломанная папка пропускается с записью в лог, остальное грузится", () => {
        const a = extensionDir("a");
        const broken = extensionDir("broken", { manifest_version: 1, name: "x" });
        const gone = path.join(os.tmpdir(), "sda-chrome-ext-gone");
        mockSettings.current.extensions = [
            { path: gone, enabled: true },
            { path: broken, enabled: true },
            { path: a, enabled: true },
        ];
        expect(extensionFlags(makeChrome().generateChromeFlags())).toEqual([`--disable-extensions-except=${a}`, `--load-extension=${a}`]);
        expect(log).toHaveBeenCalledWith(expect.stringContaining(gone));
        expect(log).toHaveBeenCalledWith(expect.stringContaining(broken));
    });
});

type FakePage = {
    goto: jest.Mock;
    authenticate: jest.Mock;
    evaluateOnNewDocument: jest.Mock;
    setCookie: jest.Mock;
    bringToFront: jest.Mock;
    close: jest.Mock;
    reload: jest.Mock;
    target: () => { url: () => string };
    url: () => string;
};

/**
 * Поддельный браузер. pages — все вкладки по порядку появления: сначала те, что браузер открывает
 * сам (initialTabs: его пустая вкладка и вкладки прошлого сеанса), потом открытые через newPage.
 * Вкладки lateTabs браузер открывает уже после подписки плагинов: их нет в targets() на момент
 * запуска, а в pages() они появляются с lateAfterPolls-го вызова.
 */
const fake = {
    pages: [] as FakePage[],
    gotoOrder: [] as string[],
    /** Общий журнал вызовов всех вкладок: «<номер вкладки>:<метод>». */
    calls: [] as string[],
    initialTabs: ["about:blank"],
    lateTabs: [] as string[],
    lateAfterPolls: 0,
    newPageCalls: 0,
};

function makePage(url = "about:blank"): FakePage {
    const target = { url: () => url };
    const index = fake.pages.length;
    const record = (name: string) => jest.fn(async (...args: any[]) => {
        fake.calls.push(`${index}:${name}`);
        if (name === "goto") fake.gotoOrder.push(args[0]);
    });
    const page: FakePage = {
        goto: record("goto"),
        authenticate: record("authenticate"),
        evaluateOnNewDocument: record("evaluateOnNewDocument"),
        setCookie: record("setCookie"),
        bringToFront: record("bringToFront"),
        close: record("close"),
        reload: record("reload"),
        target: () => target,
        url: () => url,
    };
    fake.pages.push(page);
    return page;
}

function installFakeBrowser() {
    fake.pages = [];
    fake.gotoOrder = [];
    fake.calls = [];
    fake.initialTabs = ["about:blank"];
    fake.lateTabs = [];
    fake.lateAfterPolls = 0;
    fake.newPageCalls = 0;
    puppeteer.launch = jest.fn(async () => {
        const own = fake.initialTabs.map((url) => makePage(url));
        const late = fake.lateTabs.map((url) => makePage(url));
        let polls = 0;
        return {
            on: jest.fn(),
            targets: () => own.map((page) => page.target()),
            pages: jest.fn(async () => {
                polls++;
                const opened = fake.pages.filter((page) => !own.includes(page) && !late.includes(page));
                return [...own, ...(polls > fake.lateAfterPolls ? late : []), ...opened];
            }),
            newPage: jest.fn(async () => {
                fake.newPageCalls++;
                return makePage();
            }),
        };
    });
}

describe("Chrome.start — стартовые ссылки и опции запуска", () => {
    // Те же массивы, что у поддельного браузера, — короткие имена для старых тестов.
    let pages: FakePage[];
    let gotoOrder: string[];

    beforeEach(() => {
        installFakeBrowser();
        pages = fake.pages;
        gotoOrder = fake.gotoOrder;
        jest.spyOn(fsp, "access").mockResolvedValue(undefined);
        jest.spyOn(fsp, "rm").mockResolvedValue(undefined);
        jest.spyOn(fsp, "rename").mockResolvedValue(undefined);
        jest.spyOn(fsp, "readdir").mockResolvedValue([] as any);
    });
    afterEach(() => jest.restoreAllMocks());

    /** start() не резолвится на успехе (так было и до SDA-6) — ждём, пока не откроются все вкладки. */
    async function startAndSettle(chrome: Chrome, expectedGotos: number) {
        const failure = jest.fn();
        chrome.start([], null).catch(failure);
        for (let i = 0; i < 200 && gotoOrder.length < expectedGotos; i++) await new Promise((r) => setImmediate(r));
        await new Promise((r) => setImmediate(r));
        expect(failure).not.toHaveBeenCalled();
    }

    it("по умолчанию открывается steamcommunity.com/my/ в первой вкладке, как раньше", async () => {
        await startAndSettle(makeChrome(), 1);
        expect(gotoOrder).toEqual([DEFAULT_START_LINK]);
        expect(pages).toHaveLength(1);
        expect(pages[0].bringToFront).not.toHaveBeenCalled();
    });

    it("пустой список — ссылка по умолчанию", async () => {
        mockSettings.current.startLinks = [];
        await startAndSettle(makeChrome(), 1);
        expect(gotoOrder).toEqual([DEFAULT_START_LINK]);
    });

    it("первая ссылка — в первой вкладке, остальные — новыми вкладками по порядку, с прокси и отпечатком", async () => {
        const links = ["https://steamcommunity.com/my/tradeoffers/", "https://steamcommunity.com/market/", "https://csfloat.com/sell"];
        mockSettings.current.startLinks = links;
        await startAndSettle(makeChrome(), 3);
        expect(pages.map((page) => page.goto.mock.calls.map((call) => call[0]))).toEqual([[links[0]], [links[1]], [links[2]]]);
        expect(gotoOrder).toEqual(links);
        for (const page of pages) {
            expect(page.authenticate).toHaveBeenCalledWith({ username: "user", password: "pass" });
            expect(page.evaluateOnNewDocument).toHaveBeenCalled();
        }
        // Вперёд возвращается первая вкладка — с аккаунтом Steam.
        expect(pages[0].bringToFront).toHaveBeenCalled();
    });

    it("ошибка загрузки дополнительной вкладки не роняет запуск", async () => {
        mockSettings.current.startLinks = ["https://a.test/", "https://b.test/", "https://c.test/"];
        const chrome = makeChrome();
        const originalLaunch = puppeteer.launch;
        puppeteer.launch = jest.fn(async (options: any) => {
            const browser = await originalLaunch(options);
            const newPage = browser.newPage;
            browser.newPage = jest.fn(async () => {
                const page = await newPage();
                if (pages.length === 2) page.goto.mockImplementation(async (url: string) => {
                    gotoOrder.push(url);
                    throw new Error("net::ERR_TIMED_OUT");
                });
                return page;
            });
            return browser;
        });
        await startAndSettle(chrome, 3);
        expect(gotoOrder).toEqual(["https://a.test/", "https://b.test/", "https://c.test/"]);
    });

    it("первая страница не загрузилась (DNS, прокси) — остальные всё равно открываются, запуск не падает", async () => {
        const links = ["https://unreachable.test/", "https://b.test/", "https://c.test/"];
        mockSettings.current.startLinks = links;
        const originalLaunch = puppeteer.launch;
        puppeteer.launch = jest.fn(async (options: any) => {
            const browser = await originalLaunch(options);
            // Первая стартовая страница открывается в пустой вкладке самого браузера (SDA-33).
            pages[0].goto.mockImplementation(async (url: string) => {
                gotoOrder.push(url);
                throw new Error("net::ERR_NAME_NOT_RESOLVED");
            });
            return browser;
        });
        await startAndSettle(makeChrome(), 3);
        expect(gotoOrder).toEqual(links);
        expect(pages).toHaveLength(3);
        expect(pages[0].bringToFront).toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(expect.stringContaining("ERR_NAME_NOT_RESOLVED"));
    });

    it("без расширений ignoreDefaultArgs не передаём", async () => {
        await startAndSettle(makeChrome(), 1);
        const options = puppeteer.launch.mock.calls[0][0];
        expect(options).not.toHaveProperty("ignoreDefaultArgs");
        expect(options.args.some((arg: string) => arg.startsWith("--load-extension="))).toBe(false);
    });

    it("с расширением убираем дефолтный --disable-extensions puppeteer", async () => {
        const a = extensionDir("a");
        mockSettings.current.extensions = [{ path: a, enabled: true }];
        await startAndSettle(makeChrome(), 1);
        const options = puppeteer.launch.mock.calls[0][0];
        expect(options.ignoreDefaultArgs).toEqual(["--disable-extensions"]);
        expect(options.args).toEqual(expect.arrayContaining([`--load-extension=${a}`, `--disable-extensions-except=${a}`]));
    });
});

describe("Chrome.start — вкладки при запуске (SDA-33)", () => {
    const A = "https://steamcommunity.com/my/tradeoffers/";
    const B = "https://steamcommunity.com/market/";
    const C = "https://csfloat.com/sell";
    // Плагин puppeteer-extra (как stealth): его хук для вкладок, которые он сам не видел, зовёт Chrome.
    const plugin = { name: "stealth/evasions/test", onPageCreated: jest.fn() };

    beforeEach(() => {
        installFakeBrowser();
        jest.spyOn(fsp, "access").mockResolvedValue(undefined);
        jest.spyOn(fsp, "rm").mockResolvedValue(undefined);
        jest.spyOn(fsp, "rename").mockResolvedValue(undefined);
        jest.spyOn(fsp, "readdir").mockResolvedValue([] as any);
        plugin.onPageCreated = jest.fn(async (page: FakePage) => {
            fake.calls.push(`${fake.pages.indexOf(page)}:plugin`);
        });
        puppeteer.plugins = [plugin];
    });
    afterEach(() => {
        puppeteer.plugins = [];
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    /** Запуск до конца; ожидание восстановленных вкладок идёт на поддельных таймерах. */
    async function run(chrome: Chrome, cookies: string[] = []) {
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        let settled = false;
        let error: unknown;
        const started = chrome.start(cookies, null).then(
            () => { settled = true; },
            (err) => { settled = true; error = err; }
        );
        for (let i = 0; i < 100 && !settled; i++) await jest.advanceTimersByTimeAsync(RESTORE_POLL_MS);
        await started;
        expect(error).toBeUndefined();
        return await puppeteer.launch.mock.results[0].value;
    }
    const callsOf = (index: number) => fake.calls.filter((call) => call.startsWith(`${index}:`)).map((call) => call.split(":")[1]);
    /** Папку сеанса держит другой процесс: каждая попытка удаления — EBUSY (в тексте ошибки — путь). */
    const removalAlwaysBusy = (chrome: Chrome) =>
        (fsp.rename as unknown as jest.Mock).mockRejectedValue(
            Object.assign(new Error(`EBUSY: resource busy or locked, rename '${chrome.profileDir}/Default/Sessions'`), { code: "EBUSY" })
        );
    const rmTargets = () => (fsp.rm as unknown as jest.Mock).mock.calls.map((call) => call[0]);
    /** Аргументы командной строки, с которыми запущен Chromium. */
    const launchArgs = (): string[] => puppeteer.launch.mock.calls[0][0].args;
    const RESTORE_FLAG = "--restore-last-session";
    const renameCalls = () => (fsp.rename as unknown as jest.Mock).mock.calls as [string, string][];
    const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });

    describe("выключено (по умолчанию)", () => {
        it("обе папки сеанса до запуска переименовываются в брошенные (Sessions, затем Sessions_Encrypted), те удаляются как мусор", async () => {
            const chrome = makeChrome();
            await run(chrome);
            expect(fsp.rename).toHaveBeenCalledTimes(2);
            const folders: SessionFolder[] = ["Sessions", "Sessions_Encrypted"];
            renameCalls().forEach(([from, to], index) => {
                const prefix = `${chrome.profileDir}/Default/${sessionDiscardPrefix(folders[index])}`;
                expect(from).toBe(`${chrome.profileDir}/Default/${folders[index]}`);
                expect(to.startsWith(prefix)).toBe(true);
                expect(to.slice(prefix.length)).toMatch(/^\d+-\d+$/);
            });
            for (const renamedAt of (fsp.rename as unknown as jest.Mock).mock.invocationCallOrder) {
                expect(renamedAt).toBeLessThan(puppeteer.launch.mock.invocationCallOrder[0]);
            }
            // Сами папки сеанса рекурсивно не удаляются — только брошенные.
            expect((fsp.rm as unknown as jest.Mock).mock.calls).toEqual(renameCalls().map(([, to]) => [to, { recursive: true, force: true }]));
        });

        it.each(["Sessions", "Sessions_Encrypted"] as SessionFolder[])("на диске только %s — убирается она, второй нет, и это не ошибка", async (present) => {
            const chrome = makeChrome();
            (fsp.rename as unknown as jest.Mock).mockImplementation(async (from: string) => {
                if (from !== `${chrome.profileDir}/Default/${present}`) throw enoent();
            });
            const browser = await run(chrome);
            expect(renameCalls().map(([from]) => from)).toEqual([`${chrome.profileDir}/Default/Sessions`, `${chrome.profileDir}/Default/Sessions_Encrypted`]);
            const renamedTo = renameCalls().find(([from]) => from.endsWith(`/${present}`))![1];
            expect(rmTargets()).toEqual([renamedTo]);
            expect(browser.pages).toHaveBeenCalledTimes(1);
            expect(fake.gotoOrder).toEqual([DEFAULT_START_LINK]);
            expect(log).not.toHaveBeenCalledWith(expect.stringContaining("ENOENT"));
        });

        it("брошенные папки прошлых запусков удаляются, остальное в Default не трогается", async () => {
            const chrome = makeChrome();
            const defaultDir = `${chrome.profileDir}/Default`;
            (fsp.readdir as unknown as jest.Mock).mockImplementation(async (dir: string) =>
                dir === defaultDir
                    ? [
                        `${SESSION_DISCARD_PREFIX}1-2`, `${ENCRYPTED_DISCARD_PREFIX}5-6`,
                        "Sessions", "Sessions_Encrypted", "Session Storage", "Sessions.bak", "Sessions_Encrypted.bak",
                        "Sessions.sda-discard", "Sessions_Encrypted.sda-discard",
                        `x${SESSION_DISCARD_PREFIX}3-4`, `x${ENCRYPTED_DISCARD_PREFIX}7-8`, "Preferences",
                    ]
                    : []
            );
            await run(chrome);
            const renamedTo = renameCalls().map(([, to]) => to);
            expect(rmTargets().sort()).toEqual(
                [`${defaultDir}/${SESSION_DISCARD_PREFIX}1-2`, `${defaultDir}/${ENCRYPTED_DISCARD_PREFIX}5-6`, ...renamedTo].sort()
            );
        });

        it("ошибка удаления брошенной папки не мешает запуску и не пишется в лог", async () => {
            mockSettings.current.startLinks = [A];
            const chrome = makeChrome();
            (fsp.rm as unknown as jest.Mock).mockRejectedValue(
                Object.assign(new Error(`EPERM: operation not permitted, unlink '${chrome.profileDir}/Default/${SESSION_DISCARD_PREFIX}1-2/Session_1'`), { code: "EPERM" })
            );
            await run(chrome);
            expect(fsp.rm).toHaveBeenCalled();
            expect(fake.gotoOrder).toEqual([A]);
            const logged = log.mock.calls.map((call) => call.map(String).join(" "));
            expect(logged.filter((line) => line.includes("EPERM") || line.includes(".sda-discard-"))).toEqual([]);
        });

        it("первая стартовая страница — в пустой вкладке браузера, без newPage; остальные — новыми вкладками по порядку", async () => {
            mockSettings.current.startLinks = [A, B, C];
            const chrome = makeChrome();
            chrome.params.useSteamCookies = true;
            await run(chrome, ["steamLoginSecure=abc"]);
            expect(fake.newPageCalls).toBe(2);
            expect(fake.pages.map((page) => page.goto.mock.calls.map((call) => call[0]))).toEqual([[A], [B], [C]]);
            expect(fake.gotoOrder).toEqual([A, B, C]);
            // Вкладку браузера плагины не видели: их хук, прокси, отпечаток и cookie — до загрузки.
            expect(callsOf(0)).toEqual(["plugin", "authenticate", "evaluateOnNewDocument", "setCookie", "goto", "bringToFront"]);
            expect(fake.pages[0].authenticate).toHaveBeenCalledWith({ username: "user", password: "pass" });
            expect(fake.pages[0].close).not.toHaveBeenCalled();
            // Новые вкладки плагины видят сами (targetcreated): второй раз их хук не зовём.
            expect(plugin.onPageCreated).toHaveBeenCalledTimes(1);
            for (const page of fake.pages.slice(1)) {
                expect(page.authenticate).toHaveBeenCalledWith({ username: "user", password: "pass" });
                expect(page.evaluateOnNewDocument).toHaveBeenCalled();
            }
        });

        it("пустой список — ссылка по умолчанию в пустой вкладке браузера, новых вкладок нет", async () => {
            mockSettings.current.startLinks = [];
            await run(makeChrome());
            expect(fake.gotoOrder).toEqual([DEFAULT_START_LINK]);
            expect(fake.newPageCalls).toBe(0);
            expect(fake.pages).toHaveLength(1);
        });

        it("Chromium запускается без --restore-last-session", async () => {
            await run(makeChrome());
            expect(launchArgs()).not.toContain(RESTORE_FLAG);
        });

        it("запасной режим (папки сеанса не убрать) — тоже без --restore-last-session: восстанавливать не просим", async () => {
            mockSettings.current.startLinks = [A, B];
            fake.initialTabs = ["about:blank", C];
            const chrome = makeChrome();
            removalAlwaysBusy(chrome);
            await run(chrome);
            expect(fsp.rename).toHaveBeenCalledTimes(2 * SESSION_REMOVE_ATTEMPTS);
            // Запасной режим действует: вернувшиеся вкладки не засыпаны стартовыми страницами.
            expect(fake.gotoOrder).toEqual([]);
            expect(launchArgs()).not.toContain(RESTORE_FLAG);
        });

        it("настройку включили посреди запуска — этот запуск всё равно выключенный: папки убраны, флага нет", async () => {
            (ensureSecureDnsOff as jest.Mock).mockImplementationOnce(async () => {
                mockSettings.current = { ...mockSettings.current, restoreTabs: true };
            });
            await run(makeChrome());
            expect(fsp.rename).toHaveBeenCalledTimes(2);
            expect(launchArgs()).not.toContain(RESTORE_FLAG);
        });

        it("ждать восстановленные вкладки не нужно: pages() читается один раз", async () => {
            const browser = await run(makeChrome());
            expect(browser.pages).toHaveBeenCalledTimes(1);
        });

        it("однократный EBUSY — повтор удаления, дальше обычный запуск", async () => {
            const chrome = makeChrome();
            (fsp.rename as unknown as jest.Mock).mockRejectedValueOnce(Object.assign(new Error("EBUSY"), { code: "EBUSY" }));
            const browser = await run(chrome);
            // Sessions: EBUSY и повтор; Sessions_Encrypted: одна попытка.
            expect(fsp.rename).toHaveBeenCalledTimes(3);
            expect(browser.pages).toHaveBeenCalledTimes(1);
            expect(fake.gotoOrder).toEqual([DEFAULT_START_LINK]);
            expect(log).not.toHaveBeenCalledWith(expect.stringContaining("EBUSY"));
        });

        it("папку сеанса не удалось удалить, вкладки вернулись — стартовые поверх не открываются; в логе одна строка без пути", async () => {
            mockSettings.current.startLinks = [A, B];
            fake.initialTabs = ["about:blank", C];
            const chrome = makeChrome();
            removalAlwaysBusy(chrome);
            await run(chrome);
            expect(fsp.rename).toHaveBeenCalledTimes(2 * SESSION_REMOVE_ATTEMPTS);
            expect(fsp.rm).not.toHaveBeenCalled();
            // Этот запуск — как с включённым восстановлением.
            expect(fake.gotoOrder).toEqual([]);
            expect(fake.newPageCalls).toBe(0);
            expect(callsOf(0)).toEqual(["close"]);
            expect(callsOf(1)).toEqual(["plugin", "authenticate", "evaluateOnNewDocument", "reload"]);
            const lines = log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("EBUSY"));
            expect(lines).toHaveLength(1);
            expect(lines[0]).toContain("acc-browser");
            expect(lines[0]).not.toMatch(/[\\/]/);
        });

        it("Sessions_Encrypted не удалось переименовать за все попытки — запасной режим, как при неудаче с Sessions", async () => {
            mockSettings.current.startLinks = [A, B];
            fake.initialTabs = ["about:blank", C];
            const chrome = makeChrome();
            (fsp.rename as unknown as jest.Mock).mockImplementation(async (from: string) => {
                if (from.endsWith("/Sessions_Encrypted")) {
                    throw Object.assign(new Error(`EBUSY: resource busy or locked, rename '${from}'`), { code: "EBUSY" });
                }
            });
            await run(chrome);
            expect(fsp.rename).toHaveBeenCalledTimes(1 + SESSION_REMOVE_ATTEMPTS);
            expect(fake.gotoOrder).toEqual([]);
            expect(callsOf(1)).toEqual(["plugin", "authenticate", "evaluateOnNewDocument", "reload"]);
            const lines = log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("EBUSY"));
            expect(lines).toHaveLength(1);
            expect(lines[0]).toContain("(Sessions_Encrypted: EBUSY)");
            expect(lines[0]).not.toMatch(/[\\/]/);
        });

        it("папку сеанса не удалось удалить и ничего не вернулось — стартовые открываются как обычно", async () => {
            mockSettings.current.startLinks = [A, B];
            const chrome = makeChrome();
            removalAlwaysBusy(chrome);
            const browser = await run(chrome);
            expect(fsp.rename).toHaveBeenCalledTimes(2 * SESSION_REMOVE_ATTEMPTS);
            expect(fsp.rm).not.toHaveBeenCalled();
            expect(browser.pages).toHaveBeenCalledTimes(RESTORE_WAIT_MS / RESTORE_POLL_MS + 1);
            expect(fake.gotoOrder).toEqual([A, B]);
            expect(fake.pages[0].goto).toHaveBeenCalledWith(A);
        });
    });

    describe("включено", () => {
        beforeEach(() => {
            mockSettings.current = { startLinks: [A, B], extensions: [], restoreTabs: true };
            // Сеанс прошлого запуска на диске: только тогда есть смысл ждать его вкладки.
            jest.spyOn(fsp, "readdir").mockResolvedValue(["Session_13370000000000000", "Tabs_13370000000000000"] as any);
        });

        it("Chromium запускается с --restore-last-session (Chrome 160 без него вкладки не возвращает)", async () => {
            fake.initialTabs = ["about:blank", B];
            await run(makeChrome());
            expect(launchArgs().filter((arg) => arg === RESTORE_FLAG)).toEqual([RESTORE_FLAG]);
            expect(fsp.rename).not.toHaveBeenCalled();
        });

        it("настройку выключили посреди запуска — этот запуск всё равно включённый: флаг есть, папки не тронуты", async () => {
            (ensureSecureDnsOff as jest.Mock).mockImplementationOnce(async () => {
                mockSettings.current = { ...mockSettings.current, restoreTabs: false };
            });
            fake.initialTabs = ["about:blank", B];
            await run(makeChrome());
            expect(launchArgs()).toContain(RESTORE_FLAG);
            expect(fsp.rename).not.toHaveBeenCalled();
            // И вкладки — как у включённого: вернувшаяся осталась, стартовые поверх не открыты.
            expect(fake.gotoOrder).toEqual([]);
        });

        it("сеанса на диске нет — стартовые открываются сразу, без ожидания", async () => {
            (fsp.readdir as unknown as jest.Mock).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
            const chrome = makeChrome();
            const browser = await run(chrome);
            expect(fsp.readdir).toHaveBeenCalledWith(`${chrome.profileDir}/Default/Sessions`);
            expect(fsp.readdir).toHaveBeenCalledWith(`${chrome.profileDir}/Default/Sessions_Encrypted`);
            expect(browser.pages).toHaveBeenCalledTimes(1);
            expect(fake.gotoOrder).toEqual([A, B]);
            expect(fsp.rename).not.toHaveBeenCalled();
            expect(fsp.rm).not.toHaveBeenCalled();
        });

        it("брошенные папки не считаются сеансом на диске: смотрим только сами папки сеанса", async () => {
            const chrome = makeChrome();
            const defaultDir = `${chrome.profileDir}/Default`;
            (fsp.readdir as unknown as jest.Mock).mockImplementation(async (dir: string) => {
                if (dir === defaultDir) return [`${SESSION_DISCARD_PREFIX}1-2`, `${ENCRYPTED_DISCARD_PREFIX}3-4`, "Preferences"];
                throw enoent();
            });
            const browser = await run(chrome);
            expect(browser.pages).toHaveBeenCalledTimes(1);
            expect(fake.gotoOrder).toEqual([A, B]);
            // Включено: ничего не переименовывается, но мусор прошлых запусков убирается.
            expect(fsp.rename).not.toHaveBeenCalled();
            expect(rmTargets().sort()).toEqual([`${defaultDir}/${SESSION_DISCARD_PREFIX}1-2`, `${defaultDir}/${ENCRYPTED_DISCARD_PREFIX}3-4`].sort());
        });

        it("на диске только Sessions_Encrypted — это сеанс: ожидание есть, ничего не переименовывается", async () => {
            const chrome = makeChrome();
            (fsp.readdir as unknown as jest.Mock).mockImplementation(async (dir: string) => {
                if (dir === `${chrome.profileDir}/Default/Sessions_Encrypted`) return ["Session_13370000000000000"];
                if (dir === `${chrome.profileDir}/Default`) return ["Sessions_Encrypted", "Preferences"];
                throw enoent();
            });
            const browser = await run(chrome);
            expect(browser.pages).toHaveBeenCalledTimes(RESTORE_WAIT_MS / RESTORE_POLL_MS + 1);
            expect(fake.gotoOrder).toEqual([A, B]);
            expect(fsp.rename).not.toHaveBeenCalled();
            expect(fsp.rm).not.toHaveBeenCalled();
        });

        it("пустая вкладка, открытая во время ожидания (пользователем, расширением), не закрывается и стартовой страницей не занимается", async () => {
            fake.lateTabs = ["chrome://newtab/"];
            fake.lateAfterPolls = 3;
            await run(makeChrome());
            expect(fake.gotoOrder).toEqual([A, B]);
            expect(fake.pages[0].goto).toHaveBeenCalledWith(A);
            expect(fake.pages[1].close).not.toHaveBeenCalled();
            expect(fake.pages[1].goto).not.toHaveBeenCalled();
            expect(fake.pages[1].reload).not.toHaveBeenCalled();
        });

        it("вернулась только страница расширения — это не вкладка сеанса: стартовые открываются, страница расширения остаётся", async () => {
            fake.initialTabs = ["about:blank", "chrome-extension://abcdefghijklmnopabcdefghijklmnop/welcome.html"];
            await run(makeChrome());
            expect(fake.gotoOrder).toEqual([A, B]);
            expect(fake.pages[0].goto).toHaveBeenCalledWith(A);
            expect(callsOf(1)).toEqual([]);
        });

        it("вкладки вернулись — стартовые не открываются; каждой: хук плагинов, прокси, отпечаток, затем cookie и перезагрузка", async () => {
            fake.initialTabs = ["about:blank", B, C];
            const chrome = makeChrome();
            chrome.params.useSteamCookies = true;
            await run(chrome, ["steamLoginSecure=abc"]);
            expect(fsp.rename).not.toHaveBeenCalled();
            expect(fsp.rm).not.toHaveBeenCalled();
            expect(fake.newPageCalls).toBe(0);
            expect(fake.gotoOrder).toEqual([]);
            // Пустая вкладка браузера не остаётся.
            expect(callsOf(0)).toEqual(["close"]);
            expect(callsOf(1)).toEqual(["plugin", "authenticate", "evaluateOnNewDocument", "setCookie", "reload"]);
            expect(callsOf(2)).toEqual(["plugin", "authenticate", "evaluateOnNewDocument", "reload"]);
            for (const page of fake.pages.slice(1)) expect(page.authenticate).toHaveBeenCalledWith({ username: "user", password: "pass" });
            expect(fake.pages[1].setCookie).toHaveBeenCalledWith({ url: "https://steamcommunity.com/", name: "steamLoginSecure", value: "abc" });
            // Cookie — до перезагрузки любой вкладки: сессия Steam есть во всех.
            expect(fake.calls.indexOf("1:setCookie")).toBeLessThan(fake.calls.indexOf("1:reload"));
            expect(fake.calls.indexOf("1:setCookie")).toBeLessThan(fake.calls.indexOf("2:reload"));
        });

        it("вернулись только пустые — после ожидания открываются стартовые, первая — в пустой вкладке, лишняя «Новая вкладка» закрывается", async () => {
            fake.initialTabs = ["about:blank", "chrome://newtab/"];
            const browser = await run(makeChrome());
            expect(fsp.rename).not.toHaveBeenCalled();
            expect(fsp.rm).not.toHaveBeenCalled();
            expect(browser.pages).toHaveBeenCalledTimes(RESTORE_WAIT_MS / RESTORE_POLL_MS + 1);
            expect(fake.gotoOrder).toEqual([A, B]);
            expect(callsOf(0)).toEqual(["plugin", "authenticate", "evaluateOnNewDocument", "goto", "bringToFront"]);
            expect(callsOf(1)).toEqual(["close"]);
            expect(fake.newPageCalls).toBe(1);
            expect(fake.pages[2].goto).toHaveBeenCalledWith(B);
        });

        it("вкладки прошлого сеанса появились не сразу — ждём их; хук плагинов второй раз не получают", async () => {
            fake.lateTabs = [B];
            fake.lateAfterPolls = 3;
            await run(makeChrome());
            expect(fake.gotoOrder).toEqual([]);
            expect(callsOf(0)).toEqual(["close"]);
            // Вкладку, открытую после подписки плагинов, они настроили сами (targetcreated).
            expect(callsOf(1)).toEqual(["authenticate", "evaluateOnNewDocument", "reload"]);
            expect(plugin.onPageCreated).not.toHaveBeenCalled();
        });

        it("ошибка настройки одной восстановленной вкладки только пишется в лог", async () => {
            fake.initialTabs = [B, C];
            const originalLaunch = puppeteer.launch;
            puppeteer.launch = jest.fn(async (options: any) => {
                const browser = await originalLaunch(options);
                fake.pages[0].authenticate.mockRejectedValueOnce(new Error("Target closed"));
                return browser;
            });
            await run(makeChrome());
            expect(log).toHaveBeenCalledWith(expect.stringContaining("Target closed"));
            expect(callsOf(1)).toEqual(["plugin", "authenticate", "evaluateOnNewDocument", "reload"]);
            expect(fake.gotoOrder).toEqual([]);
        });
    });

    it("вкладкой сеанса считается всё, кроме пустых и страниц расширений", () => {
        for (const url of ["https://steamcommunity.com/my/", "http://example.com/", "file:///tmp/a.html", "chrome://settings/"]) {
            expect({ url, restored: isRestoredTabUrl(url) }).toEqual({ url, restored: true });
        }
        for (const url of ["about:blank", "chrome://newtab/", "chrome-extension://abc/welcome.html"]) {
            expect({ url, restored: isRestoredTabUrl(url) }).toEqual({ url, restored: false });
        }
    });

    it("пустыми считаются about:blank и «Новая вкладка», остальное — восстановленные", () => {
        for (const url of ["", "about:blank", "about:blank#x", "chrome://newtab/", "chrome://new-tab-page/", "chrome-search://local-ntp/local-ntp.html"]) {
            expect({ url, blank: isBlankTabUrl(url) }).toEqual({ url, blank: true });
        }
        for (const url of ["https://steamcommunity.com/my/", "about:blankx", "chrome://settings/", "chrome-extension://abc/options.html"]) {
            expect({ url, blank: isBlankTabUrl(url) }).toEqual({ url, blank: false });
        }
    });
});
