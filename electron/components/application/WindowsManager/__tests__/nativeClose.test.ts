// Закрытие окна системной кнопкой (светофор macOS, кнопка заголовка Windows) не проходит
// через IPC-слушатели close*WindowListener: Electron шлёт только 'close' и 'closed'. Мок
// BrowserWindow.close() повторяет этот порядок событий, без вызова кода приложения.
import { BrowserWindow, ipcMain } from 'electron';
import WindowsManager from '../WindowsManager';
import InfoType from '../../askInfo/InfoType';
import AskSomethingChannels from '../../../../interfaces/IpcChannels/AskSomethigChannels';

const entryNames = ['MAIN', 'AUTH', 'CONFIRMATIONS', 'ASK_FAMILY_PIN', 'ERROR'];

const closeNatively = (window: BrowserWindow) => {
    const events: string[] = [];
    window.once('close', () => events.push('close'));
    window.once('closed', () => events.push('closed'));
    window.close();
    expect(events).toEqual(['close', 'closed']);
};

beforeEach(() => {
    jest.useFakeTimers();
    for (const name of entryNames) {
        (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`] = `http://localhost:3000/${name.toLowerCase()}_window`;
        (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`] = `/preload/${name}.js`;
    }
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    ipcMain.removeAllListeners();
    for (const name of entryNames) {
        delete (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`];
        delete (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`];
    }
});

it('ask window closed natively rejects the pending ask and frees askWindows[id]', async () => {
    const manager = new WindowsManager();
    const settled = manager.askSomething('account', 'name', 'familyPin' as InfoType)
        .then(value => ({ value }), error => ({ error }));
    const window = manager.askWindows.account;
    window.webContents.emit('dom-ready');
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    expect(ipcMain.listenerCount(AskSomethingChannels.ASK_WINDOW_SEND_DATA)).toBe(1);
    expect(ipcMain.listenerCount(AskSomethingChannels.ASK_WINDOW_ABORT_SENDING_DATA)).toBe(1);

    closeNatively(window);

    const outcome = await settled;
    expect(outcome).toHaveProperty('error');
    expect(outcome).not.toHaveProperty('value');
    expect(manager.askWindows).not.toHaveProperty('account');
    expect(ipcMain.listenerCount(AskSomethingChannels.ASK_WINDOW_SEND_DATA)).toBe(0);
    expect(ipcMain.listenerCount(AskSomethingChannels.ASK_WINDOW_ABORT_SENDING_DATA)).toBe(0);
});

// Системные кнопки видны сразу, ещё до загрузки страницы: вход ждёт askSomething и не должен зависнуть.
it('ask window closed natively before its page loads still rejects the pending ask and frees askWindows[id]', async () => {
    const manager = new WindowsManager();
    let outcome: unknown = 'pending';
    manager.askSomething('account', 'name', 'smsCode' as InfoType)
        .then(value => { outcome = { value }; }, error => { outcome = { error }; });
    const window = manager.askWindows.account;

    closeNatively(window);
    window.webContents.emit('dom-ready');
    jest.advanceTimersByTime(50);
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(outcome).not.toBe('pending');
    expect(outcome).toHaveProperty('error');
    expect(manager.askWindows).not.toHaveProperty('account');
    expect(ipcMain.listenerCount(AskSomethingChannels.ASK_WINDOW_SEND_DATA)).toBe(0);
    expect(ipcMain.listenerCount(AskSomethingChannels.ASK_WINDOW_ABORT_SENDING_DATA)).toBe(0);
});

it('confirmations window closed natively frees confirmationsWindows[id]', () => {
    const manager = new WindowsManager();
    manager.createConfirmationsWindow('account', 'name');
    const first = manager.confirmationsWindows.account;

    closeNatively(first);
    expect(manager.confirmationsWindows).not.toHaveProperty('account');

    // Повторное открытие создаёт новое живое окно, а не фокусирует закрытое.
    manager.createConfirmationsWindow('account', 'name');
    const second = manager.confirmationsWindows.account;
    expect(second).not.toBe(first);
    expect(second.isDestroyed()).toBe(false);
});

it('error window closed natively frees errorWindows[id]', () => {
    const manager = new WindowsManager();
    manager.createErrorWindow('title', 'message');
    const [id] = Object.keys(manager.errorWindows);
    const window = manager.errorWindows[id];

    closeNatively(window);

    expect(manager.errorWindows).not.toHaveProperty(id);
    expect(() => jest.advanceTimersByTime(50)).not.toThrow();
});
