import fs from "fs";
import path from "path";
import BrowserSettingsInterface, {
    BrowserExtensionSetting,
    BrowserExtensionView,
    BrowserSettingsError,
    BrowserSettingsView,
} from "../../interfaces/Browser/BrowserSettingsInterface";
import { t } from "../../i18n";

// Настройки браузера аккаунтов со страницы Browser (SDA-6): стартовые ссылки и распакованные
// расширения, общие для всех аккаунтов. Renderer проверяет ссылки только ради подсказки,
// решает main: всё, что приходит по IPC, проверяется здесь заново.

/** Что открывалось при старте до SDA-6; остаётся и запасным вариантом для пустого списка. */
export const DEFAULT_START_LINK = "https://steamcommunity.com/my/";
export const MAX_START_LINKS = 10;
/** Не даём сохранить мегабайтную «ссылку»: обычный URL короче. */
export const MAX_START_LINK_LENGTH = 2048;

export const DEFAULT_BROWSER_SETTINGS: BrowserSettingsInterface = {
    startLinks: [DEFAULT_START_LINK],
    extensions: [],
};

/** Только абсолютные http(s)-адреса с хостом, без пробелов и управляющих символов. */
export function isValidStartLink(value: unknown): value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_START_LINK_LENGTH) return false;
    // URL-парсер молча выкидывает пробелы, табы и переводы строк — такую строку не принимаем.
    if (/[\s\u0000-\u001f\u007f]/.test(value)) return false;
    // Префикс обязателен: new URL("http:host") тоже разбирается, но это уже не то, что видно в поле.
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
    } catch {
        return false;
    }
}

export type StartLinksProblem =
    | { problem: "notList" }
    | { problem: "tooMany" }
    | { problem: "invalid"; link: string };

export function checkStartLinks(links: unknown): StartLinksProblem | null {
    if (!Array.isArray(links)) return { problem: "notList" };
    if (links.length > MAX_START_LINKS) return { problem: "tooMany" };
    for (const link of links) {
        if (!isValidStartLink(link)) return { problem: "invalid", link: String(link).slice(0, 200) };
    }
    return null;
}

/** Что открыть при старте: сохранённые корректные ссылки по порядку, пустой список — ссылка по умолчанию. */
export function effectiveStartLinks(links: readonly unknown[]): string[] {
    const valid = links.filter(isValidStartLink).slice(0, MAX_START_LINKS);
    return valid.length ? valid : [DEFAULT_START_LINK];
}

export type ExtensionDirProblem =
    | "notAbsolute"
    | "notCanonical"
    | "comma"
    | "notDirectory"
    | "missing"
    | "manifestNotFile"
    | "manifestTooLarge"
    | "badJson"
    | "manifestVersion"
    | "noName";

export type ExtensionDirInfo =
    | { ok: true; name: string; version: string }
    | { ok: false; problem: ExtensionDirProblem };

const MESSAGE_PLACEHOLDER = /^__MSG_.+__$/;
/** manifest.json обычного расширения — килобайты; больше мегабайта не читаем. */
export const MAX_MANIFEST_BYTES = 1024 * 1024;

/**
 * Канонический путь папки: ссылки и «..» раскрывает ОС (realpath.native, а не JS-версия,
 * которая сначала нормализует «..» по тексту). null — пути нет.
 */
export function canonicalExtensionDir(dir: string): string | null {
    try {
        return fs.realpathSync.native(dir);
    } catch {
        return null;
    }
}

// Буфер чтения manifest.json один на процесс: чтение синхронное, параллельных вызовов нет.
let manifestBuffer: Buffer | null = null;

type ManifestRead = { ok: true; text: string } | { ok: false; problem: "missing" | "manifestNotFile" | "manifestTooLarge" };

/**
 * manifest.json читается так, чтобы main не завис и не съел память: только обычный файл
 * (FIFO или устройство заблокировали бы чтение, ссылка увела бы из папки), не больше
 * MAX_MANIFEST_BYTES. Открываем с O_NONBLOCK и O_NOFOLLOW и сверяем fstat с lstat:
 * подмена файла между проверкой и открытием тоже отсекается.
 */
function readManifestText(file: string): ManifestRead {
    let before: fs.Stats;
    try {
        before = fs.lstatSync(file);
    } catch {
        return { ok: false, problem: "missing" };
    }
    if (!before.isFile()) return { ok: false, problem: "manifestNotFile" };
    if (before.size > MAX_MANIFEST_BYTES) return { ok: false, problem: "manifestTooLarge" };
    let fd: number | null = null;
    try {
        const flags = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0) | (fs.constants.O_NOFOLLOW || 0);
        fd = fs.openSync(file, flags);
        const opened = fs.fstatSync(fd);
        if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev) {
            return { ok: false, problem: "manifestNotFile" };
        }
        if (opened.size > MAX_MANIFEST_BYTES) return { ok: false, problem: "manifestTooLarge" };
        const buffer = manifestBuffer || (manifestBuffer = Buffer.allocUnsafe(MAX_MANIFEST_BYTES + 1));
        let length = 0;
        while (length < buffer.length) {
            const read = fs.readSync(fd, buffer, length, buffer.length - length, null);
            if (read === 0) break;
            length += read;
        }
        // Файл дописали уже после fstat.
        if (length > MAX_MANIFEST_BYTES) return { ok: false, problem: "manifestTooLarge" };
        return { ok: true, text: buffer.toString("utf8", 0, length) };
    } catch {
        return { ok: false, problem: "missing" };
    } finally {
        if (fd !== null) {
            try {
                fs.closeSync(fd);
            } catch {}
        }
    }
}

/**
 * Проверка папки распакованного расширения. Синхронная: читается один маленький manifest.json,
 * а вызывается и из generateChromeFlags(), который синхронный.
 *
 * Путь должен быть каноническим — таким его сохраняет выбор в диалоге (addExtensionDir).
 * Если сохранённый путь теперь раскрывается иначе (в нём подменили ссылку), это уже другая
 * папка: не грузим её. Проверяется и передаётся в Chromium ровно этот путь.
 */
export function inspectExtensionDir(dir: string): ExtensionDirInfo {
    if (typeof dir !== "string" || !path.isAbsolute(dir)) return { ok: false, problem: "notAbsolute" };
    const canonical = canonicalExtensionDir(dir);
    if (canonical === null) return { ok: false, problem: "missing" };
    if (canonical !== dir) return { ok: false, problem: "notCanonical" };
    // Chromium делит списки --load-extension и --disable-extensions-except по запятой.
    if (dir.includes(",")) return { ok: false, problem: "comma" };
    let stat: fs.Stats;
    try {
        stat = fs.lstatSync(dir);
    } catch {
        return { ok: false, problem: "missing" };
    }
    if (!stat.isDirectory()) return { ok: false, problem: "notDirectory" };
    const read = readManifestText(path.join(dir, "manifest.json"));
    if (!read.ok) return { ok: false, problem: read.problem };
    let manifest: any;
    try {
        manifest = JSON.parse(read.text.replace(/^\uFEFF/, ""));
    } catch {
        return { ok: false, problem: "badJson" };
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { ok: false, problem: "badJson" };
    if (manifest.manifest_version !== 2 && manifest.manifest_version !== 3) return { ok: false, problem: "manifestVersion" };
    if (typeof manifest.name !== "string" || !manifest.name.trim()) return { ok: false, problem: "noName" };
    // Локализованное имя (__MSG_appName__) без разбора _locales: показываем имя папки.
    const name = MESSAGE_PLACEHOLDER.test(manifest.name.trim()) ? path.basename(dir) : manifest.name.trim();
    const version = typeof manifest.version === "string" ? manifest.version : "";
    return { ok: true, name, version };
}

/** Включённые расширения, которые прямо сейчас проходят проверку; остальные пропускаем с записью в лог. */
export function launchExtensionPaths(extensions: readonly BrowserExtensionSetting[]): string[] {
    const paths: string[] = [];
    for (const extension of extensions) {
        if (!extension.enabled || paths.includes(extension.path)) continue;
        const info = inspectExtensionDir(extension.path);
        if (info.ok) paths.push(extension.path);
        else console.log(`Расширение пропущено при запуске браузера (${info.problem}): ${extension.path}`);
    }
    return paths;
}

/** Сохранённое значение как есть может быть пустым или мусором: приводим к форме, отсутствующее — по умолчанию. */
export function sanitizeBrowserSettings(raw: unknown): BrowserSettingsInterface {
    const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const startLinks = Array.isArray(value.startLinks)
        ? value.startLinks.filter((link): link is string => typeof link === "string")
        : [...DEFAULT_BROWSER_SETTINGS.startLinks];
    const extensions = Array.isArray(value.extensions)
        ? value.extensions
            .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && typeof (item as any).path === "string")
            .map((item) => ({ path: item.path as string, enabled: item.enabled !== false }))
        : [];
    return { startLinks, extensions };
}

/** Для страницы: к каждому расширению — имя, версия и состояние папки сейчас. */
export function buildBrowserSettingsView(settings: BrowserSettingsInterface): BrowserSettingsView {
    const extensions: BrowserExtensionView[] = settings.extensions.map((extension) => {
        const info = inspectExtensionDir(extension.path);
        if (info.ok) return { ...extension, name: info.name, version: info.version, status: "ok" };
        return {
            ...extension,
            name: path.basename(extension.path) || extension.path,
            version: "",
            status: info.problem === "missing" ? "missing" : "invalid",
        };
    });
    return { startLinks: [...settings.startLinks], extensions };
}

function extensionProblemText(problem: ExtensionDirProblem, folder: string): string {
    return t(`errors.browser.extension.${problem}`, { folder });
}

export type SettingsUpdate =
    | { ok: true; settings: BrowserSettingsInterface }
    | { ok: false; error: BrowserSettingsError };

const linksError = (message: string): SettingsUpdate => ({ ok: false, error: { section: "links", message } });
const extensionsError = (message: string): SettingsUpdate => ({ ok: false, error: { section: "extensions", message } });

/**
 * Проверка сохранения со страницы. Ссылки — целиком заново. Расширения: сохранение только
 * переставляет, включает/выключает и убирает уже сохранённые. Новый путь добавляет лишь выбор
 * в нативном диалоге (addExtensionDir), поэтому путь, которого нет в списке, — отказ, даже если
 * папка правильная: renderer не может подсунуть свою. Уже сохранённое остаётся, даже если папку
 * с тех пор удалили, — чтобы его можно было увидеть и убрать.
 */
export function validateSettingsUpdate(incoming: unknown, current: BrowserSettingsInterface): SettingsUpdate {
    if (!incoming || typeof incoming !== "object") return linksError(t("errors.browser.invalidSettings"));
    const value = incoming as Record<string, unknown>;
    const linksProblem = checkStartLinks(value.startLinks);
    if (linksProblem) {
        if (linksProblem.problem === "tooMany") return linksError(t("errors.browser.tooManyLinks", { max: MAX_START_LINKS }));
        if (linksProblem.problem === "invalid") return linksError(t("errors.browser.invalidLink", { link: linksProblem.link }));
        return linksError(t("errors.browser.invalidSettings"));
    }
    if (!Array.isArray(value.extensions)) return extensionsError(t("errors.browser.invalidSettings"));
    const known = new Set(current.extensions.map((extension) => extension.path));
    const extensions: BrowserExtensionSetting[] = [];
    for (const item of value.extensions) {
        if (!item || typeof item !== "object" || typeof (item as any).path !== "string" || typeof (item as any).enabled !== "boolean") {
            return extensionsError(t("errors.browser.invalidSettings"));
        }
        const extension = { path: (item as any).path as string, enabled: (item as any).enabled as boolean };
        if (extensions.some((saved) => saved.path === extension.path)) continue;
        if (!known.has(extension.path)) {
            return extensionsError(t("errors.browser.extension.notPicked", { folder: extension.path.slice(0, 300) }));
        }
        extensions.push(extension);
    }
    return { ok: true, settings: { startLinks: [...(value.startLinks as string[])], extensions } };
}

/**
 * Папка из нативного диалога — единственный способ добавить расширение. Сохраняется канонический
 * путь (ссылки и «..» раскрыты): при запуске проверяется и уходит в Chromium именно он, и
 * подмена ссылки после выбора не подсунет другую папку.
 */
export function addExtensionDir(dir: string, current: BrowserSettingsInterface): SettingsUpdate {
    if (typeof dir !== "string" || !path.isAbsolute(dir)) return extensionsError(extensionProblemText("notAbsolute", String(dir)));
    const canonical = canonicalExtensionDir(dir);
    if (canonical === null) return extensionsError(extensionProblemText("missing", dir));
    const info = inspectExtensionDir(canonical);
    if (!info.ok) return extensionsError(extensionProblemText(info.problem, canonical));
    if (current.extensions.some((extension) => extension.path === canonical)) {
        return extensionsError(t("errors.browser.extension.duplicate", { name: info.name }));
    }
    return {
        ok: true,
        settings: { startLinks: [...current.startLinks], extensions: [...current.extensions, { path: canonical, enabled: true }] },
    };
}
