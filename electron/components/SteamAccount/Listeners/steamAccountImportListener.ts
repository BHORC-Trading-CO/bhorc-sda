import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import Manager from "../../manager/manager";
import steamAccountImport from "../Processes/steamAccountImport";
import steamAccountManager from "../steamAccountManager";
import proxyManager from "../../Proxy/proxyManager";
import sanitizeSmaFile from "../../Functions/sanitizeSmaFile";
import { t } from "../../../i18n";

export default (event: Electron.IpcMainEvent, accounts: [{ smaFile: SmaFileInterface, links: { proxyId: string | null, profileId: string | null } }]) => {
    // Каждый аккаунт отдельно: один неправильный файл не должен обрывать импорт остальных.
    const rejected: string[] = [];
    for (var account of accounts) {
        try {
            const smaFile = sanitizeSmaFile(account.smaFile);
            const proxyId = smaFile.proxy
                ? proxyManager.getOrCreateBySetup(smaFile.proxy).params.id
                : account.links.proxyId;
            Manager.RequireProxy(proxyId);
            steamAccountImport(smaFile, proxyId);

        } catch (err) {
            const name = account && account.smaFile && typeof account.smaFile.accountName === "string" ? account.smaFile.accountName : "?";
            rejected.push(`${name} — ${err instanceof Error ? err.message : err}`);
        }
    }
    try {
        proxyManager.sendProxiesToFront();
        steamAccountManager.sendAccountsToFront();
    } catch (err) {
        event.reply('ERROR', String(err));
    }
    if (rejected.length) event.reply('ERROR', t("errors.importRejected", { total: rejected.length, details: rejected.join("; ") }));
}
