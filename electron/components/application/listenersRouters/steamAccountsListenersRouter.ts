import { onTrusted } from '../trustedIpc';
import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';
import steamAccountCreationProcess from '../../SteamAccount/Listeners/steamAccountCreateProcessListener';
import getAuthCode from '../../SteamAccount/Functions/getAuthCode';
import steamAccountEditListener from '../../SteamAccount/Listeners/steamAccountEditListener';
import steamAccountImportListener from '../../SteamAccount/Listeners/steamAccountImportListener';
import guardSetupProcessListener from '../../SteamAccount/Listeners/guardSetupProcessListener';
import steamAccountDeleteListener from '../../SteamAccount/Listeners/steamAccountDeleteListener';
import steamAccountGetListener from '../../SteamAccount/Listeners/steamAccountGetListener';
import steamAccountSetTableFieldsListener from '../../SteamAccount/Listeners/steamAccountSetTableFieldsListener';
import steamAccountGetTableFieldsListener from '../../SteamAccount/Listeners/steamAccountGetTableFieldsListener';
import steamAccountGetSecondaryListener from '../../SteamAccount/Listeners/steamAccountGetSecondaryListener';
import steamAccountGetChangableSecondaryListener from '../../SteamAccount/Listeners/steamAccountGetChangableSecondaryListener';
import steamAccountRefreshSession from '../../SteamAccount/Listeners/steamAccountRefreshSessionListener';
import steamAccountRefreshStorageListener from '../../SteamAccount/Listeners/steamAccountRefreshStorageListener';
import steamAccountGetTableOptionsListener from '../../SteamAccount/Listeners/steamAccountGetTableOptionsListener';
import steamAccountSetTableOptionsListener from '../../SteamAccount/Listeners/steamAccountSetTableOptionsListener';
import steamAccountConfirmListener from '../../SteamAccount/Listeners/steamAccountConfirmListener';
import steamAccountGetConfirmationsListener from '../../SteamAccount/Listeners/steamAccountGetConfirmationsListener';
import steamAccountStartBrowser from '../../SteamAccount/Listeners/steamAccountStartBrowser';
import steamAccountStopBrowser from '../../SteamAccount/Listeners/steamAccountStopBrowser';
import steamAccountFocusBrowser from '../../SteamAccount/Listeners/steamAccountFocusBrowser';
import getBrowserStatus from '../../SteamAccount/Listeners/GetBrowserStatus';

export default () => {
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_GET_CONFIRMATIONS, steamAccountGetConfirmationsListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, steamAccountConfirmListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_STORAGE, steamAccountRefreshStorageListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION, steamAccountRefreshSession)
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_GET_SECONDARY, steamAccountGetSecondaryListener); //тут надо функцию поменять
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_GET_CHANGABLE_SECONDARY, steamAccountGetChangableSecondaryListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_GET_TABLE_FIELDS, steamAccountGetTableFieldsListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_SET_TABLE_FIELDS, steamAccountSetTableFieldsListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_IMPORT, steamAccountImportListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS, steamAccountCreationProcess);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_EDIT, steamAccountEditListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_DELETE, steamAccountDeleteListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_GET, steamAccountGetListener);
    onTrusted(SteamAccountChannels.GUARD_SETUP_PROCESS, guardSetupProcessListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_AUTH_CODE, getAuthCode);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_SAVE_TABLE_OPTIONS, steamAccountSetTableOptionsListener);
    onTrusted(SteamAccountChannels.STEAM_ACCOUNT_GET_TABLE_OPTIONS, steamAccountGetTableOptionsListener);
    onTrusted(SteamAccountChannels.START_BROWSER, steamAccountStartBrowser);
    onTrusted(SteamAccountChannels.STOP_BROWSER, steamAccountStopBrowser);
    onTrusted(SteamAccountChannels.FOCUS_BROWSER, steamAccountFocusBrowser);
    onTrusted(SteamAccountChannels.GET_BROWSER_STARTUS, getBrowserStatus);
}