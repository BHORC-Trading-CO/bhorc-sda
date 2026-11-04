import SuperMethods from "../../SuperMethods/SuperMethods";
import steamAccountManager from "../steamAccountManager";
import Manager from "../../manager/manager";
import maFileLogin from '../Processes/maFileLogin';
import SteamAccountSetupInterface from "../../../interfaces/SteamAccount/SteamAccountSetupInterface";
import steamAccountImport from "../Processes/steamAccountImport";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import application from "../../application/application";
import CreationStepType from "../../../interfaces/SteamAccount/CreationStepType";
import ProxyInterface from "../../../interfaces/Proxy/ProxyInterface";
import proxyManager from "../../Proxy/proxyManager";
import Proxy from "../../Proxy/Proxy";
import ProxyStorage from "../../newStorage/ProxyStorage";
import ProxySelection from "../../../interfaces/Proxy/ProxySelection";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, params: { steamAccount: SteamAccountSetupInterface, links: ProxySelection }) => {
    try {
        const nextStep = (step: CreationStepType) => application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_STEP, step);
        nextStep("start");
        console.log('create new account');
        await SuperMethods.Sleep(3000);

        let proxy: ProxyInterface | null = Manager.RequireProxySelection(params.links);
        if (params.links.proxyId){
            console.log(`link proxy: ${proxy?.id}`);
        }
        if (params.links.newProxy){
            proxy = Proxy.Generate(params.links.newProxy);
            ProxyStorage.Save(proxy.id, proxy);
            proxyManager.addNew(new Proxy(proxy));
            console.log(`generate new proxy: ${proxy.id}`);
        }
        const smaFile = await maFileLogin(params.steamAccount, {
            stepChannel: SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_STEP,
            abortChannel: SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_ABORT
        }, proxy);
        nextStep("import");
        steamAccountImport(smaFile, proxy?.id ?? null);
        nextStep("link");
        proxyManager.sendProxiesToFront();
        steamAccountManager.sendAccountsToFront();
        nextStep("end");
    } catch (err) {
        if (err != 'abort') event.reply(SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_ERROR, t('errors.createAccount', { error: String(err) }));
    }
}