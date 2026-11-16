jest.mock("../steamAccountManager", () => ({ __esModule: true, default: { getById: jest.fn() } }));
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { windows: { openMiniNotification: jest.fn() } } }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
import { runInAction } from "mobx";
import steamAccountManager from "../steamAccountManager";
import getSecondaryListener from "../Listeners/steamAccountGetSecondaryListener";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import SteamAccountsTableStore from "../../../../src/store/SteamAccountsTableStore/SteamAccountsTableStore";
import AvalibleTypes from "../../../interfaces/TableFields/AvalibleFieldTypes";

// SDA-38: the balance now comes from the same /market/ download as KT and TP, so one refresh of
// an account (row refresh button, session refresh) must not ask main for the balance separately.

const data = {
    secondary: { nickname: "fixture", level: 3, avatarUrl: "", ktState: null, tpState: true, tradeState: false },
    changableSecondary: { steam: { balance: 1.5, currency: "$", error: null } },
};

describe("main: profile refresh listener", () => {
    it("replies with the profile and the balance from one getSecondary call", async () => {
        const account = { getSecondary: jest.fn().mockResolvedValue(data), getChangableSecondary: jest.fn() };
        (steamAccountManager.getById as jest.Mock).mockReturnValue(account);
        const reply = jest.fn();
        await getSecondaryListener({ reply } as unknown as Electron.IpcMainEvent, "id-1");
        expect(account.getSecondary).toHaveBeenCalledTimes(1);
        expect(account.getChangableSecondary).not.toHaveBeenCalled();
        expect(reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY, { id: "id-1", secondary: data.secondary });
        expect(reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_GET_CHANGABLE_SECONDARY, { id: "id-1", changableSecondary: data.changableSecondary });
        expect(reply).toHaveBeenCalledTimes(2);
    });

    it("a failed refresh replies with a string error only", async () => {
        (steamAccountManager.getById as jest.Mock).mockReturnValue({ getSecondary: jest.fn().mockRejectedValue(new Error("fixture failure")) });
        const reply = jest.fn();
        await getSecondaryListener({ reply } as unknown as Electron.IpcMainEvent, "id-1");
        expect(reply.mock.calls).toEqual([[SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY_ERROR, { id: "id-1", err: "Error: fixture failure" }]]);
    });
});

describe("renderer: table store", () => {
    const methods: Record<string, jest.Mock> = {};
    const api = new Proxy({}, { get: (_target, key: string) => methods[key] ||= jest.fn() });
    const listener = (name: string) => methods[name].mock.calls[0][0];

    beforeEach(() => {
        for (const key of Object.keys(methods)) delete methods[key];
        (globalThis as any).window = { Main: { steamAccounts: api, guardConnection: api } };
    });
    afterEach(() => {
        delete (globalThis as any).window;
    });

    function storeWithAccount() {
        const table = new SteamAccountsTableStore({ windows: { openMiniNotification: jest.fn() } } as any);
        runInAction(() => {
            table.steamAccounts = { "id-1": { id: "id-1", isLogining: true, isLoadSecondary: false, deleted: false } as any };
            table.changableSecondaries = { "id-1": { isLoad: true, content: { steam: { balance: 0, currency: "RUB", error: null } } } };
        });
        return table;
    }

    it("after a session refresh asks only for the full refresh, not for the balance separately", () => {
        const table = storeWithAccount();
        listener("onRefreshSession")({}, "id-1");
        expect(methods.getSecondary).toHaveBeenCalledWith("id-1");
        expect(methods.getChangableSecondary).toBeUndefined();
        expect(table.steamAccounts["id-1"].isLoadSecondary).toBe(true);
    });

    it("the balance that arrives with the refresh replaces the stored one", () => {
        const table = storeWithAccount();
        listener("onGetChangableSecondary")({}, { id: "id-1", changableSecondary: data.changableSecondary });
        expect(table.changableSecondaries["id-1"]).toEqual({ isLoad: true, content: data.changableSecondary });
        // An account missing from the dictionary does not throw
        listener("onGetChangableSecondary")({}, { id: "id-2", changableSecondary: data.changableSecondary });
        expect(table.changableSecondaries["id-2"].isLoad).toBe(true);
    });

    const failed = (error: string) => ({ steam: { balance: null, currency: null, error } });
    const balanceField = { type: AvalibleTypes.steamAccountBalance, title: "", isSortable: true, isVisible: true, showTtitleInTable: true };
    const proxy = (host: string) => ({ id: "p", number: 1, host, port: "8080", username: "u", password: "x" });
    const accounts = (ids: string[], extra: Record<string, unknown> = {}) => ids.map((id, index) => ({
        id, number: index + 1, accountName: id, password: "p", deleted: false, maFile: { shared_secret: "c2hhcmVk" },
        secondary: { nickname: id }, changableSecondary: { steam: { balance: 0, currency: "RUB", error: null } },
        proxy: proxy("proxy-a.test"), proxyState: "ok", proxyId: "p", ...extra,
    }));
    const balanceCalls = () => (methods.getChangableSecondary ? methods.getChangableSecondary.mock.calls.map((call) => call[0]) : []);

    // Real startup order: fields, the account list (visible page loads right away), table options,
    // then the 3 s sweep over all accounts.
    function startedStore(ids = ["a", "b"]) {
        const table = new SteamAccountsTableStore({ windows: { openMiniNotification: jest.fn() }, groups: { activeGroupId: null } } as any);
        listener("onGetTableFields")({}, [balanceField]);
        listener("onGet")({}, accounts(ids));
        listener("onGetTableOptions")({}, { pageSize: 10, activePage: 1 });
        jest.advanceTimersByTime(3000);
        return table;
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    // Before: the active page asked for each balance right away and the 3 s startup timer asked
    // again, and every new account list (tab switch, edit, import) repeated it for all accounts.
    // Harmless with the old (failing) store request, ~1 MB per account with /market/.
    it("startup and later account lists request each successful balance once per session", () => {
        const table = startedStore();
        expect(balanceCalls()).toEqual(["a", "b"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        listener("onGetChangableSecondary")({}, { id: "b", changableSecondary: data.changableSecondary });
        listener("onGet")({}, accounts(["a", "b"], { changableSecondary: data.changableSecondary }));
        jest.advanceTimersByTime(30 * 60 * 1000);
        table.setActivePage(1);
        expect(balanceCalls()).toEqual(["a", "b"]);
        expect(table.changableSecondaries.a).toEqual({ isLoad: true, content: data.changableSecondary });
    });

    // Review r1: errors arrive on the normal channel as { steam: { error } } and used to be cached as done.
    // Startup race: main sends the list before initSession has set the cookies, so the first /market/
    // answers "not logged in"; the automatic retry a minute later recovers it.
    it("an error payload is retried: not before 60 s on natural triggers, automatically after 1 minute", () => {
        const table = startedStore(["a"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: failed("Steam does not see this session as logged in") });
        expect(table.changableSecondaries.a.isLoad).toBe(true); // the error is shown, not a spinner
        jest.advanceTimersByTime(3000);
        listener("onGet")({}, accounts(["a"], { changableSecondary: failed("x") }));
        table.setActivePage(1);
        expect(balanceCalls()).toEqual(["a"]);
        expect(table.changableSecondaries.a.isLoad).toBe(true);

        jest.advanceTimersByTime(57 * 1000); // 60 s after the failed answer
        expect(balanceCalls()).toEqual(["a", "a"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        jest.advanceTimersByTime(60 * 60 * 1000);
        table.setActivePage(1);
        expect(balanceCalls()).toEqual(["a", "a"]);
        expect(table.changableSecondaries.a).toEqual({ isLoad: true, content: data.changableSecondary });
    });

    it("after the automatic retries are used up, a page switch or a new account list retries, but not within 60 s", () => {
        const table = startedStore(["a"]);
        const fail = () => listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: failed("proxy down") });
        for (let i = 0; i < 4; i++) fail(); // four failures in a row: no automatic timer is left
        jest.advanceTimersByTime(30 * 1000);
        table.setActivePage(1);
        listener("onGet")({}, accounts(["a"]));
        jest.advanceTimersByTime(3000);
        expect(balanceCalls()).toEqual(["a"]);
        jest.advanceTimersByTime(30 * 1000); // 63 s after the last failure
        table.setActivePage(1);
        expect(balanceCalls()).toEqual(["a", "a"]);
        fail();
        jest.advanceTimersByTime(61 * 1000);
        listener("onGet")({}, accounts(["a"]));
        jest.advanceTimersByTime(3000);
        expect(balanceCalls()).toEqual(["a", "a", "a"]);
    });

    it("automatic retries back off 1, 5 and 15 minutes, then wait for a trigger", () => {
        startedStore(["a"]);
        const fail = () => listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: failed("proxy down") });
        fail();
        jest.advanceTimersByTime(60 * 1000);
        expect(balanceCalls()).toHaveLength(2);
        fail();
        jest.advanceTimersByTime(4 * 60 * 1000);
        expect(balanceCalls()).toHaveLength(2);
        jest.advanceTimersByTime(60 * 1000);
        expect(balanceCalls()).toHaveLength(3);
        fail();
        jest.advanceTimersByTime(15 * 60 * 1000);
        expect(balanceCalls()).toHaveLength(4);
        fail();
        jest.advanceTimersByTime(2 * 60 * 60 * 1000);
        expect(balanceCalls()).toHaveLength(4);
    });

    it("a route change forgets the account's balance; an edit with the same route does not", () => {
        const table = startedStore(["a", "b"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        listener("onGetChangableSecondary")({}, { id: "b", changableSecondary: data.changableSecondary });
        listener("onEditProxy")({}, { id: "b", proxy: proxy("proxy-a.test"), proxyState: "ok", proxyId: "p" });
        listener("onEditProxy")({}, { id: "a", proxy: proxy("proxy-b.test"), proxyState: "ok", proxyId: "p" });
        listener("onGet")({}, accounts(["a", "b"]));
        jest.advanceTimersByTime(3000);
        expect(balanceCalls()).toEqual(["a", "b", "a"]);
        expect(table.changableSecondaries.b.isLoad).toBe(true);
    });

    it("a session refresh reloads the balance through the full refresh only, and a failed refresh is retried", () => {
        const table = startedStore(["a"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        runInAction(() => { table.steamAccounts.a.isLogining = true; });
        listener("onRefreshSession")({}, "a");
        expect(methods.getSecondary.mock.calls).toEqual([["a"]]);
        // The sweep and page switches do not add a balance-only download while the refresh is running
        listener("onGet")({}, accounts(["a"]));
        jest.advanceTimersByTime(3000);
        expect(balanceCalls()).toEqual(["a"]);
        // The refresh fails before the balance: no balance reply will come, so the memo is retryable
        listener("onGetSecondaryError")({}, { id: "a", err: "Error: fixture" });
        jest.advanceTimersByTime(60 * 1000);
        expect(balanceCalls()).toEqual(["a", "a"]);
    });
});
