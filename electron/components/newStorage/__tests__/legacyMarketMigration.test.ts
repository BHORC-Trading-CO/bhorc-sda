// Используем общий in-memory мок, дополняя его вложенными ключами electron-store.
// Настоящий config.json и пути Electron в этих тестах не используются.
jest.mock("electron-store", () => {
    const MemoryStore = jest.requireActual("../../../../__mocks__/electron-store");
    const store = new MemoryStore();
    store.get = jest.fn((key: string, fallback?: unknown) => {
        const value = key.split(".").reduce((object: any, part: string) => object && object[part], store.store);
        return value === undefined ? fallback : value;
    });
    store.set = jest.fn((key: string, value: unknown) => {
        const parts = key.split(".");
        const last = parts.pop()!;
        const parent = parts.reduce((object: any, part: string) => {
            if (!object[part]) object[part] = {};
            return object[part];
        }, store.store);
        parent[last] = value;
    });
    return jest.fn(() => store);
});

jest.mock("../cryptoUserData", () => ({
    __esModule: true,
    default: {
        encryptObject: jest.fn((value: unknown) => value),
        decryptObject: jest.fn((value: unknown) => value),
    },
}));
jest.mock("../../SteamAccount/Chrome/Chrome", () => jest.fn());
jest.mock("../../manager/manager", () => ({
    __esModule: true,
    default: { GetSteamAccountLinkedData: () => ({ proxy: null }) },
}));
jest.mock("../../SteamAccount/steamAccountManager", () => ({
    __esModule: true,
    default: { objects: [] },
}));
jest.mock("steam-session", () => ({
    LoginSession: jest.fn(),
    EAuthTokenPlatformType: { MobileApp: 2 },
}));
jest.mock("steamcommunity", () => jest.fn());

import Store from "electron-store";
import TableStorage from "../TableStorage";
import SteamAccountStorage from "../SteamAccountStorage";
import defaults from "../../../interfaces/TableFields/defaults/steamAccountsTableFields";
import AvalibleFieldTypes from "../../../interfaces/TableFields/AvalibleFieldTypes";
import SteamAccountInterface from "../../../interfaces/SteamAccount/SteamAccountInterface";
import SteamAccount from "../../SteamAccount/SteamAccount";
import convertMaFileToStr from "../../Functions/converMaFileToStr";
import maFileToString from "../../SteamAccount/Functions/maFileToString";

const store = new Store();
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function oldAccount(id = "account-1") {
    return {
        id,
        number: 4,
        accountName: "migration-fixture",
        password: "fixture-password",
        tmApiKey: "old-tm-key",
        marketApiKey: "old-market-key",
        maFile: {
            shared_secret: "fixture-shared-secret",
            identity_secret: "fixture-identity-secret",
            revocation_code: "fixture-revocation-code",
            Session: { SteamID: "76561198000000000", AccessToken: "fixture-access-token" },
            tmApiKey: "old-nested-tm-key",
            marketApiKey: "old-nested-market-key",
            extraMaFileField: "preserve-me",
        },
        familyViewPin: 1234,
        useSteamCookies: true,
        secondary: { nickname: "Fixture", tradeLink: "fixture-trade-link", ktState: false, tpState: true },
        changableSecondary: {
            steam: { balance: 12.5, currency: "RUB", error: null },
            market: { balance: 42, currency: "USD", error: null },
        },
        mail: "fixture@example.invalid",
        mailPassword: "fixture-mail-password",
        deleted: false,
    };
}

function cleanedAccount(id = "account-1") {
    const legacy = oldAccount(id);
    const { tmApiKey, marketApiKey, ...account } = legacy;
    const { tmApiKey: nestedTm, marketApiKey: nestedMarket, ...maFile } = legacy.maFile;
    return { ...account, maFile, changableSecondary: { steam: legacy.changableSecondary.steam } };
}

beforeEach(() => {
    store.clear();
});

describe("Миграция сохранённых колонок", () => {
    it("удаляет TM и неизвестные типы, сохраняя порядок и настройки остальных колонок", () => {
        const supported = copy(defaults).reverse().map((field, index) => ({
            ...field,
            title: `Своё название ${index}`,
            isVisible: index % 2 === 0,
            sortDirection: "DOWN" as const,
        }));
        const legacy = [
            { ...supported[0], type: "tmApiKey" },
            ...supported.slice(0, 2),
            { ...supported[0], type: "csgoTmBalance" },
            { ...supported[0], type: "unknown-removed-column" },
            ...supported.slice(2),
        ];
        const original = copy(legacy);
        store.set("steamAccountsTableFields", legacy);
        jest.mocked(store.set).mockClear();

        expect(TableStorage.GetFields("steamAccounts")).toEqual(supported);
        expect(store.get("steamAccountsTableFields")).toEqual(supported);
        expect(legacy).toEqual(original);
        expect(store.set).toHaveBeenCalledTimes(1);
        TableStorage.GetFields("steamAccounts");
        expect(store.set).toHaveBeenCalledTimes(1);
    });

    it("сохраняет миграцию, даже когда удаление и бэкфилл не меняют длину массива", () => {
        const missing = defaults[0];
        const legacy = [{ ...missing, type: "tmApiKey" }, ...copy(defaults.slice(1))];
        store.set("steamAccountsTableFields", legacy);
        const expected = [...defaults.slice(1), missing];

        expect(TableStorage.GetFields("steamAccounts")).toEqual(expected);
        expect(store.get("steamAccountsTableFields")).toEqual(expected);
    });

    it("создаёт новые настройки без удалённых колонок", () => {
        const fields = TableStorage.GetFields("steamAccounts");
        expect(fields).toEqual(defaults);
        expect(fields.some(field => ["tmApiKey", "csgoTmBalance"].includes(field.type))).toBe(false);
        expect(fields.some(field => field.type === AvalibleFieldTypes.steamAccountBalance)).toBe(true);
    });
});

describe("Миграция сохранённых аккаунтов", () => {
    it("очищает GetAll и config, включая архивные аккаунты, без потери данных Steam", () => {
        const active = oldAccount();
        const archived = { ...oldAccount("archived"), deleted: true };
        const original = copy(active);
        store.set("steamAccounts", { [active.id]: active, [archived.id]: archived });
        store.set("unrelated-setting", { keep: true });
        jest.mocked(store.set).mockClear();
        const expected = {
            [active.id]: cleanedAccount(),
            [archived.id]: { ...cleanedAccount("archived"), deleted: true },
        };

        expect(SteamAccountStorage.GetAll()).toEqual(expected);
        expect(store.get("steamAccounts")).toEqual(expected);
        expect(store.get("unrelated-setting")).toEqual({ keep: true });
        expect(active).toEqual(original);
        expect(store.set).toHaveBeenCalledTimes(2);
        expect(SteamAccountStorage.GetAll()).toEqual(expected);
        expect(store.set).toHaveBeenCalledTimes(2);
    });

    it("очищает отдельный аккаунт при GetById и не записывает его повторно", () => {
        store.set("steamAccounts.account-1", oldAccount());
        jest.mocked(store.set).mockClear();
        expect(SteamAccountStorage.GetById("account-1")).toEqual(cleanedAccount());
        expect(store.get("steamAccounts.account-1")).toEqual(cleanedAccount());
        expect(store.set).toHaveBeenCalledTimes(1);
        SteamAccountStorage.GetById("account-1");
        expect(store.set).toHaveBeenCalledTimes(1);
    });

    it("Save и EditData не возвращают старые поля в config", () => {
        const legacy = oldAccount();
        SteamAccountStorage.Save(legacy.id, legacy as unknown as SteamAccountInterface);
        expect(store.get(`steamAccounts.${legacy.id}`)).toEqual(cleanedAccount());
        SteamAccountStorage.EditData(legacy.id, {
            ...legacy,
            password: "updated-password",
        } as unknown as SteamAccountInterface);
        expect(store.get(`steamAccounts.${legacy.id}`)).toEqual({ ...cleanedAccount(), password: "updated-password" });
    });

    it("обрабатывает пустое хранилище и аккаунт без вторичных данных", () => {
        expect(SteamAccountStorage.GetAll()).toEqual({});
        expect(() => SteamAccountStorage.GetById("missing")).toThrow(/not exist/);
        store.set("steamAccounts.minimal", { id: "minimal", tmApiKey: "old-key" });
        expect(SteamAccountStorage.GetById("minimal")).toEqual({ id: "minimal" });
    });
});

describe("Импорт и экспорт старых файлов", () => {
    it("не возвращает поля TM при импорте, редактировании и экспорте smaFile", () => {
        const legacy = oldAccount();
        const generated = SteamAccount.Generate(legacy as unknown as SteamAccountInterface, legacy.changableSecondary);
        expect(generated).not.toHaveProperty("tmApiKey");
        expect(generated).not.toHaveProperty("marketApiKey");
        expect(generated.changableSecondary).toEqual({ steam: legacy.changableSecondary.steam });
        const account = new SteamAccount(generated);
        SteamAccountStorage.Save(generated.id, generated);
        account.editParams({ maFile: legacy.maFile, changableSecondary: legacy.changableSecondary } as unknown as SteamAccountInterface);

        const exported = JSON.parse(JSON.stringify(account.getSmaFile()));
        expect(exported).toEqual({
            secondary: legacy.secondary,
            accountName: legacy.accountName,
            password: legacy.password,
            maFile: cleanedAccount().maFile,
            familyViewPin: legacy.familyViewPin,
            useSteamCookies: legacy.useSteamCookies,
        });
        expect(JSON.stringify(account.params)).not.toMatch(/tmApiKey|marketApiKey|old-tm-key/);
        expect(account.params.changableSecondary).not.toHaveProperty("market");
        expect(SteamAccount.Generate(legacy as unknown as SteamAccountInterface, null).changableSecondary)
            .toEqual({ steam: { balance: 0, currency: "RUB", error: null } });
    });

    it.each([convertMaFileToStr, maFileToString])("экспорт maFile удаляет старые ключи, сохраняя секреты и формат SteamID", (serialize) => {
        const legacy = oldAccount().maFile;
        const output = serialize(legacy as any);
        expect(output).not.toMatch(/tmApiKey|marketApiKey|old-nested/);
        expect(output).toContain('"SteamID":76561198000000000');
        expect(JSON.parse(output)).toEqual({
            ...cleanedAccount().maFile,
            Session: { SteamID: 76561198000000000, AccessToken: "fixture-access-token" },
        });
        expect(legacy.tmApiKey).toBe("old-nested-tm-key");
    });
});
