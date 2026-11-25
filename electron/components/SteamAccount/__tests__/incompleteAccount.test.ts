// SDA-62: аккаунт без shared_secret (импорт неполного файла) не останавливает остальные строки.
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { windows: { openMiniNotification: jest.fn() } } }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
const SteamTotp = require("steam-totp");
import SteamAccountsTableStore from "../../../../src/store/SteamAccountsTableStore/SteamAccountsTableStore";

afterEach(() => { delete (globalThis as any).window; jest.useRealTimers(); });

it("codes and browser statuses of healthy accounts load next to an incomplete one", () => {
    jest.useFakeTimers();
    const methods: Record<string, jest.Mock> = {};
    const api = new Proxy({}, { get: (_target, key: string) => methods[key] ||= jest.fn() });
    // Как в мосте: библиотека бросает на отсутствующем секрете
    methods.getAuthCode = jest.fn((secret: string) => SteamTotp.getAuthCode(secret));
    (globalThis as any).window = { Main: { steamAccounts: api, guardConnection: api } };
    const table = new SteamAccountsTableStore({ windows: { openMiniNotification: jest.fn() } } as any);
    const account = (id: string, maFile: unknown) => ({ id, number: 1, accountName: id, deleted: false, maFile, secondary: {}, changableSecondary: { steam: {} } }) as any;
    table.setSteamAccounts([account("broken", { Session: {} }), account("no-mafile", undefined), account("empty", { shared_secret: "" }), account("unreadable", { shared_secret: "!!!" }), account("healthy", { shared_secret: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=" })]);
    expect(table.authCodes).toMatchObject({ broken: "", "no-mafile": "", empty: "", unreadable: "", healthy: expect.stringMatching(/^[A-Z0-9]{5}$/) });
    expect(methods.getBrowserStatus.mock.calls.flat()).toEqual(["broken", "no-mafile", "empty", "unreadable", "healthy"]);
});
