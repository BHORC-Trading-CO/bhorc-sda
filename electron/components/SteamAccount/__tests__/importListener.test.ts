jest.mock("../Processes/steamAccountImport", () => ({ __esModule: true, default: jest.fn(() => ({ id: "generated-account" })) }));
jest.mock("../steamAccountManager", () => ({ __esModule: true, default: { sendAccountsToFront: jest.fn() } }));
jest.mock("../../Proxy/proxyManager", () => ({ __esModule: true, default: {
    getOrCreateBySetup: jest.fn(() => ({ params: { id: "generated-proxy" } })), sendProxiesToFront: jest.fn(),
} }));
jest.mock("../../Manager/Manager", () => ({ __esModule: true, default: { RequireProxy: jest.fn(), LinkProxyToSteamAccount: jest.fn() } }));

import importListener from "../Listeners/steamAccountImportListener";
import steamAccountImport from "../Processes/steamAccountImport";
import proxyManager from "../../Proxy/proxyManager";
import Manager from "../../Manager/Manager";
import { DEFAULT_AVATAR_URL } from "../../Functions/sanitizeAvatarUrl";
import { setMainLanguage } from "../../../i18n";

// Сообщения проверяем на русском: ru — прежний текст без изменений (SDA-18).
beforeAll(() => setMainLanguage("ru"));

const file = () => ({
    accountName: "account", password: "password", maFile: {},
    secondary: { avatarUrl: "http://unix:/tmp/socket:/avatar" }, id: "a.b", number: 999,
    proxy: { host: "proxy.test", port: "8080", username: "user", password: "pass", id: "a.b", number: 999, timezone: "fake" },
});

it("main очищает обе копии данных независимо от проверки renderer", () => {
    const event = { reply: jest.fn() };
    importListener(event as any, [{ smaFile: file(), links: { proxyId: null } }] as any);
    expect(event.reply).not.toHaveBeenCalled();
    const imported = (steamAccountImport as jest.Mock).mock.calls[0][0];
    expect(imported).not.toHaveProperty("id");
    expect(imported).not.toHaveProperty("number");
    expect(imported.secondary.avatarUrl).toBe(DEFAULT_AVATAR_URL);
    expect(proxyManager.getOrCreateBySetup).toHaveBeenCalledWith({ host: "proxy.test", port: "8080", username: "user", password: "pass" });
    expect(steamAccountImport).toHaveBeenCalledWith(expect.any(Object), "generated-proxy");
});

it("некорректный прокси отклоняется до создания аккаунта", () => {
    const event = { reply: jest.fn() };
    const smaFile = file();
    smaFile.proxy.host = "http://unix:/tmp/socket";
    importListener(event as any, [{ smaFile, links: { proxyId: null } }] as any);
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.any(String));
    expect(steamAccountImport).not.toHaveBeenCalled();
    expect(proxyManager.getOrCreateBySetup).not.toHaveBeenCalled();
});

it("без портативного прокси сохраняет выбранную пользователем привязку", () => {
    const { proxy, ...smaFile } = file();
    importListener({ reply: jest.fn() } as any, [{ smaFile, links: { proxyId: "chosen-proxy" } }] as any);
    expect(steamAccountImport).toHaveBeenCalledWith(expect.any(Object), "chosen-proxy");
    expect(proxyManager.getOrCreateBySetup).not.toHaveBeenCalled();
});

it("один неправильный файл не обрывает импорт остальных и называет пропущенный аккаунт", () => {
    const event = { reply: jest.fn() };
    const bad = file();
    bad.accountName = "broken";
    bad.proxy.host = "http://unix:/tmp/socket";
    const { proxy, ...good } = file();
    importListener(event as any, [{ smaFile: bad, links: { proxyId: null } }, { smaFile: good, links: { proxyId: null } }] as any);
    expect(steamAccountImport).toHaveBeenCalledTimes(1);
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringMatching(/Не импортировано аккаунтов: 1\. broken/));
    expect(proxyManager.sendProxiesToFront).toHaveBeenCalled();
});

// SDA-62: логин одного аккаунта с maFile другого — окно подтверждений с именем A действовало бы на B.
const jwt = (sub: string) => `e30.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.c2ln`;
it.each([
    ["account_name", { account_name: "other" }],
    ["токен сессии", { account_name: "Account ", Session: { SteamID: "76561198000000001", RefreshToken: jwt("76561198000000002") } }],
])("файл с maFile другого аккаунта отклоняется: %s", (_name, maFile) => {
    const event = { reply: jest.fn() };
    const { proxy, ...smaFile } = file();
    importListener(event as any, [{ smaFile: { ...smaFile, maFile }, links: { proxyId: null } }] as any);
    expect(steamAccountImport).not.toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringMatching(/Не импортировано аккаунтов: 1\. account — maFile/));
});

it("совпадающие логин (без учёта регистра) и SteamID, как и maFile без account_name, импортируются", () => {
    const event = { reply: jest.fn() };
    const { proxy, ...smaFile } = file();
    const Session = { SteamID: "76561198000000001", AccessToken: jwt("76561198000000001"), RefreshToken: jwt("76561198000000001") };
    importListener(event as any, [{ account_name: "ACCOUNT", Session }, { Session }].map(maFile => ({ smaFile: { ...smaFile, maFile }, links: { proxyId: null } })) as any);
    expect(event.reply).not.toHaveBeenCalled();
    expect(steamAccountImport).toHaveBeenCalledTimes(2);
});

// SDA-62: превью показывало выбранный прокси, а аккаунт получал прокси из файла.
it.each([
    ["сохранённый прокси", { proxyId: "chosen-proxy" }, "chosen-proxy"],
    ["без прокси", { proxyId: null, noProxy: true }, null],
])("явный выбор в превью главнее прокси из файла: %s", (_name, links, expected) => {
    const event = { reply: jest.fn() };
    importListener(event as any, [{ smaFile: file(), links }] as any);
    expect(event.reply).not.toHaveBeenCalled();
    expect(steamAccountImport).toHaveBeenCalledWith(expect.any(Object), expected);
    expect(proxyManager.getOrCreateBySetup).not.toHaveBeenCalled();
});

it("файл с пропавшим прокси без явного выбора не импортируется напрямую", () => {
    const event = { reply: jest.fn() };
    const { proxy, ...smaFile } = file();
    importListener(event as any, [{ smaFile: { ...smaFile, proxyMissing: true }, links: { proxyId: null } }] as any);
    expect(steamAccountImport).not.toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringContaining("прокси аккаунта больше не существует"));
});

it.each([
    [{ proxyId: "chosen-proxy" }, "chosen-proxy"],
    [{ proxyId: null, noProxy: true }, null],
])("файл с пропавшим прокси импортируется с выбором %j, метка в запись не попадает", (links, expected) => {
    const { proxy, ...smaFile } = file();
    importListener({ reply: jest.fn() } as any, [{ smaFile: { ...smaFile, proxyMissing: true }, links }] as any);
    expect(steamAccountImport).toHaveBeenCalledWith(expect.not.objectContaining({ proxyMissing: true }), expected);
});
