jest.mock('electron', () => {
    const { EventEmitter } = require('events');
    return {
        app: Object.assign(new EventEmitter(), { isReady: () => false, isPackaged: true }),
        session: { defaultSession: { setSpellCheckerEnabled: jest.fn(), webRequest: { onBeforeRequest: jest.fn() } } },
    };
});

import { app, session } from 'electron';
import fs from 'fs';
import path from 'path';
import { installRendererEgress, shouldBlockRendererRequest } from '../rendererEgress';

const entries = ['http://localhost:3000/main_window', 'http://localhost:3000/confirmations_window'];

it.each(['file:///app/index.html', 'file:///C:/app/index.html', 'file://localhost/app/index.html', 'file:///app/100%/index.html', 'data:image/jpeg;base64,/9j/', 'blob:file:///image', 'devtools://devtools/bundled/inspector.html', 'chrome-devtools://devtools/', 'about:blank'])('allows local %s', url => {
    expect(shouldBlockRendererRequest(url, true, entries)).toBe(false);
    expect(shouldBlockRendererRequest(url, false, entries)).toBe(false);
});

it.each(['file://attacker.test/share/image.jpg', 'file://192.0.2.1/share/image.jpg', 'file:////attacker.test/share/image.jpg', 'file://///attacker.test/share/image.jpg', String.raw`file:\\attacker.test\share\image.jpg`, 'file:///%2F%2Fattacker.test/share/image.jpg', 'file:///%5c%5cattacker.test/share/image.jpg'])('blocks UNC/SMB file request %s in every build', url => {
    expect(shouldBlockRendererRequest(url, true, entries)).toBe(true);
    expect(shouldBlockRendererRequest(url, false, entries)).toBe(true);
});

it.each(['https://avatars.akamai.steamstatic.com/a.jpg', 'http://example.test/img', 'ws://example.test/ws', 'wss://example.test/ws', 'http://localhost:3000/main_window', 'ws://localhost:3000/ws', 'ftp://example.test/file', 'invalid'])('packaged blocks %s', url => {
    expect(shouldBlockRendererRequest(url, true, entries)).toBe(true);
});

it.each(['http://localhost:3000/main_window', 'http://localhost:3000/assets/icon.svg', 'ws://localhost:3000/ws'])('unpackaged permits exact Forge origin %s', url => {
    expect(shouldBlockRendererRequest(url, false, entries)).toBe(false);
});

it.each(['https://example.test/', 'http://localhost:3001/', 'ws://localhost:3001/ws', 'https://localhost:3000/', 'wss://localhost:3000/ws', 'http://localhost.evil.test:3000/', 'http://localhost:3000@evil.test/', 'http://user:pass@localhost:3000/', 'http://127.0.0.1:3000/', 'http://[::1]:3000/'])('unpackaged rejects origin bypass %s', url => {
    expect(shouldBlockRendererRequest(url, false, entries)).toBe(true);
});

it('does not trust a non-loopback entry and supports explicitly configured HTTPS dev origins', () => {
    expect(shouldBlockRendererRequest('https://evil.test/', false, ['https://evil.test/main_window'])).toBe(true);
    expect(shouldBlockRendererRequest('wss://localhost:3443/ws', false, ['https://localhost:3443/main_window'])).toBe(false);
    expect(shouldBlockRendererRequest('http://localhost:3000/', false, [])).toBe(true);
});

it('guards default and custom sessions before requests, once per session; logs only each host once', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    installRendererEgress(entries);
    installRendererEgress(entries);
    app.emit('ready');
    const partition = { setSpellCheckerEnabled: jest.fn(), webRequest: { onBeforeRequest: jest.fn() } };
    const alternate = { setSpellCheckerEnabled: jest.fn(), webRequest: { onBeforeRequest: jest.fn() } };
    app.emit('session-created', partition);
    app.emit('web-contents-created', {}, { session: partition });
    app.emit('web-contents-created', {}, { session: alternate });
    for (const target of [session.defaultSession, partition, alternate]) {
        expect(target.setSpellCheckerEnabled).toHaveBeenCalledTimes(1);
        expect(target.setSpellCheckerEnabled).toHaveBeenCalledWith(false);
        const registration = target.webRequest.onBeforeRequest as jest.Mock;
        expect(registration).toHaveBeenCalledTimes(1);
        const filter = registration.mock.calls[0][0];
        const callback = jest.fn();
        filter({ url: 'https://user:secret@cdn.test/path-token?auth=secret' }, callback);
        expect(callback).toHaveBeenLastCalledWith({ cancel: true });
        filter({ url: 'file:///app/assets/User.svg' }, callback);
        expect(callback).toHaveBeenLastCalledWith({ cancel: false });
        filter({ url: 'file://share.test/image.jpg' }, callback);
        expect(callback).toHaveBeenLastCalledWith({ cancel: true });
    }
    expect(warn.mock.calls).toEqual([['Renderer network request blocked: cdn.test'], ['Renderer network request blocked: share.test']]);
    warn.mockRestore();
});

it('main installs the guard before firstStage can create any window', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../../../main.ts'), 'utf8');
    expect(main.indexOf('installRendererEgress(getAppEntries())')).toBeLessThan(main.indexOf('application.firstStage('));
});
