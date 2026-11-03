jest.mock("../Processes/steamAccountImport", () => ({ __esModule: true, default: jest.fn(() => ({ id: "generated-account" })) }));
jest.mock("../steamAccountManager", () => ({ __esModule: true, default: { sendAccountsToFront: jest.fn() } }));
jest.mock("../../Proxy/proxyManager", () => ({ __esModule: true, default: {
    getOrCreateBySetup: jest.fn(() => ({ params: { id: "generated-proxy" } })), sendProxiesToFront: jest.fn(),
} }));
jest.mock("../../manager/manager", () => ({ __esModule: true, default: { LinkProxyToSteamAccount: jest.fn() } }));

import importListener from "../Listeners/steamAccountImportListener";
import steamAccountImport from "../Processes/steamAccountImport";
import proxyManager from "../../Proxy/proxyManager";
import Manager from "../../manager/manager";
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
    importListener(event as any, [{ smaFile: file(), links: { proxyId: "chosen-proxy" } }] as any);
    expect(event.reply).not.toHaveBeenCalled();
    const imported = (steamAccountImport as jest.Mock).mock.calls[0][0];
    expect(imported).not.toHaveProperty("id");
    expect(imported).not.toHaveProperty("number");
    expect(imported.secondary.avatarUrl).toBe(DEFAULT_AVATAR_URL);
    expect(proxyManager.getOrCreateBySetup).toHaveBeenCalledWith({ host: "proxy.test", port: "8080", username: "user", password: "pass" });
    expect(Manager.LinkProxyToSteamAccount).toHaveBeenCalledWith("generated-account", "generated-proxy");
});

it("некорректный прокси отклоняется до создания аккаунта", () => {
    const event = { reply: jest.fn() };
    const smaFile = file();
    smaFile.proxy.host = "http://unix:/tmp/socket";
    importListener(event as any, [{ smaFile, links: { proxyId: null } }] as any);
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.any(Error));
    expect(steamAccountImport).not.toHaveBeenCalled();
    expect(proxyManager.getOrCreateBySetup).not.toHaveBeenCalled();
});

it("без портативного прокси сохраняет выбранную пользователем привязку", () => {
    const { proxy, ...smaFile } = file();
    importListener({ reply: jest.fn() } as any, [{ smaFile, links: { proxyId: "chosen-proxy" } }] as any);
    expect(Manager.LinkProxyToSteamAccount).toHaveBeenCalledWith("generated-account", "chosen-proxy");
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
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.objectContaining({ message: expect.stringMatching(/Не импортировано аккаунтов: 1\. broken/) }));
    expect(proxyManager.sendProxiesToFront).toHaveBeenCalled();
});
