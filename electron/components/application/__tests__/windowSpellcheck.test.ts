jest.mock('electron', () => {
    const electron = jest.requireActual('../../../../__mocks__/electron');
    return { ...electron, BrowserWindow: jest.fn().mockImplementation(options => {
        const window = new electron.BrowserWindow();
        window.options = options;
        return window;
    }) };
});

import { BrowserWindow } from 'electron';
import WindowsManager from '../WindowsManager/WindowsManager';
import InfoType from '../askInfo/InfoType';

it('disables spellcheck in main, confirmation, ask, error and dormant auth windows', () => {
    const entries = ['MAIN', 'CONFIRMATIONS', 'ASK_FAMILY_PIN', 'ERROR', 'AUTH'];
    for (const entry of entries) {
        (global as any)[`${entry}_WINDOW_WEBPACK_ENTRY`] = `file:///app/${entry}/index.html`;
        (global as any)[`${entry}_WINDOW_PRELOAD_WEBPACK_ENTRY`] = '/app/preload.js';
    }
    try {
        const windows = new WindowsManager();
        windows.createMain();
        windows.createConfirmationsWindow('a', 'account');
        windows.createAskWindow('a', 'account', 'pin' as InfoType);
        windows.createErrorWindow('Error', 'test');
        windows.createAuthWindow();
        const options = (BrowserWindow as unknown as jest.Mock).mock.calls.map(([options]) => options);
        expect(options).toHaveLength(5);
        for (const option of options) expect(option.webPreferences).toMatchObject({ spellcheck: false, contextIsolation: true, nodeIntegration: false });
    } finally {
        for (const entry of entries) {
            delete (global as any)[`${entry}_WINDOW_WEBPACK_ENTRY`];
            delete (global as any)[`${entry}_WINDOW_PRELOAD_WEBPACK_ENTRY`];
        }
    }
});
