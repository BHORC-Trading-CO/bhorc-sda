jest.mock('electron', () => {
    const electron = jest.requireActual('../../../../__mocks__/electron');
    return { ...electron, contextBridge: { exposeInMainWorld: jest.fn() } };
});

import { contextBridge, shell } from 'electron';
import mainBridge from '../../../bridges/mainBridge';
import errorWindowBridge from '../../../bridges/errorWindowBridge';
const exposes = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls.slice();

it('main and error preloads expose their ordinary controls without an external link opener', () => {
    expect(exposes).toContainEqual(['Main', mainBridge]);
    expect(exposes).toContainEqual(['ErrorWindow', errorWindowBridge]);
    expect(mainBridge.window.close).toEqual(expect.any(Function));
    expect(errorWindowBridge.windowApi.close).toEqual(expect.any(Function));
    expect(mainBridge.window).not.toHaveProperty('openLink');
    expect(errorWindowBridge).not.toHaveProperty('errorApi');
    const visit = (value: any) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, nested] of Object.entries(value)) {
            expect(key).not.toMatch(/^(openLink|openExternal)$/);
            visit(nested);
        }
    };
    visit(mainBridge); visit(errorWindowBridge);
    exposes.forEach(([, value]) => visit(value));
    expect(shell.openExternal).not.toHaveBeenCalled();
});
