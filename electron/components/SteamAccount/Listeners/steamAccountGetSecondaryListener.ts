import steamAccountManager from "../steamAccountManager";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        const secondary = await steamAccount.getSecondary();
        console.log(SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY, { id: id, secondary: secondary });
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY, { id: id, secondary: secondary });
    } catch (err) {
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY_ERROR, { id, err: String(err) });
    }
}