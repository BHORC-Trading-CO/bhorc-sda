jest.mock("../steamAccountManager", () => ({ __esModule: true, default: { objects: [] } }));
jest.mock("../../Proxy/proxyManager", () => ({ __esModule: true, default: { objects: [] } }));
jest.mock("../Chrome/Chrome", () => ({ __esModule: true, default: jest.fn() }));

import SteamAccount from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import Proxy from "../../Proxy/Proxy";
import proxyManager from "../../Proxy/proxyManager";
import { DEFAULT_AVATAR_URL } from "../../Functions/sanitizeAvatarUrl";

const proxy = { host: "proxy.test", port: "8080", username: "user", password: "pass" };
const smaFile = {
    accountName: "account", password: "password", maFile: { shared_secret: "shared" },
    secondary: { nickname: "name", avatarUrl: "https://evil.test/avatar.jpg", extra: "drop" },
    proxy, id: "victim.password", number: 999, deleted: true, extra: "drop",
    changableSecondary: { steam: { balance: 999 } },
};

beforeEach(() => {
    steamAccountManager.objects = [{ params: { number: 3, deleted: false } }, { params: { number: 999, deleted: true } }] as any;
    proxyManager.objects = [{ params: { number: 5, deleted: false } }, { params: { number: 999, deleted: true } }] as any;
});

it("SteamAccount.Generate создаёт новую идентичность и отбрасывает поля файла", () => {
    const first = SteamAccount.Generate(smaFile as any, null);
    const second = SteamAccount.Generate({ ...smaFile, id: "existing-account" } as any, null);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.id).not.toBe(second.id);
    expect(first.number).toBe(4);
    expect(first.deleted).toBe(false);
    expect(first).not.toHaveProperty("extra");
    expect(first).not.toHaveProperty("proxy");
    expect(first.secondary).not.toHaveProperty("extra");
    expect(first.secondary.avatarUrl).toBe(DEFAULT_AVATAR_URL);
    expect(first.changableSecondary.steam.balance).toBe(0);
    expect(steamAccountManager.objects.map(account => account.params.number)).toEqual([3, 999]);
});

it("Proxy.Generate не принимает id/number/deleted и геокеш из файла", () => {
    const result = Proxy.Generate({ ...proxy, id: "victim.password", number: 999, deleted: true, timezone: "fake", countryCode: "XX", extra: "drop" } as any);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toEqual({ ...proxy, id: result.id, number: 6, deleted: false });
    expect(Proxy.Generate({ ...proxy, id: "existing-proxy" } as any).id).not.toBe(result.id);
});
