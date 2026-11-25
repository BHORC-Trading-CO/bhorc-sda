// SDA-65: таблица акаунтов — выбор только видимых строк, один таймер кодов, порядок и выбор
// переживают новый список, страница не бывает пустой, строки не копируются.
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { windows: { openMiniNotification: jest.fn() } } }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
import { isObservable } from "mobx";
import SteamAccountsTableStore, { compareBalances } from "../../../../src/store/SteamAccountsTableStore/SteamAccountsTableStore";
import AvalibleTypes from "../../../interfaces/TableFields/AvalibleFieldTypes";

const methods: Record<string, jest.Mock> = {};
const api = new Proxy({}, { get: (_target, key: string) => methods[key] ||= jest.fn() });
const emit = (name: string, data: unknown) => methods[name].mock.calls[0][0]({}, data);
const account = (id: string, number: number, extra: Record<string, unknown> = {}) => ({
    id, number, accountName: `login-${id}`, password: "p", deleted: false, maFile: { shared_secret: `secret-${id}`, Session: { SteamID: "1" } },
    secondary: { nickname: `nick-${id}` }, changableSecondary: { steam: { balance: number, currency: "$", error: null } },
    proxy: null, proxyState: "none", proxyId: null, group: null, ...extra,
});
const list = (n: number, extra: Record<string, Record<string, unknown>> = {}) =>
    Array.from({ length: n }, (_, i) => account(`a${i + 1}`, i + 1, extra[`a${i + 1}`]));
function started(n = 12, extra = {}) {
    const table = new SteamAccountsTableStore({ windows: { openMiniNotification: jest.fn() }, groups: { activeGroupId: null } } as any);
    emit("onGetTableFields", []);
    emit("onGetTableOptions", { pageSize: 5, activePage: 1 });
    emit("onGet", list(n, extra));
    return table;
}
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-25T12:00:10.000Z"));
    for (const key of Object.keys(methods)) delete methods[key];
    methods.getAuthCode = jest.fn((secret: string) => `code-${secret}`);
    (globalThis as any).window = { Main: { steamAccounts: api, guardConnection: api } };
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (globalThis as any).window;
});

describe("выбор", () => {
    it("выбранная строка, скрытая поиском, не выбрана: массовое действие её не тронет", () => {
        const table = started();
        table.selectSteamAccount("a1");
        table.search("login-a2");
        table.selectSteamAccount("a2");
        expect(ids(table.selectedAccounts)).toEqual(["a2"]);
        table.refreshSessionSelected();
        expect(methods.refreshSession.mock.calls).toEqual([["a2"]]);
        table.search("");
        expect(ids(table.selectedAccounts)).toEqual(["a2"]);
        expect(table.steamAccounts.a1.isSelected).toBe(false);
    });

    it("то же для группы, страницы, размера страницы и скрытия архива", () => {
        const table = started(12, { a1: { group: { id: "g" } } });
        table.selectSteamAccount("a3");
        // Обычный объект MobX превращает в наблюдаемую копию: группу меняем в ней
        const { groups: live } = (table as any).root;
        live.activeGroupId = "g";
        table.setActivePage(1);
        expect(table.steamAccounts.a3.isSelected).toBe(false);
        live.activeGroupId = null;
        table.setActivePage(1);

        table.selectAllSteamAccounts(true);
        expect(ids(table.selectedAccounts)).toEqual(["a1", "a2", "a3", "a4", "a5"]);
        table.setActivePage(2);
        expect(Object.values(table.steamAccounts).some((sa) => sa.isSelected)).toBe(false);

        table.selectSteamAccount("a7");
        table.setPageSize(5);
        expect(table.steamAccounts.a7.isSelected).toBe(false);
    });

    it("«выбрать все» берёт строки страницы под фильтром, флажок заголовка считается по ним", () => {
        const table = started();
        table.search("login-a1");
        table.selectAllSteamAccounts(true);
        expect(ids(table.selectedAccounts)).toEqual(["a1", "a10", "a11", "a12"]);
        expect(table.isAllSelected).toBe(true);
        table.selectSteamAccount("a10", false);
        expect(table.isAllSelected).toBe(false);
    });

    it("под пустой страницей выбор не падает и «все» не отмечено", () => {
        const table = started();
        table.search("нет такого");
        expect(() => { table.selectSteamAccount("a1"); table.selectAllSteamAccounts(); }).not.toThrow();
        expect(table.selectedAccounts).toEqual([]);
        expect(table.isAllSelected).toBe(false);
    });

    it("архивная строка не выбирается «всеми» и не попадает в действие", () => {
        const table = started(3, { a2: { deleted: true } });
        table.changeShowStatus(true);
        table.selectAllSteamAccounts();
        table.selectSteamAccount("a2");
        expect(ids(table.selectedAccounts)).toEqual(["a1", "a3"]);
    });
});

describe("состав видимых строк меняется сам", () => {
    const nick = (id: string, nickname: string) => emit("onGetSecondary", { id, secondary: { nickname } });

    it("ответ сменил ник под поиском: строка ушла и не вернётся выбранной", () => {
        const table = started(3);
        table.search("nick-a2");
        table.selectSteamAccount("a2");
        nick("a2", "renamed");
        expect(table.pageAccounts).toEqual([]);
        table.search("");
        expect(table.selectedAccounts).toEqual([]);
        expect(table.steamAccounts.a2.isSelected).toBe(false);
    });

    it("ушла единственная строка последней страницы — показана существующая", () => {
        const table = started(6);
        table.search("nick-a");
        table.setActivePage(2);
        nick("a6", "renamed");
        expect(table.activePage).toBe(1);
        expect(table.pageAccounts).toHaveLength(5);
    });
});

describe("новый список", () => {
    it("не сбрасывает выбор и сортировку", () => {
        const table = started(4);
        table.changeFieldDirection(AvalibleTypes.number, "UP");
        table.sortSteamAccounts((a, b) => b.number - a.number);
        table.selectSteamAccount("a2");
        emit("onGet", list(5));
        expect(ids(table.pageAccounts)).toEqual(["a5", "a4", "a3", "a2", "a1"]);
        expect(table.sortedField).toBe(AvalibleTypes.number);
        expect(ids(table.selectedAccounts)).toEqual(["a2"]);
    });

    it("аккаунт, ушедший в архив, не остаётся выбранным", () => {
        const table = started(2);
        table.selectSteamAccount("a1");
        emit("onGet", list(2, { a1: { deleted: true } }));
        expect(table.steamAccounts.a1.isSelected).toBe(false);
        // и когда архив показан, и строка осталась на экране
        table.changeShowStatus(true);
        table.selectSteamAccount("a2");
        emit("onGet", list(2, { a1: { deleted: true }, a2: { deleted: true } }));
        expect(table.steamAccounts.a2.isSelected).toBe(false);
    });
});

describe("страница", () => {
    it("архивирована последняя строка последней страницы — показана предыдущая", () => {
        const table = started(6);
        table.setActivePage(2);
        table.editSteamAccount("a6", { deleted: true });
        expect(table.activePage).toBe(1);
        expect(table.pageAccounts).toHaveLength(5);
    });

    it("сохранённая страница не теряется, пока списка нет", () => {
        const table = new SteamAccountsTableStore({ windows: { openMiniNotification: jest.fn() }, groups: { activeGroupId: null } } as any);
        emit("onGetTableOptions", { pageSize: 5, activePage: 3 });
        emit("onGet", list(12));
        expect(table.activePage).toBe(3);
        expect(ids(table.pageAccounts)).toEqual(["a11", "a12"]);
    });
});

describe("сохранённые настройки", () => {
    it.each([0, -5, 2.5, NaN])("размер страницы %s из файла не вешает окно", (pageSize) => {
        const table = started(12);
        emit("onGetTableOptions", { pageSize, activePage: 1 });
        expect(table.pageSize).toBe(10);
        expect(table.pages).toHaveLength(2);
    });

    it("направление сортировки переживает перечитывание колонок", () => {
        const table = started(2);
        const field = { type: AvalibleTypes.number, title: "", isSortable: true, isVisible: true, showTtitleInTable: true };
        emit("onGetTableFields", [field]);
        table.changeFieldDirection(AvalibleTypes.number, "DOWN");
        emit("onGetTableFields", [field]);
        expect(table.fields[0].sortDirection).toBe("DOWN");
    });

    it("равные значения идут по номеру, что бы ни вернуло сравнение колонки", () => {
        const table = started(4);
        table.sortSteamAccounts(() => -1);
        expect(ids(table.pageAccounts)).toEqual(["a1", "a2", "a3", "a4"]);
        emit("onGet", list(4).reverse());
        expect(ids(table.pageAccounts)).toEqual(["a1", "a2", "a3", "a4"]);
    });
});

describe("строка таблицы", () => {
    // Показанный пароль — состояние ячейки: по номеру места React перенёс бы его на другой аккаунт
    it("ключ строки — запись, а не место", () => {
        const React = jest.requireActual("react");
        const line = (id: string) => ({ id, cells: [], deleted: false });
        const spies = [
            jest.spyOn(React, "useState").mockImplementation(((value: unknown) => [value, jest.fn()]) as never),
            jest.spyOn(React, "useRef").mockImplementation((() => ({ current: null })) as never),
            jest.spyOn(React, "useEffect").mockImplementation((() => undefined) as never),
        ];
        const { default: Table } = require("../../../../src/globalComponents/Table/Table");
        const keys: string[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== "object") return;
            if (Array.isArray(node)) return node.forEach(walk);
            if (node.props?.line) keys.push(node.key);
            walk(node.props?.children);
        };
        walk(Table({ fields: [], fieldsTable: "steamAccounts", lines: [line("b"), line("a")] }));
        spies.forEach((spy) => spy.mockRestore());
        expect(keys).toEqual(["b", "a"]);
    });
});

describe("коды Guard", () => {
    it("копируется код на эту секунду, а не показанный; при возврате в окно коды обновляются", () => {
        const listeners: Record<string, () => void> = {};
        (globalThis as any).window.addEventListener = (name: string, listener: () => void) => { listeners[name] = listener; };
        const table = started(1);
        methods.getAuthCode.mockReturnValue("now");
        expect(table.authCodes.a1).toBe("code-secret-a1");
        expect(table.freshAuthCode("a1")).toBe("now");
        methods.getAuthCode.mockReturnValue("later");
        listeners.focus();
        expect(table.authCodes.a1).toBe("later");
    });

    it("один таймер, сколько бы списков ни пришло", () => {
        started(3);
        for (let i = 0; i < 20; i++) emit("onGet", list(3));
        jest.advanceTimersByTime(3000); // стартовая загрузка балансов
        jest.runOnlyPendingTimers();
        methods.getAuthCode.mockClear();
        jest.advanceTimersByTime(30 * 1000);
        expect(methods.getAuthCode).toHaveBeenCalledTimes(3);
        expect(jest.getTimerCount()).toBe(1);
    });

    it("обновляется на границе тридцати секунд, в том числе после сна компьютера", () => {
        const table = started(1);
        methods.getAuthCode.mockReturnValue("next");
        jest.advanceTimersByTime(19 * 1000);
        expect(table.authCodes.a1).toBe("code-secret-a1");
        jest.advanceTimersByTime(1100);
        expect(table.authCodes.a1).toBe("next");
        // Компьютер спал: часы ушли вперёд на 7 с внутрь следующего окна, таймер сработал позже
        jest.setSystemTime(new Date("2026-11-25T14:00:07.000Z"));
        jest.runOnlyPendingTimers();
        methods.getAuthCode.mockReturnValue("after sleep");
        jest.advanceTimersByTime(30 * 1000 - (Date.now() % 30000) + 100);
        expect(table.authCodes.a1).toBe("after sleep");
    });

    it("аккаунт без секрета не оставляет без кодов и статусов остальных", () => {
        methods.getAuthCode = jest.fn((secret: string) => {
            if (secret === "secret-a1") throw new Error("no secret");
            return "ok";
        });
        const table = started(3);
        expect(table.authCodes).toEqual({ a1: "", a2: "ok", a3: "ok" });
        expect(methods.getBrowserStatus.mock.calls.map(([id]) => id)).toEqual(["a1", "a2", "a3"]);
    });
});

describe("баланс", () => {
    it("сортируется по показанному значению, неизвестный в конце", () => {
        const table = started(3);
        emit("onGetChangableSecondary", { id: "a1", changableSecondary: { steam: { balance: 100, currency: "$", error: null } } });
        emit("onGetChangableSecondary", { id: "a2", changableSecondary: { steam: { balance: 50, currency: "$", error: "ETIMEDOUT" } } });
        const sort = (direction: "UP" | "DOWN") => {
            table.sortSteamAccounts((a, b) => compareBalances(table.balanceOf(a.id), table.balanceOf(b.id), direction));
            return ids(table.pageAccounts);
        };
        expect(sort("UP")).toEqual(["a1", "a3", "a2"]);
        expect(sort("DOWN")).toEqual(["a3", "a1", "a2"]);
    });
});

describe("строки", () => {
    it("тяжёлые вложенные данные не наблюдаются и не копируются", () => {
        const table = started(1);
        expect(isObservable(table.steamAccounts.a1.maFile)).toBe(false);
        expect(table.getSteamAccountsByPages()[0][0]).toBe(table.steamAccounts.a1);
    });

    it("правка меняет ту же строку, окно редактирования держит свою копию", () => {
        const table = started(1);
        const row = table.steamAccounts.a1;
        table.editingForm.open(row);
        table.editSteamAccount("a1", { password: "new" });
        expect(table.steamAccounts.a1).toBe(row);
        expect(row.password).toBe("new");
        expect(table.editingForm.getContent().steamAccount.password).toBe("p");
        table.editingForm.editSteamAccountField("password", "typed");
        expect(row.password).toBe("new");
    });
});
