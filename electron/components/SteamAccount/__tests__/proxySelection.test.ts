jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
jest.mock("../../SuperMethods/SuperMethods", () => ({ __esModule: true, default: { Sleep: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../Processes/maFileLogin", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../Processes/setupGuard", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../Processes/steamAccountImport", () => ({ __esModule: true, default: jest.fn() }));

import createListener from "../Listeners/steamAccountCreateProcessListener";
import guardListener from "../Listeners/guardSetupProcessListener";
import importListener from "../Listeners/steamAccountImportListener";
import maFileLogin from "../Processes/maFileLogin";
import setupGuard from "../Processes/setupGuard";
import steamAccountImport from "../Processes/steamAccountImport";
import proxyManager from "../../Proxy/proxyManager";
import Proxy from "../../Proxy/Proxy";
import { setMainLanguage } from "../../../i18n";

beforeEach(() => { proxyManager.objects = []; setMainLanguage("en"); });
it.each([createListener, guardListener])("form with stale proxy rejects before starting flow %#", async listener => {
    const event = { reply: jest.fn() };
    await listener(event as any, { steamAccount: {}, accountName: "fake", password: "fake", links: { proxyMode: "savedProxy", proxyId: "gone", newProxy: null } } as any);
    expect(event.reply).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("Proxy #gone is unavailable"));
    expect(maFileLogin).not.toHaveBeenCalled();
    expect(setupGuard).not.toHaveBeenCalled();
    expect(steamAccountImport).not.toHaveBeenCalled();
});
it.each([createListener, guardListener])("form with incomplete proxy rejects before starting flow %#", async listener => {
    proxyManager.objects = [new Proxy({ id: "bad", host: "", port: "8080" } as any)];
    const event = { reply: jest.fn() };
    await listener(event as any, { steamAccount: {}, accountName: "fake", password: "fake", links: { proxyMode: "savedProxy", proxyId: "bad", newProxy: null } } as any);
    expect(event.reply).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("Proxy #bad is unavailable"));
    expect(maFileLogin).not.toHaveBeenCalled();
    expect(setupGuard).not.toHaveBeenCalled();
});
it("import with a stale selection does not leave a direct account behind", () => {
    const event = { reply: jest.fn() };
    importListener(event as any, [{ smaFile: { accountName: "fake", password: "fake", maFile: {}, secondary: {} }, links: { proxyMode: "savedProxy", proxyId: "gone", newProxy: null } }] as any);
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringContaining("Proxy #gone is unavailable"));
    expect(steamAccountImport).not.toHaveBeenCalled();
});
it.each([createListener, guardListener])("F5 main rejects empty Saved proxy and ambiguous legacy selection %#", async listener => {
    for (const links of [{ proxyMode: "savedProxy", proxyId: null, newProxy: null }, { proxyId: null, newProxy: null }]) {
        const event = { reply: jest.fn() };
        await listener(event as any, { steamAccount: {}, accountName: "fake", password: "fake", links } as any);
        expect(event.reply).toHaveBeenCalledWith(expect.any(String), expect.any(String));
    }
    expect(maFileLogin).not.toHaveBeenCalled();
    expect(setupGuard).not.toHaveBeenCalled();
});
