// Прокси опционален: доменные методы работают и без прокси (прямое соединение —
// осознанный выбор пользователя), и по-прежнему работают с прокси. Также проверяем
// пересоздание сетевых клиентов в setProxy after explicit unlink (LOW-1).
// steamcommunity замокан спаем, чтобы проверить, что методы доходят до него.

jest.mock("steamcommunity", () =>
  jest.fn().mockImplementation(() => ({
    getConfirmations: jest.fn((_t: number, _k: string, cb: any) => cb(null, [])),
    respondToConfirmation: jest.fn((_i: any, _k: any, _t: any, _key: any, _allow: any, cb: any) => cb(null)),
    setCookies: jest.fn(),
    loggedIn: jest.fn(),
    parentalUnlock: jest.fn(),
  }))
);

const mockLinked = { proxy: null as any };
beforeEach(() => { mockLinked.proxy = null; });

// Контролируем привязку прокси через Manager (по умолчанию — нет прокси).
jest.mock("../../Manager/Manager", () => ({
  __esModule: true,
  default: { GetSteamAccountLinkedData: () => ({ proxy: mockLinked.proxy, proxyState: mockLinked.proxy ? "ok" : "none", proxyId: mockLinked.proxy?.id ?? null }) },
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

describe("SteamAccount без прокси — методы работают напрямую", () => {
  it("getConfirmations доходит до community", async () => {
    const acc = makeAccount();
    const spy = (acc as any).community.getConfirmations;
    await expect(acc.getConfirmations()).resolves.toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("confirmItems доходит до community", async () => {
    const acc = makeAccount();
    const spy = (acc as any).community.respondToConfirmation;
    await expect(acc.confirmItems([1], ["k"])).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("cancelItems доходит до community", async () => {
    const acc = makeAccount();
    const spy = (acc as any).community.respondToConfirmation;
    await expect(acc.cancelItems([1], ["k"])).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("SteamAccount с прокси — методы работают через прокси", () => {
  it("getConfirmations доходит до community", async () => {
    const acc = makeAccount();
    mockLinked.proxy = proxy;
    acc.setProxy();
    const spy = (acc as any).community.getConfirmations;
    await expect(acc.getConfirmations()).resolves.toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("setProxy after explicit unlink пересоздаёт сетевые клиенты (LOW-1)", () => {
  it("после снятия прокси community/session — новые инстансы, операции работают напрямую", async () => {
    const acc = makeAccount();
    mockLinked.proxy = proxy;
    acc.setProxy();
    const communityWithProxy = (acc as any).community;
    const sessionWithProxy = (acc as any).session;

    mockLinked.proxy = null;
    acc.setProxy();

    expect(acc.proxy).toBeNull();
    expect((acc as any).community).not.toBe(communityWithProxy);
    expect((acc as any).session).not.toBe(sessionWithProxy);
    // Новый community-клиент без прокси: операции идут напрямую, а не через старый прокси.
    await expect(acc.getConfirmations()).resolves.toEqual([]);
  });
});
