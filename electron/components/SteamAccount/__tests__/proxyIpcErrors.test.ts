jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
import edit from "../Listeners/steamAccountEditListener";
import start from "../Listeners/steamAccountStartBrowser";
import confirm from "../Listeners/steamAccountConfirmListener";
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
    [confirm, { id: "unknown", data: { allow: { ids: [1], keys: ["k"] }, cancel: { ids: [], keys: [] } } }]
])("F9 generic account error payload is a string (%#)", async (listener, data) => {
    const event = { reply: jest.fn() };
    await (listener as any)(event, data);
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.any(String));
});
it("F9 browser route error crosses ERROR as a string", async () => {
    steamAccountManager.addNew(new SteamAccount({ id: "a1", maFile: {}, secondary: {} } as any));
    const event = { reply: jest.fn() };
    await start(event as any, "a1");
    expect(event.reply).toHaveBeenCalledWith("ERROR", expect.stringContaining("ProxyUnavailableError"));
});
