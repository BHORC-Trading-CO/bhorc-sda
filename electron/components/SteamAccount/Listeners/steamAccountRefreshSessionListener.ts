import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import steamAccountManager from "../steamAccountManager";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        await steamAccount.loginByPassword();
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION, id);
    } catch (err) {
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, { id, err: String(err) });
    }
}