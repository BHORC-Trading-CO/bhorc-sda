import { ipcMain } from 'electron';
import WindowsManager from '../WindowsManager/WindowsManager';
import InfoType from '../askInfo/InfoType';
import WindowsChannels from '../../../interfaces/IpcChannels/WindowsChannels';
import AskSomethingChannels from '../../../interfaces/IpcChannels/AskSomethigChannels';

const entryNames = ['MAIN', 'AUTH', 'CONFIRMATIONS', 'ASK_FAMILY_PIN', 'ERROR'];
const appUrl = 'http://localhost:3000/main_window';
const trusted = { senderFrame: { url: appUrl } };
const foreign = { senderFrame: { url: 'https://evil.test/' } };

beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    for (const name of entryNames) {
        (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`] = `http://localhost:3000/${name.toLowerCase()}_window`;
        (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`] = `/preload/${name}.js`;
    }
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    ipcMain.removeAllListeners();
    for (const name of entryNames) {
        delete (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`];
        delete (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`];
    }
});

it.each(['confirmations', 'ask', 'error'])('%s повторяет параметры после reload, но не отправляет их чужой странице', async kind => {
    const manager = new WindowsManager();
    let ready: Promise<any> | undefined;
    let window: Electron.BrowserWindow;
    let channel: string;
    if (kind === 'confirmations') {
        ready = manager.createConfirmationsWindow('account', 'name');
        window = manager.confirmationsWindows.account;
        channel = WindowsChannels.GET_CONFIRMATIONS_WINDOW_PARMAS;
    } else if (kind === 'ask') {
        ready = manager.createAskWindow('account', 'name', 'familyPin' as InfoType);
        window = manager.askWindows.account;
        channel = WindowsChannels.GET_ASK_WINDOW_PARAMS;
    } else {
        manager.createErrorWindow('title', 'message');
        window = Object.values(manager.errorWindows)[0];
        channel = WindowsChannels.GET_ERROR_WINDOW_PARAMS;
    }
    const send = window.webContents.send as jest.Mock;
    const originalUrl = window.webContents.getURL();
    window.webContents.emit('dom-ready');
    jest.advanceTimersByTime(50);
    if (ready) await expect(ready).resolves.toBe(window);
    expect(send).toHaveBeenCalledWith(channel, expect.any(Object));

    window.webContents.emit('dom-ready');
    jest.advanceTimersByTime(50);
    expect(send).toHaveBeenCalledTimes(2);

    // Адрес меняется между dom-ready и отложенной отправкой.
    window.webContents.emit('dom-ready');
    window.loadURL('https://evil.test/');
    jest.advanceTimersByTime(50);
    window.webContents.emit('dom-ready');
    jest.advanceTimersByTime(50);
    expect(send).toHaveBeenCalledTimes(2);

    window.loadURL(originalUrl);
    window.webContents.emit('dom-ready');
    jest.advanceTimersByTime(50);
    expect(send).toHaveBeenCalledTimes(3);

    window.webContents.emit('dom-ready');
    window.close();
    expect(() => jest.advanceTimersByTime(50)).not.toThrow();
    expect(send).toHaveBeenCalledTimes(3);
});

it.each(['answer', 'abort', 'close'])('askSomething снимает обёрнутые слушатели после %s', async action => {
    const manager = new WindowsManager();
    const result = manager.askSomething('account', 'name', 'familyPin' as InfoType);
    const settled = result.then(value => ({ value }), error => ({ error }));
    const window = manager.askWindows.account;
    window.webContents.emit('dom-ready');
    jest.advanceTimersByTime(50);
    await Promise.resolve();

    const answerChannel = AskSomethingChannels.ASK_WINDOW_SEND_DATA;
    const abortChannel = AskSomethingChannels.ASK_WINDOW_ABORT_SENDING_DATA;
    expect(ipcMain.listenerCount(answerChannel)).toBe(1);
    expect(ipcMain.listenerCount(abortChannel)).toBe(1);
    ipcMain.emit(answerChannel, foreign, { id: 'account', data: 'bad' });
    ipcMain.emit(abortChannel, foreign, 'account');
    ipcMain.emit(answerChannel, trusted, { id: 'another-account', data: 'bad' });
    expect(window.isDestroyed()).toBe(false);
    expect(ipcMain.listenerCount(answerChannel)).toBe(1);

    if (action === 'answer') ipcMain.emit(answerChannel, trusted, { id: 'account', data: '1234' });
    else if (action === 'abort') ipcMain.emit(abortChannel, trusted, 'account');
    else window.close();

    const outcome = await settled;
    if (action === 'answer') expect(outcome).toEqual({ value: '1234' });
    else expect(outcome).toHaveProperty('error');
    expect(ipcMain.listenerCount(answerChannel)).toBe(0);
    expect(ipcMain.listenerCount(abortChannel)).toBe(0);
});
