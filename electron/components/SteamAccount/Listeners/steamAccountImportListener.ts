import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import Manager from "../../manager/manager";
import steamAccountImport from "../Processes/steamAccountImport";
import steamAccountManager from "../steamAccountManager";
import proxyManager from "../../Proxy/proxyManager";
import sanitizeSmaFile from "../../Functions/sanitizeSmaFile";

export default (event: Electron.IpcMainEvent, accounts: [{ smaFile: SmaFileInterface, links: { proxyId: string | null, profileId: string | null } }]) => {
    try {
        for (var account of accounts) {
            const smaFile = sanitizeSmaFile(account.smaFile);
            const steamAccount = steamAccountImport(smaFile);

            // Прокси из .smaFile имеет приоритет: резолвим в локальный (существующий или новый)
            if (smaFile.proxy) {
                const proxy = proxyManager.getOrCreateBySetup(smaFile.proxy);
                Manager.LinkProxyToSteamAccount(steamAccount.id, proxy.params.id);
            } else if (account.links.proxyId) {
                Manager.LinkProxyToSteamAccount(steamAccount.id, account.links.proxyId);
            }
        }
        proxyManager.sendProxiesToFront();
        steamAccountManager.sendAccountsToFront();
    } catch (err) {
        event.reply('ERROR', err);
    }
}
