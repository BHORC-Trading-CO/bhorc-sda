import steamAccountManager from "../steamAccountManager";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { t } from "../../../i18n";
import { errorText, isStaleOperation } from "../Functions/accountErrors";

// requestId возвращается в ответах: окно принимает только ответ на свой последний запрос (SDA-56)
export default async (event: Electron.IpcMainEvent, id: string, requestId?: number) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        const changableSecondary = await steamAccount.getChangableSecondary();
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_CHANGABLE_SECONDARY, { id, changableSecondary, requestId });
    } catch (err) {
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_CHANGABLE_SECONDARY_ERROR, { err: errorText(err), id, stale: isStaleOperation(err), requestId });
    }
}
