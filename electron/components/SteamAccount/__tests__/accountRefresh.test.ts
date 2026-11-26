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
        expect(reply.mock.calls).toEqual([[SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY_ERROR, { id: "id-1", err: "fixture failure", stale: false, requestId: undefined }]]);
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
        expect(methods.getSecondary).toHaveBeenCalledWith("id-1", expect.any(Number));
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

    // Review r2, exact sequence and no extra account list: a balance fails on the old proxy (error shown,
    // retry timer set), then the user picks a working proxy in the edit form. Forgetting the memo used to
    // cancel the timer but leave the error displayed as loaded, so nothing ever loaded it again.
    it("a route change after a failed balance loads it again on the new route without a page switch or a new list", () => {
        const table = startedStore(["a", "b"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: failed("Error: tunneling socket could not be established") });
        listener("onGetChangableSecondary")({}, { id: "b", changableSecondary: data.changableSecondary });
        expect(table.changableSecondaries.a.isLoad).toBe(true);

        listener("onEditProxy")({}, { id: "a", proxy: proxy("proxy-b.test"), proxyState: "ok", proxyId: "p" });
        expect(table.changableSecondaries.a.isLoad).toBe(false); // the old proxy's error is not shown as current
        jest.advanceTimersByTime(10 * 1000);
        expect(balanceCalls()).toEqual(["a", "b", "a"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });

        jest.advanceTimersByTime(60 * 60 * 1000);
        table.setActivePage(1);
        expect(balanceCalls()).toEqual(["a", "b", "a"]);
        expect(table.changableSecondaries.a).toEqual({ isLoad: true, content: data.changableSecondary });
        expect(table.changableSecondaries.b.isLoad).toBe(true);
    });

    it("after a route change a page switch loads at once, and the scheduled load does not repeat it", () => {
        const table = startedStore(["a"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: failed("proxy down") });
        listener("onEditProxy")({}, { id: "a", proxy: proxy("proxy-b.test"), proxyState: "ok", proxyId: "p" });
        table.setActivePage(1);
        expect(balanceCalls()).toEqual(["a", "a"]);
        jest.advanceTimersByTime(60 * 1000);
        expect(balanceCalls()).toEqual(["a", "a"]);
    });

    // Review r3: replies carry no request id, so a request sent before the route change could
    // answer after it. A success cancelled the scheduled reload (it shared the retry timer slot),
    // an error replaced it with the 60 s retry and showed the old proxy's error as current.
    it("a reply to a request sent before the route change is not shown and does not cancel the reload", () => {
        const table = startedStore(["a"]);
        expect(balanceCalls()).toEqual(["a"]); // still in flight on the old route
        listener("onEditProxy")({}, { id: "a", proxy: proxy("proxy-b.test"), proxyState: "ok", proxyId: "p" });
        jest.advanceTimersByTime(1000);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        expect(table.changableSecondaries.a.isLoad).toBe(false);
        expect(table.changableSecondaries.a.content).not.toEqual(data.changableSecondary);
        jest.advanceTimersByTime(9000);
        expect(balanceCalls()).toEqual(["a", "a"]);
        const fresh = { steam: { balance: 7.25, currency: "$", error: null } };
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: fresh });
        expect(table.changableSecondaries.a).toEqual({ isLoad: true, content: fresh });
        jest.advanceTimersByTime(60 * 60 * 1000);
        table.setActivePage(1);
        expect(balanceCalls()).toEqual(["a", "a"]);
    });

    it("an error from the old route does not move the reload from 10 s to the 60 s retry", () => {
        const table = startedStore(["a"]);
        listener("onEditProxy")({}, { id: "a", proxy: proxy("proxy-b.test"), proxyState: "ok", proxyId: "p" });
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: failed("Error: old proxy is down") });
        listener("onGetChangableSecondaryError")({}, { id: "a", err: "Error: old proxy is down" });
        expect(table.changableSecondaries.a.isLoad).toBe(false);
        jest.advanceTimersByTime(10 * 1000);
        expect(balanceCalls()).toEqual(["a", "a"]);
        // The new route's own failure is shown and retried by the usual rules
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: failed("Error: new proxy refused") });
        expect(table.changableSecondaries.a).toEqual({ isLoad: true, content: failed("Error: new proxy refused") });
        jest.advanceTimersByTime(60 * 1000);
        expect(balanceCalls()).toEqual(["a", "a", "a"]);
    });

    it("a manual refresh during the 10 s wait takes over: its balance is shown and no second load follows", () => {
        const table = startedStore(["a"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        listener("onEditProxy")({}, { id: "a", proxy: proxy("proxy-b.test"), proxyState: "ok", proxyId: "p" });
        table.loadSecondaries("a");
        const fresh = { steam: { balance: 7.25, currency: "$", error: null } };
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: fresh });
        expect(table.changableSecondaries.a).toEqual({ isLoad: true, content: fresh });
        jest.advanceTimersByTime(60 * 60 * 1000);
        expect(balanceCalls()).toEqual(["a"]);
        expect(methods.getSecondary.mock.calls.map((call) => call[0])).toEqual(["a"]);
    });

    // Review r3: with the balance column hidden the scheduled reload is skipped (nothing loads a
    // hidden column), the cell was left "loading" and showing the column again asked for nothing.
    it("showing the balance column again loads what was skipped while it was hidden", () => {
        const table = startedStore(["a", "b"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        listener("onGetChangableSecondary")({}, { id: "b", changableSecondary: data.changableSecondary });
        table.setFields([{ ...balanceField, isVisible: false }]);
        listener("onEditProxy")({}, { id: "a", proxy: proxy("proxy-b.test"), proxyState: "ok", proxyId: "p" });
        jest.advanceTimersByTime(60 * 60 * 1000);
        expect(balanceCalls()).toEqual(["a", "b"]); // hidden: no download

        table.setFields([balanceField]);
        expect(balanceCalls()).toEqual(["a", "b", "a"]); // only the account that has nothing to show
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        expect(table.changableSecondaries.a).toEqual({ isLoad: true, content: data.changableSecondary });
        // Saving the same visible column again asks for nothing
        table.setFields([balanceField]);
        expect(balanceCalls()).toEqual(["a", "b", "a"]);
    });

    it("a store started with the balance column hidden loads the page when the column is shown", () => {
        const table = new SteamAccountsTableStore({ windows: { openMiniNotification: jest.fn() }, groups: { activeGroupId: null } } as any);
        listener("onGetTableFields")({}, [{ ...balanceField, isVisible: false }]);
        listener("onGet")({}, accounts(["a", "b"]));
        listener("onGetTableOptions")({}, { pageSize: 10, activePage: 1 });
        jest.advanceTimersByTime(60 * 60 * 1000);
        expect(balanceCalls()).toEqual([]);
        table.setFields([balanceField]);
        expect(balanceCalls()).toEqual(["a", "b"]);
    });

    it("an edit with the same route keeps the balance and its memo", () => {
        const table = startedStore(["a"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        listener("onEditProxy")({}, { id: "a", proxy: proxy("proxy-a.test"), proxyState: "ok", proxyId: "p" });
        jest.advanceTimersByTime(60 * 60 * 1000);
        table.setActivePage(1);
        expect(balanceCalls()).toEqual(["a"]);
        expect(table.changableSecondaries.a.isLoad).toBe(true);
    });

    it("a session refresh reloads the balance through the full refresh only, and a failed refresh is retried", () => {
        const table = startedStore(["a"]);
        listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
        runInAction(() => { table.steamAccounts.a.isLogining = true; });
        listener("onRefreshSession")({}, "a");
        expect(methods.getSecondary.mock.calls.map((call) => call[0])).toEqual(["a"]);
        // The sweep and page switches do not add a balance-only download while the refresh is running
        listener("onGet")({}, accounts(["a"]));
        jest.advanceTimersByTime(3000);
        expect(balanceCalls()).toEqual(["a"]);
        // The refresh fails before the balance: no balance reply will come, so the memo is retryable
        listener("onGetSecondaryError")({}, { id: "a", err: "Error: fixture" });
        jest.advanceTimersByTime(60 * 1000);
        expect(balanceCalls()).toEqual(["a", "a"]);
    });
    // SDA-59: «Перезагрузить все данные» only re-read the list; profile data was not refreshed at all,
    // and the hidden archived accounts logged in too. Now: the list, then a queue over active accounts.
    describe("reload all", () => {
        const secondaryCalls = () => (methods.getSecondary ? methods.getSecondary.mock.calls.map((call) => call[0]) : []);
        const answer = (id: string) => listener("onGetSecondary")({}, { id, secondary: { nickname: id } });
        const fail = (id: string) => listener("onGetSecondaryError")({}, { id, err: "Error: session has expired" });
        const list = () => [
            ...accounts(["a", "b", "c", "d", "e"]),
            ...accounts(["x"], { deleted: true }),
        ];
        // main marks its reload right before the list it read for it (SDA-61)
        const emitReloadedList = () => {
            listener("onRefreshStorage")({}, { requestId: methods.refresh.mock.calls[methods.refresh.mock.calls.length - 1][0] });
            listener("onGet")({}, list());
        };

        it("asks main to reload and refreshes nothing until the new list arrives", () => {
            const table = startedStore(["a"]);
            table.reloadAll();
            expect(methods.refresh).toHaveBeenCalledTimes(1);
            expect(secondaryCalls()).toEqual([]);
        });

        it("refreshes active accounts three at a time; an error does not stop the rest; archived are skipped", () => {
            const table = startedStore(["a"]);
            table.reloadAll();
            emitReloadedList();
            expect(secondaryCalls()).toEqual(["a", "b", "c"]);
            expect(table.steamAccounts.a.isLoadSecondary).toBe(true);
            fail("b");
            expect(secondaryCalls()).toEqual(["a", "b", "c", "d"]);
            answer("a");
            answer("c");
            expect(secondaryCalls()).toEqual(["a", "b", "c", "d", "e"]);
            answer("d");
            answer("e");
            expect(secondaryCalls()).not.toContain("x");
            expect(table.steamAccounts.e.secondary).toEqual({ nickname: "e" });
        });

        // Стартовый таймер балансов не должен бить /market/ поверх очереди: Steam отвечал 429
        it("queued accounts get no separate balance request: the balance comes with the queue", () => {
            const table = startedStore(["a"]);
            const before = balanceCalls().length;
            table.reloadAll();
            emitReloadedList();
            jest.advanceTimersByTime(3000);
            expect(balanceCalls().length).toBe(before);
            expect(secondaryCalls()).toEqual(["a", "b", "c"]);
        });

        it("the current page goes first", () => {
            const table = startedStore(["a"]);
            listener("onGetTableOptions")({}, { pageSize: 2, activePage: 1 });
            listener("onGet")({}, list());
            table.setActivePage(2);
            table.reloadAll();
            emitReloadedList();
            expect(secondaryCalls()).toEqual(["c", "d", "a"]);
        });

        it("answers to a row refresh do not start extra queue items, and a later list alone starts nothing", () => {
            const table = startedStore(["a"]);
            table.reloadAll();
            emitReloadedList();
            answer("x"); // archived row answered its own refresh button
            expect(secondaryCalls()).toEqual(["a", "b", "c"]);
            listener("onGet")({}, list());
            expect(secondaryCalls()).toEqual(["a", "b", "c"]);
        });

        it("an answer for an account gone from the table does not stall the queue", () => {
            const table = startedStore(["a"]);
            table.reloadAll();
            emitReloadedList();
            runInAction(() => { delete table.steamAccounts.a; });
            expect(() => answer("a")).not.toThrow();
            expect(secondaryCalls()).toEqual(["a", "b", "c", "d"]);
        });
    });
});
