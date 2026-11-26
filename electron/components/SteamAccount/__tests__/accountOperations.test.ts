// SDA-61, SDA-56: смена прокси посреди обновления, очередь входов, повтор неудачного входа,
// вход по паролю. Сети нет: вход и загрузка данных подменены, клиенты Steam настоящие.
jest.mock("../../application/application", () => ({ __esModule: true, default: {
    sendToMain: jest.fn(), images: { invalidateRoute: jest.fn(), pruneOrphans: jest.fn().mockResolvedValue(undefined), removeAccount: jest.fn().mockResolvedValue(undefined) }
} }));
const mockGetAccountData = jest.fn();
const mockGetBalance = jest.fn();
jest.mock("../Processes/loadSteamAccountData", () => ({
    __esModule: true,
    getAccountData: (...args: unknown[]) => mockGetAccountData(...args),
    getChangableSecondaries: (...args: unknown[]) => mockGetBalance(...args),
}));
const mockCookies = jest.fn();
jest.mock("../Functions/getCommunityWebCookies", () => ({ __esModule: true, default: (...args: unknown[]) => mockCookies(...args) }));
const mockFetchConfirmations = jest.fn();
const mockRespond = jest.fn();
jest.mock("../Functions/mobileConfirmations", () => ({ ...jest.requireActual("../Functions/mobileConfirmations"), fetchConfirmations: (...args: unknown[]) => mockFetchConfirmations(...args), respondToConfirmations: (...args: unknown[]) => mockRespond(...args) }));
const mockAskMailCode = jest.fn();
jest.mock("../../application/askInfo/askMailCode", () => ({ __esModule: true, default: (...args: unknown[]) => mockAskMailCode(...args) }));

import { EventEmitter } from "events";
import nock from "nock";
import { EAuthSessionGuardType } from "steam-session";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import LinksStorage from "../../newStorage/LinksStorage";
import proxyManager from "../../Proxy/proxyManager";
import Manager from "../../Manager/Manager";
import SteamAccount, { ACCOUNT_LIMITS, SESSION_TIMING } from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import editListener from "../Listeners/steamAccountEditListener";
import getBalanceListener from "../Listeners/steamAccountGetChangableSecondaryListener";
import startBrowser from "../Listeners/steamAccountStartBrowser";
import getBrowserStatus from "../Listeners/GetBrowserStatus";
import refreshStorageListener from "../Listeners/steamAccountRefreshStorageListener";
import refreshSessionListener from "../Listeners/steamAccountRefreshSessionListener";
import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { SessionExpiredError } from "../Functions/accountErrors";
import { setMainLanguage } from "../../../i18n";

const DAY = 24 * 60 * 60 * 1000;
const jwt = (expMs: number, aud: string[]) =>
    `eyJhbGciOiJFZERTQSJ9.${Buffer.from(JSON.stringify({ sub: "76561190000000000", aud, exp: Math.floor(expMs / 1000) })).toString("base64url")}.c2ln`;
const session = () => ({
    AccessToken: jwt(Date.now() + DAY, ["web", "mobile"]),
    RefreshToken: jwt(Date.now() + 100 * DAY, ["web", "renew", "derive", "mobile"]),
    SteamID: "76561190000000000", SessionID: "",
});
const params = (id: string, extra: Record<string, unknown> = {}) => ({
    id, number: 1, accountName: "fixture", password: "x", deleted: false,
    maFile: { shared_secret: "c2VjcmV0", identity_secret: "c2VjcmV0", Session: session() },
    secondary: { nickname: "old", level: 1, avatarUrl: "", ktState: null, tpState: null, tradeState: null },
    changableSecondary: { steam: { balance: 0, currency: "$", error: null } },
    ...extra,
} as any);
const proxyParams = (id: string, host: string) => ({ id, number: 1, host, port: "8080", username: "u", password: "p", deleted: false } as any);

function add(id: string, proxyId: string | null = null, extra: Record<string, unknown> = {}) {
    SteamAccountStorage.Save(id, params(id, extra));
    const links = LinksStorage.Get();
    LinksStorage.Save({ ...links, steamAccounts: { ...links.steamAccounts, [id]: proxyId } });
    const account = new SteamAccount(params(id, extra));
    steamAccountManager.objects = [...steamAccountManager.objects, account];
    return account;
}
function addProxy(id: string, host: string) {
    const Proxy = jest.requireActual("../../Proxy/Proxy").default;
    proxyManager.objects = [...proxyManager.objects, new Proxy(proxyParams(id, host))];
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
const fresh = { secondary: { nickname: "fresh" }, changableSecondary: { steam: { balance: 5, currency: "$", error: null } } };
const stored = (id: string) => SteamAccountStorage.GetById(id) as any;
const event = () => ({ reply: jest.fn() } as unknown as Electron.IpcMainEvent & { reply: jest.Mock });
const timing = { ...SESSION_TIMING };

beforeAll(() => setMainLanguage("en"));
beforeEach(() => {
    new (require("electron-store"))().clear();
    LinksStorage.Save({ steamAccounts: {}, profiles: {}, groups: {} });
    proxyManager.objects = [];
    steamAccountManager.objects = [];
    for (const mock of [mockGetAccountData, mockGetBalance, mockCookies, mockFetchConfirmations, mockRespond, mockAskMailCode]) mock.mockReset();
});
afterEach(() => {
    jest.restoreAllMocks();
    Object.assign(SESSION_TIMING, timing);
});

describe("смена маршрута посреди обновления (SDA-56, SDA-61)", () => {
    beforeEach(() => { addProxy("p1", "one.test"); addProxy("p2", "two.test"); });

    it("результат старого маршрута не сохраняется и помечен stale", async () => {
        const account = add("a1", "p1");
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        const balance = deferred<any>();
        mockGetBalance.mockReturnValue(balance.promise);
        const e = event();
        const reply = getBalanceListener(e, "a1", 41);
        await flush();
        Manager.LinkProxyToSteamAccount("a1", "p2");
        balance.resolve({ steam: { balance: 99, currency: "$", error: null } });
        await reply;
        expect(e.reply.mock.calls).toEqual([[SteamAccountChannels.STEAM_ACCOUNT_GET_CHANGABLE_SECONDARY_ERROR,
            expect.objectContaining({ id: "a1", stale: true, requestId: 41 })]]);
        expect(stored("a1").changableSecondary.steam.balance).toBe(0);
    });

    it("заменённый клиент больше не шлёт запросов", async () => {
        const account = add("a1", "p1");
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        const old = account.community as any;
        const request = jest.fn();
        old.request = request;
        Manager.LinkProxyToSteamAccount("a1", "p2");
        const err = await new Promise((resolve) => old.httpRequestGet("https://steamcommunity.com/market/", resolve));
        expect(err).toMatchObject({ code: "STALE_OPERATION" });
        expect(request).not.toHaveBeenCalled();
    });

    it("действующий клиент запросы шлёт", () => {
        const account = add("a1", "p1");
        const request = jest.fn();
        (account.community as any).request = request;
        (account.community as any).httpRequestGet("https://steamcommunity.com/market/", () => undefined);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("cookie, полученные старым маршрутом, не попадают в новый клиент", async () => {
        const account = add("a1", "p1");
        const cookies = deferred<string[]>();
        mockCookies.mockReturnValueOnce(cookies.promise).mockResolvedValue(["steamLoginSecure=76561190000000001%7C%7Cnew"]);
        jest.spyOn(account.session, "refreshAccessToken").mockResolvedValue(undefined as never);
        account.startSession().catch(() => undefined);
        await flush();
        expect(mockCookies).toHaveBeenCalledTimes(1);
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        Manager.LinkProxyToSteamAccount("a1", "p2");
        cookies.resolve(["steamLoginSecure=76561190000000000%7C%7Cold"]);
        await flush();
        expect(account.community.steamID).toBeFalsy();
        // Вытесненный вход не показывает ошибку и не портит состояние
        expect(account.sessionErrorText()).toBeNull();
        expect(application.sendToMain).not.toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, expect.anything());
    });

    it("редирект прежним маршрутом не открывается", async () => {
        nock.disableNetConnect();
        const account = add("a1");
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        nock("https://steamcommunity.com").get("/market/").reply(() => {
            Manager.LinkProxyToSteamAccount("a1", "p1");
            return [302, "", { location: "https://steamcommunity.com/second" }];
        });
        const second = nock("https://steamcommunity.com").get("/second").reply(200, "x");
        const { community } = account;
        await new Promise((resolve) => (community as any).httpRequestGet({ uri: "https://steamcommunity.com/market/", checkHttpError: false }, resolve));
        expect(second.isDone()).toBe(false);

        // Контроль: без смены маршрута редирект выполняется
        nock.cleanAll();
        const direct = add("a2");
        nock("https://steamcommunity.com").get("/market/").reply(302, "", { location: "https://steamcommunity.com/second" });
        const followed = nock("https://steamcommunity.com").get("/second").reply(200, "x");
        await new Promise((resolve) => (direct.community as any).httpRequestGet("https://steamcommunity.com/market/", resolve));
        expect(followed.isDone()).toBe(true);
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it("подтверждение, ждавшее в очереди, не уходит после архива и восстановления", async () => {
        const account = add("a1");
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        let check!: () => void;
        mockRespond.mockImplementation((_c: unknown, _s: unknown, _r: unknown, _a: unknown, beforeEach: () => void) => {
            check = beforeEach;
            return Promise.resolve([]);
        });
        await account.respondConfirmations([{ id: "1", nonce: "n", type: 2, multi: true }], true);
        expect(() => check()).not.toThrow();
        account.editParams({ deleted: true });
        account.editParams({ deleted: false });
        expect(() => check()).toThrow();
    });

    it("архивирование во время загрузки: результат не сохраняется", async () => {
        const account = add("a1");
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        const data = deferred<any>();
        mockGetAccountData.mockReturnValue(data.promise);
        const refreshed = account.getSecondary();
        await flush();
        account.editParams({ deleted: true });
        data.resolve(fresh);
        await expect(refreshed).rejects.toMatchObject({ code: "STALE_OPERATION" });
        expect(stored("a1").secondary.nickname).toBe("old");
    });

    it("восстановление с другим прокси входит уже новым маршрутом", async () => {
        const account = add("a1", "p1", { deleted: true });
        const routes: (string | null)[] = [];
        jest.spyOn(account, "initSession").mockImplementation(async () => { routes.push(account.proxyUrl()); });
        await editListener(event(), { id: "a1", steamAccountParams: { deleted: false }, links: { proxyId: "p2", profileId: null } });
        await flush();
        expect(routes.length).toBeGreaterThan(0);
        expect(routes.every((route) => route!.includes("two.test"))).toBe(true);
    });
});

describe("запоздалый вход ничего не меняет", () => {
    it("вход, закончившийся по сроку, не ставит cookie потом", async () => {
        SESSION_TIMING.loginMs = 20;
        const account = add("a1");
        const cookies = deferred<string[]>();
        mockCookies.mockReturnValue(cookies.promise);
        jest.spyOn(account.session, "refreshAccessToken").mockResolvedValue(undefined as never);
        await expect(account.startSession()).rejects.toThrow("did not finish in time");
        cookies.resolve(["steamLoginSecure=76561190000000000%7C%7Clate"]);
        await flush();
        expect(account.community.steamID).toBeFalsy();
        expect(account.sessionErrorText()).toContain("did not finish in time");
    });

    it("то же для запасного обмена cookie", async () => {
        SESSION_TIMING.loginMs = 20;
        const account = add("a1");
        const cookies = deferred<string[]>();
        mockCookies.mockRejectedValue(new Error("primary failed"));
        jest.spyOn(account.session, "refreshAccessToken").mockResolvedValue(undefined as never);
        jest.spyOn(account.session, "getWebCookies").mockReturnValue(cookies.promise as never);
        await expect(account.startSession()).rejects.toThrow("did not finish in time");
        cookies.resolve(["steamLoginSecure=76561190000000000%7C%7Clate"]);
        await flush();
        expect(account.community.steamID).toBeFalsy();
    });

    it("второй startSession присоединяется к идущему", async () => {
        const account = add("a1");
        const gate = deferred();
        const init = jest.spyOn(account, "initSession").mockReturnValue(gate.promise);
        const first = account.startSession();
        expect(account.startSession()).toBe(first);
        gate.resolve();
        await first;
        expect(init).toHaveBeenCalledTimes(1);
    });

    it("архив отменяет идущий вход: cookie не ставятся, ошибки нет", async () => {
        const account = add("a1");
        const cookies = deferred<string[]>();
        mockCookies.mockReturnValue(cookies.promise);
        jest.spyOn(account.session, "refreshAccessToken").mockResolvedValue(undefined as never);
        const started = account.startSession();
        started.catch(() => undefined);
        await flush();
        account.editParams({ deleted: true });
        await expect(started).rejects.toMatchObject({ code: "STALE_OPERATION" });
        cookies.resolve(["steamLoginSecure=76561190000000000%7C%7Clate"]);
        await flush();
        expect(account.community.steamID).toBeFalsy();
        expect(account.sessionErrorText()).toBeNull();
    });

    it("браузер: запасной обмен cookie не идёт прежним маршрутом после смены прокси", async () => {
        addProxy("p1", "one.test");
        const account = add("a1");
        mockCookies.mockRejectedValue(new Error("primary failed"));
        const renewed = deferred<void>();
        const { session } = account;
        jest.spyOn(session, "refreshAccessToken").mockReturnValue(renewed.promise as never);
        const web = jest.spyOn(session, "getWebCookies").mockResolvedValue(["steamLoginSecure=x"]);
        const cookies = account.getBrowserCookies();
        await flush();
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        Manager.LinkProxyToSteamAccount("a1", "p1");
        renewed.resolve();
        await expect(cookies).rejects.toMatchObject({ code: "STALE_OPERATION" });
        expect(web).not.toHaveBeenCalled();
    });

    it("сам клиент входа прежнего маршрута запросов больше не шлёт", async () => {
        addProxy("p1", "one.test");
        const account = add("a1");
        const old = account.session as any;
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        Manager.LinkProxyToSteamAccount("a1", "p1");
        await expect(old._webClient.request({ method: "GET", url: "https://api.steampowered.com/" })).rejects.toMatchObject({ code: "STALE_OPERATION" });
    });
});

describe("порядок записи", () => {
    const account1 = () => {
        const account = add("a1");
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        return account;
    };
    const full = (nickname: string, balance: number) => ({ secondary: { nickname }, changableSecondary: { steam: { balance, currency: "$", error: null } } });

    it("старое полное обновление не пишется поверх нового", async () => {
        const account = account1();
        const old = deferred<any>();
        mockGetAccountData.mockReturnValueOnce(old.promise).mockResolvedValue(full("new", 7));
        const first = account.getSecondary();
        await flush();
        await account.startSession();
        await account.getSecondary();
        old.resolve(full("old", 1));
        await expect(first).rejects.toMatchObject({ code: "STALE_OPERATION" });
        expect(stored("a1").secondary.nickname).toBe("new");
        expect(stored("a1").changableSecondary.steam.balance).toBe(7);
    });

    it("старое полное обновление отдаёт окну более поздний записанный баланс", async () => {
        const account = account1();
        const old = deferred<any>();
        mockGetBalance.mockResolvedValue({ steam: { balance: 12, currency: "$", error: null } });
        mockGetAccountData.mockReturnValue(old.promise);
        const first = account.getSecondary();
        await flush();
        await account.startSession();
        await account.getChangableSecondary();
        old.resolve(full("old", 5));
        await expect(first).resolves.toMatchObject({ changableSecondary: { steam: { balance: 12 } } });
        expect(stored("a1").changableSecondary.steam.balance).toBe(12);
    });

    it("запись, исчезнувшая из хранилища, при перечитывании отменяет своё начатое", async () => {
        const account = account1();
        const old = deferred<any>();
        mockGetAccountData.mockReturnValue(old.promise);
        const refreshed = account.getSecondary();
        await flush();
        SteamAccountStorage.Delete("a1");
        jest.spyOn(account.chrome, "stop").mockResolvedValue(undefined as never);
        await steamAccountManager.load();
        old.resolve(full("old", 1));
        await expect(refreshed).rejects.toMatchObject({ code: "STALE_OPERATION" });
    });

    it("старый баланс не пишется поверх нового полного обновления", async () => {
        const account = account1();
        const old = deferred<any>();
        mockGetBalance.mockReturnValue(old.promise);
        mockGetAccountData.mockResolvedValue(full("new", 7));
        const balance = account.getChangableSecondary();
        await flush();
        await account.getSecondary();
        old.resolve({ steam: { balance: 1, currency: "$", error: null } });
        await expect(balance).rejects.toMatchObject({ code: "STALE_OPERATION" });
        expect(stored("a1").changableSecondary.steam.balance).toBe(7);
    });

    it("баланс, запрошенный во время полного обновления, берётся из него", async () => {
        const account = account1();
        const data = deferred<any>();
        mockGetAccountData.mockReturnValue(data.promise);
        const refreshed = account.getSecondary();
        const balance = account.getChangableSecondary();
        await flush();
        data.resolve(full("new", 7));
        await expect(balance).resolves.toMatchObject({ steam: { balance: 7 } });
        await refreshed;
        expect(mockGetBalance).not.toHaveBeenCalled();
    });

    it("загрузка, начатая до архива, не пишется после восстановления", async () => {
        const account = account1();
        const old = deferred<any>();
        mockGetAccountData.mockReturnValue(old.promise);
        const refreshed = account.getSecondary();
        await flush();
        account.editParams({ deleted: true });
        account.editParams({ deleted: false });
        old.resolve(full("old", 1));
        await expect(refreshed).rejects.toMatchObject({ code: "STALE_OPERATION" });
        expect(stored("a1").secondary.nickname).toBe("old");
        expect(stored("a1").changableSecondary.steam.balance).toBe(0);
    });

    it("удаление навсегда отменяет начатое", async () => {
        const account = account1();
        const old = deferred<any>();
        mockGetAccountData.mockReturnValue(old.promise);
        const refreshed = account.getSecondary();
        await flush();
        await steamAccountManager.delete("a1");
        old.resolve(full("old", 1));
        await expect(refreshed).rejects.toMatchObject({ code: "STALE_OPERATION" });
    });
});

describe("одинаковые запросы", () => {
    it("запрос, который сам повторил вход, остаётся общим для следующих", async () => {
        SESSION_TIMING.retryFloorMs = 0;
        const account = add("a1");
        const gate = deferred();
        jest.spyOn(account, "initSession").mockRejectedValueOnce(new Error("proxy down")).mockReturnValue(gate.promise);
        await account.startSession().catch(() => undefined);
        mockGetAccountData.mockResolvedValue(fresh);
        const first = account.getSecondary();
        await flush();
        gate.resolve();
        await flush();
        const data = deferred<any>();
        mockGetAccountData.mockReturnValue(data.promise);
        const second = account.getSecondary();
        const third = account.getSecondary();
        await flush();
        data.resolve(fresh);
        await Promise.all([first, second, third]);
        expect(mockGetAccountData.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it("второй запрос, пока первый в пути, не идёт в Steam", async () => {
        const account = add("a1");
        const data = deferred<any>();
        mockGetAccountData.mockReturnValue(data.promise);
        const both = Promise.all([account.getSecondary(), account.getSecondary()]);
        await flush();
        data.resolve(fresh);
        await expect(both).resolves.toEqual([fresh, fresh]);
        expect(mockGetAccountData).toHaveBeenCalledTimes(1);
        mockGetAccountData.mockResolvedValue(fresh);
        await account.getSecondary();
        expect(mockGetAccountData).toHaveBeenCalledTimes(2);
    });

    it("после нового входа запрос свой, а не присоединяется к старому", async () => {
        const account = add("a1");
        const old = deferred<any>();
        mockGetAccountData.mockReturnValueOnce(old.promise).mockResolvedValue(fresh);
        const first = account.getSecondary();
        await flush();
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        await account.startSession();
        await expect(account.getSecondary()).resolves.toBe(fresh);
        old.reject(new Error("Not Logged In"));
        await expect(first).rejects.toThrow("Not Logged In");
    });
});

describe("очередь входов и загрузок", () => {
    it("загрузка списка входит не больше чем в ACCOUNT_LIMITS.logins аккаунтов разом, но во все", async () => {
        const total = ACCOUNT_LIMITS.logins * 2 + 1;
        for (let i = 0; i < total; i++) SteamAccountStorage.Save(`a${i}`, params(`a${i}`));
        const gates: ReturnType<typeof deferred>[] = [];
        let running = 0, peak = 0;
        const init = jest.spyOn(SteamAccount.prototype, "initSession").mockImplementation(async () => {
            peak = Math.max(peak, ++running);
            const gate = deferred();
            gates.push(gate);
            await gate.promise;
            running--;
        });
        await steamAccountManager.load();
        await flush();
        expect(init).toHaveBeenCalledTimes(ACCOUNT_LIMITS.logins);
        for (let i = 0; i < total; i++) { gates[i].resolve(); await flush(); }
        expect(init).toHaveBeenCalledTimes(total);
        expect(peak).toBe(ACCOUNT_LIMITS.logins);
    });

    it("балансы идут не больше чем по ACCOUNT_LIMITS.dataLoads", async () => {
        const gates: ReturnType<typeof deferred<any>>[] = [];
        mockGetBalance.mockImplementation(() => { const gate = deferred<any>(); gates.push(gate); return gate.promise; });
        const accounts = Array.from({ length: ACCOUNT_LIMITS.dataLoads + 2 }, (_, i) => add(`b${i}`));
        const loads = accounts.map((account) => account.getChangableSecondary());
        await flush();
        expect(mockGetBalance).toHaveBeenCalledTimes(ACCOUNT_LIMITS.dataLoads);
        for (let i = 0; i < accounts.length; i++) { gates[i].resolve({ steam: { balance: i, currency: "$", error: null } }); await flush(); }
        await Promise.all(loads);
    });

    it("открытый человеком аккаунт входит раньше очереди", async () => {
        const gates: ReturnType<typeof deferred>[] = [];
        const order: string[] = [];
        jest.spyOn(SteamAccount.prototype, "initSession").mockImplementation(function (this: SteamAccount) {
            order.push(this.params.id);
            const gate = deferred();
            gates.push(gate);
            return gate.promise;
        });
        const accounts = Array.from({ length: ACCOUNT_LIMITS.logins + 2 }, (_, i) => add(`c${i}`));
        for (const account of accounts) account.startSessionInBackground();
        const last = accounts[accounts.length - 1];
        mockFetchConfirmations.mockResolvedValue([]);
        const opened = last.getConfirmations();
        await flush();
        expect(order).not.toContain(last.params.id);
        gates[0].resolve();
        await flush();
        expect(order[order.length - 1]).toBe(last.params.id);
        for (let i = 0; i < accounts.length; i++) { gates[i]?.resolve(); await flush(); }
        await expect(opened).resolves.toEqual([]);
        expect(order.filter((id) => id === last.params.id)).toHaveLength(1);
    });
});

describe("неудачный вход", () => {
    it("повторяется при обновлении, когда прошла пауза, и чинит аккаунт", async () => {
        SESSION_TIMING.retryFloorMs = 0;
        const account = add("a1");
        const init = jest.spyOn(account, "initSession").mockRejectedValueOnce(new Error("proxy down")).mockResolvedValue(undefined);
        await account.startSession().catch(() => undefined);
        expect(account.sessionErrorText()).toBe("proxy down");
        mockGetAccountData.mockResolvedValue(fresh);
        await expect(account.getSecondary()).resolves.toBe(fresh);
        expect(init).toHaveBeenCalledTimes(2);
        expect(account.sessionErrorText()).toBeNull();
        expect(application.sendToMain).toHaveBeenLastCalledWith(SteamAccountChannels.STEAM_ACCOUNT_SESSION_STATE, { id: "a1", sessionError: null });
    });

    it("сразу же не повторяется", async () => {
        const account = add("a1");
        const init = jest.spyOn(account, "initSession").mockRejectedValue(new Error("proxy down"));
        await account.startSession().catch(() => undefined);
        await expect(account.getSecondary()).rejects.toThrow("proxy down");
        expect(init).toHaveBeenCalledTimes(1);
    });

    it("мёртвый токен не повторяется: поможет только вход по паролю", async () => {
        SESSION_TIMING.retryFloorMs = 0;
        const account = add("a1");
        const init = jest.spyOn(account, "initSession").mockRejectedValue(new SessionExpiredError());
        await account.startSession().catch(() => undefined);
        await expect(account.getSecondary()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
        expect(init).toHaveBeenCalledTimes(1);
        expect(mockGetAccountData).not.toHaveBeenCalled();
    });

    it("зависший вход завершается по сроку", async () => {
        SESSION_TIMING.loginMs = 20;
        const account = add("a1");
        jest.spyOn(account, "initSession").mockReturnValue(new Promise(() => undefined));
        await expect(account.startSession()).rejects.toThrow("did not finish in time");
    });

    it("список аккаунтов несёт текст ошибки входа", async () => {
        const account = add("a1");
        jest.spyOn(account, "initSession").mockRejectedValue(new Error("proxy down"));
        await account.startSession().catch(() => undefined);
        expect(steamAccountManager.getCompiledObjects()[0].sessionError).toBe("proxy down");
    });

    it("без refresh-токена входить нечем: это ошибка, а не молчаливый успех", async () => {
        const account = add("a1", null, { maFile: { shared_secret: "c2VjcmV0", Session: { SteamID: "1" } } });
        await expect(account.startSession()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
        expect(account.sessionErrorText()).toContain("no saved session");
    });

    it("хватает одного refresh-токена", async () => {
        const account = add("a1", null, { maFile: { shared_secret: "c2VjcmV0", Session: { ...session(), AccessToken: undefined } } });
        const renew = jest.spyOn(account.session, "refreshAccessToken").mockResolvedValue(undefined as never);
        mockCookies.mockResolvedValue(["steamLoginSecure=76561190000000000%7C%7Ct"]);
        await account.startSession();
        expect(renew).toHaveBeenCalledTimes(1);
        expect(account.community.steamID).toBeTruthy();
    });

    it("окно подтверждений не ждёт входа вечно и не читает новым маршрутом без входа", async () => {
        SESSION_TIMING.confirmationsWaitMs = 20;
        const account = add("a1");
        jest.spyOn(account, "initSession").mockReturnValue(new Promise(() => undefined));
        account.startSession().catch(() => undefined);
        await expect(account.getConfirmations()).rejects.toMatchObject({ code: "LOGIN_TIMED_OUT" });
        expect(mockFetchConfirmations).not.toHaveBeenCalled();

        addProxy("p1", "one.test");
        SESSION_TIMING.confirmationsWaitMs = 5000;
        const opened = account.getConfirmations();
        opened.catch(() => undefined);
        await flush();
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        Manager.LinkProxyToSteamAccount("a1", "p1");
        await expect(opened).rejects.toMatchObject({ code: "CONFIRMATION_ROUTE_CHANGED" });
        expect(mockFetchConfirmations).not.toHaveBeenCalled();
    });

    it("окно подтверждений показывает причину: сессия закончилась", async () => {
        const { confirmationErrorMessage } = jest.requireActual("../Functions/mobileConfirmations");
        const account = add("a1");
        jest.spyOn(account, "initSession").mockRejectedValue(new SessionExpiredError());
        await account.startSession().catch(() => undefined);
        const err = await account.getConfirmations().catch((e) => e);
        expect(confirmationErrorMessage(err)).toContain("session has expired");
    });

    it("окно подтверждений ждёт входа; только что добавленный аккаунт входит сам", async () => {
        const gate = deferred();
        const init = jest.spyOn(SteamAccount.prototype, "initSession").mockReturnValue(gate.promise);
        SteamAccountStorage.Save("n1", params("n1"));
        const account = new SteamAccount(params("n1"));
        steamAccountManager.addNew(account);
        expect(init).toHaveBeenCalledTimes(1);
        mockFetchConfirmations.mockResolvedValue([]);
        const opened = account.getConfirmations();
        await flush();
        expect(mockFetchConfirmations).not.toHaveBeenCalled();
        gate.resolve();
        await expect(opened).resolves.toEqual([]);
    });
});

describe("вход по паролю", () => {
    class FakeSession extends EventEmitter {
        accessToken = "access"; refreshToken = "refresh";
        steamID = { getSteamID64: () => "76561190000000000", toString: () => "76561190000000000" };
        startWithCredentials = jest.fn().mockResolvedValue({ actionRequired: false });
        submitSteamGuardCode = jest.fn().mockResolvedValue(undefined);
        cancelLoginAttempt = jest.fn();
    }
    function withSession(account: SteamAccount) {
        const fake = new FakeSession();
        jest.spyOn(account as any, "buildSession").mockReturnValue(fake);
        return fake;
    }

    it("два нажатия — один вход", async () => {
        const account = add("a1");
        const fake = withSession(account);
        mockCookies.mockResolvedValue(["steamLoginSecure=76561190000000000%7C%7Ct"]);
        const both = Promise.all([account.loginByPassword(), account.loginByPassword()]);
        await flush();
        fake.emit("authenticated");
        await both;
        expect(fake.startWithCredentials).toHaveBeenCalledTimes(1);
        expect(stored("a1").maFile.Session.RefreshToken).toBe("refresh");
    });

    it("не удалось сохранить новую сессию — это ошибка, а не успех", async () => {
        const account = add("a1");
        const fake = withSession(account);
        mockCookies.mockResolvedValue(["steamLoginSecure=76561190000000000%7C%7Ct"]);
        jest.spyOn(SteamAccountStorage, "EditData").mockImplementation(() => { throw new Error("ENOSPC"); });
        const e = event();
        const done = refreshSessionListener(e, "a1");
        await flush();
        fake.emit("authenticated");
        await done;
        expect(e.reply.mock.calls).toEqual([[SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, { id: "a1", err: expect.stringContaining("ENOSPC"), stale: false }]]);
    });

    it("Steam не принял код из maFile — понятная ошибка, а не вечное ожидание", async () => {
        const account = add("a1");
        withSession(account).startWithCredentials.mockResolvedValue({ actionRequired: true, validActions: [{ type: EAuthSessionGuardType.DeviceCode }] });
        await expect(account.loginByPassword()).rejects.toThrow("rejected the Guard code");
        expect(mockAskMailCode).not.toHaveBeenCalled();
    });

    it("смена прокси завершает идущий вход, следующий начинается заново", async () => {
        addProxy("p1", "one.test");
        const account = add("a1");
        const fake = withSession(account);
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        const e = event();
        const done = refreshSessionListener(e, "a1");
        await flush();
        Manager.LinkProxyToSteamAccount("a1", "p1");
        await done;
        expect(e.reply.mock.calls).toEqual([[SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, expect.objectContaining({ id: "a1", stale: true })]]);
        mockCookies.mockResolvedValue(["steamLoginSecure=76561190000000000%7C%7Ct"]);
        const again = account.loginByPassword();
        await flush();
        fake.emit("authenticated");
        await again;
        expect(fake.startWithCredentials).toHaveBeenCalledTimes(2);
    });

    it("«Перезагрузить все» во время входа по паролю ждёт его, а не заменяет", async () => {
        const account = add("a1");
        const fake = withSession(account);
        const init = jest.spyOn(account, "initSession").mockRejectedValue(new SessionExpiredError());
        await account.startSession().catch(() => undefined);
        mockCookies.mockResolvedValue(["steamLoginSecure=76561190000000000%7C%7Ct"]);
        const login = account.loginByPassword();
        await flush();
        account.startSessionInBackground();
        await flush();
        fake.emit("authenticated");
        await login;
        expect(init).toHaveBeenCalledTimes(1);
        expect(account.sessionErrorText()).toBeNull();
    });

    it("код из письма, введённый после отмены входа, в Steam не уходит", async () => {
        addProxy("p1", "one.test");
        const account = add("a1");
        const fake = withSession(account);
        fake.startWithCredentials.mockResolvedValue({ actionRequired: true, validActions: [{ type: EAuthSessionGuardType.EmailCode }] });
        const code = deferred<string>();
        mockAskMailCode.mockReturnValue(code.promise);
        const login = account.loginByPassword();
        login.catch(() => undefined);
        await flush();
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        Manager.LinkProxyToSteamAccount("a1", "p1");
        code.resolve("ABCDE");
        await expect(login).rejects.toMatchObject({ code: "STALE_OPERATION" });
        await flush();
        expect(fake.submitSteamGuardCode).not.toHaveBeenCalled();
    });

    it("неотвеченный код из письма не держит вечно ни место входа, ни чтение данных", async () => {
        SESSION_TIMING.waitForLoginMs = 20;
        SESSION_TIMING.passwordLoginMs = 300;
        const account = add("a1");
        const fake = withSession(account);
        fake.startWithCredentials.mockResolvedValue({ actionRequired: true, validActions: [{ type: EAuthSessionGuardType.EmailCode }] });
        mockAskMailCode.mockReturnValue(new Promise(() => undefined));
        const login = account.loginByPassword();
        let loginEnded = false;
        login.catch(() => { loginEnded = true; });
        await expect(account.getChangableSecondary()).rejects.toMatchObject({ code: "LOGIN_TIMED_OUT" });
        expect(loginEnded).toBe(false);
        await expect(login).rejects.toMatchObject({ code: "LOGIN_TIMED_OUT" });
    });

    it("массовый вход по паролю идёт не больше чем по ACCOUNT_LIMITS.passwordLogins, зависший место не держит", async () => {
        addProxy("p1", "one.test");
        const accounts = Array.from({ length: ACCOUNT_LIMITS.passwordLogins + 2 }, (_, i) => add(`p${i}`));
        const fakes = accounts.map(withSession);
        mockCookies.mockResolvedValue(["steamLoginSecure=76561190000000000%7C%7Ct"]);
        const logins = accounts.map((account) => account.loginByPassword().catch((err) => err));
        await flush();
        expect(fakes.filter((fake) => fake.startWithCredentials.mock.calls.length)).toHaveLength(ACCOUNT_LIMITS.passwordLogins);
        // Смена маршрута отменяет один из идущих: его место занимает следующий
        jest.spyOn(accounts[0], "initSession").mockResolvedValue(undefined);
        Manager.LinkProxyToSteamAccount("p0", "p1");
        await flush();
        expect(fakes[ACCOUNT_LIMITS.passwordLogins].startWithCredentials).toHaveBeenCalledTimes(1);
        for (const fake of fakes.slice(1)) { fake.emit("authenticated"); await flush(); fake.emit("authenticated"); }
        fakes[fakes.length - 1].emit("authenticated");
        await flush();
        await Promise.all(logins);
    });

    it("успешный вход не ждёт прежний зависший: данные идут сразу", async () => {
        const account = add("a1");
        jest.spyOn(account, "initSession").mockReturnValue(new Promise(() => undefined));
        account.startSession().catch(() => undefined);
        const fake = withSession(account);
        mockCookies.mockResolvedValue(["steamLoginSecure=76561190000000000%7C%7Ct"]);
        const login = account.loginByPassword();
        await flush();
        fake.emit("authenticated");
        await login;
        mockGetAccountData.mockResolvedValue(fresh);
        await expect(account.getSecondary()).resolves.toBe(fresh);
    });
});

describe("перечитывание по кнопке", () => {
    it("отметка с номером уходит прямо перед новым списком; ошибка — с тем же номером", async () => {
        add("a1");
        jest.spyOn(SteamAccount.prototype, "initSession").mockResolvedValue(undefined);
        const e = event();
        await refreshStorageListener(e, 7);
        const sent = (application.sendToMain as jest.Mock).mock.calls.map(([channel, data]) => [channel, data?.requestId]);
        const mark = sent.findIndex(([channel]) => channel === SteamAccountChannels.STEAM_ACCOUNT_REFRESH_STORAGE);
        expect(sent[mark]).toEqual([SteamAccountChannels.STEAM_ACCOUNT_REFRESH_STORAGE, 7]);
        expect(sent[mark + 1][0]).toBe(SteamAccountChannels.STEAM_ACCOUNT_GET);
        jest.spyOn(SteamAccountStorage, "GetAll").mockImplementation(() => { throw new Error("EACCES"); });
        await refreshStorageListener(e, 8);
        expect(e.reply.mock.calls).toEqual([[SteamAccountChannels.STEAM_ACCOUNT_REFRESH_STORAGE, { requestId: 8, err: expect.stringContaining("EACCES") }]]);
    });
});

describe("стыки правок", () => {
    it("замена maFile посреди входа: cookie и токены прежнего аккаунта в новые данные не попадают", async () => {
        const account = add("a1");
        const cookies = deferred<string[]>();
        mockCookies.mockReturnValueOnce(cookies.promise).mockReturnValue(new Promise(() => undefined));
        jest.spyOn(account.session, "refreshAccessToken").mockResolvedValue(undefined as never);
        const before = account.community;
        (account.chrome as any).workStatus = "working";
        (account.chrome as any).browser = {};
        const stopBrowser = jest.spyOn(account.chrome, "stop").mockResolvedValue(undefined as never);
        account.startSessionInBackground();
        await flush();
        const other = { shared_secret: "b3RoZXJzZWNyZXRvdGhlcnNlY3I=", identity_secret: "x", Session: { ...session(), SteamID: "76561190000000099" } };
        await editListener(event(), { id: "a1", steamAccountParams: { accountName: "other", maFile: other as any } });
        expect(account.community).not.toBe(before);
        expect(stopBrowser).toHaveBeenCalledWith("routeChanged");
        cookies.resolve(["steamLoginSecure=76561190000000000%7C%7Cold"]);
        await flush();
        expect(account.community.steamID).toBeFalsy();
    });

    it("вход по паролю, начатый до замены maFile, не пишет токены в новый", async () => {
        const account = add("a1");
        const fake: any = Object.assign(new EventEmitter(), {
            accessToken: "access", refreshToken: "refresh", cancelLoginAttempt: jest.fn(),
            steamID: { getSteamID64: () => "76561190000000000", toString: () => "76561190000000000" },
            startWithCredentials: jest.fn().mockResolvedValue({ actionRequired: false }),
        });
        jest.spyOn(account as any, "buildSession").mockReturnValue(fake);
        mockCookies.mockResolvedValue(["steamLoginSecure=76561190000000000%7C%7Ct"]);
        const login = account.loginByPassword();
        login.catch(() => undefined);
        await flush();
        jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        await editListener(event(), { id: "a1", steamAccountParams: { maFile: { shared_secret: "bmV3", Session: { SteamID: "76561190000000099" } } as any } });
        fake.emit("authenticated");
        await expect(login).rejects.toMatchObject({ code: "STALE_OPERATION" });
        await flush();
        expect(stored("a1").maFile.Session).toEqual({ SteamID: "76561190000000099" });
    });

    it("правка без смены логина и maFile вход не сбрасывает", async () => {
        const account = add("a1");
        const { community } = account;
        await editListener(event(), { id: "a1", steamAccountParams: { profileName: "x", accountName: "fixture", maFile: { ...account.params.maFile } } });
        expect(account.community).toBe(community);
    });

    it("восстановление во время удаления отклоняется", async () => {
        const account = add("a1", null, { deleted: true });
        account.chrome.launchesBlocked = true;
        const e = event();
        await editListener(e, { id: "a1", steamAccountParams: { deleted: false } });
        expect(e.reply).toHaveBeenCalledWith("ERROR", expect.stringContaining("being deleted"));
        expect(stored("a1").deleted).toBe(true);
    });

    it("восстановление с другим maFile входит один раз", async () => {
        const account = add("a1", null, { deleted: true });
        const init = jest.spyOn(account, "initSession").mockResolvedValue(undefined);
        await editListener(event(), { id: "a1", steamAccountParams: { deleted: false, maFile: { shared_secret: "bmV3", Session: session() } as any } });
        await flush();
        expect(init).toHaveBeenCalledTimes(1);
    });

    it("список перечитали, пока удаление ждало браузер: запись нового объекта не стирается", async () => {
        const account = add("a1");
        const closed = deferred<void>();
        jest.spyOn(account.chrome, "shutdown").mockReturnValue(closed.promise);
        const deletion = steamAccountManager.delete("a1");
        deletion.catch(() => undefined);
        await flush();
        steamAccountManager.objects = [new SteamAccount(params("a1"))];
        closed.resolve();
        await expect(deletion).rejects.toThrow("reloaded");
        expect(stored("a1")).toBeTruthy();
    });

    it("аккаунт исчез при перечитывании, пока готовился браузер: браузер не запускается", async () => {
        const account = add("a1");
        account.params.useSteamCookies = true;
        const cookies = deferred<string[]>();
        jest.spyOn(account, "getBrowserCookies").mockReturnValue(cookies.promise);
        const start = jest.spyOn(account.chrome, "start").mockResolvedValue(undefined);
        const preparing = startBrowser(event() as any, "a1");
        await flush();
        SteamAccountStorage.Delete("a1");
        await steamAccountManager.load();
        cookies.resolve(["steamLoginSecure=x"]);
        await preparing;
        expect(start).not.toHaveBeenCalled();
        expect(account.chrome.launchesBlocked).toBe(true);
    });

    it("браузер готовится: список не возвращает кнопку, второе нажатие ничего не начинает", async () => {
        const account = add("a1");
        account.params.useSteamCookies = true;
        const cookies = deferred<string[]>();
        const get = jest.spyOn(account, "getBrowserCookies").mockReturnValue(cookies.promise);
        jest.spyOn(account.chrome, "start").mockResolvedValue(undefined);
        const preparing = startBrowser(event() as any, "a1");
        await flush();
        const status = event();
        await getBrowserStatus(status, "a1");
        expect(status.reply.mock.calls[0][1]).toEqual({ id: "a1", status: "load" });
        await startBrowser(event() as any, "a1");
        expect(get).toHaveBeenCalledTimes(1);
        cookies.resolve([]);
        await preparing;
        expect(account.browserPreparing).toBe(false);
    });

    it("без секрета Guard вход по паролю всё равно пробуется", async () => {
        const account = add("a1", null, { maFile: { Session: session() } });
        const fake: any = Object.assign(new EventEmitter(), { startWithCredentials: jest.fn().mockResolvedValue({ actionRequired: false }), cancelLoginAttempt: jest.fn() });
        jest.spyOn(account as any, "buildSession").mockReturnValue(fake);
        account.loginByPassword().catch(() => undefined);
        await flush();
        expect(fake.startWithCredentials).toHaveBeenCalledWith(expect.objectContaining({ steamGuardCode: undefined }));
    });

    it("PIN семейного просмотра сохраняется с нулём в начале, и ожидание завершается", async () => {
        const account = add("a1");
        (account.community as any).parentalUnlock = (_pin: string, cb: (err: Error | null) => void) => cb(null);
        await account.setPin("0123");
        expect(stored("a1").familyViewPin).toBe("0123");
    });
});

describe("старые записи прокси", () => {
    it("правка, добавившая логин старой записи без него, меняет и живой маршрут", () => {
        const Proxy = jest.requireActual("../../Proxy/Proxy").default;
        const ProxyStorage = require("../../newStorage/ProxyStorage").default;
        const params: any = { id: "old", number: 1, host: "one.test", port: "80", deleted: false };
        ProxyStorage.Save("old", params);
        const proxy = new Proxy(params);
        proxy.editParams({ username: "u", password: "p" });
        expect(proxy.params).toMatchObject({ username: "u", password: "p" });
        proxy.editParams({ password: undefined, host: "two.test" });
        expect(proxy.params).toMatchObject({ host: "two.test", password: "p" });
        expect(ProxyStorage.GetById("old")).toMatchObject({ host: "two.test", password: "p" });
    });

    it("запись без host не роняет импорт; один и тот же прокси узнаётся в любом написании", () => {
        const { proxyIdentity } = require("../../Functions/proxyAddress");
        expect(() => proxyIdentity({})).not.toThrow();
        expect(proxyIdentity({ host: 127 as any, port: 1 })).toBe(proxyIdentity({ host: " 127 ", port: "1" }));
        expect(proxyIdentity({ host: "проксі.example", port: 80 })).toBe(proxyIdentity({ host: require("url").domainToASCII("проксі.example"), port: "80", username: "", password: "" }));
        expect(proxyIdentity({ host: "a.test", port: 80, username: "u" })).not.toBe(proxyIdentity({ host: "a.test", port: 80, username: "v" }));
    });
});
