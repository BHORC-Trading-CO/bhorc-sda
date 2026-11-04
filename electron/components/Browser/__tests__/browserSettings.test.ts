import fs from "fs";
import os from "os";
import path from "path";

import {
    addExtensionDir,
    buildBrowserSettingsView,
    checkStartLinks,
    DEFAULT_START_LINK,
    effectiveStartLinks,
    inspectExtensionDir,
    isValidStartLink,
    launchExtensionPaths,
    MAX_START_LINKS,
    sanitizeBrowserSettings,
    validateSettingsUpdate,
} from "../browserSettings";
import * as rendererValidation from "../../../../src/pages/Main/tabs/BrowserTab/startLinkValidation";
import { setMainLanguage } from "../../../i18n";

beforeAll(() => setMainLanguage("en"));

const tempDirs: string[] = [];
function tempDir(name = "ext") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sda-browser-${name}-`));
    tempDirs.push(dir);
    return dir;
}
/** Папка расширения с manifest.json (объект — как JSON, строка — как есть). */
function extensionDir(manifest: object | string | null, name = "ext") {
    const dir = tempDir(name);
    if (manifest !== null) {
        fs.writeFileSync(path.join(dir, "manifest.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
    }
    return dir;
}
afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const GOOD = { manifest_version: 3, name: "Trade Helper", version: "1.2.3" };

describe("стартовые ссылки: проверка адреса", () => {
    const accepted = [
        "https://steamcommunity.com/my/",
        "http://example.com",
        "https://steamcommunity.com/market/search?q=ak&appid=730#p1",
        "HTTPS://STEAMCOMMUNITY.COM/",
        "https://127.0.0.1:8080/path",
    ];
    const rejected = [
        "",
        " ",
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "file:///etc/passwd",
        "data:text/html,hi",
        "ftp://example.com",
        "chrome://settings",
        "/my/",
        "steamcommunity.com/my/",
        "//steamcommunity.com/my/",
        "http:steamcommunity.com",
        "https://",
        " https://steamcommunity.com/",
        "https://steam community.com/",
        "https://steamcommunity.com/\n",
        `https://example.com/${"a".repeat(2100)}`,
    ];

    it.each(accepted)("принимает %s", (link) => {
        expect(isValidStartLink(link)).toBe(true);
    });
    it.each(rejected)("отклоняет %j", (link) => {
        expect(isValidStartLink(link)).toBe(false);
    });
    it("не строку отклоняет", () => {
        expect(isValidStartLink(42)).toBe(false);
        expect(isValidStartLink(null)).toBe(false);
        expect(isValidStartLink({ href: "https://x.test/" })).toBe(false);
    });
    it("renderer проверяет так же, как main (подсказка совпадает с решением)", () => {
        for (const link of [...accepted, ...rejected]) {
            expect({ link, renderer: rendererValidation.isValidStartLink(link) }).toEqual({ link, renderer: isValidStartLink(link) });
        }
        expect(rendererValidation.MAX_START_LINKS).toBe(MAX_START_LINKS);
        expect(rendererValidation.DEFAULT_START_LINK).toBe(DEFAULT_START_LINK);
    });
});

describe("стартовые ссылки: список", () => {
    const links = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}`);

    it(`не больше ${MAX_START_LINKS}`, () => {
        expect(checkStartLinks(links(MAX_START_LINKS))).toBeNull();
        expect(checkStartLinks(links(MAX_START_LINKS + 1))).toEqual({ problem: "tooMany" });
    });
    it("пустой список допустим", () => {
        expect(checkStartLinks([])).toBeNull();
    });
    it("одна плохая ссылка — отказ всего списка", () => {
        expect(checkStartLinks(["https://ok.test/", "javascript:alert(1)"])).toEqual({ problem: "invalid", link: "javascript:alert(1)" });
    });
    it("не массив — отказ", () => {
        expect(checkStartLinks("https://ok.test/")).toEqual({ problem: "notList" });
        expect(checkStartLinks(undefined)).toEqual({ problem: "notList" });
    });
    it("при старте: пустой список -> ссылка по умолчанию, порядок сохраняется, мусор отброшен", () => {
        expect(effectiveStartLinks([])).toEqual([DEFAULT_START_LINK]);
        expect(effectiveStartLinks(["javascript:alert(1)"])).toEqual([DEFAULT_START_LINK]);
        expect(effectiveStartLinks(["https://b.test/", "file:///x", "https://a.test/"])).toEqual(["https://b.test/", "https://a.test/"]);
        expect(effectiveStartLinks(links(15))).toEqual(links(MAX_START_LINKS));
    });
    it("renderer: пусто, лимит, повтор", () => {
        const { startLinkError } = rendererValidation;
        expect(startLinkError("", [], true)).toBe("empty");
        expect(startLinkError("https://a.test/", links(MAX_START_LINKS), true)).toBe("tooMany");
        expect(startLinkError("https://a.test/", links(MAX_START_LINKS), false)).toBeNull();
        expect(startLinkError("steamcommunity.com", [], true)).toBe("invalid");
        expect(startLinkError("https://a.test/", ["https://a.test/"], true)).toBe("duplicate");
    });
});

describe("папка расширения: manifest.json", () => {
    it("хорошая: имя и версия из manifest", () => {
        expect(inspectExtensionDir(extensionDir(GOOD))).toEqual({ ok: true, name: "Trade Helper", version: "1.2.3" });
    });
    it("manifest_version 2 тоже принимаем", () => {
        expect(inspectExtensionDir(extensionDir({ ...GOOD, manifest_version: 2 })).ok).toBe(true);
    });
    it("manifest с BOM разбирается", () => {
        expect(inspectExtensionDir(extensionDir(`﻿${JSON.stringify(GOOD)}`)).ok).toBe(true);
    });
    it("имя __MSG_…__ -> имя папки", () => {
        const dir = extensionDir({ ...GOOD, name: "__MSG_appName__" });
        expect(inspectExtensionDir(dir)).toEqual({ ok: true, name: path.basename(dir), version: "1.2.3" });
    });
    it("без версии — пустая строка", () => {
        expect(inspectExtensionDir(extensionDir({ manifest_version: 3, name: "X" }))).toEqual({ ok: true, name: "X", version: "" });
    });
    it("нет manifest.json", () => {
        expect(inspectExtensionDir(extensionDir(null))).toEqual({ ok: false, problem: "missing" });
    });
    it("нет папки", () => {
        expect(inspectExtensionDir(path.join(os.tmpdir(), "sda-browser-no-such-dir-xyz"))).toEqual({ ok: false, problem: "missing" });
    });
    it("битый JSON", () => {
        expect(inspectExtensionDir(extensionDir("{ name: 'x',"))).toEqual({ ok: false, problem: "badJson" });
        expect(inspectExtensionDir(extensionDir("[1, 2]"))).toEqual({ ok: false, problem: "badJson" });
    });
    it("manifest_version 1 и без версии — отказ", () => {
        expect(inspectExtensionDir(extensionDir({ ...GOOD, manifest_version: 1 }))).toEqual({ ok: false, problem: "manifestVersion" });
        expect(inspectExtensionDir(extensionDir({ name: "X" }))).toEqual({ ok: false, problem: "manifestVersion" });
        expect(inspectExtensionDir(extensionDir({ ...GOOD, manifest_version: "3" }))).toEqual({ ok: false, problem: "manifestVersion" });
    });
    it("без имени — отказ", () => {
        expect(inspectExtensionDir(extensionDir({ manifest_version: 3 }))).toEqual({ ok: false, problem: "noName" });
        expect(inspectExtensionDir(extensionDir({ manifest_version: 3, name: "  " }))).toEqual({ ok: false, problem: "noName" });
    });
    it("запятая в пути — отказ (Chromium делит список по запятой)", () => {
        const dir = extensionDir(GOOD, "a,b");
        expect(dir).toContain(",");
        expect(inspectExtensionDir(dir)).toEqual({ ok: false, problem: "comma" });
    });
    it("относительный путь — отказ", () => {
        expect(inspectExtensionDir("some/ext")).toEqual({ ok: false, problem: "notAbsolute" });
    });
    it("файл (.crx) вместо папки — отказ", () => {
        const file = path.join(tempDir("crx"), "helper.crx");
        fs.writeFileSync(file, "Cr24");
        expect(inspectExtensionDir(file)).toEqual({ ok: false, problem: "notDirectory" });
    });
});

describe("расширения при запуске", () => {
    it("берёт только включённые и проходящие проверку, без повторов; пропуск — в лог", () => {
        const a = extensionDir(GOOD, "a");
        const b = extensionDir({ ...GOOD, name: "B" }, "b");
        const off = extensionDir(GOOD, "off");
        const gone = path.join(os.tmpdir(), "sda-browser-gone-xyz");
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const paths = launchExtensionPaths([
            { path: a, enabled: true },
            { path: off, enabled: false },
            { path: gone, enabled: true },
            { path: b, enabled: true },
            { path: a, enabled: true },
        ]);
        expect(paths).toEqual([a, b]);
        expect(log).toHaveBeenCalledWith(expect.stringContaining(gone));
        log.mockRestore();
    });
});

describe("хранимая форма", () => {
    it("ключа нет -> по умолчанию", () => {
        expect(sanitizeBrowserSettings(undefined)).toEqual({ startLinks: [DEFAULT_START_LINK], extensions: [] });
    });
    it("мусор приводится к форме", () => {
        expect(sanitizeBrowserSettings("x")).toEqual({ startLinks: [DEFAULT_START_LINK], extensions: [] });
        expect(sanitizeBrowserSettings({ startLinks: ["https://a.test/", 5], extensions: [{ path: "/x" }, { enabled: true }, null] }))
            .toEqual({ startLinks: ["https://a.test/"], extensions: [{ path: "/x", enabled: true }] });
    });
    it("пустой список ссылок пользователя сохраняется (на старте подставится ссылка по умолчанию)", () => {
        expect(sanitizeBrowserSettings({ startLinks: [], extensions: [] }).startLinks).toEqual([]);
    });
    it("вид для страницы: имя, версия и состояние папки", () => {
        const good = extensionDir(GOOD);
        const gone = path.join(os.tmpdir(), "sda-browser-gone-view");
        const bad = extensionDir("{");
        const view = buildBrowserSettingsView({
            startLinks: [DEFAULT_START_LINK],
            extensions: [{ path: good, enabled: true }, { path: gone, enabled: false }, { path: bad, enabled: true }],
        });
        expect(view.extensions).toEqual([
            { path: good, enabled: true, name: "Trade Helper", version: "1.2.3", status: "ok" },
            { path: gone, enabled: false, name: "sda-browser-gone-view", version: "", status: "missing" },
            { path: bad, enabled: true, name: path.basename(bad), version: "", status: "invalid" },
        ]);
    });
});

describe("сохранение со страницы (main — последняя проверка)", () => {
    const empty = { startLinks: [DEFAULT_START_LINK], extensions: [] };

    it("корректное сохраняется", () => {
        const dir = extensionDir(GOOD);
        const update = validateSettingsUpdate({ startLinks: ["https://a.test/", "https://b.test/"], extensions: [{ path: dir, enabled: false }] }, empty);
        expect(update).toEqual({ ok: true, settings: { startLinks: ["https://a.test/", "https://b.test/"], extensions: [{ path: dir, enabled: false }] } });
    });
    it("плохая ссылка и лишняя ссылка — отказ с текстом", () => {
        expect(validateSettingsUpdate({ startLinks: ["javascript:alert(1)"], extensions: [] }, empty))
            .toEqual({ ok: false, error: "Not a valid http(s) address: javascript:alert(1)" });
        const many = Array.from({ length: 11 }, (_, i) => `https://e.test/${i}`);
        expect(validateSettingsUpdate({ startLinks: many, extensions: [] }, empty)).toEqual({ ok: false, error: "Up to 10 start pages are allowed." });
    });
    it("новый путь без manifest — отказ: renderer не протащит произвольную папку", () => {
        const dir = extensionDir(null);
        const update = validateSettingsUpdate({ startLinks: [], extensions: [{ path: dir, enabled: true }] }, empty);
        expect(update.ok).toBe(false);
        expect(!update.ok && update.error).toContain(dir);
    });
    it("новый путь с запятой — отказ", () => {
        const dir = extensionDir(GOOD, "x,y");
        expect(validateSettingsUpdate({ startLinks: [], extensions: [{ path: dir, enabled: true }] }, empty).ok).toBe(false);
    });
    it("уже сохранённое расширение, чью папку удалили, остаётся — его можно увидеть и убрать", () => {
        const gone = path.join(os.tmpdir(), "sda-browser-gone-saved");
        const current = { startLinks: [], extensions: [{ path: gone, enabled: true }] };
        expect(validateSettingsUpdate({ startLinks: [], extensions: [{ path: gone, enabled: false }] }, current))
            .toEqual({ ok: true, settings: { startLinks: [], extensions: [{ path: gone, enabled: false }] } });
    });
    it("повтор пути схлопывается", () => {
        const dir = extensionDir(GOOD);
        const update = validateSettingsUpdate({ startLinks: [], extensions: [{ path: dir, enabled: true }, { path: dir, enabled: false }] }, empty);
        expect(update.ok && update.settings.extensions).toEqual([{ path: dir, enabled: true }]);
    });
    it("не та форма — отказ", () => {
        expect(validateSettingsUpdate(null, empty).ok).toBe(false);
        expect(validateSettingsUpdate({ startLinks: [] }, empty).ok).toBe(false);
        expect(validateSettingsUpdate({ startLinks: [], extensions: [{ path: "/x", enabled: "yes" }] }, empty).ok).toBe(false);
    });
});

describe("папка из диалога", () => {
    it("добавляется включённой в конец", () => {
        const first = extensionDir(GOOD, "first");
        const dir = extensionDir({ ...GOOD, name: "Second" }, "second");
        const current = { startLinks: ["https://a.test/"], extensions: [{ path: first, enabled: false }] };
        expect(addExtensionDir(dir, current)).toEqual({
            ok: true,
            settings: { startLinks: ["https://a.test/"], extensions: [{ path: first, enabled: false }, { path: dir, enabled: true }] },
        });
    });
    it("повтор — отказ с именем", () => {
        const dir = extensionDir(GOOD);
        expect(addExtensionDir(dir, { startLinks: [], extensions: [{ path: dir, enabled: true }] }))
            .toEqual({ ok: false, error: "Trade Helper is already in the list." });
    });
    it("плохая папка — отказ с текстом про manifest", () => {
        const dir = extensionDir({ ...GOOD, manifest_version: 1 });
        const update = addExtensionDir(dir, { startLinks: [], extensions: [] });
        expect(update).toEqual({ ok: false, error: `manifest.json in ${dir} has an unsupported manifest_version (2 or 3 is required).` });
    });
});
