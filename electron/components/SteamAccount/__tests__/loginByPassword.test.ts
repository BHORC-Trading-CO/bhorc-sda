// Регресс: обновление сессии (refreshSession -> loginByPassword) должно работать
// повторно и обязано реджектить промис при ошибке, а не висеть вечно.
// Раньше LoginSession переиспользовался, и второй startWithCredentials кидал
// "A session has already been started...", а async-исполнитель new Promise глотал
// исключение — листенер в main не отвечал, и в UI навсегда оставался спиннер.

const mockSessions: any[] = [];
const mockBehavior = { fail: false };

jest.mock("steam-session", () => {
  const { EventEmitter } = require("events");
  class FakeLoginSession extends EventEmitter {
    started = false;
    accessToken = "access-token";
    refreshToken = "refresh-token";
    steamID = { getSteamID64: () => "76561190000000000", toString: () => "76561190000000000" };
    constructor(platformType: number, options?: any) {
      super();
      (this as any).platformType = platformType;
      (this as any).options = options;
      mockSessions.push(this);
    }
    async startWithCredentials() {
      // Тот же guard, что и в настоящем steam-session.
      if (this.started) {
        throw new Error("A session has already been started on this LoginSession object. Create a new LoginSession to start a new session.");
      }
      this.started = true;
      if (mockBehavior.fail) throw new Error("proxy dead");
      setImmediate(() => this.emit("authenticated"));
      return { actionRequired: false };
    }
    async submitSteamGuardCode() { }
    async refreshAccessToken() { }
    async getWebCookies() { return []; }
  }
  return {
    __esModule: true,
    LoginSession: FakeLoginSession,
    EAuthTokenPlatformType: { MobileApp: 2 },
    EAuthSessionGuardType: { EmailCode: 2 },
  };
});

jest.mock("steamcommunity", () =>
  jest.fn().mockImplementation(() => ({
    setCookies: jest.fn(),
    loggedIn: jest.fn(),
    getConfirmations: jest.fn(),
    respondToConfirmation: jest.fn(),
    parentalUnlock: jest.fn(),
  }))
);

// Без сети: cookie для community берём заглушкой.
jest.mock("../Functions/getCommunityWebCookies", () => ({
  __esModule: true,
  default: jest.fn(async () => []),
}));

jest.mock("../../Manager/Manager", () => ({
  __esModule: true,
  default: { GetSteamAccountLinkedData: () => ({ proxy: null, proxyState: "none", proxyId: null }) },
}));

import SteamAccount from "../SteamAccount";

const IDENTITY = Buffer.from("identity-secret-1234").toString("base64");

function makeAccount() {
  const acc = new SteamAccount({
    id: "acc-1",
    number: 1,
    accountName: "bob",
    password: "pw",
    maFile: { shared_secret: "c2hhcmVk", identity_secret: IDENTITY },
    secondary: { nickname: "n", avatarUrl: "" },
    useSteamCookies: false,
  } as any);
  // Сохранение сессии в хранилище к этому тесту не относится.
  jest.spyOn(acc, "saveSession").mockResolvedValue(undefined);
  return acc;
}

beforeEach(() => {
  mockSessions.length = 0;
  mockBehavior.fail = false;
});

describe("loginByPassword", () => {
  it("работает повторно: на каждый логин создаётся новый LoginSession", async () => {
    const acc = makeAccount();
    const sessionsAfterConstruct = mockSessions.length;

    await expect(acc.loginByPassword()).resolves.toBeUndefined();
    await expect(acc.loginByPassword()).resolves.toBeUndefined();

    expect(mockSessions.length).toBe(sessionsAfterConstruct + 2);
    // Каждый объект использован ровно один раз — переиспользования нет.
    expect(mockSessions.filter((s) => s.started).length).toBe(2);
  });

  it("ошибка логина реджектит промис, а не подвешивает его", async () => {
    const acc = makeAccount();
    mockBehavior.fail = true;

    await expect(acc.loginByPassword()).rejects.toThrow("proxy dead");
  });

  it("после неудачной попытки следующий логин проходит", async () => {
    const acc = makeAccount();
    mockBehavior.fail = true;
    await expect(acc.loginByPassword()).rejects.toThrow("proxy dead");

    mockBehavior.fail = false;
    await expect(acc.loginByPassword()).resolves.toBeUndefined();
  });

  it("не накапливает листенеры: на каждой сессии не больше одного на событие", async () => {
    const acc = makeAccount();
    await acc.loginByPassword();
    await acc.loginByPassword();
    await acc.loginByPassword();

    for (const session of mockSessions) {
      for (const event of ["authenticated", "error", "timeout"]) {
        expect(session.listenerCount(event)).toBeLessThanOrEqual(1);
      }
    }
  });
});
