jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: {} }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
import SteamAccountsTableStore from "../../../../src/store/SteamAccountsTableStore/SteamAccountsTableStore";

it("R2 N2 route-change IPC opens a non-blocking notification without alert", () => {
    const methods: Record<string, jest.Mock> = {};
    const api = new Proxy({}, { get: (_target, key: string) => methods[key] ||= jest.fn() });
    (globalThis as any).window = { Main: { steamAccounts: api, guardConnection: api } };
    (globalThis as any).alert = jest.fn();
    try {
        const openMiniNotification = jest.fn();
        new SteamAccountsTableStore({ windows: { openMiniNotification } } as any);
        const listener = methods.onBrowserRouteChanged.mock.calls[0][0];
        listener({}, "localized route-change notice");
        expect(openMiniNotification).toHaveBeenCalledTimes(1);
        expect(openMiniNotification).toHaveBeenCalledWith({ type: "info", text: "localized route-change notice" });
        expect(alert).not.toHaveBeenCalled();
    } finally {
        delete (globalThis as any).window;
        delete (globalThis as any).alert;
    }
});
