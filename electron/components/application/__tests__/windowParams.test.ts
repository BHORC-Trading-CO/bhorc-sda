jest.mock('electron', () => {
    const { EventEmitter } = require('events');
    return { ipcRenderer: Object.assign(new EventEmitter(), { send: jest.fn() }), contextBridge: { exposeInMainWorld: jest.fn() } };
});
jest.mock('../../../bridges/languageBridge', () => ({ exposeLanguageApi: jest.fn() }));
jest.mock('../../Functions/installConsoleRedaction', () => ({}));

import { ipcRenderer } from 'electron';
import confirmations from '../../../bridges/confirmationsBridge';
import ask from '../../../bridges/askFamilyPinBridge';
import error from '../../../bridges/errorWindowBridge';
import WindowsChannels from '../../../interfaces/IpcChannels/WindowsChannels';

const emit = (channel: string, data: unknown) => (ipcRenderer as any).emit(channel, {}, data);

// SDA-66: main шлёт параметры один раз; страница, подписавшаяся позже, раньше оставалась пустой
it.each([
    ['confirmations', WindowsChannels.GET_CONFIRMATIONS_WINDOW_PARMAS, (listener: any) => confirmations.api.onGetParams(listener)],
    ['ask', WindowsChannels.GET_ASK_WINDOW_PARAMS, (listener: any) => ask.askFamilyPinApi.onGetParams(listener)],
    ['error', WindowsChannels.GET_ERROR_WINDOW_PARAMS, (listener: any) => error.windowApi.onGetParams(listener)],
])('%s: параметры, пришедшие до подписки, не теряются', (_name, channel, subscribe) => {
    emit(channel, { id: 'early' });
    const listener = jest.fn();
    subscribe(listener);
    expect(listener.mock.calls.map(([, data]) => data)).toEqual([{ id: 'early' }]);
    emit(channel, { id: 'next' });
    expect(listener.mock.calls.map(([, data]) => data)).toEqual([{ id: 'early' }, { id: 'next' }]);
});

it('отписка окна подтверждений действует', () => {
    const listener = jest.fn();
    const stop = confirmations.api.onGetParams(listener);
    listener.mockClear();
    stop();
    emit(WindowsChannels.GET_CONFIRMATIONS_WINDOW_PARMAS, { id: 'later' });
    expect(listener).not.toHaveBeenCalled();
});
