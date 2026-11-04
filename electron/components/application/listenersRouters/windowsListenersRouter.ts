import { onTrusted } from '../trustedIpc';
import WindowsChannels from '../../../interfaces/IpcChannels/WindowsChannels';
import closeMainWindowListener from '../WindowsManager/windowsListeners/closeMainWindowListener';
import closeAskWindowListener from '../WindowsManager/windowsListeners/closeAskWindowListener';
import closeConfirmationsWindowListener from '../WindowsManager/windowsListeners/closeConfirmationsWindowListener';
import openConfirmationsWindowListener from '../WindowsManager/windowsListeners/openConfirmationsWindowListener';
import closeAuthWindowListener from '../WindowsManager/windowsListeners/closeAuthWindowListener';
import closeErrorWindowListener from '../WindowsManager/windowsListeners/closeErrorWindowListener';
import getProfileParams from '../WindowsManager/windowsListeners/getProfileParams';
import setSecretKeyListener from '../WindowsManager/windowsListeners/setSecretKeyListener';

export default () => {
    //main window
    onTrusted(WindowsChannels.GET_PROFILE_PARAMS, getProfileParams);
    onTrusted(WindowsChannels.CLOSE_MAIN_WINDOW, closeMainWindowListener);

    //ask window
    onTrusted(WindowsChannels.CLOSE_ASK_WINDOW, closeAskWindowListener);

    //confirmations window
    onTrusted(WindowsChannels.CLOSE_CONFIRMATIONS_WINDOW, closeConfirmationsWindowListener);
    onTrusted(WindowsChannels.OPEN_CONFIRMATIONS_WINDOW, openConfirmationsWindowListener);

    //auth window
    onTrusted(WindowsChannels.CLOSE_AUTH_WINDOW, closeAuthWindowListener);

    //error window
    onTrusted(WindowsChannels.CLOSE_ERROR_WINDOW, closeErrorWindowListener);

    onTrusted(WindowsChannels.SET_SECRET_KEY, setSecretKeyListener);
}