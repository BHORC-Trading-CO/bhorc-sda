// SDA-65: номер после восстановления, счётчик группы, чтения config.json на один список
jest.mock("../../application/application", () => ({ __esModule: true, default: {
    sendToMain: jest.fn(), images: { invalidateRoute: jest.fn(), pruneOrphans: jest.fn().mockResolvedValue(undefined), removeAccount: jest.fn().mockResolvedValue(undefined) }
} }));
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import LinksStorage from "../../newStorage/LinksStorage";
import Manager from "../../Manager/Manager";
import SteamAccount from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import application from "../../application/application";
import GroupChannels from "../../../interfaces/IpcChannels/GroupChannels";
import deleteListener from "../Listeners/steamAccountDeleteListener";
import editListener from "../Listeners/steamAccountEditListener";

const add = (id: string, number: number, deleted = false) => {
    const params = { id, number, accountName: id, password: "x", deleted, maFile: { shared_secret: "c2VjcmV0" }, secondary: { nickname: "n" }, changableSecondary: { steam: { balance: 0, currency: "$", error: null } } } as any;
    SteamAccountStorage.Save(id, params);
    const account = new SteamAccount(params);
    steamAccountManager.objects = [...steamAccountManager.objects, account];
    return account;
};
const event = { reply: jest.fn() } as unknown as Electron.IpcMainEvent;
beforeEach(() => {
    new (require("electron-store"))().clear();
    LinksStorage.Save({ steamAccounts: {}, profiles: {}, groups: {} });
    steamAccountManager.objects = [];
    (application.sendToMain as jest.Mock).mockClear();
});
afterEach(() => jest.restoreAllMocks());

it("занятый номер восстановленного аккаунта меняется на свободный, свободный остаётся", async () => {
    add("active", 7);
    const taken = add("taken", 7, true);
    const free = add("free", 3, true);
    add("other archived", 3, true);
    await editListener(event, { id: "taken", steamAccountParams: { deleted: false } });
    await editListener(event, { id: "free", steamAccountParams: { deleted: false } });
    expect(taken.params.number).toBe(8);
    expect((SteamAccountStorage.GetById("taken") as any).number).toBe(8);
    expect(free.params.number).toBe(3);
});

it("новый номер виден и на вкладке прокси", async () => {
    add("active", 7);
    add("taken", 7, true);
    await editListener(event, { id: "taken", steamAccountParams: { deleted: false } });
    expect((application.sendToMain as jest.Mock).mock.calls.map(([channel]) => channel)).toContain("GET_PROXIES");
});

it("восстановление с удалённым прокси не сохраняется наполовину", async () => {
    add("active", 7);
    const taken = add("taken", 7, true);
    const e = { reply: jest.fn() } as any;
    await editListener(e, { id: "taken", steamAccountParams: { deleted: false }, links: { proxyId: "gone", profileId: null } });
    expect(e.reply).toHaveBeenCalledWith("ERROR", expect.any(String));
    expect(taken.params).toMatchObject({ deleted: true, number: 7 });
    expect(SteamAccountStorage.GetById("taken")).toMatchObject({ deleted: true, number: 7 });
});

it("после удаления аккаунта счётчики групп приходят заново", async () => {
    add("a1", 1);
    await deleteListener(event, "a1");
    expect((application.sendToMain as jest.Mock).mock.calls.map(([channel]) => channel)).toContain(GroupChannels.GET_GROUPS);
});

it("счётчик группы не считает удалённые навсегда аккаунты", () => {
    add("a1", 1);
    LinksStorage.Save({ steamAccounts: {}, profiles: {}, groups: { a1: "g", gone: "g" } });
    expect(Manager.GetGroupSteamAccountIds("g")).toEqual(["a1"]);
});

it("список аккаунтов читает связи один раз, сколько бы аккаунтов ни было", () => {
    for (let i = 0; i < 20; i++) add(`a${i}`, i + 1);
    const get = jest.spyOn(LinksStorage, "Get");
    expect(steamAccountManager.getCompiledObjects()).toHaveLength(20);
    expect(get).toHaveBeenCalledTimes(1);
});
