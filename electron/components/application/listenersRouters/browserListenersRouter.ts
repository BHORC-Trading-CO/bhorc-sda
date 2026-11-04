import { onTrusted } from '../trustedIpc';
import BrowserChannels from '../../../interfaces/IpcChannels/BrowserChannels';
import {
    browserPickExtensionListener,
    browserSettingsGetListener,
    browserSettingsSaveListener,
} from '../../Browser/Listeners/browserSettingsListeners';

export default () => {
    onTrusted(BrowserChannels.BROWSER_SETTINGS_GET, browserSettingsGetListener);
    onTrusted(BrowserChannels.BROWSER_SETTINGS_SAVE, browserSettingsSaveListener);
    onTrusted(BrowserChannels.BROWSER_PICK_EXTENSION, browserPickExtensionListener);
}
