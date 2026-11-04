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
    const reply = (event: IpcMainEvent, channel: ImageChannels, requestId: string, dataUrl: string | null) => {
        try {
            if (isAppUrl(event.senderFrame?.url ?? '', getAppEntries())) event.reply(channel, { requestId, dataUrl });
        } catch { /* Окно могло закрыться, пока изображение было в очереди. */ }
    };
    const validRequest = (value: any) => value && typeof value.requestId === 'string' &&
        /^[0-9]{1,16}$/.test(value.requestId) && typeof value.accountId === 'string';

    onTrusted(ImageChannels.GET_AVATAR, async (event, params) => {
        if (!validRequest(params)) return;
        reply(event, ImageChannels.GET_AVATAR, params.requestId, await images.getAvatar(params.accountId));
    });
    onTrusted(ImageChannels.GET_CONFIRMATION_ICON, async (event, params) => {
        if (!validRequest(params)) return;
        // ID уже приходит в GET_CONFIRMATIONS_WINDOW_PARMAS; чужое окно не выбирает маршрут.
        const windows = application.windowsManager.confirmationsWindows;
        const owner = Object.prototype.hasOwnProperty.call(windows, params.accountId) ? windows[params.accountId] : undefined;
        const allowed = owner && !owner.isDestroyed() && owner.webContents === event.sender;
        reply(event, ImageChannels.GET_CONFIRMATION_ICON, params.requestId,
            allowed ? await images.getConfirmationIcon(params.accountId, params.url) : null);
    });
}
