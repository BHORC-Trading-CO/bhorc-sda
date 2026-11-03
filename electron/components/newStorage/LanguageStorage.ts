import createStore from "./createStore";
import { Language } from "../../interfaces/Language";

const store = createStore();

function hasEntries(value: unknown): boolean {
    return !!value && typeof value === "object" && Object.keys(value as object).length > 0;
}

class LanguageStorage {
    /** Сохранённое значение как есть: может отсутствовать или быть мусором из старой версии. */
    static Get(): unknown {
        return store.get("language");
    }
    static Save(language: Language) {
        store.set("language", language);
    }
    /** Есть ли в config.json данные старой (только русской) версии: аккаунты Steam или прокси. */
    static HasUserData(): boolean {
        return hasEntries(store.get("steamAccounts")) || hasEntries(store.get("proxies"));
    }
}

export default LanguageStorage;
