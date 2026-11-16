// Прокси опционален: доменные методы работают и без прокси (прямое соединение —
// осознанный выбор пользователя), и по-прежнему работают с прокси. Также проверяем
// пересоздание сетевых клиентов в setProxy after explicit unlink (LOW-1).
// steamcommunity замокан спаем, чтобы проверить, что методы доходят до него.

jest.mock("steamcommunity", () =>
  jest.fn().mockImplementation(() => ({
    steamID: { getSteamID64: () => "76561198000000001" },
    httpRequest: jest.fn((_options: any, cb: any) => cb(null, { statusCode: 200 }, { success: true, conf: [] })),
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
    const spy = (acc as any).community.httpRequest;
    await expect(acc.getConfirmations()).resolves.toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("respondConfirmations allow доходит до community", async () => {
    const acc = makeAccount();
    const spy = (acc as any).community.httpRequest;
    await expect(acc.respondConfirmations([{ id: "1", nonce: "fake", type: 2, multi: true }], true)).resolves.toEqual([{ id: "1", ok: true }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("respondConfirmations cancel доходит до community", async () => {
    const acc = makeAccount();
    const spy = (acc as any).community.httpRequest;
    await expect(acc.respondConfirmations([{ id: "1", nonce: "fake", type: 2, multi: true }], false)).resolves.toEqual([{ id: "1", ok: true }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("SteamAccount с прокси — методы работают через прокси", () => {
  it("getConfirmations доходит до community", async () => {
    const acc = makeAccount();
    mockLinked.proxy = proxy;
    acc.setProxy();
    const spy = (acc as any).community.httpRequest;
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
