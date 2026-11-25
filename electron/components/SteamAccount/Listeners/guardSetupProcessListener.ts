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
import { isUnknownOutcome } from "../Functions/guardOutcome";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, params: { accountName: string, password: string, profileName?: string, mail?: string, mailPassword?: string, useSteamCookies?: boolean, links: ProxySelection }) => {
    // Отмена слушается с первой секунды и только этим запуском (SDA-63): раньше в первые три секунды
    // её никто не слышал, и мастер менял аккаунт Steam уже после отмены.
    const run = new AbortController();
    const stopListening = onTrusted(SteamAccountChannels.GUARD_SETUP_PROCESS_ABORT, () => run.abort());
    let recovery: { code: string, backupFile: string | null } | null = null;
    let connected = false;
    let saved = false;
    // Про копию на диске — только то, что есть на самом деле
    const recoveryText = () => recovery ? [
        t('errors.guard.revocationCode', { code: recovery.code }),
        recovery.backupFile ? t('errors.guard.backupSaved', { file: recovery.backupFile }) : t('errors.guard.backupNotSaved'),
    ] : [];
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

        const showRecovery = (revocationCode: string, steamId: string, backupFile: string | null = null) => {
            const result: GuardSetupResultInterface = {
                accountName: params.accountName, steamId, revocationCode,
                proxy: proxy ? `${proxy.host}:${proxy.port}` : null
            };
            recovery = { code: revocationCode, backupFile: backupFile ?? recovery?.backupFile ?? null };
            // Мастер отменённого запуска закрыт: код отзыва покажем в конце, см. ниже
            if (!run.signal.aborted) application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT, result);
        };
        const { accountName, password, profileName, mail, mailPassword, useSteamCookies } = params;
        const smaFile = await setupGuard({ accountName, password, profileName, mail, mailPassword, useSteamCookies }, proxy, showRecovery, run.signal);
        connected = true;
        showRecovery(smaFile.maFile.revocation_code, String(smaFile.maFile.Session?.SteamID ?? ""));
        nextStep("import");
        const { id } = steamAccountImport(smaFile, proxy?.id ?? null);
        saved = true;
        proxyManager.sendProxiesToFront();
        steamAccountManager.sendAccountsToFront();
        nextStep("end");
        // Код подтверждения уже был у Steam: подключение состоялось, аккаунт не теряем
        if (run.signal.aborted) application.sendToMain('ERROR', [t('errors.guard.tooLate', { login: accountName }), ...recoveryText()].join(" "));
        // Профиль — после сохранения и не обязателен: его можно обновить из строки
        steamAccountManager.getById(id)?.getSecondary()
            .then(() => steamAccountManager.sendAccountsToFront())
            .catch(err => console.log(`${id} - profile after Guard setup: ${err}`));
    } catch (err) {
        const details = { login: params.accountName, error: String(err) };
        if ((connected && !saved) || isUnknownOutcome(err)) {
            // Guard включён или мог включиться: говорим об этом и после отмены
            const text = [t(connected ? 'errors.guard.notSaved' : 'errors.guard.outcomeUnknown', details), ...recoveryText()].join(" ");
            if (run.signal.aborted) application.sendToMain('ERROR', text);
            else event.reply(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, text);
        } else if (!run.signal.aborted) {
            event.reply(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, t('errors.guardSetup', { error: String(err) }));
        } else if (recovery) {
            // Steam выдаёт код отзыва один раз, а мастер, где он показан, уже закрыт
            application.sendToMain('ERROR', [t(saved ? 'errors.guard.tooLate' : 'errors.guard.aborted', details), ...recoveryText()].join(" "));
        }
    } finally {
        stopListening();
    }
}
