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
import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import { isUnknownOutcome } from "../Functions/guardOutcome";
import quietly from "../../Functions/quietly";
import { t } from "../../../i18n";

export default async (event: Electron.IpcMainEvent, params: { accountName: string, password: string, profileName?: string, mail?: string, mailPassword?: string, useSteamCookies?: boolean, links: ProxySelection }) => {
    // Отмена слушается с первой секунды и только этим запуском (SDA-63): раньше в первые три секунды
    // её никто не слышал, и мастер менял аккаунт Steam уже после отмены.
    const run = new AbortController();
    const stopListening = onTrusted(SteamAccountChannels.GUARD_SETUP_PROCESS_ABORT, () => run.abort());
    let recovery: { code: string, backupFile: string | null } | null = null;
    let proxy: ProxyInterface | null = null;
    let connected = false;
    let saved = false;
    // Про копию на диске — только то, что есть на самом деле
    const recoveryText = () => recovery ? [
        ...(recovery.code ? [t('errors.guard.revocationCode', { code: recovery.code })] : []),
        recovery.backupFile ? t('errors.guard.backupSaved', { file: recovery.backupFile }) : t('errors.guard.backupNotSaved'),
    ] : [];
    // Мастер отменённого или законченного запуска закрыт: говорим отдельным сообщением
    const alert = (text: string) => quietly(() => application.sendToMain('ERROR', [text, ...recoveryText()].join(" ")));
    const fail = (text: string) => run.signal.aborted ? alert(text)
        : quietly(() => event.reply(SteamAccountChannels.GUARD_SETUP_PROCESS_ERROR, [text, ...recoveryText()].join(" ")));
    const nextStep = (step: CreationStepType) => {
        if (!run.signal.aborted) quietly(() => application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_STEP, step));
    };
    const showRecovery = (revocationCode: string, steamId: string, backupFile: string | null = null) => {
        const result: GuardSetupResultInterface = {
            accountName: params.accountName, steamId, revocationCode,
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null
        };
        recovery = { code: revocationCode, backupFile: backupFile ?? recovery?.backupFile ?? null };
        if (revocationCode && !run.signal.aborted) quietly(() => application.sendToMain(SteamAccountChannels.GUARD_SETUP_PROCESS_RESULT, result));
    };
    // Guard включён: сначала аккаунт на диск, всё остальное после
    const keep = (smaFile: SmaFileInterface) => {
        connected = true;
        recovery = { code: smaFile.maFile.revocation_code, backupFile: recovery?.backupFile ?? null };
        const { id } = steamAccountImport(smaFile, proxy?.id ?? null);
        saved = true;
        showRecovery(smaFile.maFile.revocation_code, String(smaFile.maFile.Session?.SteamID ?? ""));
        quietly(() => proxyManager.sendProxiesToFront());
        quietly(() => steamAccountManager.sendAccountsToFront());
        // Профиль не обязателен: его можно обновить из строки
        quietly(() => steamAccountManager.getById(id)?.getSecondary()
            .then(() => steamAccountManager.sendAccountsToFront())
            .catch(err => console.log(`${id} - profile after Guard setup: ${err}`)));
    };
    const notSaved = (err: unknown) => t('errors.guard.notSaved', { login: params.accountName, error: String(err) });
    try {
        nextStep("start");
        await SuperMethods.Sleep(3000);
        if (run.signal.aborted) return;

        proxy = Manager.RequireProxySelection(params.links);
        if (params.links.newProxy) {
            const newProxy = Proxy.Generate(params.links.newProxy);
            ProxyStorage.Save(newProxy.id, newProxy);
            const newProxyObj = new Proxy(newProxy);
            proxyManager.addNew(newProxyObj);
            proxy = newProxy;
        }

        const { accountName, password, profileName, mail, mailPassword, useSteamCookies } = params;
        keep(await setupGuard({ accountName, password, profileName, mail, mailPassword, useSteamCookies }, proxy, showRecovery, run.signal));
        nextStep("end");
        // Код подтверждения уже был у Steam: подключение состоялось, аккаунт не теряем
        if (run.signal.aborted) alert(t('errors.guard.tooLate', { login: accountName }));
    } catch (err) {
        const details = { login: params.accountName, error: String(err) };
        if (connected && !saved) fail(notSaved(err));
        // Guard мог включиться: говорим об этом и после отмены
        else if (isUnknownOutcome(err)) fail(t('errors.guard.outcomeUnknown', details));
        else if (!run.signal.aborted) fail(t('errors.guardSetup', { error: String(err) }));
        // Steam выдаёт код отзыва один раз, а мастер, где он показан, уже закрыт
        else if (recovery) alert(t(saved ? 'errors.guard.tooLate' : 'errors.guard.aborted', details));

        // Мастер закончен, а ответ ещё в пути: успех сохраняем, когда бы он ни пришёл
        const late = (err as { late?: Promise<SmaFileInterface> } | undefined)?.late;
        if (late) {
            run.abort();
            late.then(smaFile => {
                keep(smaFile);
                alert(t('errors.guard.lateSuccess', { login: params.accountName }));
            }).catch(lateErr => {
                if (connected && !saved) alert(notSaved(lateErr));
                else console.log(`${params.accountName} - late Guard answer: ${lateErr}`);
            });
        }
    } finally {
        stopListening();
    }
}
