// SDA-61, SDA-56: учёт запросов в сторе таблицы аккаунтов — поздние ответы, одна сводка ошибок,
// повторные нажатия, список посреди работы, архив и восстановление.
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { windows: { openMiniNotification: jest.fn() } } }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string, vars?: object) => (vars ? `${key} ${JSON.stringify(vars)}` : key) } }));
import { runInAction } from "mobx";
import SteamAccountsTableStore, { BACKGROUND_SUMMARY_MAX_MS, BACKGROUND_SUMMARY_QUIET_MS, ERROR_SUMMARY_DELAY_MS } from "../../../../src/store/SteamAccountsTableStore/SteamAccountsTableStore";
import AvalibleTypes from "../../../interfaces/TableFields/AvalibleFieldTypes";

const methods: Record<string, jest.Mock> = {};
const api = new Proxy({}, { get: (_target, key: string) => methods[key] ||= jest.fn() });
const emit = (name: string, data: unknown) => methods[name].mock.calls[0][0]({}, data);
const notify = jest.fn();
const balanceField = { type: AvalibleTypes.steamAccountBalance, title: "", isSortable: true, isVisible: true, showTtitleInTable: true };
const wallet = (balance: number) => ({ steam: { balance, currency: "$", error: null } });
const proxy = (host: string) => ({ id: "p", number: 1, host, port: "8080", username: "u", password: "x" });
const accounts = (ids: string[], extra: Record<string, Record<string, unknown>> = {}) => ids.map((id, index) => ({
    id, number: index + 1, accountName: `login-${id}`, password: "p", deleted: false, maFile: { shared_secret: "c2hhcmVk" },
    secondary: { nickname: id }, changableSecondary: wallet(0),
    proxy: proxy("proxy-a.test"), proxyState: "ok", proxyId: "p", sessionError: null, ...extra[id],
}));
const calls = (name: string) => (methods[name] ? methods[name].mock.calls : []);
// Последний номер запроса, с которым стор обратился к main по аккаунту
const lastId = (name: string, id: string) => [...calls(name)].reverse().find((call) => call[0] === id)![1];

function started(ids = ["a", "b"], extra = {}) {
    const table = new SteamAccountsTableStore({ windows: { openMiniNotification: notify }, groups: { activeGroupId: null } } as any);
    emit("onGetTableFields", [balanceField]);
    emit("onGet", accounts(ids, extra));
    emit("onGetTableOptions", { pageSize: 10, activePage: 1 });
    jest.advanceTimersByTime(3000);
    return table;
}

beforeEach(() => {
    jest.useFakeTimers();
    notify.mockReset();
    for (const key of Object.keys(methods)) delete methods[key];
    (globalThis as any).window = { Main: { steamAccounts: api, guardConnection: api } };
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (globalThis as any).window;
});

describe("поздние ответы", () => {
    // Последовательность из SDA-56
    it("баланс старого запроса после смены прокси и нового запроса не принимается", () => {
        const table = started(["a"]);
        const old = lastId("getChangableSecondary", "a");
        emit("onEditProxy", { id: "a", proxy: proxy("proxy-b.test"), proxyId: "p2", proxyState: "ok" });
        table.setActivePage(1);
        const next = lastId("getChangableSecondary", "a");
        expect(next).not.toBe(old);
        emit("onGetChangableSecondaryError", { id: "a", err: "Not Logged In", stale: false, requestId: next });
        emit("onGetChangableSecondary", { id: "a", changableSecondary: wallet(99), requestId: old });
        expect(table.changableSecondaries.a.content.steam).toMatchObject({ error: "Not Logged In" });
        const before = calls("getChangableSecondary").length;
        jest.advanceTimersByTime(60 * 1000);
        expect(calls("getChangableSecondary")).toHaveLength(before + 1);
    });

    it("ответ прежнего обновления не снимает индикатор нового", () => {
        const table = started(["a"]);
        table.loadSecondaries("a");
        const first = lastId("getSecondary", "a");
        table.loadSecondaries("a");
        const second = lastId("getSecondary", "a");
        emit("onGetSecondary", { id: "a", secondary: { nickname: "stale" }, requestId: first });
        expect(table.steamAccounts.a).toMatchObject({ isLoadSecondary: true, secondary: { nickname: "a" } });
        emit("onGetSecondary", { id: "a", secondary: { nickname: "fresh" }, requestId: second });
        expect(table.steamAccounts.a).toMatchObject({ isLoadSecondary: false, secondary: { nickname: "fresh" } });
    });

    it("устаревший результат снимает индикатор без сообщения и ошибки в строке", () => {
        const table = started(["a"]);
        table.loadSecondaries("a");
        emit("onGetSecondaryError", { id: "a", err: "x", stale: true, requestId: lastId("getSecondary", "a") });
        jest.advanceTimersByTime(ERROR_SUMMARY_DELAY_MS * 2);
        expect(table.steamAccounts.a).toMatchObject({ isLoadSecondary: false, getSecondaryError: null });
        expect(notify).not.toHaveBeenCalled();
    });

    it("ответы по удалённому аккаунту ничего не роняют", () => {
        const table = started(["a"]);
        table.loadSecondaries("a");
        runInAction(() => { delete table.steamAccounts.a; });
        for (const [name, data] of [
            ["onGetSecondary", { id: "a", secondary: {} }], ["onGetSecondaryError", { id: "a", err: "x" }],
            ["onRefreshSession", "a"], ["onRefreshSessionError", { id: "a", err: "x" }],
            ["onSessionState", { id: "a", sessionError: "x" }],
        ] as const) expect(() => emit(name, data)).not.toThrow();
    });
});

describe("ошибки", () => {
    const fail = (table: SteamAccountsTableStore, id: string, err = "ETIMEDOUT") => {
        table.loadSecondaries(id);
        emit("onGetSecondaryError", { id, err, stale: false, requestId: lastId("getSecondary", id) });
    };

    it("одна ошибка: сообщение с номером и логином, причина в строке; успех её снимает", () => {
        const table = started(["a"]);
        fail(table, "a");
        jest.advanceTimersByTime(ERROR_SUMMARY_DELAY_MS);
        expect(notify.mock.calls).toEqual([[{ type: "error", text: expect.stringContaining("#1 login-a") }]]);
        expect(table.steamAccounts.a.getSecondaryError).toBe("ETIMEDOUT");
        table.loadSecondaries("a");
        emit("onGetSecondary", { id: "a", secondary: {}, requestId: lastId("getSecondary", "a") });
        expect(table.steamAccounts.a.getSecondaryError).toBeNull();
    });

    it("восемь ошибок подряд — одно сообщение с именами", () => {
        const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
        const table = started(ids);
        for (const id of ids) fail(table, id);
        jest.advanceTimersByTime(ERROR_SUMMARY_DELAY_MS);
        expect(notify).toHaveBeenCalledTimes(1);
        const { text } = notify.mock.calls[0][0];
        expect(text).toContain('"total":8');
        expect(text).toContain("#5 login-e, +3");
        expect(text).not.toContain("login-f");
    });

    it("вход не удался и данные не пришли — по аккаунту одна причина, вход", () => {
        const table = started(["a"]);
        emit("onRefreshSessionError", { id: "a", err: "session expired" });
        expect(notify).not.toHaveBeenCalled();
        fail(table, "a", "session expired");
        jest.advanceTimersByTime(ERROR_SUMMARY_DELAY_MS);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0].text).toContain("accounts.errors.refreshSession ");
    });

    // Прогон в CI на 43 аккаунтах: входы падали пачками раз в 5 с и давали пять сообщений подряд
    it("фоновые входы, падающие пачками, дают одно сообщение, когда стихнет", () => {
        const table = started(["a", "b", "c", "d"]);
        for (const id of ["a", "b", "c", "d"]) {
            emit("onRefreshSessionError", { id, err: "proxy down" });
            jest.advanceTimersByTime(5000);
        }
        expect(notify).not.toHaveBeenCalled();
        jest.advanceTimersByTime(BACKGROUND_SUMMARY_QUIET_MS);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0].text).toContain('"total":4');
    });

    it("…но не дольше минуты, даже если не стихает", () => {
        const ids = Array.from({ length: 20 }, (_, i) => `x${i}`);
        started(ids);
        for (const id of ids.slice(0, 13)) {
            emit("onRefreshSessionError", { id, err: "proxy down" });
            jest.advanceTimersByTime(5000);
        }
        expect(13 * 5000).toBeGreaterThan(BACKGROUND_SUMMARY_MAX_MS);
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("вход, который запустил человек, показывается сразу, даже во время фоновых", () => {
        const table = started(["a", "b"]);
        emit("onRefreshSessionError", { id: "a", err: "proxy down" });
        table.refreshSession("b");
        emit("onRefreshSessionError", { id: "b", err: "bad password" });
        jest.advanceTimersByTime(ERROR_SUMMARY_DELAY_MS);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0].text).toContain("login-b");
        jest.advanceTimersByTime(BACKGROUND_SUMMARY_MAX_MS);
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("обновление, заменившее запрос баланса, не оставляет спиннер в ячейке", () => {
        const table = started(["a"]);
        table.loadSecondaries("a");
        expect(table.changableSecondaries.a.isLoad).toBe(false);
        emit("onGetSecondaryError", { id: "a", err: "proxy down", stale: false, requestId: lastId("getSecondary", "a") });
        expect(table.changableSecondaries.a).toMatchObject({ isLoad: true, content: { steam: { error: "proxy down" } } });
    });

    it("не пришедший баланс показывает причину в ячейке, а не спиннер", () => {
        const table = started(["a"]);
        emit("onGetChangableSecondaryError", { id: "a", err: "proxy down", stale: false, requestId: lastId("getChangableSecondary", "a") });
        expect(table.changableSecondaries.a).toMatchObject({ isLoad: true, content: { steam: { error: "proxy down" } } });
    });

    it("состояние входа видно в строке: из списка и из события", () => {
        const table = started(["a", "b"], { b: { sessionError: "expired" } });
        expect(table.steamAccounts.b.sessionError).toBe("expired");
        emit("onSessionState", { id: "a", sessionError: "proxy down" });
        expect(table.steamAccounts.a.sessionError).toBe("proxy down");
        emit("onRefreshSession", "a");
        expect(table.steamAccounts.a.sessionError).toBeNull();
    });
});

describe("«Перезагрузить все данные»", () => {
    const ids = ["a", "b", "c", "d"];
    // main отмечает перечитанное прямо перед своим списком
    const reloaded = () => {
        emit("onRefreshStorage", { requestId: calls("refresh")[calls("refresh").length - 1][0] });
        emit("onGet", accounts(ids));
    };
    const answer = (id: string) => emit("onGetSecondary", { id, secondary: {}, requestId: lastId("getSecondary", id) });

    it("второе нажатие, пока идёт, ничего не делает; после конца — снова работает", () => {
        const table = started(ids);
        table.reloadAll();
        table.reloadAll();
        expect(calls("refresh")).toHaveLength(1);
        reloaded();
        table.reloadAll();
        expect(calls("refresh")).toHaveLength(1);
        expect(table.fullRefreshActive).toBe(true);
        for (const id of ids) answer(id);
        expect(table.fullRefreshActive).toBe(false);
        table.reloadAll();
        expect(calls("refresh")).toHaveLength(2);
    });

    it("посторонний список, пока main перечитывает, ничего не запускает; запускает отмеченный", () => {
        const table = started(ids);
        table.reloadAll();
        emit("onGet", accounts(ids));
        expect(calls("getSecondary")).toHaveLength(0);
        emit("onRefreshStorage", { requestId: -1 });
        emit("onGet", accounts(ids));
        expect(calls("getSecondary")).toHaveLength(0);
        reloaded();
        expect(calls("getSecondary").map((call) => call[0])).toEqual(["a", "b", "c"]);
    });

    it("main не прочитал хранилище: кнопка оживает, причина показана, следующий список ничего не запускает", () => {
        const table = started(ids);
        table.reloadAll();
        emit("onRefreshStorage", { requestId: calls("refresh")[0][0], err: "EACCES" });
        expect(table.fullRefreshActive).toBe(false);
        expect(notify.mock.calls[0][0].text).toContain("EACCES");
        emit("onGet", accounts(ids));
        expect(calls("getSecondary")).toHaveLength(0);
    });

    it("удалённый во время обновления и потерянный ответ не держат кнопку", () => {
        const table = started(ids);
        table.reloadAll();
        reloaded();
        emit("onGet", accounts(["b", "c", "d"]));
        expect(calls("getSecondary").map((call) => call[0])).toEqual(["a", "b", "c", "d"]);
        answer("c");
        answer("d");
        expect(table.fullRefreshActive).toBe(true);
        jest.advanceTimersByTime(10 * 60 * 1000);
        expect(table.fullRefreshActive).toBe(false);
        expect(table.steamAccounts.b.isLoadSecondary).toBe(false);
    });

    it("срок принадлежит месту в очереди: заменённый запрос строки его не отменяет", () => {
        const table = started(ids);
        table.reloadAll();
        reloaded();
        table.loadSecondaries("a");
        for (const id of ["b", "c", "d"]) answer(id);
        jest.advanceTimersByTime(10 * 60 * 1000);
        expect(table.fullRefreshActive).toBe(false);
        expect(table.steamAccounts.a.isLoadSecondary).toBe(false);
        expect(table.balanceLoads.a.state).toBe("failed");
    });

    it("ошибка после отметки: следующий список ничего не запускает", () => {
        const table = started(ids);
        table.reloadAll();
        const requestId = calls("refresh")[0][0];
        emit("onRefreshStorage", { requestId });
        emit("onRefreshStorage", { requestId, err: "compile failed" });
        emit("onGet", accounts(ids));
        expect(calls("getSecondary")).toHaveLength(0);
        expect(table.fullRefreshActive).toBe(false);
    });

    it("сводка, ждавшая показа, не всплывает посреди обновления и не называет архивных", () => {
        const table = started(ids);
        table.loadSecondaries("a");
        emit("onGetSecondaryError", { id: "a", err: "x", stale: false, requestId: lastId("getSecondary", "a") });
        table.loadSecondaries("b");
        emit("onGetSecondaryError", { id: "b", err: "y", stale: false, requestId: lastId("getSecondary", "b") });
        table.reloadAll();
        reloaded();
        jest.advanceTimersByTime(ERROR_SUMMARY_DELAY_MS * 2);
        expect(notify).not.toHaveBeenCalled();
        table.editSteamAccount("a", { deleted: true });
        for (const id of ids) answer(id);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0].text).toContain("#2 login-b");
        expect(notify.mock.calls[0][0].text).not.toContain("login-a");
    });

    it("ошибки показываются одной сводкой в конце", () => {
        const table = started(ids);
        table.reloadAll();
        reloaded();
        for (const id of ids.slice(0, 3)) {
            emit("onGetSecondaryError", { id, err: "ETIMEDOUT", stale: false, requestId: lastId("getSecondary", id) });
        }
        jest.advanceTimersByTime(60 * 1000);
        expect(notify).not.toHaveBeenCalled();
        answer("d");
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0].text).toContain('"total":3');
    });

    it("архивированный, пока ждал очереди, не остаётся «в загрузке»", () => {
        const table = started(ids);
        table.reloadAll();
        reloaded();
        table.editSteamAccount("d", { deleted: true });
        for (const id of ["a", "b", "c"]) answer(id);
        expect(calls("getSecondary").map((call) => call[0])).not.toContain("d");
        expect(table.balanceLoads.d).toBeUndefined();
        expect(table.fullRefreshActive).toBe(false);
    });
});

describe("список посреди работы", () => {
    it("индикаторы входа и обновления переживают новый список", () => {
        const table = started(["a", "b"]);
        table.loadSecondaries("a");
        table.refreshSession("b");
        table.refreshSession("b");
        expect(calls("refreshSession")).toHaveLength(1);
        emit("onGet", accounts(["a", "b"]));
        expect(table.steamAccounts.a.isLoadSecondary).toBe(true);
        expect(table.steamAccounts.b.isLogining).toBe(true);
    });

    it("восстановление из архива обновляет данные аккаунта, когда придёт список", () => {
        const table = started(["a", "b"], { b: { deleted: true } });
        table.restoreAccount("b");
        expect(calls("edit")).toEqual([["b", { deleted: false }]]);
        expect(calls("getSecondary")).toHaveLength(0);
        emit("onGet", accounts(["a", "b"]));
        expect(calls("getSecondary").map((call) => call[0])).toEqual(["b"]);
        emit("onGet", accounts(["a", "b"]));
        expect(calls("getSecondary")).toHaveLength(1);
    });

    it("список, собранный до восстановления, не съедает обновление", () => {
        const table = started(["a", "b"], { b: { deleted: true } });
        table.restoreAccount("b");
        emit("onGet", accounts(["a", "b"], { b: { deleted: true } }));
        expect(calls("getSecondary")).toHaveLength(0);
        emit("onGet", accounts(["a", "b"]));
        expect(calls("getSecondary").map((call) => call[0])).toEqual(["b"]);
    });

    it("отменённый вход (сменился прокси) не показывается ошибкой", () => {
        const table = started(["a"]);
        table.refreshSession("a");
        emit("onRefreshSessionError", { id: "a", err: "x", stale: true });
        jest.advanceTimersByTime(ERROR_SUMMARY_DELAY_MS * 2);
        expect(table.steamAccounts.a.isLogining).toBe(false);
        expect(notify).not.toHaveBeenCalled();
    });

    it("причина неудачного баланса переживает новый список и во время повтора", () => {
        const table = started(["a"]);
        emit("onGetChangableSecondaryError", { id: "a", err: "proxy down", stale: false, requestId: lastId("getChangableSecondary", "a") });
        jest.advanceTimersByTime(60 * 1000);
        emit("onGet", accounts(["a"]));
        expect(table.changableSecondaries.a.content.steam.error).toBe("proxy down");
    });

    it("причина неудачного баланса переживает новый список", () => {
        const table = started(["a"]);
        emit("onGetChangableSecondaryError", { id: "a", err: "proxy down", stale: false, requestId: lastId("getChangableSecondary", "a") });
        emit("onGet", accounts(["a"]));
        expect(table.changableSecondaries.a.content.steam.error).toBe("proxy down");
    });
});
