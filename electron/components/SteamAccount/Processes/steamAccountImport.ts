import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import SteamAccount from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import { t } from "../../../i18n";

const steamAccountImport = (smaFile: SmaFileInterface) => {
    try {
        const steamAccountParams = SteamAccount.Generate(smaFile, null);
        console.log('generated');
        const steamAccount = new SteamAccount(steamAccountParams);
        console.log('new')
        steamAccountManager.addNew(steamAccount);
        SteamAccountStorage.Save(steamAccountParams.id, steamAccountParams);
        return steamAccountParams;
    } catch (err){
        throw new Error(t('errors.importAccount', { error: String(err) }));
    }
}

export default steamAccountImport;