import windowsListeners from './windowsListenersRouter';
import proxiesListeners from './proxiesListenersRouter';
import steamAccountsListeners from './steamAccountsListenersRouter';
import groupsListeners from './groupsListenersRouter';

export default () => {
    windowsListeners();
    proxiesListeners();
    steamAccountsListeners();
    groupsListeners();
}