import { execFileSync } from "child_process";
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
    MAX_MANIFEST_BYTES,
    MAX_START_LINKS,
    sanitizeBrowserSettings,
    validateSettingsUpdate,
} from "../browserSettings";
import * as rendererValidation from "../../../../src/pages/Main/tabs/BrowserTab/startLinkValidation";
import { setMainLanguage } from "../../../i18n";

beforeAll(() => setMainLanguage("en"));

const tempDirs: string[] = [];
/** Временная папка по каноническому пути (на macOS /var -> /private/var): так её сохранил бы диалог. */
function tempDir(name = "ext") {
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `sda-browser-${name}-`)));
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
        expect(inspectExtensionDir(extensionDir(`\uFEFF${JSON.stringify(GOOD)}`)).ok).toBe(true);
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
    it("путь через ссылку — не канонический, отказ (сохраняется и грузится только канонический)", () => {
        const dir = extensionDir(GOOD);
        const link = path.join(tempDir("link"), "ext-link");
        fs.symlinkSync(dir, link);
        expect(inspectExtensionDir(link)).toEqual({ ok: false, problem: "notCanonical" });
        expect(inspectExtensionDir(dir).ok).toBe(true);
    });
    it("путь с «..» — не канонический, отказ", () => {
        const dir = extensionDir(GOOD);
        expect(inspectExtensionDir(path.join(dir, "sub", "..") + path.sep + ".." + path.sep + path.basename(dir))).toEqual({ ok: false, problem: "notCanonical" });
    });
    it("manifest.json — ссылка на файл снаружи — отказ", () => {
        const outside = path.join(tempDir("outside"), "manifest.json");
        fs.writeFileSync(outside, JSON.stringify(GOOD));
        const dir = extensionDir(null);
        fs.symlinkSync(outside, path.join(dir, "manifest.json"));
        expect(inspectExtensionDir(dir)).toEqual({ ok: false, problem: "manifestNotFile" });
    });
    it("manifest.json — папка — отказ", () => {
        const dir = extensionDir(null);
        fs.mkdirSync(path.join(dir, "manifest.json"));
        expect(inspectExtensionDir(dir)).toEqual({ ok: false, problem: "manifestNotFile" });
    });
    (process.platform === "win32" ? it.skip : it)("manifest.json — FIFO — отказ без чтения (main не зависает)", () => {
        const dir = extensionDir(null);
        execFileSync("mkfifo", [path.join(dir, "manifest.json")]);
        expect(inspectExtensionDir(dir)).toEqual({ ok: false, problem: "manifestNotFile" });
    });
    it(`manifest.json больше ${MAX_MANIFEST_BYTES} байт — отказ`, () => {
        const big = JSON.stringify({ ...GOOD, description: "x".repeat(MAX_MANIFEST_BYTES) });
        expect(inspectExtensionDir(extensionDir(big))).toEqual({ ok: false, problem: "manifestTooLarge" });
        const justUnder = JSON.stringify({ ...GOOD, description: "x".repeat(MAX_MANIFEST_BYTES - 200) });
        expect(inspectExtensionDir(extensionDir(justUnder)).ok).toBe(true);
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
    it("сохранённый путь подменили ссылкой на другую папку — не грузим", () => {
        const picked = extensionDir(GOOD, "picked");
        const other = extensionDir({ ...GOOD, name: "Other" }, "other");
        // Папку из диалога убрали и положили на её место ссылку на другое расширение.
        fs.rmSync(picked, { recursive: true, force: true });
        fs.symlinkSync(other, picked);
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        expect(launchExtensionPaths([{ path: picked, enabled: true }])).toEqual([]);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("notCanonical"));
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

    it("корректное сохраняется: ссылки, порядок и выключение уже добавленных", () => {
        const a = extensionDir(GOOD, "a");
        const b = extensionDir(GOOD, "b");
        const current = { startLinks: [DEFAULT_START_LINK], extensions: [{ path: a, enabled: true }, { path: b, enabled: true }] };
        const update = validateSettingsUpdate(
            { startLinks: ["https://a.test/", "https://b.test/"], extensions: [{ path: b, enabled: false }, { path: a, enabled: true }] },
            current
        );
        expect(update).toEqual({
            ok: true,
            settings: { startLinks: ["https://a.test/", "https://b.test/"], extensions: [{ path: b, enabled: false }, { path: a, enabled: true }] },
        });
    });
    it("плохая ссылка и лишняя ссылка — отказ с текстом", () => {
        expect(validateSettingsUpdate({ startLinks: ["javascript:alert(1)"], extensions: [] }, empty))
            .toEqual({ ok: false, error: { section: "links", message: "Not a valid http(s) address: javascript:alert(1)" } });
        const many = Array.from({ length: 11 }, (_, i) => `https://e.test/${i}`);
        expect(validateSettingsUpdate({ startLinks: many, extensions: [] }, empty))
            .toEqual({ ok: false, error: { section: "links", message: "Up to 10 start pages are allowed." } });
    });
    it("новый путь — отказ, даже если папка правильная: добавляет только диалог", () => {
        const dir = extensionDir(GOOD);
        const update = validateSettingsUpdate({ startLinks: [], extensions: [{ path: dir, enabled: true }] }, empty);
        expect(update).toEqual({
            ok: false,
            error: { section: "extensions", message: `Extensions are added only through the folder dialog. This one was not saved: ${dir}` },
        });
    });
    it("новый путь рядом с уже добавленным — тоже отказ", () => {
        const known = extensionDir(GOOD, "known");
        const sneaked = extensionDir(GOOD, "sneaked");
        const current = { startLinks: [], extensions: [{ path: known, enabled: true }] };
        const update = validateSettingsUpdate({ startLinks: [], extensions: [{ path: known, enabled: true }, { path: sneaked, enabled: true }] }, current);
        expect(update.ok).toBe(false);
    });
    it("уже сохранённое расширение, чью папку удалили, остаётся — его можно увидеть и убрать", () => {
        const gone = path.join(os.tmpdir(), "sda-browser-gone-saved");
        const current = { startLinks: [], extensions: [{ path: gone, enabled: true }] };
        expect(validateSettingsUpdate({ startLinks: [], extensions: [{ path: gone, enabled: false }] }, current))
            .toEqual({ ok: true, settings: { startLinks: [], extensions: [{ path: gone, enabled: false }] } });
    });
    it("повтор пути схлопывается", () => {
        const dir = extensionDir(GOOD);
        const current = { startLinks: [], extensions: [{ path: dir, enabled: true }] };
        const update = validateSettingsUpdate({ startLinks: [], extensions: [{ path: dir, enabled: true }, { path: dir, enabled: false }] }, current);
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
            .toEqual({ ok: false, error: { section: "extensions", message: "Trade Helper is already in the list." } });
    });
    it("выбрана ссылка — сохраняется канонический путь цели", () => {
        const dir = extensionDir(GOOD, "target");
        const link = path.join(tempDir("pick-link"), "ext-link");
        fs.symlinkSync(dir, link);
        expect(addExtensionDir(link, { startLinks: [], extensions: [] })).toEqual({
            ok: true,
            settings: { startLinks: [], extensions: [{ path: dir, enabled: true }] },
        });
        // Та же папка через ссылку — повтор.
        expect(addExtensionDir(link, { startLinks: [], extensions: [{ path: dir, enabled: true }] }).ok).toBe(false);
    });
    it("ссылка + «..»: путь раскрывает ОС, а не текстовая нормализация", () => {
        // root/a/inner, root/link -> root/a/inner. root/link/../ext у ОС — это root/a/ext, по тексту — root/ext.
        const root = tempDir("dotdot");
        fs.mkdirSync(path.join(root, "a", "inner"), { recursive: true });
        fs.symlinkSync(path.join(root, "a", "inner"), path.join(root, "link"));
        const physical = path.join(root, "a", "ext");
        fs.mkdirSync(physical);
        fs.writeFileSync(path.join(physical, "manifest.json"), JSON.stringify({ ...GOOD, name: "Physical" }));
        const lexical = path.join(root, "ext");
        fs.mkdirSync(lexical);
        fs.writeFileSync(path.join(lexical, "manifest.json"), JSON.stringify({ ...GOOD, name: "Lexical" }));
        const raw = `${path.join(root, "link")}${path.sep}..${path.sep}ext`;
        const update = addExtensionDir(raw, { startLinks: [], extensions: [] });
        expect(update.ok && update.settings.extensions).toEqual([{ path: physical, enabled: true }]);
        expect(buildBrowserSettingsView(update.ok ? update.settings : { startLinks: [], extensions: [] }).extensions[0].name).toBe("Physical");
    });
    it("плохая папка — отказ с текстом про manifest", () => {
        const dir = extensionDir({ ...GOOD, manifest_version: 1 });
        const update = addExtensionDir(dir, { startLinks: [], extensions: [] });
        expect(update).toEqual({
            ok: false,
            error: { section: "extensions", message: `manifest.json in ${dir} has an unsupported manifest_version (2 or 3 is required).` },
        });
    });
});
