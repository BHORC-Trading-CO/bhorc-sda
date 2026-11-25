import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import ProxyInterface from "../../../interfaces/Proxy/ProxyInterface";
import CreationStepType from "../../../interfaces/SteamAccount/CreationStepType";
import application from "../../application/application";
import { onTrusted } from "../../application/trustedIpc";
import Manager from "../../Manager/Manager";
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

export default async (event: Electron.IpcMainEvent, params: { accountName: string, password: string, profileName?: string, mail?: string, mailPassword?: string, useSteamCookies?: boolean, links: ProxySelection }) => {
    // Отмена слушается с первой секунды и только этим запуском (SDA-63): раньше в первые три секунды
    // её никто не слышал, и мастер менял аккаунт Steam уже после отмены.
    const run = new AbortController();
    const stopListening = onTrusted(SteamAccountChannels.GUARD_SETUP_PROCESS_ABORT, () => run.abort());
    let recoveryCode = "";
    try {
        const nextStep = (step: CreationStepType) => {
            if (!run.signal.aborted) application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_STEP, step);
        };
        nextStep("start");
        await SuperMethods.Sleep(3000);
        if (run.signal.aborted) return;

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
            recoveryCode = revocationCode;
            // Мастер отменённого запуска закрыт: код отзыва покажем в конце, см. ниже
            if (!run.signal.aborted) application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT, result);
        };
        const { accountName, password, profileName, mail, mailPassword, useSteamCookies } = params;
        const smaFile = await setupGuard({ accountName, password, profileName, mail, mailPassword, useSteamCookies }, proxy, showRecovery, run.signal);
        showRecovery(smaFile.maFile.revocation_code, String(smaFile.maFile.Session?.SteamID ?? ""));
        nextStep("import");
        steamAccountImport(smaFile, proxy?.id ?? null);
        proxyManager.sendProxiesToFront();
        steamAccountManager.sendAccountsToFront();
        nextStep("end");
        // Код подтверждения уже был у Steam: подключение состоялось, аккаунт не теряем
        if (run.signal.aborted) application.sendToMain('ERROR', t('errors.guardAbortTooLate', { login: accountName, code: recoveryCode }));
    } catch (err) {
        if (!run.signal.aborted) event.reply(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, t('errors.guardSetup', { error: String(err) }));
        // Steam выдаёт код отзыва один раз, а мастер, где он показан, уже закрыт
        else if (recoveryCode) application.sendToMain('ERROR', t('errors.guardAbortedWithSecrets', { login: params.accountName, code: recoveryCode, error: String(err) }));
    } finally {
        stopListening();
    }
}
