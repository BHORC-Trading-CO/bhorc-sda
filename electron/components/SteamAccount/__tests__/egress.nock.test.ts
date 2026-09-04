// Tier 2: проверяем на РЕАЛЬНОМ сетевом слое Node, что прокси опционален.
// steamcommunity здесь НЕ замокан, а nock.disableNetConnect() роняет любую
// реальную попытку соединения. Значит:
//  - если метод дошёл до сети (nock перехватил попытку) — guard'а "прокси
//    обязателен" больше нет, прямые соединения разрешены;
//  - если бы guard вернули (регресс), реджект пришёл бы ДО сети с сообщением
//    "не привязан прокси", и проверка ниже провалилась бы.

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

beforeAll(() => {
  nock.disableNetConnect();
});
afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

async function rejectionMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e: any) {
    return (e && e.message) || String(e);
  }
}

describe("Прокси опционален (Tier 2, реальный steamcommunity + nock)", () => {
  it("getConfirmations без прокси доходит до сети (нет privacy-guard'а)", async () => {
    const acc = makeAccount();
    const message = await rejectionMessage(acc.getConfirmations());
    expect(message.length).toBeGreaterThan(0); // отклонилось (nock/нет логина), но
    expect(message).not.toMatch(/не привязан прокси/); // НЕ из-за отсутствия прокси
  });

  it("getSecondary без прокси доходит до сети", async () => {
    const acc = makeAccount();
    const message = await rejectionMessage(acc.getSecondary());
    expect(message).not.toMatch(/не привязан прокси/);
  });

  it("getChangableSecondary без прокси доходит до сети", async () => {
    const acc = makeAccount();
    const message = await rejectionMessage(acc.getChangableSecondary());
    expect(message).not.toMatch(/не привязан прокси/);
  });
});
