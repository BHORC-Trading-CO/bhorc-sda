import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import SteamAccount from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import { t } from "../../../i18n";

const steamAccountImport = (smaFile: SmaFileInterface, proxyId: string | null = null) => {
    try {
        const steamAccountParams = SteamAccount.Generate(smaFile, null);
        // Keep the chosen ID even if the proxy vanished during login/enrollment.
        SteamAccountStorage.SaveWithProxyLink(steamAccountParams, proxyId);
        const steamAccount = new SteamAccount(steamAccountParams);
        console.log('new')
        steamAccountManager.addNew(steamAccount);
        return steamAccountParams;
    } catch (err){
        throw new Error(t('errors.importAccount', { error: String(err) }));
    }
}

export default steamAccountImport;