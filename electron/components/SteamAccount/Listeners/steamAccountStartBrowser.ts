import { IpcMainEvent } from 'electron';
import steamAccountManager from '../steamAccountManager';
import proxyManager from '../../Proxy/proxyManager';
import { t } from "../../../i18n";
import { BrowserStartCancelledError } from "../Chrome/Chrome";

export default async (event: IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        steamAccount.proxyUrl();
        const cookies = steamAccount.params.useSteamCookies ? await steamAccount.getBrowserCookies() : [];
        // Без прокси гео не определяем — браузер стартует с системной TZ/локалью.
        const geo = steamAccount.proxy ? await proxyManager.getProxyGeo(steamAccount.proxy.id) : null;
        // Пока получали cookie и гео, аккаунт могли удалить навсегда: браузер остался бы без владельца (SDA-64).
        if (steamAccountManager.getById(id) !== steamAccount) return;
        steamAccount.chrome.start(cookies, geo).catch((err) => {
            if (err instanceof BrowserStartCancelledError) return;
            console.log(`#${id} - ошибка запуска браузера: ${err}`);
            event.reply('ERROR', String(err));
        });
    } catch (err) {
        event.reply('ERROR', String(err));
    }
}
