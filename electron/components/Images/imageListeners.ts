import { app, IpcMainEvent } from 'electron';
import path from 'path';
import ImageChannels from '../../interfaces/IpcChannels/ImageChannels';
import steamAccountManager from '../SteamAccount/steamAccountManager';
import application from '../application/application';
import { onTrusted } from '../application/trustedIpc';
import { isAppUrl } from '../application/navigationGuard';
import { getAppEntries } from '../application/appEntries';
import AccountImages from './accountImages';

export default function registerImageListeners(): void {
    const images = new AccountImages(() => path.join(app.getPath('userData'), 'avatar-cache'), id => steamAccountManager.getById(id));
    application.images = images;
    const reply = (event: IpcMainEvent, channel: ImageChannels, key: { requestId: string, accountId: string, url: string | null }, dataUrl: string | null) => {
        try {
            if (isAppUrl(event.senderFrame?.url ?? '', getAppEntries())) event.reply(channel, { ...key, dataUrl });
        } catch { /* Окно могло закрыться, пока изображение было в очереди. */ }
    };
    const validRequest = (value: any) => value && typeof value.requestId === 'string' &&
        /^[a-f0-9]{32}:[0-9]{1,16}$/.test(value.requestId) && typeof value.accountId === 'string';

    onTrusted(ImageChannels.GET_AVATAR, async (event, params) => {
        if (!validRequest(params)) return;
        const key = { requestId: params.requestId, accountId: params.accountId, url: null };
        reply(event, ImageChannels.GET_AVATAR, key, await images.getAvatar(key.accountId));
    });
    onTrusted(ImageChannels.GET_CONFIRMATION_ICON, async (event, params) => {
        if (!validRequest(params) || typeof params.url !== 'string') return;
        const key = { requestId: params.requestId, accountId: params.accountId, url: params.url };
        // ID уже приходит в GET_CONFIRMATIONS_WINDOW_PARMAS; чужое окно не выбирает маршрут.
        const windows = application.windowsManager.confirmationsWindows;
        const owner = Object.prototype.hasOwnProperty.call(windows, key.accountId) ? windows[key.accountId] : undefined;
        const allowed = owner && !owner.isDestroyed() && owner.webContents === event.sender;
        reply(event, ImageChannels.GET_CONFIRMATION_ICON, key,
            allowed ? await images.getConfirmationIcon(key.accountId, key.url) : null);
    });
}
