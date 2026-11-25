import TableSteamAccountInterface from "../../../interfaces/SteamAccount/TableSteamAccountInterface";
import Manager from "../../Manager/Manager";
import steamAccountManager from "../steamAccountManager";
import proxyManager from "../../Proxy/proxyManager";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, data: { id: string, steamAccountParams: { [K in keyof TableSteamAccountInterface]?: TableSteamAccountInterface[K] }, links?: { proxyId: string | null, profileId: string | null } }) => {
    try {
        console.log(`edit steam account ${data.id}`);
        const steamAccount = steamAccountManager.getById(data.id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: data.id }));
        const wasArchived = steamAccount.params.deleted === true;
        const relink = data.links && data.links.proxyId !== Manager.GetSteamAccountLinkedData(data.id).proxyId;
        // До записи: отказ по прокси не должен оставить аккаунт восстановленным наполовину
        if (relink) Manager.RequireProxy(data.links!.proxyId);
        const changes = { ...data.steamAccountParams };
        const restored = wasArchived && changes.deleted === false;
        if (restored) {
            // Пока аккаунт был в архиве, его номер мог занять новый (SDA-65)
            const numbers = steamAccountManager.objects
                .filter(other => other !== steamAccount && !other.params.deleted).map(other => other.params.number);
            if (numbers.includes(steamAccount.params.number)) changes.number = Math.max(...numbers) + 1;
        }
        steamAccount.editParams(changes);
        // Прокси — раньше входа: вход после восстановления должен идти уже новым маршрутом
        if (relink) Manager.LinkProxyToSteamAccount(steamAccount.params.id, data.links!.proxyId);
        // Архивный аккаунт сессию не держит (SDA-59): вход — при восстановлении из архива
        if (restored) {
            // На вкладке прокси показан номер связанного аккаунта
            if (changes.number !== undefined) proxyManager.sendProxiesToFront();
            steamAccount.startSessionInBackground();
        }
    } catch (err) {
        event.reply('ERROR', String(err));
    }
}