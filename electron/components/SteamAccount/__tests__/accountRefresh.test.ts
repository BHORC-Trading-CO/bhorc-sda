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

    // Before: the active page asked for each balance right away and the 3 s startup timer asked
    // again, and every new account list (tab switch, edit, import) repeated it for all accounts.
    // Harmless with the old (failing) store request, ~1 MB per account with /market/.
    it("startup and later account lists request each balance once per session", () => {
        jest.useFakeTimers();
        try {
            const table = new SteamAccountsTableStore({ windows: { openMiniNotification: jest.fn() }, groups: { activeGroupId: null } } as any);
            listener("onGetTableFields")({}, [{ type: AvalibleTypes.steamAccountBalance, title: "", isSortable: true, isVisible: true, showTtitleInTable: true }]);
            const accounts = ["a", "b"].map((id, index) => ({
                id, number: index + 1, accountName: id, password: "p", deleted: false, maFile: { shared_secret: "c2hhcmVk" },
                secondary: { nickname: id }, changableSecondary: { steam: { balance: 0, currency: "RUB", error: null } },
            }));
            listener("onGet")({}, accounts);
            listener("onGetTableOptions")({}, { pageSize: 10, activePage: 1 });
            jest.advanceTimersByTime(3000);
            expect(methods.getChangableSecondary.mock.calls).toEqual([["a"], ["b"]]);

            listener("onGetChangableSecondary")({}, { id: "a", changableSecondary: data.changableSecondary });
            listener("onGetChangableSecondary")({}, { id: "b", changableSecondary: data.changableSecondary });
            const saved = accounts.map((account) => ({ ...account, changableSecondary: data.changableSecondary }));
            listener("onGet")({}, saved);
            jest.advanceTimersByTime(3000);
            expect(methods.getChangableSecondary).toHaveBeenCalledTimes(2);
            expect(table.changableSecondaries.a).toEqual({ isLoad: true, content: data.changableSecondary });

            // A failed request (error channel) may be retried by the next page switch
            listener("onGetChangableSecondaryError")({}, { id: "a", err: "fixture" });
            runInAction(() => { table.changableSecondaries.a.isLoad = false; });
            table.setActivePage(1);
            expect(methods.getChangableSecondary).toHaveBeenLastCalledWith("a");
        } finally {
            jest.clearAllTimers();
            jest.useRealTimers();
        }
    });
});
