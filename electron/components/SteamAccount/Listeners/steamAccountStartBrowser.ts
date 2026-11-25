import { IpcMainEvent } from 'electron';
import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';
import steamAccountManager from '../steamAccountManager';
import proxyManager from '../../Proxy/proxyManager';
import { t } from "../../../i18n";
import { BrowserStartCancelledError } from "../Chrome/Chrome";

export default async (event: IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        // Второе нажатие, пока первое готовится (список перерисовал кнопку), ничего не начинает
        if (steamAccount.browserPreparing) return;
        // Подготовка (cookie, гео прокси) занимает секунды, а до Chrome.start кнопка выглядела ненажатой
        // и её нажимали ещё раз (SDA-61)
        if (steamAccount.chrome.workStatus === "notworking") event.reply(SteamAccountChannels.GET_BROWSER_STARTUS, { status: "load", id });
        steamAccount.proxyUrl();
        const assertRoute = steamAccount.captureRoute();
        let cookies: string[], geo;
        steamAccount.browserPreparing = true;
        try {
            cookies = steamAccount.params.useSteamCookies ? await steamAccount.getBrowserCookies() : [];
            // Без прокси гео не определяем — браузер стартует с системной TZ/локалью.
            geo = steamAccount.proxy ? await proxyManager.getProxyGeo(steamAccount.proxy.id) : null;
        } finally {
            steamAccount.browserPreparing = false;
        }
        // Пока готовились, аккаунт могли удалить или перечитать без него
        if (steamAccountManager.getById(id) !== steamAccount) return;
        // Cookie получены прежним прокси: в браузер с новым прокси они попасть не должны
        assertRoute();
        steamAccount.chrome.start(cookies, geo).catch((err) => {
            if (err instanceof BrowserStartCancelledError) {
                // Запуск могли отклонить до Chrome.start (аккаунт удаляется): вернуть кнопке настоящее состояние
                event.reply(SteamAccountChannels.GET_BROWSER_STARTUS, { status: steamAccount.chrome.workStatus, id });
                return;
            }
            console.log(`#${id} - ошибка запуска браузера: ${err}`);
            event.reply('ERROR', String(err));
        });
    } catch (err) {
        // До запуска не дошло: кнопке — настоящее состояние
        const account = steamAccountManager.getById(id);
        if (account) event.reply(SteamAccountChannels.GET_BROWSER_STARTUS, { status: account.chrome.workStatus, id });
        event.reply('ERROR', String(err));
    }
}
