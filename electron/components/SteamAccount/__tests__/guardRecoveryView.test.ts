jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("../../../../src/globalComponents/Button/Button", () => ({ __esModule: true, default: (props: any) => require("react").createElement("button", null, props.text) }));
jest.mock("react-loading-icons", () => ({ __esModule: true, default: { BallTriangle: () => null } }));
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { steamAccountsTable: { creationForm: {
    guardSetupProcessStep: "error", guardSetupProcessError: "Local save failed",
    guardSetupResult: { accountName: "fake", steamId: "76561198000000001", revocationCode: "R-TEST", proxy: "proxy.test:8080" }
} } } }));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GuardSetup from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsCreationForm/components/GuardSetup/GuardSetup";

it("F1 error screen still displays the one-time recovery code without claiming enrollment success", () => {
    const html = renderToStaticMarkup(React.createElement(GuardSetup));
    expect(html).toContain("Local save failed");
    expect(html).toContain("R-TEST");
    expect(html).toContain("guard.result.copyCode");
    expect(html).not.toContain("guard.result.title");
});
