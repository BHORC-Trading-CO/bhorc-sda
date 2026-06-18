// Tier 1: guard'ы fail-closed на доменных методах (HIGH-1) и пересоздание
// сетевых клиентов в setProxy(null) (LOW-1). steamcommunity замокан спаем,
// чтобы проверить, что без прокси его методы НЕ вызываются.

jest.mock("steamcommunity", () =>
  jest.fn().mockImplementation(() => ({
    getConfirmations: jest.fn((_t: number, _k: string, cb: any) => cb(null, [])),
    respondToConfirmation: jest.fn((_i: any, _k: any, _t: any, _key: any, _allow: any, cb: any) => cb(null)),
    setCookies: jest.fn(),
    loggedIn: jest.fn(),
    parentalUnlock: jest.fn(),
  }))
);

// Контролируем привязку прокси через Manager (по умолчанию — нет прокси).
jest.mock("../../Manager/Manager", () => ({
  __esModule: true,
  default: { GetSteamAccountLinkedData: () => ({ proxy: null }) },
}));

import SteamAccount from "../SteamAccount";

const IDENTITY = Buffer.from("identity-secret-1234").toString("base64");

function makeAccount() {
  return new SteamAccount({
    id: "acc-1",
    number: 1,
    accountName: "bob",
    password: "pw",
    maFile: { shared_secret: "c2hhcmVk", identity_secret: IDENTITY },
    secondary: { nickname: "n", avatarUrl: "" },
    useSteamCookies: false,
  } as any);
}

const proxy = { host: "127.0.0.1", port: 8888, username: "u", password: "p" } as any;

describe("SteamAccount fail-closed guard'ы без прокси (HIGH-1)", () => {
  it("getConfirmations реджектит и НЕ трогает community", async () => {
    const acc = makeAccount();
    const spy = (acc as any).community.getConfirmations;
    await expect(acc.getConfirmations()).rejects.toThrow(/не привязан прокси/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("confirmItems реджектит и НЕ трогает community", async () => {
    const acc = makeAccount();
    const spy = (acc as any).community.respondToConfirmation;
    await expect(acc.confirmItems([1], ["k"])).rejects.toThrow(/не привязан прокси/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("cancelItems реджектит и НЕ трогает community", async () => {
    const acc = makeAccount();
    const spy = (acc as any).community.respondToConfirmation;
    await expect(acc.cancelItems([1], ["k"])).rejects.toThrow(/не привязан прокси/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("getSecondary и getChangableSecondary реджектят", async () => {
    const acc = makeAccount();
    await expect(acc.getSecondary()).rejects.toThrow(/не привязан прокси/);
    await expect(acc.getChangableSecondary()).rejects.toThrow(/не привязан прокси/);
  });

  it("пишет аудит-лог заблокированной попытки (LOW-4)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const acc = makeAccount();
    await expect(acc.getConfirmations()).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\[privacy\].*заблокировано/));
    warn.mockRestore();
  });
});

describe("SteamAccount с прокси — guard пропускает (HIGH-1)", () => {
  it("getConfirmations доходит до community", async () => {
    const acc = makeAccount();
    acc.setProxy(proxy);
    const spy = (acc as any).community.getConfirmations;
    await expect(acc.getConfirmations()).resolves.toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("setProxy(null) пересоздаёт сетевые клиенты (LOW-1)", () => {
  it("после снятия прокси community/session — новые инстансы, операции снова заблокированы", async () => {
    const acc = makeAccount();
    acc.setProxy(proxy);
    const communityWithProxy = (acc as any).community;
    const sessionWithProxy = (acc as any).session;

    acc.setProxy(null);

    expect(acc.proxy).toBeNull();
    expect((acc as any).community).not.toBe(communityWithProxy);
    expect((acc as any).session).not.toBe(sessionWithProxy);
    await expect(acc.getConfirmations()).rejects.toThrow(/не привязан прокси/);
  });
});
