import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';
import steamAccountManager from './../steamAccountManager';
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, id: string) => {
    try {
        const account = steamAccountManager.getById(id);
        if (!account) {
            throw new Error(t('errors.steamAccountNotFound', { id: id }));
        }
        event.reply(SteamAccountChannels.GET_BROWSER_STARTUS, { status: account.chrome.workStatus, id});
    } catch (err) {
        event.reply('ERROR', err);
    }
}