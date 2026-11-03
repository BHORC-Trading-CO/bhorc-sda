// Одно общее хранилище на все createStore() — как config.json в реальном приложении.
jest.mock("../../newStorage/createStore", () => {
    const data: Record<string, unknown> = {};
    const store = { data, get: (key: string) => data[key], set: (key: string, value: unknown) => { data[key] = value; } };
    return { __esModule: true, default: () => store, store };
});

import { getLanguage, initLanguage, localeToLanguage, resolveLanguage, setLanguage } from "../languageManager";
import { getMainLanguage, setMainLanguage, t } from "../../../i18n";
import LanguageChannels from "../../../interfaces/IpcChannels/LanguageChannels";
import sanitizeSmaFile from "../../Functions/sanitizeSmaFile";

const { store } = jest.requireMock("../../newStorage/createStore") as { store: { data: Record<string, unknown> } };
const account = { id: "a1", accountName: "trader", password: "secret" };

beforeEach(() => {
    for (const key of Object.keys(store.data)) delete store.data[key];
    initLanguage("en-US", () => { });
    for (const key of Object.keys(store.data)) delete store.data[key];
});

describe("язык на старте", () => {
    it.each([
        ["uk-UA", "uk"], ["uk", "uk"], ["UK-ua", "uk"],
        ["ru-RU", "ru"], ["ru", "ru"],
        ["de-DE", "en"], ["en-US", "en"], ["be-BY", "en"], ["", "en"],
    ])("пустое хранилище, система %p -> %p, и значение сразу сохранено", (locale, expected) => {
        expect(initLanguage(locale)).toBe(expected);
        expect(store.data.language).toBe(expected);
        expect(getLanguage()).toBe(expected);
        expect(getMainLanguage()).toBe(expected);
    });

    it("данные старой версии (аккаунты) -> ru при любом языке системы", () => {
        store.data.steamAccounts = { a1: account };
        expect(initLanguage("en-US")).toBe("ru");
        expect(store.data.language).toBe("ru");
    });

    it("данные старой версии (только прокси) -> ru", () => {
        store.data.proxies = { p1: { id: "p1", host: "proxy.test", port: "8080" } };
        expect(initLanguage("uk-UA")).toBe("ru");
        expect(store.data.language).toBe("ru");
    });

    it("пустые коллекции не считаются данными пользователя", () => {
        store.data.steamAccounts = {};
        store.data.proxies = {};
        expect(initLanguage("uk-UA")).toBe("uk");
    });

    it("сохранённый корректный выбор важнее данных и языка системы", () => {
        store.data.language = "en";
        store.data.steamAccounts = { a1: account };
        expect(initLanguage("ru-RU")).toBe("en");
        expect(store.data.language).toBe("en");
    });

    it.each(["de", "", "RU", "en-US", null, 42, {}])("некорректное сохранённое значение %p пересчитывается и сохраняется", (saved) => {
        store.data.language = saved;
        expect(initLanguage("uk-UA")).toBe("uk");
        expect(store.data.language).toBe("uk");

        store.data.language = saved;
        store.data.steamAccounts = { a1: account };
        expect(initLanguage("uk-UA")).toBe("ru");
        expect(store.data.language).toBe("ru");
    });

    it("язык нового пользователя не меняется, когда появляются аккаунты", () => {
        expect(initLanguage("de-DE")).toBe("en");
        store.data.steamAccounts = { a1: account };
        expect(initLanguage("de-DE")).toBe("en");
    });

    it("resolveLanguage и localeToLanguage — чистые функции", () => {
        expect(resolveLanguage("uk", true, "ru-RU")).toBe("uk");
        expect(resolveLanguage(undefined, true, "uk-UA")).toBe("ru");
        expect(resolveLanguage(undefined, false, "uk-UA")).toBe("uk");
        expect(localeToLanguage("ru_RU")).toBe("ru");
        expect(localeToLanguage(undefined as unknown as string)).toBe("en");
    });
});

describe("смена языка", () => {
    it("en|uk|ru: сохраняет, переключает main и рассылает во все окна", () => {
        const broadcast = jest.fn();
        initLanguage("en-US", broadcast);
        expect(setLanguage("uk")).toBe(true);
        expect(store.data.language).toBe("uk");
        expect(getLanguage()).toBe("uk");
        expect(t("errors.wrongPin")).toBe("Неправильний PIN");
        expect(broadcast).toHaveBeenCalledTimes(1);
        expect(broadcast).toHaveBeenCalledWith(LanguageChannels.LANGUAGE_CHANGED, "uk");
    });

    it.each(["de", "", "EN", "uk-UA", null, undefined, 1, {}, ["en"], "__proto__"])("отклоняет %p и ничего не меняет", (value) => {
        const broadcast = jest.fn();
        initLanguage("ru-RU", broadcast);
        expect(setLanguage(value)).toBe(false);
        expect(store.data.language).toBe("ru");
        expect(getLanguage()).toBe("ru");
        expect(getMainLanguage()).toBe("ru");
        expect(broadcast).not.toHaveBeenCalled();
    });
});

describe("t() main-процесса", () => {
    afterAll(() => setMainLanguage("en"));

    it("следует текущему языку и подставляет параметры", () => {
        setMainLanguage("en");
        expect(t("errors.steamAccountNotFound", { id: "42" })).toBe("Steam account #42 does not exist");
        setMainLanguage("uk");
        expect(t("errors.steamAccountNotFound", { id: "42" })).toBe("Акаунта Steam #42 не існує");
        setMainLanguage("ru");
        expect(t("errors.steamAccountNotFound", { id: "42" })).toBe("Такого стим аккаунта #42 не существует");
    });

    it("ошибка получает язык в момент, когда её бросают", () => {
        setMainLanguage("en");
        expect(() => sanitizeSmaFile(null)).toThrow("Invalid object in smaFile");
        setMainLanguage("ru");
        expect(() => sanitizeSmaFile(null)).toThrow("Неправильный объект в smaFile");
        setMainLanguage("uk");
        expect(() => sanitizeSmaFile({ secondary: {}, accountName: 1 })).toThrow("Неправильне поле accountName");
    });

    it("неизвестный ключ не превращается в пустую строку", () => {
        setMainLanguage("en");
        expect(t("errors.noSuchKey")).toBe("errors.noSuchKey");
    });
});
