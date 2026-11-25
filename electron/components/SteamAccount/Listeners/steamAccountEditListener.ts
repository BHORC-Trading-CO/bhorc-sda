import TableSteamAccountInterface from "../../../interfaces/SteamAccount/TableSteamAccountInterface";
import Manager from "../../Manager/Manager";
import steamAccountManager from "../steamAccountManager";
import { t } from "../../../i18n";
import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";

export default async (event: Electron.IpcMainEvent, data: { id: string, steamAccountParams: { [K in keyof TableSteamAccountInterface]?: TableSteamAccountInterface[K] }, links?: { proxyId: string | null, profileId: string | null } }) => {
    try {
        console.log(`edit steam account ${data.id}`);
        const steamAccount = steamAccountManager.getById(data.id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: data.id }));
        const wasArchived = steamAccount.params.deleted === true;
        steamAccount.editParams(data.steamAccountParams);
        // Архивный аккаунт сессию не держит (SDA-59): вход — при восстановлении из архива
        if (wasArchived && steamAccount.params.deleted === false) {
            steamAccount.startSession().catch(err => application.sendToMain(
                SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, { id: steamAccount.params.id, err: String(err) }
            ));
        }
        if (data.links && data.links.proxyId !== Manager.GetSteamAccountLinkedData(data.id).proxyId)
            Manager.LinkProxyToSteamAccount(steamAccount.params.id, data.links.proxyId);
    } catch (err) {
        event.reply('ERROR', String(err));
    }
}