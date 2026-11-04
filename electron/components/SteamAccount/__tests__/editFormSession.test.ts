// Форма правки аккаунта: патч изменений живёт одну сессию окна. Обработчики настоящего TSX
// вызываются на синтетических аккаунтах; поля и кнопки замоканы и отдают свои props тесту.
// Регрессия: общий объект модуля не очищался, и отменённый пароль аккаунта A уходил в сохранение B.
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }), Trans: () => null }));
const mockUi: Record<string, any> = { inputs: {}, buttons: {} };
const mockStore: Record<string, any> = {};
jest.mock("../../../../src/store/store", () => ({
    __esModule: true,
    default: {
        get steamAccountsTable() { return mockStore.steamAccountsTable; },
        get proxiesTable() { return mockStore.proxiesTable; },
        get windows() { return mockStore.windows; },
    },
}));
jest.mock("../../../../src/pages/Main/components/MiniWindow/MiniWindow", () => ({
    __esModule: true,
    default: (props: any) => { mockUi.closeWindow = props.onClose; mockUi.content = props.content; return props.content; },
}));
jest.mock("../../../../src/globalComponents/Input/Input", () => ({
    __esModule: true,
    default: (props: any) => { mockUi.inputs[props.placeholder] = props; return null; },
}));
jest.mock("../../../../src/globalComponents/Button/Button", () => ({
    __esModule: true,
    default: (props: any) => { mockUi.buttons[props.text] = props; return null; },
}));
jest.mock("../../../../src/pages/Main/tabs/SteamAccountsTab/components/MaFileImport/MaFileImport", () => ({
    __esModule: true,
    default: (props: any) => { mockUi.maFile = props; return null; },
}));
jest.mock("../../../../src/globalComponents/Checkbox/Checkbox", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../../src/globalComponents/Navigation/Navigation", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../../src/pages/Main/tabs/SteamAccountsTab/components/ProxyBlock/CreateProxyBlock/CreateProxyBlock", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../../src/pages/Main/tabs/SteamAccountsTab/components/ProxyBlock/SavedProxiesBlock/SavedProxies", () => ({ __esModule: true, default: () => null }));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EditingFormStore from "../../../../src/store/SteamAccountsTableStore/EditingFormStore";
import SteamAccountsEditForm from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsEditForm/SteamAccountsEditForm";
import ProxiesEditingForm from "../../../../src/pages/Main/tabs/ProxiesTab/components/ProxiesEditingForm/ProxiesEditingForm";

const account = (id: string, extra: Record<string, unknown> = {}) => ({
    id, number: id === "a" ? 1 : 2, accountName: `fixture_${id}`, password: `password-${id}`,
    mail: `${id}@example.invalid`, mailPassword: `mail-password-${id}`, familyViewPin: 1234,
    maFile: { account_name: `fixture_${id}`, shared_secret: `shared-${id}` },
    useSteamCookies: true, secondary: { avatarUrl: "" }, proxyState: "none", proxyId: null, proxy: null,
    ...extra,
});
const A = account("a");
const B = account("b");
let sent: unknown[][];
let form: EditingFormStore;

function render() {
    mockUi.inputs = {};
    mockUi.buttons = {};
    renderToStaticMarkup(React.createElement(SteamAccountsEditForm));
}
const type = (placeholder: string, value: string) => { render(); mockUi.inputs[placeholder].onChange(value); };
const press = (text: string) => { render(); mockUi.buttons[text].onClick(); };
const open = (steamAccount: Record<string, unknown>) => form.open(JSON.parse(JSON.stringify(steamAccount)));

beforeEach(() => {
    sent = [];
    form = new EditingFormStore({} as any);
    mockStore.steamAccountsTable = { editingForm: form, getSteamAccounts: () => ({ a: A, b: B }), editSteamAccount: jest.fn() };
    mockStore.proxiesTable = { createNew: jest.fn(), getProxies: () => [] };
    mockStore.windows = { openMiniNotification: jest.fn() };
    // Копия аргументов: общий объект патча мутировал бы уже записанный вызов.
    (globalThis as any).window = { Main: { steamAccounts: { edit: jest.fn((...args: unknown[]) => sent.push(JSON.parse(JSON.stringify(args)))) } } };
});
afterEach(() => { delete (globalThis as any).window; });

it("cancelled edits of account A never reach the save of account B", () => {
    open(A);
    type("accounts.form.steamPassword", "cancelled-password-for-a");
    type("accounts.form.mail", "cancelled@example.invalid");
    type("accounts.form.pin", "9876");
    render();
    mockUi.maFile.onChange({ account_name: A.accountName, shared_secret: "cancelled-shared" });
    press("common.buttons.cancel");
    expect(sent).toEqual([]);

    open(B);
    type("accounts.form.mail", "b-new@example.invalid");
    press("common.buttons.saveChanges");

    expect(sent).toEqual([["b", { mail: "b-new@example.invalid" }]]);
    expect(mockStore.steamAccountsTable.editSteamAccount).toHaveBeenCalledWith("b", { mail: "b-new@example.invalid" });
});

it("closing with the cross or the overlay also discards the patch", () => {
    open(A);
    type("accounts.form.steamPassword", "cancelled-password-for-a");
    render();
    mockUi.closeWindow();
    open(B);
    press("common.buttons.saveChanges");
    expect(sent).toEqual([["b", {}]]);
});

it("a second save of the same account does not resend fields from the first save", () => {
    open(A);
    type("accounts.form.steamPassword", "first-save-password");
    press("common.buttons.saveChanges");
    open({ ...A, password: "first-save-password" });
    type("accounts.form.mailPassword", "second-save-mail-password");
    press("common.buttons.saveChanges");
    expect(sent).toEqual([
        ["a", { password: "first-save-password" }],
        ["a", { mailPassword: "second-save-mail-password" }],
    ]);
});

it("the new-proxy save path sends only the current session's changes too", () => {
    open(A);
    type("accounts.form.steamPassword", "cancelled-password-for-a");
    press("common.buttons.cancel");
    open(B);
    form.editSwitches({ proxy: "newProxy" });
    type("accounts.form.steamLogin", "fixture_b_renamed");
    press("common.buttons.saveChanges");
    expect(sent).toEqual([["b", { accountName: "fixture_b_renamed" }]]);
    expect(mockStore.proxiesTable.createNew).toHaveBeenCalledWith(expect.any(Object), { steamAccountIds: ["b"], profileIds: [] });
});

it("an invalid save keeps the session open with its changes; reopening starts clean", () => {
    open({ ...B, proxyState: "linked", proxyId: "p1" });
    form.editContent({ proxy: { ...form.content.proxy, savedId: null } });
    type("accounts.form.steamPassword", "pending-password");
    press("common.buttons.saveChanges");
    expect(sent).toEqual([]);
    expect(form.isOpen).toBe(true);
    expect(form.getChanges()).toEqual({ password: "pending-password" });
    open(A);
    expect(form.getChanges()).toEqual({});
});

it("the proxy edit window restarts its local state when it is opened for another proxy", () => {
    const proxy = (id: string) => ({ id, number: 1, host: `${id}.invalid`, port: "1", username: "u", password: "p", steamAccountIds: [] });
    for (const id of ["p1", "p2"]) {
        mockStore.proxiesTable = { isEditingFormOpen: true, getEditingFormContent: () => proxy(id), getProxies: () => [], resetEditingTestDisplay: jest.fn() };
        mockStore.steamAccountsTable = { getSteamAccounts: () => ({}) };
        mockUi.content = undefined;
        renderToStaticMarkup(React.createElement(ProxiesEditingForm));
        expect(mockUi.content.key).toBe(id);
    }
});
