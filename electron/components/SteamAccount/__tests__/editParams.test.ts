// SDA-27: editParams() обновлял в памяти только ключи, которые уже были в this.params, а в
// config.json писал все. Почта, добавленная аккаунту без почты, сохранялась на диск, но живой
// объект оставался без неё, и следующая рассылка аккаунтов стирала её в окне.
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
        // Как electron-store: значение проходит через JSON, undefined-ключи пропадают.
        parent[last] = JSON.parse(JSON.stringify(value));
    });
    return jest.fn(() => store);
});
jest.mock("../../newStorage/cryptoUserData", () => ({
    __esModule: true,
    default: { encryptObject: jest.fn((value: unknown) => value), decryptObject: jest.fn((value: unknown) => value) },
}));
jest.mock("../Chrome/Chrome", () => jest.fn());
jest.mock("../../manager/manager", () => ({
    __esModule: true,
    default: { GetSteamAccountLinkedData: () => ({ proxy: null, proxyState: "none", proxyId: null }) },
}));
jest.mock("../steamAccountManager", () => ({ __esModule: true, default: { objects: [] } }));
jest.mock("steam-session", () => ({ LoginSession: jest.fn(), EAuthTokenPlatformType: { MobileApp: 2 } }));
jest.mock("steamcommunity", () => jest.fn());

import Store from "electron-store";
import SteamAccount from "../SteamAccount";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import SteamAccountInterface from "../../../interfaces/SteamAccount/SteamAccountInterface";

const store = new Store();

// Аккаунт без необязательных полей: ни почты, ни secondary, ни PIN.
function minimalAccount(): SteamAccountInterface {
    return {
        id: "account-1", number: 1, accountName: "fixture", password: "fixture-password",
        maFile: { account_name: "fixture", shared_secret: "fixture-shared", identity_secret: "fixture-identity" } as any,
        useSteamCookies: true, deleted: false,
        changableSecondary: { steam: { balance: 0, currency: "RUB", error: null } },
    } as unknown as SteamAccountInterface;
}
function savedAccount() {
    const params = minimalAccount();
    SteamAccountStorage.Save(params.id, params);
    return new SteamAccount(JSON.parse(JSON.stringify(params)));
}
const onDisk = () => SteamAccountStorage.GetById("account-1");
const inMemory = (account: SteamAccount) => JSON.parse(JSON.stringify(account.params));

beforeEach(() => store.clear());

it("a mail added to an account without one lands in memory as well as in config.json", () => {
    const account = savedAccount();
    expect(account.params).not.toHaveProperty("mail");
    account.editParams({ mail: "added@example.invalid", mailPassword: "added-mail-password" });
    expect(account.params.mail).toBe("added@example.invalid");
    expect(account.params.mailPassword).toBe("added-mail-password");
    expect(onDisk()).toMatchObject({ mail: "added@example.invalid", mailPassword: "added-mail-password" });
    expect(inMemory(account)).toEqual(onDisk());
});

it("secondary, changableSecondary and familyViewPin take the same path when absent at first", () => {
    const account = savedAccount();
    delete (account.params as any).changableSecondary;
    const secondary = { nickname: "fixture", ktState: false, tpState: true, avatarUrl: "", level: 3, tradeState: true } as any;
    account.editParams({ secondary });
    account.editParams({ changableSecondary: { steam: { balance: 1.5, currency: "USD", error: null } } } as any);
    account.editParams({ familyViewPin: 1234 });
    expect(account.params.secondary).toEqual(secondary);
    expect(account.params.changableSecondary).toEqual({ steam: { balance: 1.5, currency: "USD", error: null } });
    expect(account.params.familyViewPin).toBe(1234);
    expect(inMemory(account)).toEqual(onDisk());
});

it("undefined values change neither memory nor config.json; null is applied to both", () => {
    const account = savedAccount();
    account.editParams({ mail: "kept@example.invalid", familyViewPin: 1234 });
    account.editParams({ mail: undefined, familyViewPin: null });
    expect(account.params.mail).toBe("kept@example.invalid");
    expect(account.params.familyViewPin).toBeNull();
    expect(onDisk()).toMatchObject({ mail: "kept@example.invalid", familyViewPin: null });
    expect(inMemory(account)).toEqual(onDisk());
});

it("legacy market fields are dropped from both copies", () => {
    const account = savedAccount();
    account.editParams({ tmApiKey: "old-key", password: "new-password" } as any);
    expect(account.params).not.toHaveProperty("tmApiKey");
    expect(onDisk()).not.toHaveProperty("tmApiKey");
    expect(account.params.password).toBe("new-password");
    expect(inMemory(account)).toEqual(onDisk());
});
