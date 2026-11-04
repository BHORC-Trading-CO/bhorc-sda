// Языки интерфейса (SDA-18). Модуль без зависимостей: его импортируют и main, и preload-мосты.
// Новый язык: запись в LANGUAGES, запись в LANGUAGE_META и папка src/locales/<код>.
export const LANGUAGES = ["en", "uk", "ru"] as const;

export type Language = typeof LANGUAGES[number];

export const DEFAULT_LANGUAGE: Language = "en";

// Меню языка в верхней панели (R2): короткий код и самоназвание. Самоназвание не переводится —
// каждый язык подписан на своём языке, чтобы его нашли из любого интерфейса.
export const LANGUAGE_META: Record<Language, { code: string; nativeName: string }> = {
    en: { code: "EN", nativeName: "English" },
    uk: { code: "UA", nativeName: "Українська" }, // i18n-ok: самоназвание языка, не перевод
    ru: { code: "RU", nativeName: "Русский" }, // i18n-ok: самоназвание языка, не перевод
};

export function isLanguage(value: unknown): value is Language {
    return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}
