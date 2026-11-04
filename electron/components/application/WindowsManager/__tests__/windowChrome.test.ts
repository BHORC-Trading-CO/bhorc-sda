jest.mock('electron', () => {
    const electron = jest.requireActual('../../../../../__mocks__/electron');
    return { ...electron, BrowserWindow: jest.fn().mockImplementation(options => {
        const window = new electron.BrowserWindow();
        window.options = options;
        return window;
    }) };
});

import { BrowserWindow } from 'electron';
import { windowChrome } from '../windowChrome';
import windowsConfig from '../windowsConfig';
import WindowsManager from '../WindowsManager';
import InfoType from '../../askInfo/InfoType';

const entries = ['MAIN', 'CONFIRMATIONS', 'ASK_FAMILY_PIN', 'ERROR', 'AUTH'];
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const setPlatform = (value: NodeJS.Platform) => Object.defineProperty(process, 'platform', { ...realPlatform, value });

beforeEach(() => {
    for (const entry of entries) {
        (global as any)[`${entry}_WINDOW_WEBPACK_ENTRY`] = `file:///app/${entry}/index.html`;
        (global as any)[`${entry}_WINDOW_PRELOAD_WEBPACK_ENTRY`] = '/app/preload.js';
    }
});

afterEach(() => {
    Object.defineProperty(process, 'platform', realPlatform);
    for (const entry of entries) {
        delete (global as any)[`${entry}_WINDOW_WEBPACK_ENTRY`];
        delete (global as any)[`${entry}_WINDOW_PRELOAD_WEBPACK_ENTRY`];
    }
});

it('macOS: native traffic lights, vertically centred in the 48 px bar', () => {
    expect(windowChrome('darwin')).toEqual({ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 17 } });
});

it('Windows: native caption buttons over the bar via titleBarOverlay', () => {
    const chrome = windowChrome('win32');
    expect(chrome.titleBarStyle).toBe('hidden');
    expect(chrome.titleBarOverlay).toEqual({ color: '#18181b', symbolColor: '#d4d4d8', height: 48 });
});

it('other platforms keep the system frame', () => {
    expect(windowChrome('linux')).toEqual({ frame: true });
    expect(windowChrome('freebsd')).toEqual({ frame: true });
});

it('windowsConfig no longer asks for frameless or transparent windows', () => {
    for (const [name, config] of Object.entries(windowsConfig)) {
        expect({ name, frame: (config as any).frame }).not.toEqual({ name, frame: false });
        expect(config).not.toHaveProperty('transparent');
    }
});

it.each(['darwin', 'win32', 'linux'] as NodeJS.Platform[])('every window gets the %s chrome', platform => {
    setPlatform(platform);
    const windows = new WindowsManager();
    windows.createMain();
    windows.createConfirmationsWindow('a', 'account');
    windows.createAskWindow('a', 'account', 'familyPin' as InfoType);
    windows.createErrorWindow('Error', 'test');
    windows.createAuthWindow();
    const options = (BrowserWindow as unknown as jest.Mock).mock.calls.map(([options]) => options);
    expect(options).toHaveLength(5);
    for (const option of options) {
        expect(option).toMatchObject(windowChrome(platform));
        expect(option.frame).not.toBe(false);
        expect(option).not.toHaveProperty('transparent');
    }
});
