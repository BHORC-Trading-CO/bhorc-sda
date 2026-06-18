// Tier 2: доказываем fail-closed на РЕАЛЬНОМ сетевом слое Node.
// steamcommunity здесь НЕ замокан, а nock.disableNetConnect() роняет любую
// реальную попытку соединения. Значит:
//  - если guard сработал, метод реджектит ДО сети -> наше сообщение об ошибке;
//  - если бы guard убрали (регресс), steamcommunity ушёл бы в сеть -> nock бросил
//    бы "Disallowed net connect", и проверка сообщения guard'а провалилась бы.

jest.mock("../../Manager/Manager", () => ({
  __esModule: true,
  default: { GetSteamAccountLinkedData: () => ({ proxy: null }) },
}));

import nock from "nock";
import SteamAccount from "../SteamAccount";

const IDENTITY = Buffer.from("identity-secret-1234").toString("base64");

function makeAccount() {
  return new SteamAccount({
    id: "acc-nock",
    number: 7,
    accountName: "bob",
    password: "pw",
    maFile: { shared_secret: "c2hhcmVk", identity_secret: IDENTITY },
    secondary: { nickname: "n", avatarUrl: "" },
    useSteamCookies: false,
  } as any);
}

const proxy = { host: "127.0.0.1", port: 8888, username: "u", password: "p" } as any;

beforeAll(() => {
  nock.disableNetConnect();
});
afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});
beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("Egress fail-closed (Tier 2, реальный steamcommunity + nock)", () => {
  it("getConfirmations без прокси: реджект guard'а, НИ ОДНОЙ попытки соединения", async () => {
    const acc = makeAccount();
    await expect(acc.getConfirmations()).rejects.toThrow(/не привязан прокси/);
  });

  it("getSecondary без прокси: реджект guard'а, без сети", async () => {
    const acc = makeAccount();
    await expect(acc.getSecondary()).rejects.toThrow(/не привязан прокси/);
  });

  it("getChangableSecondary без прокси: реджект guard'а, без сети", async () => {
    const acc = makeAccount();
    await expect(acc.getChangableSecondary()).rejects.toThrow(/не привязан прокси/);
  });

  // Позитивный контроль: с прокси guard ПРОПУСКАЕТ -> код уходит дальше в
  // steamcommunity (там падает уже по другой причине — нет cookies/логина/сети),
  // но НЕ на privacy-guard'е. Это доказывает, что реджекты выше — именно guard
  // (до сети), а не случайная ошибка, и что guard корректно зависит от прокси.
  it("с прокси guard пропускает -> реджект уже НЕ privacy-guard", async () => {
    const acc = makeAccount();
    acc.setProxy(proxy);
    let message = "";
    try {
      await acc.getConfirmations();
    } catch (e: any) {
      message = (e && e.message) || String(e);
    }
    expect(message.length).toBeGreaterThan(0); // действительно отклонилось
    expect(message).not.toMatch(/не привязан прокси/); // но не из-за отсутствия прокси
  });
});
