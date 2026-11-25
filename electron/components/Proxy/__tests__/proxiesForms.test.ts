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
