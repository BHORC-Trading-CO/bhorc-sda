/** Распакованное расширение в настройках браузера (SDA-6). path — абсолютный путь к папке с manifest.json. */
export interface BrowserExtensionSetting {
    path: string;
    enabled: boolean;
}

/** Общие для всех аккаунтов настройки браузера: стартовые ссылки и расширения (config.json, ключ browserSettings). */
export default interface BrowserSettingsInterface {
    startLinks: string[];
    extensions: BrowserExtensionSetting[];
}

/** Состояние папки расширения сейчас: ok, папки/manifest.json нет, manifest не проходит проверку. */
export type BrowserExtensionStatus = "ok" | "missing" | "invalid";

/** Расширение для страницы Browser: к сохранённому добавлены имя и версия из manifest.json. */
export interface BrowserExtensionView extends BrowserExtensionSetting {
    name: string;
    version: string;
    status: BrowserExtensionStatus;
}

export interface BrowserSettingsView {
    startLinks: string[];
    extensions: BrowserExtensionView[];
}
