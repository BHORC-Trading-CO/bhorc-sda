import steamAccountManager from './../steamAccountManager';
import { IpcMainEvent } from 'electron';
import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';
import type { MobileConfirmationResponse, MobileConfirmationResult } from '../../../interfaces/SteamAccount/MobileConfirmationInterface';
import { confirmationErrorMessage } from '../Functions/mobileConfirmations';
import { t } from '../../../i18n';

export default async (event: IpcMainEvent, params: { id: string, data: MobileConfirmationResponse }) => {
    try {
        const steamAccount = steamAccountManager.getById(params.id);
        if (!steamAccount) throw new Error(t('errors.steamAccountNotFound', { id: params.id }));

        const results: MobileConfirmationResult[] = [];
        if (params.data.allow.length > 0) {
            results.push(...await steamAccount.respondConfirmations(params.data.allow, true));
        }
        if (params.data.cancel.length > 0) {
            const stopped = results.find(result => result.stopped);
            if (stopped) {
                results.push(...params.data.cancel.map(ref => ({ id: ref.id, ok: false, stopped: true, notSent: true, message: stopped.message })));
            } else {
                results.push(...await steamAccount.respondConfirmations(params.data.cancel, false));
            }
        }
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, { id: params.id, results });
    } catch (err) {
        event.reply(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM_ERROR, { id: params.id, err: confirmationErrorMessage(err) });
    }
}
