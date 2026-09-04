// Инвариант приватности: если к аккаунту привязан прокси, ВСЕ его сетевые клиенты
// обязаны быть построены через этот прокси. Прямое соединение допустимо только
// когда прокси не привязан вовсе.

const mockSessions: any[] = [];
const mockCommunities: any[] = [];
const mockRequestDefaults: any[] = [];

jest.mock("steam-session", () => {
  const { EventEmitter } = require("events");
  class FakeLoginSession extends EventEmitter {
    constructor(platformType: number, options?: any) {
      super();
      (this as any).platformType = platformType;
      (this as any).options = options;
      mockSessions.push(this);
    }
  }
  return {
    __esModule: true,
    LoginSession: FakeLoginSession,
    EAuthTokenPlatformType: { MobileApp: 2 },
    EAuthSessionGuardType: { EmailCode: 2 },
  };
});

jest.mock("steamcommunity", () =>
  jest.fn().mockImplementation((opts: any) => {
    const instance = { opts, setCookies: jest.fn(), loggedIn: jest.fn() };
    mockCommunities.push(instance);
    return instance;
  })
);

// Перехватываем request.defaults, чтобы видеть, с каким proxy построен http-клиент.
jest.mock("request", () => {
  const defaults = jest.fn((opts: any) => {
    mockRequestDefaults.push(opts);
    const client: any = jest.fn();
    client.__opts = opts;
    return client;
  });
  const req: any = jest.fn();
  req.defaults = defaults;
  return { __esModule: true, default: req, ...req };
});

// Прокси аккаунта задаём через Manager (как в реальном коде — по ссылке из LinksStorage).
const mockLinked: { proxy: any } = { proxy: null };
jest.mock("../../Manager/Manager", () => ({
  __esModule: true,
  default: { GetSteamAccountLinkedData: () => ({ proxy: mockLinked.proxy }) },
}));

import SteamAccount from "../SteamAccount";

const IDENTITY = Buffer.from("identity-secret-1234").toString("base64");
const PROXY = { id: "p1", host: "10.0.0.1", port: "8888", username: "user", password: "pass" } as any;

function makeAccount() {
  return new SteamAccount({
    id: "acc-proxy",
    number: 3,
    accountName: "bob",
    password: "pw",
    maFile: { shared_secret: "c2hhcmVk", identity_secret: IDENTITY },
    secondary: { nickname: "n", avatarUrl: "" },
    useSteamCookies: false,
  } as any);
}

const lastSession = () => mockSessions[mockSessions.length - 1];
const lastRequestDefaults = () => mockRequestDefaults[mockRequestDefaults.length - 1];

beforeEach(() => {
  mockSessions.length = 0;
  mockCommunities.length = 0;
  mockRequestDefaults.length = 0;
  mockLinked.proxy = null;
});

describe("Привязанный прокси используется всеми клиентами", () => {
  it("при создании аккаунта с прокси ни один клиент не строится напрямую", () => {
    mockLinked.proxy = PROXY;
    const acc = makeAccount();

    expect(acc.proxyUrl()).toBe("http://user:pass@10.0.0.1:8888");
    // steam-session
    expect(lastSession().options.httpProxy).toBe("http://user:pass@10.0.0.1:8888");
    // http-клиент steamcommunity
    expect(lastRequestDefaults().proxy).toBe("http://user:pass@10.0.0.1:8888");
    // Ни одного клиента без прокси за всё время конструирования.
    expect(mockSessions.every((s) => s.options && s.options.httpProxy)).toBe(true);
    expect(mockRequestDefaults.every((o) => o.proxy)).toBe(true);
  });

  it("привязка прокси на лету пересоздаёт и session, и community", () => {
    const acc = makeAccount();
    expect(acc.proxyUrl()).toBeNull();

    acc.setProxy(PROXY);

    expect(lastSession().options.httpProxy).toBe("http://user:pass@10.0.0.1:8888");
    expect(lastRequestDefaults().proxy).toBe("http://user:pass@10.0.0.1:8888");
  });

  it("без прокси клиенты строятся напрямую", () => {
    const acc = makeAccount();
    expect(acc.proxyUrl()).toBeNull();
    expect(lastSession().options).toBeUndefined();
    expect(lastRequestDefaults().proxy).toBeUndefined();
  });

  it("setProxy(undefined) не оставляет состояние \"прокси есть, а трафик прямой\"", () => {
    const acc = makeAccount();
    acc.setProxy(undefined as any);
    expect(acc.proxy).toBeNull();
    expect(acc.proxyUrl()).toBeNull();
  });

  it("спецсимволы в логине/пароле экранируются, а не ломают URL", () => {
    mockLinked.proxy = { ...PROXY, username: "us@er", password: "p:a/ss" };
    const acc = makeAccount();
    expect(acc.proxyUrl()).toBe("http://us%40er:p%3Aa%2Fss@10.0.0.1:8888");
    expect(lastSession().options.httpProxy).toBe("http://us%40er:p%3Aa%2Fss@10.0.0.1:8888");
  });
});
