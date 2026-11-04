import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import ProxyInterface from "../../../interfaces/Proxy/ProxyInterface";
import CreationStepType from "../../../interfaces/SteamAccount/CreationStepType";
import application from "../../application/application";
import Manager from "../../manager/manager";
import proxyManager from "../../Proxy/proxyManager";
import SuperMethods from "../../SuperMethods/SuperMethods";
import setupGuard from "../Processes/setupGuard";
import steamAccountImport from "../Processes/steamAccountImport";
import steamAccountManager from "../steamAccountManager";
import Proxy from "../../Proxy/Proxy";
import ProxyStorage from "../../newStorage/ProxyStorage";
import GuardSetupResultInterface from "../../../interfaces/SteamAccount/GuardSetupResultInterface";
import ProxySelection from "../../../interfaces/Proxy/ProxySelection";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, params: { accountName: string, password: string, links: ProxySelection }) => {
    try {
        const nextStep = (step: CreationStepType) => application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_STEP, step)
        nextStep("start");
        await SuperMethods.Sleep(3000);

        let proxy: ProxyInterface | null = Manager.RequireProxySelection(params.links);
        if (params.links.newProxy) {
            const newProxy = Proxy.Generate(params.links.newProxy);
            ProxyStorage.Save(newProxy.id, newProxy);
            const newProxyObj = new Proxy(newProxy);
            proxyManager.addNew(newProxyObj);
            proxy = newProxy;
        }

        const showRecovery = (revocationCode: string, steamId: string) => {
            const result: GuardSetupResultInterface = {
                accountName: params.accountName, steamId, revocationCode,
                proxy: proxy ? `${proxy.host}:${proxy.port}` : null
            };
            application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT, result);
        };
        const smaFile = await setupGuard({ accountName: params.accountName, password: params.password }, proxy, showRecovery);
        showRecovery(smaFile.maFile.revocation_code, String(smaFile.maFile.Session?.SteamID ?? ""));
        nextStep("import");
        steamAccountImport(smaFile, proxy?.id ?? null);
        proxyManager.sendProxiesToFront();
        steamAccountManager.sendAccountsToFront();
        nextStep("end");
    } catch (err) {
        if (err != 'abort') event.reply(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, t('errors.guardSetup', { error: String(err) }))
    }
}