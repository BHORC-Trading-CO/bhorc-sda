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
jest.mock("../steamAccountManager", () => ({ __esModule: true, default: { objects: [], sendAccountsToFront: jest.fn() } }));

import { ipcMain, ipcRenderer } from "electron";
import mainBridge from "../../../bridges/mainBridge";
import application from "../../application/application";
import SuperMethods from "../../SuperMethods/SuperMethods";
import createListener from "../Listeners/steamAccountCreateProcessListener";
import guardListener from "../Listeners/guardSetupProcessListener";
import maFileLogin from "../Processes/maFileLogin";
import setupGuard from "../Processes/setupGuard";
import steamAccountImport from "../Processes/steamAccountImport";
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
        onRecovery("R-TEST", "76561198000000001");
        throw new Error("prompt closed");
    });
    const event = { reply: jest.fn() };
    await guardListener(event as any, params());
    expect(steamAccountImport).not.toHaveBeenCalled();
    expect(event.reply).not.toHaveBeenCalled();
    expect(sentTo("ERROR")).toEqual([expect.stringMatching(/fake.*R-TEST.*pending_authenticators.*prompt closed/)]);
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
