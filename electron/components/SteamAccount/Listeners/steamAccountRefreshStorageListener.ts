import steamAccountManager from "../steamAccountManager";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { errorText } from "../Functions/accountErrors";

export default async (event: Electron.IpcMainEvent, requestId?: number) => {
    try {
        // Без await ошибка чтения хранилища уходила в никуда
        await steamAccountManager.load(requestId);
    } catch (err) {
        if (requestId === undefined) event.reply('ERROR', String(err));
        else event.reply(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_STORAGE, { requestId, err: errorText(err) });
    }
}
