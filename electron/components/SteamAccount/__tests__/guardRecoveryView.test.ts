jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("../../../../src/globalComponents/Button/Button", () => ({ __esModule: true, default: (props: any) => require("react").createElement("button", null, props.text) }));
// Геттер: шаг формы меняется между тестами, а фабрика мока вызывается раньше, чем объявлен mockForm.
const mockForm: Record<string, any> = {};
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { steamAccountsTable: { get creationForm() { return mockForm; } } } }));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GuardSetup from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsCreationForm/components/GuardSetup/GuardSetup";

beforeEach(() => {
    Object.assign(mockForm, {
        guardSetupProcessStep: "error", guardSetupProcessError: "Local save failed",
        guardSetupResult: { accountName: "fake", steamId: "76561198000000001", revocationCode: "R-TEST", proxy: "proxy.test:8080" },
    });
});

it("F1 error screen still displays the one-time recovery code without claiming enrollment success", () => {
    const html = renderToStaticMarkup(React.createElement(GuardSetup));
    expect(html).toContain("Local save failed");
    expect(html).toContain("R-TEST");
    expect(html).toContain("guard.result.copyCode");
    expect(html).not.toContain("guard.result.title");
});

it("a running step shows the lucide loader that always spins", () => {
    mockForm.guardSetupProcessStep = "enableTwoFactor";
    const html = renderToStaticMarkup(React.createElement(GuardSetup));
    expect(html).toContain("guard.steps.enableTwoFactor.title");
    expect(html).toMatch(/<svg[^>]*class="[^"]*lucide-loader-circle[^"]*sda-spin[^"]*account-creation_loader/);
    expect(html).toContain("guard.abort");
});
