import LanguageStorage from "../newStorage/LanguageStorage";
import LanguageChannels from "../../interfaces/IpcChannels/LanguageChannels";
import { DEFAULT_LANGUAGE, isLanguage, Language } from "../../interfaces/Language";
import { setMainLanguage } from "../../i18n";

type Broadcast = (channel: string, payload: unknown) => void;

let current: Language = DEFAULT_LANGUAGE;
let broadcast: Broadcast = () => { };

/** Язык системы (app.getLocale(): "uk-UA", "ru", "de-DE" ...) -> язык интерфейса. */
export function localeToLanguage(locale: string): Language {
    const normalized = (locale || "").toLowerCase();
    if (normalized.startsWith("uk")) return "uk";
    if (normalized.startsWith("ru")) return "ru";
    return DEFAULT_LANGUAGE;
}

/**
 * Язык на старте. Сохранённый корректный выбор важнее всего. Без него: если в хранилище уже
 * есть аккаунты или прокси, это обновление старой версии, где интерфейс был только русским, —
 * оставляем русский, а не переключаем молча на английский. Иначе берём язык системы.
 */
export function resolveLanguage(saved: unknown, hasUserData: boolean, locale: string): Language {
    if (isLanguage(saved)) return saved;
    if (hasUserData) return "ru";
    return localeToLanguage(locale);
}

/** Язык без записи в хранилище (например, когда папка данных не та и писать туда нельзя). */
export function peekLanguage(locale: string): Language {
    const saved = LanguageStorage.Get();
    return resolveLanguage(saved, !isLanguage(saved) && LanguageStorage.HasUserData(), locale);
}

/**
 * Вызывается один раз после app.ready (раньше app.getLocale() недоступен) и до создания окон.
 * Вычисленный язык сразу сохраняем: иначе у нового пользователя он сменился бы на русский,
 * как только появятся первые аккаунты.
 */
export function initLanguage(locale: string, broadcastToWindows?: Broadcast): Language {
    if (broadcastToWindows) broadcast = broadcastToWindows;
    const saved = LanguageStorage.Get();
    const language = peekLanguage(locale);
    if (saved !== language) {
        try {
            LanguageStorage.Save(language);
        } catch (err) {
            console.log(`Не удалось сохранить язык интерфейса: ${err}`);
        }
    }
    current = language;
    setMainLanguage(language);
    return language;
}

export function getLanguage(): Language {
    return current;
}

/** Смена языка из окна: проверка, запись, main-процесс, рассылка во все окна. false — значение отклонено. */
export function setLanguage(value: unknown): boolean {
    if (!isLanguage(value)) return false;
    LanguageStorage.Save(value);
    current = value;
    setMainLanguage(value);
    broadcast(LanguageChannels.LANGUAGE_CHANGED, value);
    return true;
}
