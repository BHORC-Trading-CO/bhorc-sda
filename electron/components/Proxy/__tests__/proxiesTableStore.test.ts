// SDA-64: стор страницы Proxies — импорт списка.
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
        receive("onBulkResult", { requestId, added: 1, duplicates: 0, rejected: ["a:b@2.2.2.2:port"] });
        await expect(result).resolves.toEqual({ added: 1, duplicates: 0, rejected: ["a:b@2.2.2.2:port"] });
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
