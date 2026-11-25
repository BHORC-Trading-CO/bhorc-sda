// SDA-64: окна страницы Proxies. Кнопки замоканы и отдают свои props тесту.
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: object) => options ? `${key}|${JSON.stringify(options)}` : key }), Trans: () => null }));
const mockUi: { buttons: Record<string, any> } = { buttons: {} };
const mockStore: Record<string, any> = {};
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: {
    get proxiesTable() { return mockStore.proxiesTable; },
    get steamAccountsTable() { return { getSteamAccounts: () => ({}) }; },
    get windows() { return mockStore.windows; },
} }));
jest.mock("../../../../src/pages/Main/components/MiniWindow/MiniWindow", () => ({ __esModule: true, default: (props: any) => props.content }));
jest.mock("../../../../src/globalComponents/Button/Button", () => ({ __esModule: true, default: (props: any) => { mockUi.buttons[props.text] = props; return null; } }));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkRejected } from "../../../../src/pages/Main/tabs/ProxiesTab/components/ProxiesBulkForm/ProxiesBulkForm";
import { ProxyTestButton } from "../../../../src/pages/Main/tabs/ProxiesTab/components/ProxyActionButton";
import ProxiesFooter from "../../../../src/pages/Main/tabs/ProxiesTab/components/ProxiesFooter";
import ProxiesEditingForm from "../../../../src/pages/Main/tabs/ProxiesTab/components/ProxiesEditingForm/ProxiesEditingForm";

const content = { id: "p1", number: 1, host: "host.test", port: "80", username: "u", password: "p:x", steamAccountIds: ["a1"] };
function renderEditing(extra: Record<string, unknown> = {}, proxy = content) {
    mockStore.proxiesTable = {
        isEditingFormOpen: true, getEditingFormContent: () => proxy, editError: null, isSavingEdit: false,
        saveEditing: jest.fn(), closeEditingForm: jest.fn(), setEditError: jest.fn(), resetEditingTestDisplay: jest.fn(), ...extra,
    };
    return renderToStaticMarkup(React.createElement(ProxiesEditingForm));
}

it("Save sends the edit and leaves the window open for the reply", () => {
    renderEditing();
    mockUi.buttons["common.buttons.save"].onClick();
    expect(mockStore.proxiesTable.saveEditing).toHaveBeenCalledWith(
        { host: "host.test", port: "80", username: "u", password: "p:x" },
        { steamAccountIds: ["a1"], originalSteamAccountIds: ["a1"] },
    );
    expect(mockStore.proxiesTable.closeEditingForm).not.toHaveBeenCalled();
});

it("an incomplete proxy is reported in the form instead of a silent no-op", () => {
    renderEditing({}, { ...content, port: "" });
    mockUi.buttons["common.buttons.save"].onClick();
    expect(mockStore.proxiesTable.saveEditing).not.toHaveBeenCalled();
    expect(mockStore.proxiesTable.setEditError).toHaveBeenCalledWith("proxies.reject.address");
});

it("a proxy without a login can be saved; the field shows a string that reads back as the same proxy", () => {
    expect(renderEditing({}, { ...content, username: "", password: "" })).toContain('value="host.test:80"');
    mockUi.buttons["common.buttons.save"].onClick();
    expect(mockStore.proxiesTable.saveEditing).toHaveBeenCalledWith(expect.objectContaining({ host: "host.test", username: "", password: "" }), expect.any(Object));
    expect(renderEditing({}, { ...content, username: "my.login", password: "1234:x" })).toContain('value="http://my.login:1234%3Ax@host.test:80"');
});

it("the list import says why lines were rejected", () => {
    const html = renderToStaticMarkup(React.createElement(BulkRejected, { reasons: ["scheme", "address", "scheme"] }));
    expect(html).toContain('proxies.bulk.rejected|{&quot;count&quot;:3}');
    expect(html).toContain("<li>proxies.reject.scheme: 2</li><li>proxies.reject.address: 1</li>");
    expect(renderToStaticMarkup(React.createElement(BulkRejected, { reasons: [] }))).toBe("");
});

it("shows the refusal and the saving state", () => {
    expect(renderEditing({ editError: "bad port", isSavingEdit: true })).toMatch(/role="alert"[^>]*>bad port</);
    expect(mockUi.buttons["common.buttons.save"].isLoad).toBe(true);
});

it("the archive prompt and the archive itself use the rows that are selected on screen", () => {
    const selected = [{ id: "p2", number: 2 }];
    const prompt = jest.fn();
    mockStore.windows = { prompt };
    mockStore.proxiesTable = {
        getVisibleProxies: () => selected, getProxiesByPages: () => [selected], getSelectedProxies: () => selected,
        // Выделен и скрытый поиском прокси: в действие он не попадает.
        getProxies: () => [{ id: "p1", number: 1, isSelected: true }, { id: "p2", number: 2, isSelected: true }],
        pageSize: 10, currentPage: 1, editProxyInStorage: jest.fn(),
    };
    const html = renderToStaticMarkup(React.createElement(ProxiesFooter));
    expect(html).toMatch(/footer__info">1</);
    mockUi.buttons["common.buttons.delete"].onClick();
    expect(prompt.mock.calls[0][0].title).toBe('proxies.archiveSelected.title|{"count":1}');
    prompt.mock.calls[0][0].cb();
    expect(mockStore.proxiesTable.editProxyInStorage.mock.calls).toEqual([["p2", { deleted: true }, { steamAccountIds: [] }]]);
});

it.each([
    [{ isTesting: true, isWorking: true }, "pending", "proxies.test.pending", ""],
    [{ isTesting: false }, "idle", "proxies.test.untested", ""],
    [{ isTesting: false, isWorking: true }, "success", "proxies.test.ok", ""],
    [{ isTesting: false, isWorking: true, failure: { statusCode: 429 } }, "warning", 'proxies.test.steamCode|{"code":429}', 'proxies.test.steamHint|{"code":429}'],
    [{ isTesting: false, isWorking: false, failure: { error: "ECONNREFUSED" } }, "danger", "proxies.test.failed", "ECONNREFUSED"],
])("test badge %j is %s", (props, state, status, hint) => {
    const html = renderToStaticMarkup(React.createElement(ProxyTestButton, { ...props, onClick: () => undefined })).replace(/&quot;/g, '"');
    expect(html).toContain(`proxy-test-control--${state}"`);
    expect(html).toContain(`>${status}</span>`);
    expect(html.includes(' title="' + hint + '">' + status)).toBe(hint !== "");
});
