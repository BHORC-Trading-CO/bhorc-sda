import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import Manager from "../../Manager/Manager";
import steamAccountImport from "../Processes/steamAccountImport";
import steamAccountManager from "../steamAccountManager";
import proxyManager from "../../Proxy/proxyManager";
import sanitizeSmaFile from "../../Functions/sanitizeSmaFile";
import assertSameAccount from "../Processes/accountIdentity";
import { t } from "../../../i18n";

export default (event: Electron.IpcMainEvent, accounts: [{ smaFile: SmaFileInterface, links: { proxyId: string | null, noProxy?: boolean } }]) => {
    // Каждый аккаунт отдельно: один неправильный файл не должен обрывать импорт остальных.
    const rejected: string[] = [];
    for (var account of accounts) {
        try {
            // Метка пропавшего прокси нужна только здесь, в записи аккаунта её не храним.
            const { proxyMissing, ...smaFile } = sanitizeSmaFile(account.smaFile);
            assertSameAccount(smaFile.accountName, smaFile.maFile);
            // Явный выбор в превью главнее прокси из файла (SDA-62): раньше показывался один, а работал другой.
            const { proxyId: chosenId = null, noProxy } = account.links;
            if (proxyMissing && chosenId === null && !noProxy) throw new Error(t("errors.importRouteRequired"));
            const proxyId = chosenId === null && !noProxy && smaFile.proxy
                ? proxyManager.getOrCreateBySetup(smaFile.proxy).params.id
                : chosenId;
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
