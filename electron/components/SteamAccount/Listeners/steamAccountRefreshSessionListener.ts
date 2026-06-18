import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import steamAccountManager from "../steamAccountManager";

export default async (event: Electron.IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(`Такого стим аккаунта не сущесвует (#${id})`);
        // Защита приватности: без прокси не логинимся (иначе реальный IP свяжет аккаунт с ПК).
        if (!steamAccount.proxy) {
            throw new Error(`Аккаунт #${steamAccount.params.number}: не привязан прокси. Привяжите прокси перед обновлением сессии.`);
        }
        await steamAccount.loginByPassword();
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION, id);
    } catch (err) {
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, { id, err });
    }
}