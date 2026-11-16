import { IpcMainEvent } from 'electron';
import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';
import steamAccountManager from '../steamAccountManager';
import { t } from "../../../i18n";
import { confirmationErrorMessage } from '../Functions/mobileConfirmations';

export default async (event: IpcMainEvent, id: string) => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: id }));
        const confirmations = await steamAccount.getConfirmations();
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_CONFIRMATIONS, { id, confirmations });
    } catch (err) {
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_GET_CONFIRMATIONS_ERROR, { id, err: confirmationErrorMessage(err) });
    }
}
