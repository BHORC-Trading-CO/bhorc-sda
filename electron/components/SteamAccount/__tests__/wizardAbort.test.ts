// Отмена мастеров (SDA-63): окно и main говорят по одному каналу, отменённый запуск ничего не сохраняет
// и молчит, слушатель не остаётся после завершения.
jest.mock("electron", () => {
    const electron = jest.requireActual("../../../../__mocks__/electron");
    return { ...electron, ipcRenderer: { on: jest.fn(), send: jest.fn(), sendSync: jest.fn(), invoke: jest.fn() } };
});
jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
jest.mock("../../SuperMethods/SuperMethods", () => ({ __esModule: true, default: { Sleep: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../Processes/maFileLogin", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../Processes/setupGuard", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../Processes/steamAccountImport", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../steamAccountManager", () => ({ __esModule: true, default: { objects: [], sendAccountsToFront: jest.fn(), getById: jest.fn() } }));

import { ipcMain, ipcRenderer } from "electron";
import mainBridge from "../../../bridges/mainBridge";
import application from "../../application/application";
import SuperMethods from "../../SuperMethods/SuperMethods";
import createListener from "../Listeners/steamAccountCreateProcessListener";
import guardListener from "../Listeners/guardSetupProcessListener";
import maFileLogin from "../Processes/maFileLogin";
import setupGuard from "../Processes/setupGuard";
import steamAccountImport from "../Processes/steamAccountImport";
import steamAccountManager from "../steamAccountManager";
import { unknownOutcome } from "../Functions/guardOutcome";
import proxyManager from "../../Proxy/proxyManager";
import ProxyStorage from "../../newStorage/ProxyStorage";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { setMainLanguage } from "../../../i18n";

const entry = "http://localhost:3000/main_window";
const sendToMain = application.sendToMain as jest.Mock;
const sentTo = (channel: string) => sendToMain.mock.calls.filter(([name]) => name === channel).map(([, content]) => content);
const file = () => ({ accountName: "fake", password: "fake", maFile: { revocation_code: "R-TEST", Session: { SteamID: "76561198000000001" } }, secondary: {} } as any);
const noProxy = { proxyMode: "noProxy", proxyId: null, newProxy: null };
const params = (links: any = noProxy) => ({ steamAccount: {}, accountName: "fake", password: "fake", links } as any);
// Кнопка «Прервать»: настоящий мост шлёт в канал, который слушает настоящий main
function pressAbort(press: () => void) {
    (ipcRenderer.send as jest.Mock).mockClear();
    press();
    const [channel] = (ipcRenderer.send as jest.Mock).mock.calls[0];
    ipcMain.emit(channel, { senderFrame: { url: entry } });
}
const abortCreation = () => pressAbort(() => mainBridge.steamAccounts.abortCreation());
const abortSetup = () => pressAbort(() => mainBridge.guardConnection.abortSetup());
const listeners = () => ipcMain.listenerCount(SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_ABORT)
    + ipcMain.listenerCount(SteamAccountChannels.GUARD_SETUP_PROCESS_ABORT);

beforeAll(() => { (global as any).MAIN_WINDOW_WEBPACK_ENTRY = entry; setMainLanguage("en"); });
afterAll(() => { delete (global as any).MAIN_WINDOW_WEBPACK_ENTRY; });
beforeEach(() => {
    for (const fn of [maFileLogin, setupGuard, steamAccountImport]) (fn as jest.Mock).mockReset();
    (steamAccountImport as jest.Mock).mockReturnValue({ id: "new-account" });
    proxyManager.objects = [];
});
afterEach(() => expect(listeners()).toBe(0));

it.each([["account", createListener, abortCreation, maFileLogin], ["Guard", guardListener, abortSetup, setupGuard]])("%s wizard: an abort in the first seconds is heard", async (_name, listener, abort, flow) => {
    (SuperMethods.Sleep as jest.Mock).mockImplementationOnce(async () => abort());
    const event = { reply: jest.fn() };
    await listener(event as any, params());
    expect(flow).not.toHaveBeenCalled();
    expect(steamAccountImport).not.toHaveBeenCalled();
    expect(event.reply).not.toHaveBeenCalled();
});

it("account wizard: an abort during the login saves nothing, even if the login still succeeds", async () => {
    const save = jest.spyOn(ProxyStorage, "Save");
    (maFileLogin as jest.Mock).mockImplementationOnce(async (_params, options) => {
        abortCreation();
        expect(options.signal.aborted).toBe(true);
        sendToMain.mockClear();
        return file();
    });
    const event = { reply: jest.fn() };
    await createListener(event as any, params({ proxyMode: "newProxy", proxyId: null, newProxy: { host: "new.test", port: "1", username: "", password: "" } }));
    expect(steamAccountImport).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(proxyManager.objects).toEqual([]);
    expect(sendToMain).not.toHaveBeenCalled();
    expect(event.reply).not.toHaveBeenCalled();
});

it("account wizard: an aborted run stays silent while the next one works", async () => {
    let finishFirst!: (err: unknown) => void;
    (maFileLogin as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => { finishFirst = reject; })).mockResolvedValueOnce(file());
    const first = { reply: jest.fn() };
    const firstRun = createListener(first as any, params());
    while (!finishFirst) await Promise.resolve();
    abortCreation();
    const second = { reply: jest.fn() };
    await createListener(second as any, params());
    finishFirst(new Error("late failure"));
    await firstRun;
    expect(first.reply).not.toHaveBeenCalled();
    expect(steamAccountImport).toHaveBeenCalledTimes(1);
    expect(sentTo(SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_STEP)).toEqual(["start", "start", "import", "link", "end"]);
});

it("Guard wizard: a failure without an abort is reported as before", async () => {
    (setupGuard as jest.Mock).mockRejectedValueOnce(new Error("sign-in failed"));
    const event = { reply: jest.fn() };
    await guardListener(event as any, params());
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, expect.stringContaining("sign-in failed"));
});

it("Guard wizard: an abort after Steam issued the secrets still shows the revocation code", async () => {
    (setupGuard as jest.Mock).mockImplementationOnce(async (_params, _proxy, onRecovery, signal) => {
        abortSetup();
        expect(signal.aborted).toBe(true);
        onRecovery("R-TEST", "76561198000000001", "/data/pending_authenticators/fake.json");
        throw new Error("prompt closed");
    });
    const event = { reply: jest.fn() };
    await guardListener(event as any, params());
    expect(steamAccountImport).not.toHaveBeenCalled();
    expect(event.reply).not.toHaveBeenCalled();
    expect(sentTo("ERROR")).toEqual([expect.stringMatching(/aborted.*prompt closed.*R-TEST.*saved in \/data\/pending_authenticators\/fake\.json/)]);
    // Мастер отменённого запуска закрыт: его итог не должен попасть в следующий
    expect(sentTo(SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT)).toEqual([]);
});

it("Guard wizard: a late abort does not drop an account that is already connected", async () => {
    (setupGuard as jest.Mock).mockImplementationOnce(async (_params, _proxy, onRecovery) => {
        onRecovery("R-TEST", "76561198000000001");
        abortSetup();
        return file();
    });
    await guardListener({ reply: jest.fn() } as any, params());
    expect(steamAccountImport).toHaveBeenCalledTimes(1);
    expect(sentTo("ERROR")).toEqual([expect.stringMatching(/Too late to abort.*fake.*R-TEST/)]);
});

it("Guard wizard: an abort before any secrets is silent", async () => {
    (setupGuard as jest.Mock).mockImplementationOnce(async () => { abortSetup(); throw "abort"; });
    const event = { reply: jest.fn() };
    await guardListener(event as any, params());
    expect(event.reply).not.toHaveBeenCalled();
    expect(sentTo("ERROR")).toEqual([]);
});

// V62-5: потерянный ответ Steam — не «ошибка подключения» и не тишина после отмены
describe("Guard wizard: a lost answer", () => {
    const lost = () => unknownOutcome(new Error("socket hang up"));
    it("after an abort, before any secrets: the operator is told that Guard may be enabled", async () => {
        (setupGuard as jest.Mock).mockImplementationOnce(async () => { abortSetup(); throw lost(); });
        await guardListener({ reply: jest.fn() } as any, params());
        expect(sentTo("ERROR")).toEqual([expect.stringMatching(/socket hang up.*may already be enabled on fake/)]);
        expect(sentTo("ERROR")[0]).not.toMatch(/Revocation code|saved/);
    });
    it.each([
        ["/data/fake.json", /R-TEST.*saved in \/data\/fake\.json/],
        [null, /R-TEST.*could not be saved to disk/],
    ])("after the secrets (backup %s): the code and the real state of the backup", async (backupFile, expected) => {
        (setupGuard as jest.Mock).mockImplementation(async (_params, _proxy, onRecovery) => {
            onRecovery("R-TEST", "76561198000000001", backupFile);
            throw lost();
        });
        const event = { reply: jest.fn() };
        await guardListener(event as any, params());
        expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, expect.stringMatching(/may already be enabled/));
        expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, expect.stringMatching(expected));
        if (!backupFile) expect(event.reply.mock.calls[0][1]).not.toMatch(/saved in/);
    });
});

it.each([["told in the wizard", false], ["told after an abort", true]])("Guard wizard: a connected account that could not be saved is not called aborted: %s", async (_name, abort) => {
    (setupGuard as jest.Mock).mockImplementationOnce(async (_params, _proxy, onRecovery) => {
        onRecovery("R-TEST", "76561198000000001", "/data/fake.json");
        if (abort) abortSetup();
        return file();
    });
    (steamAccountImport as jest.Mock).mockImplementationOnce(() => { throw new Error("disk full"); });
    const event = { reply: jest.fn() };
    await guardListener(event as any, params());
    const [text] = abort ? sentTo("ERROR") : event.reply.mock.calls.map(([, content]) => content);
    expect(text).toMatch(/connected to fake, but the account could not be saved here.*disk full.*R-TEST.*saved in \/data\/fake\.json/);
});

it("Guard wizard: the profile is loaded after the save, and the list is sent again", async () => {
    (setupGuard as jest.Mock).mockResolvedValueOnce(file());
    const getSecondary = jest.fn().mockResolvedValue({});
    (steamAccountManager.getById as jest.Mock).mockReturnValueOnce({ getSecondary });
    await guardListener({ reply: jest.fn() } as any, params());
    await Promise.resolve();
    expect(steamAccountManager.getById).toHaveBeenCalledWith("new-account");
    expect(getSecondary).toHaveBeenCalledTimes(1);
    expect(steamAccountManager.sendAccountsToFront).toHaveBeenCalledTimes(2);
});
