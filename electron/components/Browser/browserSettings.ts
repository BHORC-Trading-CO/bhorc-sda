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
    | "comma"
    | "notDirectory"
    | "missing"
    | "badJson"
    | "manifestVersion"
    | "noName";

export type ExtensionDirInfo =
    | { ok: true; name: string; version: string }
    | { ok: false; problem: ExtensionDirProblem };

const MESSAGE_PLACEHOLDER = /^__MSG_.+__$/;

/**
 * Проверка папки распакованного расширения. Синхронная: читается один маленький manifest.json,
 * а вызывается и из generateChromeFlags(), который синхронный.
 */
export function inspectExtensionDir(dir: string): ExtensionDirInfo {
    if (typeof dir !== "string" || !path.isAbsolute(dir)) return { ok: false, problem: "notAbsolute" };
    // Chromium делит списки --load-extension и --disable-extensions-except по запятой.
    if (dir.includes(",")) return { ok: false, problem: "comma" };
    let stat: fs.Stats;
    try {
        stat = fs.statSync(dir);
    } catch {
        return { ok: false, problem: "missing" };
    }
    if (!stat.isDirectory()) return { ok: false, problem: "notDirectory" };
    let text: string;
    try {
        text = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
    } catch {
        return { ok: false, problem: "missing" };
    }
    let manifest: any;
    try {
        manifest = JSON.parse(text.replace(/^﻿/, ""));
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
 * Проверка сохранения со страницы. Ссылки — целиком заново. Расширения: путь, которого ещё нет
 * в сохранённом списке, проходит ту же проверку папки, что и выбор в диалоге; уже сохранённый
 * остаётся, даже если папку с тех пор удалили, — чтобы его можно было увидеть и убрать.
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
            const info = inspectExtensionDir(extension.path);
            if (!info.ok) return extensionsError(extensionProblemText(info.problem, extension.path));
        }
        extensions.push(extension);
    }
    return { ok: true, settings: { startLinks: [...(value.startLinks as string[])], extensions } };
}

/** Папка из диалога: проверка, повтор, затем включённой в конец списка. */
export function addExtensionDir(dir: string, current: BrowserSettingsInterface): SettingsUpdate {
    const info = inspectExtensionDir(dir);
    if (!info.ok) return extensionsError(extensionProblemText(info.problem, dir));
    if (current.extensions.some((extension) => extension.path === dir)) {
        return extensionsError(t("errors.browser.extension.duplicate", { name: info.name }));
    }
    return {
        ok: true,
        settings: { startLinks: [...current.startLinks], extensions: [...current.extensions, { path: dir, enabled: true }] },
    };
}
