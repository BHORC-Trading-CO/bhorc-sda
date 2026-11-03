import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "../locales/en/common.json";
import ukCommon from "../locales/uk/common.json";
import ruCommon from "../locales/ru/common.json";
import enShell from "../locales/en/shell.json";
import ukShell from "../locales/uk/shell.json";
import ruShell from "../locales/ru/shell.json";
// Часть кода electron/ (например, sanitizeSmaFile) выполняется и в renderer со своим
// экземпляром main-переводов — держим его на том же языке.
import { setMainLanguage } from "../../electron/i18n";

// Один список языков на main, preload и renderer.
import { LANGUAGES, DEFAULT_LANGUAGE, isLanguage } from "../../electron/interfaces/Language";
import type { Language } from "../../electron/interfaces/Language";
export { LANGUAGES, DEFAULT_LANGUAGE, isLanguage };
export type { Language };

function initialLanguage(): Language {
    try {
        const language = window.Language?.get();
        if (isLanguage(language)) return language;
    } catch (err) {
        console.log(`Не удалось получить язык интерфейса: ${err}`);
    }
    return DEFAULT_LANGUAGE;
}

function applyLanguage(language: string) {
    document.documentElement.lang = language;
    if (isLanguage(language)) setMainLanguage(language);
}

i18n.use(initReactI18next).init({
    resources: {
        en: { common: enCommon, shell: enShell },
        uk: { common: ukCommon, shell: ukShell },
        ru: { common: ruCommon, shell: ruShell },
    },
    lng: initialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...LANGUAGES],
    ns: ["common", "shell"],
    defaultNS: "common",
    // Ресурсы встроены в бандл: инициализация синхронная, первая отрисовка сразу с переводами.
    initImmediate: false,
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
});

applyLanguage(i18n.language);
i18n.on("languageChanged", applyLanguage);

// Язык меняется в main (из любого окна) и рассылается во все окна, включая то, где его выбрали.
window.Language?.onChanged((language) => {
    if (isLanguage(language) && language !== i18n.language) i18n.changeLanguage(language);
});

export default i18n;
