import { onTrusted } from '../trustedIpc';
import WindowsChannels from '../../../interfaces/IpcChannels/WindowsChannels';
import closeMainWindowListener from '../WindowsManager/windowsListeners/closeMainWindowListener';
import centerizeMainWindowListener from '../WindowsManager/windowsListeners/centerizeMainWindowListener';
import maximizeMainWindowListener from '../WindowsManager/windowsListeners/maximizeMainWindowListener';
import minimizeMainWindowListener from '../WindowsManager/windowsListeners/minimizeMainWindowListener';
import closeAskWindowListener from '../WindowsManager/windowsListeners/closeAskWindowListener';
import centerizeAskWindowListener from '../WindowsManager/windowsListeners/centerizeAskWindowListener';
import maximizeAskWindowListener from '../WindowsManager/windowsListeners/maximizeAskWindowListener';
import minimizeAskWindowListener from '../WindowsManager/windowsListeners/minimizeAskWindowListener';
import closeConfirmationsWindowListener from '../WindowsManager/windowsListeners/closeConfirmationsWindowListener';
import centerizeConfirmationsWindowListener from '../WindowsManager/windowsListeners/centerizeConfirmationsWindowListener';
import maximizeConfirmationsWindowListener from '../WindowsManager/windowsListeners/maximizeConfirmationsWindowListener';
import minimizeConfirmationsWindowListener from '../WindowsManager/windowsListeners/minimizeConfirmationsWindowListener';
import openConfirmationsWindowListener from '../WindowsManager/windowsListeners/openConfirmationsWindowListener';
import centerizeAuthWindowListener from '../WindowsManager/windowsListeners/centerizeAuthWindowListener';
import closeAuthWindowListener from '../WindowsManager/windowsListeners/closeAuthWindowListener';
import maximizeAuthWindowListener from '../WindowsManager/windowsListeners/maximizeAuthWindowListener';
import minimizeAuthWindowListener from '../WindowsManager/windowsListeners/minimizeAuthWindowListener';
import centerizeErrorWindowListener from '../WindowsManager/windowsListeners/centerizeErrorWindowListener';
import closeErrorWindowListener from '../WindowsManager/windowsListeners/closeErrorWindowListener';
import maximizeErrorWindowListener from '../WindowsManager/windowsListeners/maximizeErrorWindowListener';
import minimizeErrorWindowListener from '../WindowsManager/windowsListeners/minimizeErrorWindowListener';
import getProfileParams from '../WindowsManager/windowsListeners/getProfileParams';
import setSecretKeyListener from '../WindowsManager/windowsListeners/setSecretKeyListener';

export default () => {
    //main window
    onTrusted(WindowsChannels.GET_PROFILE_PARAMS, getProfileParams);
    onTrusted(WindowsChannels.CLOSE_MAIN_WINDOW, closeMainWindowListener);
    onTrusted(WindowsChannels.CENTERIZE_MAIN_WINDOW, centerizeMainWindowListener);
    onTrusted(WindowsChannels.MAXIMIZE_MAIN_WINDOW, maximizeMainWindowListener);
    onTrusted(WindowsChannels.MINIMIZE_MAIN_WINDOW, minimizeMainWindowListener);

    //ask window
    onTrusted(WindowsChannels.CLOSE_ASK_WINDOW, closeAskWindowListener);
    onTrusted(WindowsChannels.CENTERIZE_ASK_WINDOW, centerizeAskWindowListener);
    onTrusted(WindowsChannels.MAXIMIZE_ASK_WINDOW, maximizeAskWindowListener);
    onTrusted(WindowsChannels.MINIMIZE_ASK_WINDOW, minimizeAskWindowListener);

    //confirmations window
    onTrusted(WindowsChannels.CLOSE_CONFIRMATIONS_WINDOW, closeConfirmationsWindowListener);
    onTrusted(WindowsChannels.CENTERIZE_CONFIRMATIONS_WINDOW, centerizeConfirmationsWindowListener);
    onTrusted(WindowsChannels.MAXIMIZE_CONFIRMATIONS_WINDOW, maximizeConfirmationsWindowListener);
    onTrusted(WindowsChannels.MINIMIZE_CONFIRMATIONS_WINDOW, minimizeConfirmationsWindowListener);
    onTrusted(WindowsChannels.OPEN_CONFIRMATIONS_WINDOW, openConfirmationsWindowListener);

    //confirmations window
    onTrusted(WindowsChannels.CLOSE_AUTH_WINDOW, closeAuthWindowListener);
    onTrusted(WindowsChannels.CENTERIZE_AUTH_WINDOW, centerizeAuthWindowListener);
    onTrusted(WindowsChannels.MAXIMIZE_AUTH_WINDOW, maximizeAuthWindowListener);
    onTrusted(WindowsChannels.MINIMIZE_AUTH_WINDOW, minimizeAuthWindowListener);

    //error window
    onTrusted(WindowsChannels.CLOSE_ERROR_WINDOW, closeErrorWindowListener);
    onTrusted(WindowsChannels.CENTERIZE_ERROR_WINDOW, centerizeErrorWindowListener);
    onTrusted(WindowsChannels.MAXIMIZE_ERROR_WINDOW, maximizeErrorWindowListener);
    onTrusted(WindowsChannels.MINIMIZE_ERROR_WINDOW, minimizeErrorWindowListener);

    onTrusted(WindowsChannels.SET_SECRET_KEY, setSecretKeyListener);
}