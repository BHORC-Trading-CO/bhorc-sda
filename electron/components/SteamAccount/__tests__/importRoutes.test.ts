// Маршрут аккаунта при импорте .smaFile (SDA-62): в main уходит ровно то, что показано в превью,
// а пропавший прокси требует явного выбора.
jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { names?: string }) => options?.names ? `${key}:${options.names}` : key }), Trans: () => null }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
const mockUi: Record<string, any> = { buttons: {}, saved: null, open: false };
// Панель выбора маршрута открывает кнопка строки (состояние компонента): в тесте она открыта сразу
jest.mock("react", () => {
    const actual = jest.requireActual("react");
    return { ...actual, useState: (initial: unknown) => mockUi.open && initial === false ? [true, () => undefined] : actual.useState(initial) };
});
const mockStore: Record<string, any> = {};
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: new Proxy({}, { get: (_target, key: string) => mockStore[key] }) }));
jest.mock("../../../../src/globalComponents/Button/Button", () => ({ __esModule: true, default: (props: any) => { mockUi.buttons[props.text ?? props.altText] = props; return null; } }));
jest.mock("../../../../src/globalComponents/Navigation/Navigation", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../../src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsCreationForm/components/ImportAccountItem/ProxyItem", () => ({
    __esModule: true, default: (props: any) => { mockUi.saved = props; return null; },
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import proxyManager from "../../Proxy/proxyManager";
import Proxy_ from "../../Proxy/Proxy";
import CreationFormStore from "../../../../src/store/SteamAccountsTableStore/CreationFormStore";
import ImportAccountItem from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsCreationForm/components/ImportAccountItem/ImportAccountItem";
import DataFilling from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsCreationForm/components/DataFilling/DataFilling";

const smaFile = (extra: Record<string, unknown> = {}) => ({
    accountName: "fixture", password: "password", maFile: {}, secondary: { nickname: "n" }, useSteamCookies: true, familyViewPin: null, ...extra,
} as any);
const PROXY = { id: "p1", number: 1, deleted: false, host: "saved.test", port: "1", username: "", password: "", steamAccounts: [] };
let form: CreationFormStore;
const load = (file: any) => form.editContent({ importedAccounts: [{ smaFile: file, proxyId: null, tempId: "t1" }] });
const item = () => renderToStaticMarkup(React.createElement(ImportAccountItem, form.getContent().importedAccounts[0]));
function choose(action: () => void) {
    mockUi.open = true;
    try { item(); } finally { mockUi.open = false; }
    action();
}

beforeEach(() => {
    const methods = new Proxy({}, { get: () => jest.fn() });
    (globalThis as any).window = { Main: { steamAccounts: Object.assign(Object.create(methods), { import: jest.fn(), onCreationProcessStep: jest.fn(), onCreationProcessError: jest.fn() }), guardConnection: methods } };
    form = new CreationFormStore({} as any);
    form.open();
    form.editSwitches({ creationType: "import" });
    mockUi.buttons = {};
    mockStore.steamAccountsTable = { creationForm: form, getSteamAccounts: () => ({}), ensurePageSizeFits: jest.fn() };
    mockStore.proxiesTable = { getProxies: () => [PROXY], ensurePageSizeFits: jest.fn() };
    mockStore.windows = { openMiniNotification: jest.fn(), prompt: jest.fn() };
});
afterEach(() => { delete (globalThis as any).window; });

function pressImport() {
    renderToStaticMarkup(React.createElement(DataFilling));
    mockUi.buttons["accounts.creation.import"].onClick();
    return (window.Main.steamAccounts.import as jest.Mock).mock.calls[0]?.[0].map((account: any) => account.links);
}

it("the preview shows the chosen proxy from the state that is sent to main (R2-5)", () => {
    load(smaFile({ proxy: { host: "embedded.test", port: "2", username: "", password: "" } }));
    expect(item()).toContain("embedded.test : 2");
    choose(() => mockUi.saved.onSelect(PROXY));
    // Раньше повторный рендер с открытой панелью снова показывал прокси из файла
    expect(item()).toContain("saved.test : 1");
    expect(item()).not.toContain("embedded.test");
    expect(pressImport()).toEqual([{ proxyId: "p1", noProxy: false }]);
});

it("an explicit No proxy replaces both the embedded and the chosen proxy", () => {
    load(smaFile({ proxy: { host: "embedded.test", port: "2", username: "", password: "" } }));
    choose(() => mockUi.saved.onSelect(PROXY));
    choose(() => mockUi.buttons["proxyBlock.noProxy"].onClick());
    expect(item()).toContain("proxyBlock.noProxy");
    expect(pressImport()).toEqual([{ proxyId: null, noProxy: true }]);
});

it("a vanished proxy blocks the import until the route is chosen (R2-6)", () => {
    load(smaFile({ proxyMissing: true }));
    expect(item()).toContain("accounts.table.proxyMissing");
    expect(pressImport()).toBeUndefined();
    expect(mockStore.windows.openMiniNotification).toHaveBeenCalledWith({ type: "error", text: "accounts.import.routeRequired:fixture" });
    expect(form.isOpen).toBe(true);
    choose(() => mockUi.buttons["proxyBlock.noProxy"].onClick());
    expect(item()).not.toContain("accounts.table.proxyMissing");
    expect(pressImport()).toEqual([{ proxyId: null, noProxy: true }]);
});

it("an ordinary file imports without a choice, as before", () => {
    load(smaFile());
    expect(pressImport()).toEqual([{ proxyId: null, noProxy: undefined }]);
});

it("the same host and port with other credentials is another proxy (R2-5)", () => {
    const setup = { host: "gate.test", port: "9000", username: "exit-a", password: "p" };
    proxyManager.objects = [new Proxy_({ id: "gate", number: 1, deleted: false, ...setup })];
    expect(proxyManager.getOrCreateBySetup({ ...setup, port: "9000" }).params.id).toBe("gate");
    const other = proxyManager.getOrCreateBySetup({ ...setup, username: "exit-b" });
    expect(other.params).toMatchObject({ host: "gate.test", username: "exit-b" });
    expect(other.params.id).not.toBe("gate");
    expect(proxyManager.getOrCreateBySetup({ ...setup, password: "other" }).params.id).not.toBe("gate");
    // Записи без логина и пароля (старые) совпадают с пустыми
    proxyManager.objects = [new Proxy_({ id: "open", number: 1, deleted: false, host: "open.test", port: "1" } as any)];
    expect(proxyManager.getOrCreateBySetup({ host: "open.test", port: "1", username: "", password: "" }).params.id).toBe("open");
});
