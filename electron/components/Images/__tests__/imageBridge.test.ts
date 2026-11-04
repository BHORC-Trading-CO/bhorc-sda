jest.mock('electron', () => {
    const { EventEmitter } = require('events');
    return { ipcRenderer: Object.assign(new EventEmitter(), { send: jest.fn() }) };
});

import { ipcRenderer } from 'electron';
import { requestImage } from '../../../bridges/imageBridge';
import ImageChannels from '../../../interfaces/IpcChannels/ImageChannels';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });
const reply = (channel: ImageChannels, requestId: string, dataUrl: unknown) => (ipcRenderer as any).emit(channel, {}, { requestId, dataUrl });
const data = 'data:image/jpeg;base64,/9j/';

it('correlates out-of-order responses without adding one listener per account', async () => {
    const first = requestImage(ImageChannels.GET_AVATAR, { accountId: 'a1' });
    const second = requestImage(ImageChannels.GET_AVATAR, { accountId: 'a2' });
    const sends = (ipcRenderer.send as jest.Mock).mock.calls;
    reply(ImageChannels.GET_AVATAR, sends[1][1].requestId, null);
    reply(ImageChannels.GET_AVATAR, sends[0][1].requestId, data);
    expect(await Promise.all([first, second])).toEqual([data, null]);
    expect((ipcRenderer as any).listenerCount(ImageChannels.GET_AVATAR)).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
});

it.each(['https://evil.test/avatar.jpg', 'file:///secret', 'data:image/svg+xml;base64,PHN2Zz4=', undefined])('rejects non-raster response %j', async value => {
    const result = requestImage(ImageChannels.GET_AVATAR, { accountId: 'a1' });
    const requestId = (ipcRenderer.send as jest.Mock).mock.calls[0][1].requestId;
    reply(ImageChannels.GET_AVATAR, requestId, value);
    expect(await result).toBeNull();
});

it('ignores the wrong channel and keeps valid results after a long queue wait', async () => {
    const result = requestImage(ImageChannels.GET_AVATAR, { accountId: 'a1' });
    const requestId = (ipcRenderer.send as jest.Mock).mock.calls[0][1].requestId;
    reply(ImageChannels.GET_CONFIRMATION_ICON, requestId, data);
    jest.advanceTimersByTime(15 * 60 * 1000);
    reply(ImageChannels.GET_AVATAR, requestId, data);
    expect(await result).toBe(data);
    expect(jest.getTimerCount()).toBe(0);
});
