import fs from 'fs';
import path from 'path';
import { ipcMain } from 'electron';
import { onTrusted, onceTrusted, handleTrusted } from '../trustedIpc';
import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';
import steamAccountConfirmListener from '../../SteamAccount/Listeners/steamAccountConfirmListener';
import steamAccountManager from '../../SteamAccount/steamAccountManager';

jest.mock('../../SteamAccount/steamAccountManager', () => ({
    __esModule: true,
    default: { getById: jest.fn() },
}));

const entry = 'http://localhost:3000/main_window';
const trusted = () => ({ senderFrame: { url: entry }, reply: jest.fn() });
const foreign = () => ({ senderFrame: { url: 'https://evil.test/private' }, sender: { getURL: () => entry } });

beforeEach(() => {
    (global as any).MAIN_WINDOW_WEBPACK_ENTRY = entry;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    ipcMain.removeAllListeners();
    delete (global as any).MAIN_WINDOW_WEBPACK_ENTRY;
    jest.restoreAllMocks();
});

it.each([foreign(), {}, { senderFrame: null }, { senderFrame: { url: 'about:blank' } }, { senderFrame: { url: 'data:text/html,hello' } }])('игнорирует чужой или отсутствующий senderFrame: %j', event => {
    const handler = jest.fn();
    onTrusted('TEST', handler);
    ipcMain.emit('TEST', event, { secret: 'do-not-log' });
    expect(handler).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith('Отклонён IPC от недоверенного отправителя: TEST');
});

it('игнорирует уничтоженный фрейм', () => {
    const handler = jest.fn();
    onTrusted('TEST', handler);
    const event = { get senderFrame() { throw new Error('destroyed'); } };
    expect(() => ipcMain.emit('TEST', event)).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
});

it('передаёт исходное событие и аргументы, поддерживает повторные события и удаление', () => {
    const handler = jest.fn();
    const remove = onTrusted('TEST', handler);
    const event = trusted();
    const payload = { id: 'account' };
    ipcMain.emit('TEST', event, payload, 42);
    ipcMain.emit('TEST', event, payload, 43);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, event, payload, 42);
    expect(handler).toHaveBeenNthCalledWith(2, event, payload, 43);
    remove();
    remove();
    ipcMain.emit('TEST', event, payload);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(ipcMain.listenerCount('TEST')).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
});

it('once ждёт первое доверенное событие и удаляется до повторного входа', () => {
    const event = trusted();
    const handler = jest.fn(() => { ipcMain.emit('ONCE', event, 'again'); });
    onceTrusted('ONCE', handler);
    ipcMain.emit('ONCE', foreign(), 'bad');
    expect(ipcMain.listenerCount('ONCE')).toBe(1);
    ipcMain.emit('ONCE', event, 'good');
    ipcMain.emit('ONCE', event, 'later');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event, 'good');
    expect(ipcMain.listenerCount('ONCE')).toBe(0);
});

it('позволяет удалить once до получения события', () => {
    const handler = jest.fn();
    const remove = onceTrusted('ONCE', handler);
    remove();
    ipcMain.emit('ONCE', trusted());
    expect(handler).not.toHaveBeenCalled();
});

it('handle блокирует чужой вызов и сохраняет результат доверенного', async () => {
    const handler = jest.fn(async (_event, value) => value + 1);
    handleTrusted('INVOKE', handler);
    const listener = (ipcMain.handle as jest.Mock).mock.calls[0][1];
    expect(listener(foreign(), 10)).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
    const event = trusted();
    await expect(listener(event, 10)).resolves.toBe(11);
    expect(handler).toHaveBeenCalledWith(event, 10);
});

it('не подтверждает сделки по IPC с чужой страницы, но сохраняет штатное подтверждение', async () => {
    const account = { confirmItems: jest.fn().mockResolvedValue(undefined), cancelItems: jest.fn().mockResolvedValue(undefined) };
    (steamAccountManager.getById as jest.Mock).mockReturnValue(account);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, steamAccountConfirmListener);
    const payload = { id: 'account', data: { allow: { ids: [1], keys: ['key'] }, cancel: { ids: [], keys: [] } } };
    ipcMain.emit(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, foreign(), payload);
    expect(steamAccountManager.getById).not.toHaveBeenCalled();
    expect(account.confirmItems).not.toHaveBeenCalled();
    const event = trusted();
    ipcMain.emit(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, event, payload);
    await Promise.resolve();
    expect(account.confirmItems).toHaveBeenCalledWith([1], ['key']);
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, 'account');
});

it('в electron нет прямых регистраций ipcMain вне trustedIpc', () => {
    const root = path.resolve(__dirname, '../../..');
    const helper = path.resolve(__dirname, '../trustedIpc.ts');
    const offenders: string[] = [];
    const visit = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (/\.[jt]sx?$/.test(file) && file !== helper && /\bipcMain\s*\.\s*(?:on|once|handle)\s*\(/.test(fs.readFileSync(file, 'utf8'))) {
                offenders.push(path.relative(root, file));
            }
        }
    };
    visit(root);
    expect(offenders).toEqual([]);
});
