import { EventEmitter } from 'events';
import path from 'path';
import vm from 'vm';
import { transformFileSync } from '@babel/core';
import ImageChannels from '../../../interfaces/IpcChannels/ImageChannels';

const filename = path.resolve(__dirname, '../../../bridges/imageBridge.ts');
const code = transformFileSync(filename, {
    configFile: false, babelrc: false,
    presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
})!.code!;
const data = 'data:image/jpeg;base64,/9j/';

it.each([
    [ImageChannels.GET_AVATAR, { accountId: 'a' }, { accountId: 'b' }],
    [ImageChannels.GET_CONFIRMATION_ICON, { accountId: 'a', url: 'old-icon' }, { accountId: 'a', url: 'new-icon' }],
])('reload mid-flight cannot apply a previous document reply (%s)', async (channel, oldParams, newParams) => {
    // Two real preload evaluations, one surviving webContents transport.
    const ipc = Object.assign(new EventEmitter(), { send: jest.fn() });
    const loadDocument = () => {
        const exports: any = {};
        vm.runInNewContext(code, { exports, require: (name: string) => {
            if (name === 'electron') return { ipcRenderer: ipc };
            if (name.endsWith('/ImageChannels')) return { __esModule: true, default: ImageChannels };
            return require(name);
        } }, { filename });
        return exports.requestImage;
    };
    loadDocument()(channel, oldParams);
    const oldRequest = ipc.send.mock.calls[0][1];
    ipc.removeAllListeners(); // Discard the old document, retaining its in-flight main request.
    const current = loadDocument()(channel, newParams);
    const newRequest = ipc.send.mock.calls[1][1];
    expect(oldRequest.requestId).toMatch(/^[a-f0-9]{32}:1$/);
    expect(newRequest.requestId).toMatch(/^[a-f0-9]{32}:1$/);
    expect(oldRequest.requestId).not.toBe(newRequest.requestId);
    const settled = jest.fn();
    current.then(settled);
    ipc.emit(channel, {}, { ...oldRequest, dataUrl: data });
    ipc.emit(channel, {}, { ...oldRequest, requestId: newRequest.requestId, dataUrl: data });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    ipc.emit(channel, {}, { ...newRequest, dataUrl: null });
    expect(await current).toBeNull();
    expect(settled).toHaveBeenCalledTimes(1);
});
