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
    expect(mockStore.proxiesTable.setEditError).toHaveBeenCalledWith("proxies.creation.incomplete");
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
