import windowsListeners from './windowsListenersRouter';
import proxiesListeners from './proxiesListenersRouter';
import steamAccountsListeners from './steamAccountsListenersRouter';
import groupsListeners from './groupsListenersRouter';
import browserListeners from './browserListenersRouter';

export default () => {
    windowsListeners();
    proxiesListeners();
    steamAccountsListeners();
    groupsListeners();
    browserListeners();
}