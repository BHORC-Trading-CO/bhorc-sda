import { IpcMainEvent } from 'electron';
import steamAccountManager from '../steamAccountManager';
import proxyManager from '../../Proxy/proxyManager';

export default async (event: IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(`Такого стим аккаунта #${id} не существует`);
        // Защита приватности: без прокси не запускаем браузер (иначе реальный IP свяжет аккаунт с ПК).
        if (!steamAccount.proxy) {
            throw new Error(`Аккаунт #${steamAccount.params.number}: не привязан прокси. Привяжите прокси перед запуском браузера.`);
        }
        const cookies = steamAccount.params.useSteamCookies ? await steamAccount.getBrowserCookies() : [];
        const geo = await proxyManager.getProxyGeo(steamAccount.proxy.id);
        steamAccount.chrome.start(cookies, geo).catch((err) => {
            console.log(`#${id} - ошибка запуска браузера: ${err}`);
            event.reply('ERROR', err);
        });
    } catch (err) {
        event.reply('ERROR', err);
    }
}