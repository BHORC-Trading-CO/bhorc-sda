import { IpcMainEvent } from 'electron';
import application from '../../application';
import { setCrypto } from '../../../newStorage/cryptoUserData';
import { t } from "../../../../i18n";

//Данная функция пока не работает
export default (event: IpcMainEvent, key: string) => {
    try {
        if (!key || key.length < 8) throw new Error(t("errors.secretKeyTooShort"));
        setCrypto(key);
    } catch (err) {
        event.reply('ERROR', err);
    }
}