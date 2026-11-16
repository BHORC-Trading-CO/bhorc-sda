// SDA-25: "Open data folder" goes to main over IPC and opens the folder with shell.openPath.
// The old preload built `open ${folderPath}` / `start ${folderPath}` for a shell, so a path with a
// space ("Application Support", a Windows user name with a space) became two arguments.
jest.mock('electron', () => {
    const electron = jest.requireActual('../../../../__mocks__/electron');
    return { ...electron, shell: { ...electron.shell, openPath: jest.fn() } };
});
jest.mock('child_process');

import fs from 'fs';
import path from 'path';
import childProcess from 'child_process';
import { app, ipcRenderer, shell } from 'electron';
import openDataFolderListener from '../WindowsManager/windowsListeners/openDataFolderListener';
import WindowsChannels from '../../../interfaces/IpcChannels/WindowsChannels';
import mainBridge from '../../../bridges/mainBridge';

const openPath = shell.openPath as jest.Mock;
const getPath = app.getPath as jest.Mock;
const originalPlatform = process.platform;

const DATA_DIRS: Record<string, string> = {
    darwin: '/Users/Jane Doe/Library/Application Support/trademanager-open-source',
    win32: 'C:\\Users\\Jane Doe\\AppData\\Roaming\\trademanager-open-source',
    linux: '/home/jane doe/.config/trademanager-open-source',
};

function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

function shellCalls() {
    const cp = childProcess as unknown as Record<string, jest.Mock>;
    return ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork'].reduce((sum, name) => sum + cp[name].mock.calls.length, 0);
}

const event = () => ({ reply: jest.fn() });

afterEach(() => {
    setPlatform(originalPlatform);
    getPath.mockReset();
    getPath.mockImplementation(() => process.cwd());
    openPath.mockReset();
});

describe.each(Object.keys(DATA_DIRS))('on %s', (platform) => {
    it('passes the data folder with spaces to shell.openPath as one argument and builds no shell command', async () => {
        setPlatform(platform);
        getPath.mockReturnValue(DATA_DIRS[platform]);
        openPath.mockResolvedValue('');
        const reply = event();

        await openDataFolderListener(reply as any);

        expect(getPath).toHaveBeenCalledWith('userData');
        expect(openPath).toHaveBeenCalledTimes(1);
        expect(openPath.mock.calls[0]).toEqual([DATA_DIRS[platform]]);
        expect(shellCalls()).toBe(0);
        expect(reply.reply).not.toHaveBeenCalled();
    });
});

it('shell metacharacters in the path are plain characters, not commands', async () => {
    const dir = "/Users/o'hara & co/$(touch pwned)/`id`; rm -rf ~/trademanager-open-source";
    getPath.mockReturnValue(dir);
    openPath.mockResolvedValue('');
    await openDataFolderListener(event() as any);
    expect(openPath.mock.calls).toEqual([[dir]]);
    expect(shellCalls()).toBe(0);
});

it('ignores anything the renderer sends: the path is always the pinned userData folder', async () => {
    getPath.mockReturnValue(DATA_DIRS.darwin);
    openPath.mockResolvedValue('');
    await (openDataFolderListener as any)(event(), '/etc', 'calc.exe');
    expect(openPath.mock.calls).toEqual([[DATA_DIRS.darwin]]);
});

it('a non-empty string from shell.openPath is an error and goes to the ERROR channel', async () => {
    getPath.mockReturnValue(DATA_DIRS.darwin);
    openPath.mockResolvedValue('Failed to open path');
    const reply = event();
    await openDataFolderListener(reply as any);
    expect(reply.reply).toHaveBeenCalledTimes(1);
    expect(reply.reply).toHaveBeenCalledWith('ERROR', `Failed to open the data folder ${DATA_DIRS.darwin}: Failed to open path`);
});

it('a rejected shell.openPath is reported the same way', async () => {
    getPath.mockReturnValue(DATA_DIRS.linux);
    openPath.mockRejectedValue(new Error('no file manager'));
    const reply = event();
    await openDataFolderListener(reply as any);
    expect(reply.reply).toHaveBeenCalledWith('ERROR', `Failed to open the data folder ${DATA_DIRS.linux}: no file manager`);
});

it('the preload only asks main to open the folder, without a path', () => {
    const send = jest.spyOn(ipcRenderer, 'send');
    mainBridge.window.openAppdata();
    expect(send.mock.calls).toEqual([[WindowsChannels.OPEN_DATA_FOLDER]]);
    send.mockRestore();
});

it('neither the preload nor the listener can run a shell command; the channel is registered as trusted', () => {
    const root = path.resolve(__dirname, '../../..');
    for (const file of ['bridges/mainBridge.ts', 'components/application/WindowsManager/windowsListeners/openDataFolderListener.ts']) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        expect({ file, childProcess: /child_process|\bexec(?:File|Sync)?\s*\(|\bspawn\s*\(/.test(source) }).toEqual({ file, childProcess: false });
    }
    const router = fs.readFileSync(path.join(root, 'components/application/listenersRouters/windowsListenersRouter.ts'), 'utf8');
    expect(router).toContain('onTrusted(WindowsChannels.OPEN_DATA_FOLDER, openDataFolderListener)');
});
