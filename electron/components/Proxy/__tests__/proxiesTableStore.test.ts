// SDA-64: стор страницы Proxies — импорт списка, правка, проверки, выделение и страницы.
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: {} }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string, options?: object) => options ? `${key}|${JSON.stringify(options)}` : key } }));

import ProxiesTableStore from "../../../../src/store/ProxiesTableStore/ProxiesTableStore";
import rootStore from "../../../../src/store/store";

type Listener = (event: unknown, data: any) => void;
const listeners: Record<string, Listener> = {};
let api: Record<string, jest.Mock>;
let toasts: { type: string, text: string }[];
let table: ProxiesTableStore;

const proxy = (number: number, extra: Record<string, unknown> = {}) => ({
    id: `p${number}`, number, host: `host${number}.test`, port: "80", username: "u", password: "p",
    deleted: false, steamAccounts: [], steamAccountIds: [], ...extra,
});
const receive = (name: string, data: unknown) => listeners[name]({}, data);
const rows = (...items: ReturnType<typeof proxy>[]) => receive("onGet", items);

beforeEach(() => {
    toasts = [];
    for (const key of Object.keys(listeners)) delete listeners[key];
    api = Object.fromEntries(["getTableFields", "get", "getTableOptions", "setTableOptions", "bulkNew", "edit", "new", "test", "testByParams", "delete"]
        .map(name => [name, jest.fn()]));
    const subscribe = new Proxy({}, { get: (_target, name: string) => name.startsWith("on") ? (listener: Listener) => { listeners[name] = listener; } : api[name] });
    (globalThis as any).window = { Main: { proxies: subscribe } };
    const windows = { openMiniNotification: (toast: any) => { toasts.push(toast); } };
    Object.assign(rootStore as any, { windows });
    table = new ProxiesTableStore(rootStore as any);
});
afterEach(() => { delete (globalThis as any).window; });

describe("bulk import", () => {
    it("shows what main saved, not what the field looked like, and returns the rejected lines", async () => {
        const result = table.createBulk("a:b@1.1.1.1:1\na:b@2.2.2.2:port");
        expect(toasts).toEqual([]);
        const [[text, requestId]] = api.bulkNew.mock.calls;
        expect(text).toBe("a:b@1.1.1.1:1\na:b@2.2.2.2:port");
        receive("onBulkResult", { requestId: "other", added: 5, duplicates: 0, rejected: [] });
        expect(toasts).toEqual([]);
        const rejected = [{ line: "a:b@2.2.2.2:port", reason: "address" }];
        receive("onBulkResult", { requestId, added: 1, duplicates: 0, rejected });
        await expect(result).resolves.toEqual({ added: 1, duplicates: 0, rejected });
        expect(toasts).toEqual([{ type: "error", text: 'proxies.bulk.result|{"added":1,"invalid":1,"duplicates":0}' }]);
    });
});

describe("editing form", () => {
    const setup = { host: "new.test", port: "81", username: "u", password: "p:x" };
    const links = { steamAccountIds: ["a1"], originalSteamAccountIds: [] };
    const save = () => {
        table.saveEditing(setup, links);
        return api.edit.mock.calls[api.edit.mock.calls.length - 1][3] as string;
    };
    beforeEach(() => table.openEditingForm(proxy(1) as any));

    it("stays open until main confirms", () => {
        const requestId = save();
        expect(api.edit).toHaveBeenCalledWith("p1", setup, links, requestId);
        expect([table.isEditingFormOpen, table.isSavingEdit]).toEqual([true, true]);
        table.saveEditing(setup, links);
        expect(api.edit).toHaveBeenCalledTimes(1);
        receive("onEditResult", { requestId });
        expect([table.isEditingFormOpen, table.isSavingEdit]).toEqual([false, false]);
        expect(toasts).toEqual([]);
    });

    it("a refusal stays in the form and can be corrected", () => {
        receive("onEditResult", { requestId: save(), error: "bad port" });
        expect([table.isEditingFormOpen, table.isSavingEdit, table.editError]).toEqual([true, false, "bad port"]);
        const second = save();
        expect(table.editError).toBeNull();
        receive("onEditResult", { requestId: second });
        expect(table.isEditingFormOpen).toBe(false);
    });

    it("a late reply to a closed window neither closes the next one nor hides the refusal", () => {
        const first = save();
        table.closeEditingForm();
        table.openEditingForm(proxy(2) as any);
        receive("onEditResult", { requestId: first });
        expect(table.isEditingFormOpen).toBe(true);
        receive("onEditResult", { requestId: first, error: "bad port" });
        expect([table.isEditingFormOpen, table.editError]).toEqual([true, null]);
        expect(toasts).toEqual([{ type: "error", text: "bad port" }]);
    });
});

describe("proxy tests", () => {
    const setup = (n: number) => ({ host: `host${n}.test`, port: "80", username: "u", password: "p" });
    const row = (n: number) => table.proxies.find(p => p.id === `p${n}`)!;
    const requestFor = (id: string) => api.test.mock.calls.filter(call => call[0] === id).map(call => call[1] as string);
    const reply = (n: number, result: object, requestId = requestFor(`p${n}`)[0]) => receive("onTest", { requestId, id: `p${n}`, tested: setup(n), ...result });
    beforeEach(() => rows(proxy(1), proxy(2), proxy(3)));

    it("each request has its own id and one reply ends it", () => {
        table.testProxy("p1");
        table.testProxy("p1");
        expect(api.test).toHaveBeenCalledTimes(1);
        expect(row(1).isTesting).toBe(true);
        reply(1, { ok: true });
        expect([row(1).isTesting, row(1).isWorking]).toEqual([false, true]);
        reply(1, { ok: false, error: "late duplicate" });
        expect(row(1).isWorking).toBe(true);
        table.testProxy("p1");
        expect(new Set(requestFor("p1")).size).toBe(2);
    });

    it("Steam's 429 is a working proxy: its own text with the code, not a failure", () => {
        table.testProxy("p1");
        reply(1, { ok: false, statusCode: 429 });
        expect(row(1)).toMatchObject({ isTesting: false, isWorking: true, testFailure: { statusCode: 429 } });
        expect(toasts).toEqual([{ type: "info", text: 'proxies.test.steamStatus|{"name":"#1 host1.test:80","code":429}' }]);
        table.testProxy("p1");
        reply(1, { ok: true }, requestFor("p1")[1]);
        expect([row(1).isWorking, row(1).testFailure]).toEqual([true, undefined]);
    });

    it("a dead proxy shows the reason", () => {
        table.testProxy("p1");
        reply(1, { ok: false, error: "ECONNREFUSED" });
        expect(row(1)).toMatchObject({ isWorking: false, testFailure: { error: "ECONNREFUSED" } });
        expect(toasts).toEqual([{ type: "error", text: 'proxies.test.notWorking|{"name":"#1 host1.test:80"}: ECONNREFUSED' }]);
    });

    it.each([{ host: "new.test" }, { port: "81" }, { username: "other" }, { password: "other" }])("a result for replaced data %j is dropped", change => {
        table.testProxy("p1");
        rows(proxy(1, change), proxy(2));
        expect(row(1).isTesting).toBe(false);
        // Новые данные можно проверить, не дожидаясь старого ответа.
        table.testProxy("p1");
        const [first, second] = requestFor("p1");
        reply(1, { ok: true }, first);
        expect([row(1).isTesting, row(1).isWorking]).toEqual([true, undefined]);
        expect(toasts).toEqual([]);
        receive("onTest", { requestId: second, id: "p1", tested: { ...setup(1), ...change }, ok: false, error: "x" });
        expect([row(1).isTesting, row(1).isWorking]).toEqual([false, false]);
    });

    it("main tested other data than the row shows: nothing is applied", () => {
        table.testProxy("p1");
        receive("onTest", { requestId: requestFor("p1")[0], id: "p1", tested: { ...setup(1), password: "main-has-another" }, ok: true });
        expect([row(1).isTesting, row(1).isWorking]).toEqual([false, undefined]);
        expect(toasts).toEqual([]);
    });

    it("a list reply with the same data keeps the spinner; a deleted proxy does not throw", () => {
        table.testProxy("p1");
        rows(proxy(1), proxy(2));
        expect(row(1).isTesting).toBe(true);
        rows(proxy(2));
        expect(() => reply(1, { ok: true })).not.toThrow();
        expect(toasts).toEqual([]);
    });

    describe("bulk test summary", () => {
        const title = "proxies.test.summary.title: ";
        const part = (name: string, values: object) => `proxies.test.summary.${name}|${JSON.stringify(values)}`;
        beforeEach(() => ["p1", "p2", "p3"].forEach(id => table.selectProxy(id)));

        it("one summary; a proxy Steam refused is counted apart from the failed ones", () => {
            table.testSelected();
            reply(2, { ok: false, error: "dead" });
            reply(1, { ok: true });
            expect(toasts).toEqual([]);
            reply(3, { ok: false, statusCode: 403 });
            expect(toasts).toEqual([{ type: "error", text: title + [
                part("working", { number: 1 }), part("refused", { number: 1, list: "#3 (403)" }), part("failed", { number: 1, list: "#2" }),
            ].join("; ") }]);
            expect([row(1).isWorking, row(2).isWorking, row(3).isWorking]).toEqual([true, false, true]);
        });

        it("only Steam refusals: not an error", () => {
            table.testSelected();
            [1, 2, 3].forEach(n => reply(n, { ok: false, statusCode: 429 }));
            expect(toasts).toEqual([{ type: "info", text: title + part("refused", { number: 3, list: "#1 (429), #2 (429), #3 (429)" }) }]);
        });

        it("all working", () => {
            table.testSelected();
            [1, 2, 3].forEach(n => reply(n, { ok: true }));
            expect(toasts).toEqual([{ type: "success", text: title + part("working", { number: 3 }) }]);
        });

        it("every row is already being tested: the summary comes at once", () => {
            ["p1", "p2", "p3"].forEach(id => table.testProxy(id));
            table.testSelected();
            expect(api.test).toHaveBeenCalledTimes(3);
            expect(toasts).toEqual([{ type: "info", text: title + part("skipped", { number: 3 }) }]);
        });

        it("every row changed or is gone: still a summary", () => {
            table.testSelected();
            rows(proxy(1, { password: "new" }), proxy(2, { host: "new.test" }));
            [1, 2, 3].forEach(n => reply(n, { ok: true }));
            expect(toasts).toEqual([{ type: "info", text: title + part("skipped", { number: 3 }) }]);
        });

        it("rows that changed meanwhile are counted apart", () => {
            table.testSelected();
            rows(proxy(1, { password: "new" }), proxy(2), proxy(3));
            [1, 2, 3].forEach(n => reply(n, { ok: true }));
            expect(toasts).toEqual([{ type: "info", text: title + [part("working", { number: 2 }), part("skipped", { number: 1 })].join("; ") }]);
        });

        it("nothing selected: nothing happens", () => {
            table.selectAllProxies(false);
            table.testSelected();
            expect([api.test.mock.calls.length, toasts.length]).toEqual([0, 0]);
        });
    });

    describe("add and edit windows", () => {
        const form = (requestIndex: number, result: object) => receive("onTest", { requestId: api.testByParams.mock.calls[requestIndex][1], ...result });

        it("a refused address does not block the next test", () => {
            table.testEditingProxy({ host: "", port: "", username: "", password: "" });
            form(0, { ok: false, error: "Invalid proxy address" });
            expect([table.isTestingEditingProxy, table.editingTestResult]).toEqual([false, false]);
            expect(toasts[0].text).toBe('proxies.test.notWorking|{"name":"—"}: Invalid proxy address');
            table.testEditingProxy(setup(1));
            expect(table.isTestingEditingProxy).toBe(true);
            form(1, { ok: true });
            expect([table.isTestingEditingProxy, table.editingTestResult]).toEqual([false, true]);
        });

        it("only the last request counts, whatever the order of the replies", () => {
            table.testEditingProxy(setup(1));
            table.testEditingProxy(setup(2));
            form(1, { ok: false, statusCode: 429 });
            form(0, { ok: true });
            expect([table.editingTestResult, table.editingTestFailure?.statusCode]).toEqual([true, 429]);
            // Адрес в тексте: в окне за время проверки могли выбрать другой прокси.
            expect(toasts).toEqual([{ type: "info", text: 'proxies.test.steamStatus|{"name":"host2.test:80","code":429}' }]);
        });

        it("a reply after the window closed or the value changed shows nothing", () => {
            table.testEditingProxy(setup(1));
            table.resetEditingTestDisplay();
            form(0, { ok: true });
            expect([table.editingTestResult, toasts.length]).toEqual([undefined, 0]);
        });

        it("only the connection fields go to main", () => {
            table.testEditingProxy(proxy(1) as any);
            expect(api.testByParams.mock.calls[0][0]).toEqual(setup(1));
        });
    });
});

describe("selection scope and pages", () => {
    const ids = (items: { id: string }[]) => items.map(item => item.id);
    const pageIds = () => ids(table.getProxiesByPages()[table.currentPage - 1] ?? []);
    beforeEach(() => {
        rows(...Array.from({ length: 25 }, (_, i) => proxy(i + 1)), proxy(99, { deleted: true }));
        table.setPageSize(10, false);
    });

    it("the header checkbox selects only what the search shows", () => {
        table.search("host25");
        table.selectAllProxies(true);
        expect(table.isAllSelected).toBe(true);
        expect(ids(table.getSelectedProxies())).toEqual(["p25"]);
        table.search("");
        expect(table.isAllSelected).toBe(false);
        expect(ids(table.getSelectedProxies())).toEqual(["p25"]);
    });

    it("rows selected before the search and hidden by it take no part in bulk actions", () => {
        table.selectProxy("p1");
        table.search("host25");
        table.selectProxy("p25");
        expect(ids(table.getSelectedProxies())).toEqual(["p25"]);
        table.testSelected();
        expect(api.test.mock.calls.map(call => call[0])).toEqual(["p25"]);
        table.search("");
        expect(ids(table.getSelectedProxies())).toEqual(["p1", "p25"]);
    });

    it("without a search all active proxies are selected, archived ones never", () => {
        table.changeShowStatus(true);
        table.selectAllProxies(true);
        expect(table.getSelectedProxies()).toHaveLength(25);
        expect(table.isAllSelected).toBe(true);
        table.selectProxy("p7", false);
        expect(table.isAllSelected).toBe(false);
    });

    it("the header checkbox follows the list: a new list clears both", () => {
        table.selectAllProxies(true);
        rows(proxy(1), proxy(2));
        expect([table.isAllSelected, table.getSelectedProxies().length]).toEqual([false, 0]);
    });

    it("a search from a far page shows its matches", () => {
        table.setActivePage(3);
        expect(pageIds()).toEqual(["p21", "p22", "p23", "p24", "p25"]);
        table.search("host25");
        expect([table.currentPage, pageIds()]).toEqual([1, ["p25"]]);
    });

    it("the page is clamped when rows disappear under the search or without it", () => {
        table.setActivePage(3);
        rows(...Array.from({ length: 12 }, (_, i) => proxy(i + 1)));
        expect([table.currentPage, pageIds()]).toEqual([2, ["p11", "p12"]]);
        rows();
        expect(table.currentPage).toBe(1);
    });

    it("the search follows proxies added or edited while it is on", () => {
        table.search("host25");
        rows(...Array.from({ length: 25 }, (_, i) => proxy(i + 1)), proxy(26, { host: "host25-new.test" }));
        expect(pageIds()).toEqual(["p25", "p26"]);
        rows(...Array.from({ length: 25 }, (_, i) => proxy(i + 1, i === 24 ? { host: "renamed.test" } : {})));
        expect(pageIds()).toEqual([]);
    });

    it("sorting reorders the rows", () => {
        table.sortProxies((a, b) => b.number - a.number);
        expect(pageIds().slice(0, 2)).toEqual(["p25", "p24"]);
    });

    it("table rows are plain copies: they go to IPC and to the edit window", () => {
        const { isObservable } = require("mobx");
        rows(proxy(1, { steamAccountIds: ["a1"] }));
        const [[first]] = table.getProxiesByPages();
        expect([isObservable(first), isObservable(first.steamAccountIds)]).toEqual([false, false]);
    });
});

// Записи вне действий mobx: в строгом режиме каждая даёт предупреждение.
it("list, test, edit and import replies change the store inside mobx actions", () => {
    const { configure, autorun, toJS } = require("mobx");
    configure({ enforceActions: "always" });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const stop = autorun(() => toJS(table));
    try {
        rows(proxy(1), proxy(2));
        table.testProxy("p1");
        receive("onTest", { requestId: api.test.mock.calls[0][1], id: "p1", tested: proxy(1), ok: true });
        table.testEditingProxy(proxy(2) as any);
        receive("onTest", { requestId: api.testByParams.mock.calls[0][1], ok: true });
        table.openEditingForm(proxy(1) as any);
        table.saveEditing(proxy(1) as any, { steamAccountIds: [] });
        receive("onEditResult", { requestId: api.edit.mock.calls[0][3], error: "bad" });
        table.createBulk("text");
        receive("onBulkResult", { requestId: api.bulkNew.mock.calls[0][1], added: 1, duplicates: 0, rejected: [] });
        receive("onGetTableOptions", { pageSize: 5, activePage: 1 });
        receive("onGetTableFields", []);
        table.sortProxies((a, b) => b.number - a.number);
        expect(warn.mock.calls.filter(([text]) => String(text).includes("[MobX]"))).toEqual([]);
    } finally {
        stop();
        configure({ enforceActions: "observed" });
        warn.mockRestore();
    }
});
