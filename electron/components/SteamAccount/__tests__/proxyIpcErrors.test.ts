jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
import edit from "../Listeners/steamAccountEditListener";
import start from "../Listeners/steamAccountStartBrowser";
import confirm from "../Listeners/steamAccountConfirmListener";
import stop from "../Listeners/steamAccountStopBrowser";
import focus from "../Listeners/steamAccountFocusBrowser";
import { BrowserStartCancelledError } from "../Chrome/Chrome";
import steamAccountManager from "../steamAccountManager";
import SteamAccount from "../SteamAccount";
import LinksStorage from "../../newStorage/LinksStorage";

beforeEach(() => {
    steamAccountManager.objects = [];
    LinksStorage.Save({ steamAccounts: { a1: "gone" }, groups: {}, profiles: {} });
});
it.each([
    [edit, { id: "unknown", steamAccountParams: {} }],
    [start, "unknown"],
    [stop, "unknown"],
    [focus, "unknown"],
    [confirm, { id: "unknown", data: { allow: { ids: [1], keys: ["k"] }, cancel: { ids: [], keys: [] } } }]
])("F9 generic account error payload is a string (%#)", async (listener, data) => {
    const event = { reply: jest.fn() };
    await (listener as any)(event, data);
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.any(String));
});
afterEach(() => jest.restoreAllMocks());
it.each([[stop, "stop"], [focus, "focus"]] as const)("R2 F9 %s awaits asynchronous browser errors and sends a string", async (listener, method) => {
    const account = new SteamAccount({ id: "a1", maFile: {}, secondary: {} } as any);
    steamAccountManager.addNew(account);
    jest.spyOn(account.chrome, method).mockRejectedValueOnce(new Error("browser disconnected"));
    const event = { reply: jest.fn() };
    await listener(event as any, "a1");
    expect(event.reply).toHaveBeenCalledWith("ERROR", "Error: browser disconnected");
});
it.each(["superseded", "stopped", "routeChanged"] as const)("R2 N2 %s start cancellation is silent at IPC", async reason => {
    LinksStorage.Save({ steamAccounts: { a1: null }, groups: {}, profiles: {} });
    const account = new SteamAccount({ id: "a1", maFile: {}, secondary: {} } as any);
    steamAccountManager.addNew(account);
    jest.spyOn(account.chrome, "start").mockRejectedValueOnce(new BrowserStartCancelledError(reason));
    const event = { reply: jest.fn() };
    await start(event as any, "a1");
    expect(event.reply).not.toHaveBeenCalled();
});
it("F9 browser route error crosses ERROR as a string", async () => {
    steamAccountManager.addNew(new SteamAccount({ id: "a1", maFile: {}, secondary: {} } as any));
    const event = { reply: jest.fn() };
    await start(event as any, "a1");
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringContaining("ProxyUnavailableError"));
});
