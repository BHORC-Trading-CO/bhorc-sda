import steamAccountManager from "../steamAccountManager";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        const changableSecondary = await steamAccount.getChangableSecondary();
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_CHANGABLE_SECONDARY, { id, changableSecondary });
    } catch (err) {
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_CHANGABLE_SECONDARY_ERROR, { err: String(err), id });
    }
}