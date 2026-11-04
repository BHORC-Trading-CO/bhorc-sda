// Стартовые ссылки и расширения со страницы Browser (SDA-6) в Chrome: флаги запуска,
// опции puppeteer.launch и порядок вкладок. Браузер не запускается: puppeteer замокан.
const mockSettings = { current: { startLinks: [] as string[], extensions: [] as { path: string; enabled: boolean }[] } };
jest.mock("../../../newStorage/BrowserSettingsStorage", () => ({
    __esModule: true,
    default: { Get: () => mockSettings.current, Save: jest.fn() },
}));
jest.mock("../resolveBrowserPath", () => ({ __esModule: true, default: jest.fn(async () => "/fake/chromium") }));
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
import Chrome from "../Chrome";
import { DEFAULT_START_LINK } from "../../../Browser/browserSettings";

const puppeteer = require("puppeteer-extra");

const tempDirs: string[] = [];
function extensionDir(name: string, manifest: object | null = { manifest_version: 3, name, version: "1.0" }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sda-chrome-ext-${name}-`));
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
    mockSettings.current = { startLinks: [DEFAULT_START_LINK], extensions: [] };
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

describe("Chrome.start — стартовые ссылки и опции запуска", () => {
    type FakePage = {
        goto: jest.Mock;
        authenticate: jest.Mock;
        evaluateOnNewDocument: jest.Mock;
        setCookie: jest.Mock;
        bringToFront: jest.Mock;
    };
    let pages: FakePage[];
    let gotoOrder: string[];

    function makePage(): FakePage {
        return {
            goto: jest.fn(async (url: string) => {
                gotoOrder.push(url);
            }),
            authenticate: jest.fn(async () => {}),
            evaluateOnNewDocument: jest.fn(async () => {}),
            setCookie: jest.fn(async () => {}),
            bringToFront: jest.fn(async () => {}),
        };
    }

    beforeEach(() => {
        pages = [];
        gotoOrder = [];
        jest.spyOn(fsp, "access").mockResolvedValue(undefined);
        puppeteer.launch = jest.fn(async () => ({
            on: jest.fn(),
            newPage: jest.fn(async () => {
                const page = makePage();
                pages.push(page);
                return page;
            }),
        }));
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
