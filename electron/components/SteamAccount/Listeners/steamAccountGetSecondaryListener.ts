import steamAccountManager from "../steamAccountManager";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        const { secondary, changableSecondary } = await steamAccount.getSecondary();
        console.log(SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY, { id: id, secondary: secondary });
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY, { id: id, secondary: secondary });
        // Баланс пришёл с той же страницы /market/, что и КТ/ТП: отдельный запрос баланса не нужен (SDA-38).
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_CHANGABLE_SECONDARY, { id, changableSecondary });
    } catch (err) {
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY_ERROR, { id, err: String(err) });
    }
}
