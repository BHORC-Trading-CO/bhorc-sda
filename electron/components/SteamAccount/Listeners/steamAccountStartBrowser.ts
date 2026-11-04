import { IpcMainEvent } from 'electron';
import steamAccountManager from '../steamAccountManager';
import proxyManager from '../../Proxy/proxyManager';
import { t } from "../../../i18n";

export default async (event: IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        steamAccount.proxyUrl();
        const cookies = steamAccount.params.useSteamCookies ? await steamAccount.getBrowserCookies() : [];
        // Без прокси гео не определяем — браузер стартует с системной TZ/локалью.
        const geo = steamAccount.proxy ? await proxyManager.getProxyGeo(steamAccount.proxy.id) : null;
        steamAccount.chrome.start(cookies, geo).catch((err) => {
            console.log(`#${id} - ошибка запуска браузера: ${err}`);
            event.reply('ERROR', err);
        });
    } catch (err) {
        event.reply('ERROR', err);
    }
}