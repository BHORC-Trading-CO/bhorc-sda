jest.mock('../../SteamAccount/steamAccountManager', () => ({ __esModule: true, default: { getById: jest.fn() } }));
jest.mock('../../application/application', () => ({ __esModule: true, default: { windowsManager: { confirmationsWindows: {} } } }));
jest.mock('../accountImages', () => ({ __esModule: true, default: jest.fn() }));

import { ipcMain } from 'electron';
import AccountImages from '../accountImages';
import application from '../../application/application';
import registerImageListeners from '../imageListeners';
import ImageChannels from '../../../interfaces/IpcChannels/ImageChannels';

const entry = 'file:///app/.webpack/renderer/main_window/index.html';
const confirmationEntry = 'file:///app/.webpack/renderer/confirmations_window/index.html';
const dataUrl = 'data:image/jpeg;base64,/9j/';
const requestId = 'a'.repeat(32) + ':1';
let images: { getAvatar: jest.Mock, getConfirmationIcon: jest.Mock };
let sender: object;
const event = (url = entry, source = sender) => ({ senderFrame: { url }, sender: source, reply: jest.fn() });
const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
    (global as any).MAIN_WINDOW_WEBPACK_ENTRY = entry;
    images = { getAvatar: jest.fn().mockResolvedValue(dataUrl), getConfirmationIcon: jest.fn().mockResolvedValue(dataUrl) };
    (AccountImages as jest.Mock).mockImplementation(() => images);
    sender = {};
    application.windowsManager.confirmationsWindows = { account: { webContents: sender, isDestroyed: () => false } } as any;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    registerImageListeners();
});
afterEach(() => { ipcMain.removeAllListeners(); delete (global as any).MAIN_WINDOW_WEBPACK_ENTRY; jest.restoreAllMocks(); });

it('trusted avatar request supplies only the account ID to main', async () => {
    const request = event();
    ipcMain.emit(ImageChannels.GET_AVATAR, request, { requestId, accountId: 'account', url: 'https://evil.test/' });
    await flush();
    expect(images.getAvatar).toHaveBeenCalledWith('account');
    expect(request.reply).toHaveBeenCalledWith(ImageChannels.GET_AVATAR, { requestId, accountId: 'account', url: null, dataUrl });
    expect(application.images).toBe(images);
});

it.each([ImageChannels.GET_AVATAR, ImageChannels.GET_CONFIRMATION_ICON])('untrusted sender cannot use %s', async channel => {
    ipcMain.emit(channel, event('https://evil.test/'), { requestId, accountId: 'account', url: 'https://evil.test/' });
    await flush();
    expect(images.getAvatar).not.toHaveBeenCalled();
    expect(images.getConfirmationIcon).not.toHaveBeenCalled();
});

it('confirmation icon uses its owning window account', async () => {
    const request = event(confirmationEntry);
    ipcMain.emit(ImageChannels.GET_CONFIRMATION_ICON, request, { requestId, accountId: 'account', url: 'icon-url' });
    await flush();
    expect(images.getConfirmationIcon).toHaveBeenCalledWith('account', 'icon-url');
    expect(request.reply).toHaveBeenCalledWith(ImageChannels.GET_CONFIRMATION_ICON, { requestId, accountId: 'account', url: 'icon-url', dataUrl });
});

it.each(['different-account', 'account', '__proto__', 'constructor'])('rejects wrong account/window pairing (%s)', async accountId => {
    const request = event(confirmationEntry, {});
    ipcMain.emit(ImageChannels.GET_CONFIRMATION_ICON, request, { requestId, accountId, url: 'icon-url' });
    await flush();
    expect(images.getConfirmationIcon).not.toHaveBeenCalled();
    expect(request.reply).toHaveBeenCalledWith(ImageChannels.GET_CONFIRMATION_ICON, { requestId, accountId, url: 'icon-url', dataUrl: null });
});

it.each([null, {}, { requestId: {}, accountId: 'account' }, { requestId: '1', accountId: 'account' }, { requestId, accountId: {} }])('ignores malformed request %j', async params => {
    ipcMain.emit(ImageChannels.GET_AVATAR, event(), params);
    await flush();
    expect(images.getAvatar).not.toHaveBeenCalled();
});

it('does not reply into a frame that navigated while the request was pending', async () => {
    const request = event();
    ipcMain.emit(ImageChannels.GET_AVATAR, request, { requestId, accountId: 'account' });
    request.senderFrame.url = 'https://evil.test/';
    await flush();
    expect(request.reply).not.toHaveBeenCalled();
});
