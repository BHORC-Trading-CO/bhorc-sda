jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
import Store from "electron-store";
import SteamAccountStorage from "../SteamAccountStorage";
import LinksStorage from "../LinksStorage";
import steamAccountImport from "../../SteamAccount/Processes/steamAccountImport";
import steamAccountManager from "../../SteamAccount/steamAccountManager";
import SteamAccount from "../../SteamAccount/SteamAccount";

beforeEach(() => { new Store().clear(); steamAccountManager.objects = []; });
it("R2 N6 the default store mock preserves the atomic import and dangling route across instances", () => {
    const saved = steamAccountImport({ accountName: "fake", password: "fake", maFile: {}, secondary: {} } as any, "gone");
    const stored = SteamAccountStorage.GetById(saved.id);
    expect(LinksStorage.Get().steamAccounts[saved.id]).toBe("gone");
    expect(new Store().get(`steamAccounts.${saved.id}`)).toEqual(stored);
    expect(new SteamAccount(stored).proxyState).toBe("missing");
    expect(steamAccountManager.getById(saved.id)?.proxyState).toBe("missing");
    expect(new Store().get("[object Object]")).toBeUndefined();
});
it("R2 N6 mock delete and clear update every instance of the same store", () => {
    const first = new Store();
    const second = new Store();
    first.set({ "steamAccounts.a1": { id: "a1" }, "links.steamAccounts.a1": "gone" });
    second.delete("steamAccounts.a1");
    expect(first.has("steamAccounts.a1")).toBe(false);
    expect(first.get("links.steamAccounts.a1")).toBe("gone");
    second.clear();
    expect(first.get("links")).toBeUndefined();
});
