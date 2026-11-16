import { onTrusted } from '../trustedIpc';
import AppSettingsChannels from '../../../interfaces/IpcChannels/AppSettingsChannels';
import { appSettingsGetListener, appSettingsSaveListener } from '../../AppSettings/Listeners/appSettingsListeners';

export default () => {
    onTrusted(AppSettingsChannels.APP_SETTINGS_GET, appSettingsGetListener);
    onTrusted(AppSettingsChannels.APP_SETTINGS_SAVE, appSettingsSaveListener);
}
