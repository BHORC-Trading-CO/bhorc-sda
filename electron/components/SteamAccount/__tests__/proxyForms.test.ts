jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { windows: { openMiniNotification: jest.fn() } } }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
import CreationFormStore from "../../../../src/store/SteamAccountsTableStore/CreationFormStore";
import EditingFormStore from "../../../../src/store/SteamAccountsTableStore/EditingFormStore";
import store from "../../../../src/store/store";

beforeEach(() => {
    (globalThis as any).window = { Main: {
        steamAccounts: { onCreationProcessStep: jest.fn(), onCreationProcessError: jest.fn(), creationProcess: jest.fn() },
        guardConnection: { onSetupStep: jest.fn(), onSetupResult: jest.fn(), onSetupError: jest.fn(), setup: jest.fn() }
    } };
});
afterEach(() => { delete (globalThis as any).window; });
it.each(["runCreationProcess", "runGuardSetupProcess"] as const)("F5 %s blocks an empty Saved proxy selection", method => {
    const form = new CreationFormStore({} as any);
    form.editContent({ accountName: "fake", password: "fake", maFile: {} as any });
    form.editSwitches({ proxy: "savedProxy" });
    expect(form.hasValidProxySelection).toBe(false);
    form[method]();
    expect(window.Main.steamAccounts.creationProcess).not.toHaveBeenCalled();
    expect(window.Main.guardConnection.setup).not.toHaveBeenCalled();
    expect(store.windows.openMiniNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
    expect(form.currentProcess).toBe("dataFilling");
});
it.each(["noProxy", "savedProxy"] as const)("F5 %s submits an explicit mode to main", proxyMode => {
    const form = new CreationFormStore({} as any);
    form.editContent({ accountName: "fake", password: "fake", maFile: {} as any, proxy: { new: {} as any, savedId: "p1" } });
    form.editSwitches({ proxy: proxyMode });
    expect(form.hasValidProxySelection).toBe(true);
    form.runCreationProcess();
    form.runGuardSetupProcess();
    const selection = { proxyMode, proxyId: proxyMode === "savedProxy" ? "p1" : null, newProxy: null };
    expect(window.Main.steamAccounts.creationProcess).toHaveBeenCalledWith(expect.any(Object), selection);
    expect(window.Main.guardConnection.setup).toHaveBeenCalledWith(expect.any(Object), selection);
});
it.each(["gone", ""])("F8 unrelated edit retains untouched missing proxy %s without links", id => {
    const form = new EditingFormStore({} as any);
    form.open({ id: "a1", proxyState: "missing", proxyId: id, proxy: null } as any);
    form.editContent({ steamAccount: { ...form.content.steamAccount, password: "changed" } });
    expect(form.getProxyLinkChange()).toBeUndefined();
    form.editSwitches({ proxy: "noProxy" });
    expect(form.getProxyLinkChange()).toEqual({ proxyId: null });
});
it("F8 selecting a replacement proxy sends only the deliberate link change", () => {
    const form = new EditingFormStore({} as any);
    form.open({ id: "a1", proxyState: "missing", proxyId: "gone", proxy: null } as any);
    form.editContent({ proxy: { ...form.content.proxy, savedId: "p2" } });
    expect(form.getProxyLinkChange()).toEqual({ proxyId: "p2" });
});
