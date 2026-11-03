// Языки интерфейса (SDA-18). Модуль без зависимостей: его импортируют и main, и preload-мосты.
export const LANGUAGES = ["en", "uk", "ru"] as const;

export type Language = typeof LANGUAGES[number];

export const DEFAULT_LANGUAGE: Language = "en";

export function isLanguage(value: unknown): value is Language {
    return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}
