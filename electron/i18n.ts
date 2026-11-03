import i18next from "i18next";
import en from "./locales/en/main.json";
import uk from "./locales/uk/main.json";
import ru from "./locales/ru/main.json";
import { DEFAULT_LANGUAGE, Language } from "./interfaces/Language";

// Тексты main-процесса, которые видит пользователь (ошибки, диалоги). Язык держит
// components/language/languageManager.ts; t() вызываем в момент, когда текст создаётся,
// а не при импорте модуля, иначе смена языка до него не дойдёт.
const i18n = i18next.createInstance();

i18n.init({
    resources: { en: { main: en }, uk: { main: uk }, ru: { main: ru } },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    ns: ["main"],
    defaultNS: "main",
    // Ресурсы встроены, поэтому инициализация синхронная: t() работает сразу после импорта.
    initImmediate: false,
    interpolation: { escapeValue: false },
    returnNull: false,
});

export function t(key: string, options?: Record<string, unknown>): string {
    return i18n.t(key, options) as string;
}

export function setMainLanguage(language: Language): void {
    i18n.changeLanguage(language);
}

export function getMainLanguage(): string {
    return i18n.language;
}

export default i18n;
