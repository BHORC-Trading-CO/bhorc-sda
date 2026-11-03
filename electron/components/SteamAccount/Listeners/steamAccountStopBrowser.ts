import { IpcMainEvent } from 'electron';
import steamAccountManager from '../steamAccountManager';
import { t } from "../../../i18n";

export default async (event: IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        steamAccount.chrome.stop();
    } catch (err) {
        event.reply('ERROR', err);
    }
}