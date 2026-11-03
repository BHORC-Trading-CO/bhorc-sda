import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import ProxyInterface from "../../../interfaces/Proxy/ProxyInterface";
import ProxySetupInterface from "../../../interfaces/Proxy/ProxySetupInterface";
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

export default async (event: Electron.IpcMainEvent, params: { accountName: string, password: string, links: { proxyId: string | null, profileId: string | null, newProxy: ProxySetupInterface | null } }) => {
    try {
        const nextStep = (step: CreationStepType) => application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_STEP, step)
        nextStep("start");
        await SuperMethods.Sleep(3000);

        let proxy: ProxyInterface | undefined;
        if (params.links.proxyId) {
            proxy = proxyManager.getById(params.links.proxyId)?.params;
        }
        if (params.links.newProxy) {
            const newProxy = Proxy.Generate(params.links.newProxy);
            ProxyStorage.Save(newProxy.id, newProxy);
            const newProxyObj = new Proxy(newProxy);
            proxyManager.addNew(newProxyObj);
            proxy = newProxy;
        }

        const smaFile = await setupGuard({ accountName: params.accountName, password: params.password }, proxy);
        nextStep("import");
        const steamAccount = steamAccountImport(smaFile);
        nextStep("link");
        if (proxy) Manager.LinkProxyToSteamAccount(steamAccount.id, proxy.id);
        steamAccountManager.sendAccountsToFront();
        // Итог шлём ДО "end": на финальном экране пользователь должен увидеть
        // revocation code — Steam выдаёт его один раз, и без него аутентификатор
        // с аккаунта уже не снять.
        const result: GuardSetupResultInterface = {
            accountName: smaFile.accountName,
            steamId: smaFile.maFile.Session ? String(smaFile.maFile.Session.SteamID) : "",
            revocationCode: smaFile.maFile.revocation_code,
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null
        };
        application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT, result);
        nextStep("end");
    } catch (err) {
        if (err != 'abort') event.reply(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, `Ошибка при подключении Guard: ${err}`)
    }
}