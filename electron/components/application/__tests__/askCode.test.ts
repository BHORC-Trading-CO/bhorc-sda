// Окна ввода кода (SDA-63): свой id у каждого запроса, закрытие с причиной, отмена процесса.
jest.mock("../application", () => {
    const WindowsManager = require("../WindowsManager/WindowsManager").default;
    return { __esModule: true, default: { windowsManager: new WindowsManager() } };
});
jest.mock("../../SteamAccount/steamAccountManager", () => ({ __esModule: true, default: { getById: () => null } }));
import { ipcMain } from "electron";
import application from "../application";
import askMailCode from "../askInfo/askMailCode";
import askFamilyPin from "../askInfo/askFamilyPin";
import AskSomethingChannels from "../../../interfaces/IpcChannels/AskSomethigChannels";
import WindowsChannels from "../../../interfaces/IpcChannels/WindowsChannels";
import { setMainLanguage } from "../../../i18n";

const entryNames = ["MAIN", "AUTH", "CONFIRMATIONS", "ASK_FAMILY_PIN", "ERROR"];
const trusted = { senderFrame: { url: "http://localhost:3000/ask_family_pin_window" } };
const windows = () => Object.values(application.windowsManager.askWindows) as any[];
const openWindow = async (window: any): Promise<string> => {
    window.webContents.emit("dom-ready");
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    const [channel, params] = window.webContents.send.mock.calls[0];
    expect(channel).toBe(WindowsChannels.GET_ASK_WINDOW_PARAMS);
    return params.id;
};

beforeAll(() => setMainLanguage("en"));
beforeEach(() => {
    jest.useFakeTimers();
    for (const name of entryNames) {
        (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`] = `http://localhost:3000/${name.toLowerCase()}_window`;
        (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`] = `/preload/${name}.js`;
    }
});
afterEach(() => {
    jest.useRealTimers();
    ipcMain.removeAllListeners();
    for (const window of windows()) window.close();
});

it("two prompts of one account do not share a code (R2-16)", async () => {
    const first = askMailCode("account", "account");
    const second = askMailCode("account", "account");
    const [a, b] = windows();
    const firstId = await openWindow(a);
    const secondId = await openWindow(b);
    expect(firstId).not.toBe(secondId);
    let secondAnswered = false;
    second.then(() => { secondAnswered = true; });
    ipcMain.emit(AskSomethingChannels.ASK_WINDOW_SEND_DATA, trusted, { id: firstId, data: "11111" });
    await expect(first).resolves.toBe("11111");
    expect(a.isDestroyed()).toBe(true);
    expect(b.isDestroyed()).toBe(false);
    expect(secondAnswered).toBe(false);
    ipcMain.emit(AskSomethingChannels.ASK_WINDOW_SEND_DATA, trusted, { id: secondId, data: "22222" });
    await expect(second).resolves.toBe("22222");
});

it.each([["before the page loads", false], ["later", true]])("a closed prompt rejects with a reason: %s (R2-15)", async (_name, loaded) => {
    const outcome = askFamilyPin("account", "account").catch(err => err);
    const [window] = windows();
    if (loaded) await openWindow(window);
    window.close();
    expect(await outcome).toEqual(new Error("Entering the Family View PIN was cancelled"));
});

it.each([["before the page loads", false], ["later", true]])("an aborted run closes its prompt: %s (R2-13)", async (_name, loaded) => {
    const run = new AbortController();
    const outcome = askMailCode("account", "account", run.signal).catch(err => err);
    const other = askMailCode("other", "other");
    other.catch(() => undefined);
    const [window, otherWindow] = windows();
    if (loaded) await openWindow(window);
    run.abort();
    expect(await outcome).toBeInstanceOf(Error);
    expect(window.isDestroyed()).toBe(true);
    expect(otherWindow.isDestroyed()).toBe(false);
});

it("an already aborted run opens no prompt", async () => {
    const run = new AbortController();
    run.abort();
    await expect(askMailCode("account", "account", run.signal)).rejects.toBeInstanceOf(Error);
    expect(windows()).toEqual([]);
});
