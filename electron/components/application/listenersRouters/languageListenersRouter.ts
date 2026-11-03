import { onTrusted, onTrustedSync } from '../trustedIpc';
import LanguageChannels from '../../../interfaces/IpcChannels/LanguageChannels';
import { DEFAULT_LANGUAGE } from '../../../interfaces/Language';
import languageGetListener from '../../language/Listeners/languageGetListener';
import languageSetListener from '../../language/Listeners/languageSetListener';

export default () => {
    onTrustedSync(LanguageChannels.GET_LANGUAGE, languageGetListener, DEFAULT_LANGUAGE);
    onTrusted(LanguageChannels.SET_LANGUAGE, languageSetListener);
}
