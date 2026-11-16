jest.mock('electron', () => {
    const { EventEmitter } = require('events');
    return { ipcRenderer: Object.assign(new EventEmitter(), { send: jest.fn() }), contextBridge: { exposeInMainWorld: jest.fn() } };
});
jest.mock('../../../bridges/languageBridge', () => ({ exposeLanguageApi: jest.fn() }));
jest.mock('../../Functions/installConsoleRedaction', () => ({}));

import { ipcRenderer } from 'electron';
import bridge from '../../../bridges/confirmationsBridge';
import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';

it('sends refs and receives account-scoped results/errors on their enum channels with cleanup', () => {
    const ref = { id: '9', nonce: 'synthetic-key', type: 9, multi: true };
    bridge.api.respondConfirmations('account', { allow: [ref], cancel: [] });
    expect(ipcRenderer.send).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, { id: 'account', data: { allow: [ref], cancel: [] } });
    const results = jest.fn();
    const errors = jest.fn();
    const stopResults = bridge.api.onRespondConfirmations(results);
    const stopErrors = bridge.api.onRespondConfirmationsError(errors);
    const event = {};
    (ipcRenderer as any).emit(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, event, { id: 'account', results: [{ id: '9', ok: true }] });
    (ipcRenderer as any).emit(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM_ERROR, event, { id: 'account', err: 'Offline' });
    expect(results).toHaveBeenCalledWith(event, { id: 'account', results: [{ id: '9', ok: true }] });
    expect(errors).toHaveBeenCalledWith(event, { id: 'account', err: 'Offline' });
    stopResults(); stopErrors();
    expect((ipcRenderer as any).listenerCount(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM)).toBe(0);
    expect((ipcRenderer as any).listenerCount(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM_ERROR)).toBe(0);
});
