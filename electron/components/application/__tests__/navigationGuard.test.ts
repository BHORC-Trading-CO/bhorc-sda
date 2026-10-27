import { EventEmitter } from 'events';
import { app, shell } from 'electron';
import { installNavigationGuard, isAppUrl } from '../navigationGuard';

const devEntry = 'http://localhost:3000/main_window';
const macEntry = 'file:///Applications/BHORC%20SDA.app/Contents/Resources/app.asar/.webpack/renderer/main_window/index.html';
const winEntry = 'file:///C:/Program%20Files/BHORC%20SDA/.webpack/renderer/main_window/index.html';
const macRoot = macEntry.slice(0, macEntry.indexOf('/main_window'));
const winRoot = winEntry.slice(0, winEntry.indexOf('/main_window'));

describe('isAppUrl', () => {
    it.each([
        [devEntry, [devEntry], true],
        ['http://localhost:3000/confirmations_window?reload=1#details', [devEntry], true],
        ['https://localhost:3000/ask_family_pin_window', ['https://localhost:3000/main_window'], true],
        ['http://localhost:3001/main_window', [devEntry], false],
        ['https://localhost:3000/main_window', [devEntry], false],
        ['http://localhost:3000.evil.test/main_window', [devEntry], false],
        ['http://localhost:3000@evil.test/', [devEntry], false],
        ['https://evil.test/', [devEntry, macEntry], false],
        ['blob:http://localhost:3000/id', [devEntry], false],
        [macEntry, [macEntry], true],
        [macEntry.replace('%20', ' '), [macEntry], true],
        [macEntry, [macEntry.replace('%20', ' ')], true],
        [`${macRoot}/confirmations_window/index.html?reload=1#details`, [macEntry], true],
        [`${macRoot}/ask_family_pin_window/index.html`, [macEntry], true],
        [`${macRoot}/error_window/index.html`, [macEntry], true],
        [winEntry, [winEntry], true],
        [`${winRoot}/confirmations_window/index.html`, [winEntry], true],
        [winEntry.replace('/C:/', '/c:/'), [winEntry], true],
        ['file://C:\\Program Files\\BHORC SDA\\.webpack\\renderer\\main_window\\index.html', [winEntry], true],
        [winEntry.replace('/C:/', '/D:/'), [winEntry], false],
        [`${winRoot}/..%20/outside.html`, [winEntry], false],
        ['file:///etc/passwd', [macEntry], false],
        [`${macRoot}-evil/index.html`, [macEntry], false],
        [`${macRoot}/../main/index.html`, [macEntry], false],
        [`${macRoot}/%2e%2e/main/index.html`, [macEntry], false],
        [`${macRoot}/main_window/%2e%2e/%2e%2e/main/index.html`, [macEntry], false],
        [`${macRoot}/..%2fmain/index.html`, [macEntry], false],
        [`${winRoot}/..%5cmain/index.html`, [winEntry], false],
        [`${macRoot}/%00.html`, [macEntry], false],
        // Битый %-escape внутри своей папки — просто буквальное имя файла приложения.
        [`${macRoot}/%zz.html`, [macEntry], true],
        [`${macRoot}/../%zz/index.html`, [macEntry], false],
        [macEntry.replace('file:///', 'file://evil.test/'), [macEntry], false],
        [macEntry.replace('file:///', 'file://localhost/'), [macEntry], true],
        ['file://server/share/.webpack/renderer/error_window/index.html', ['file://server/share/.webpack/renderer/main_window/index.html'], true],
        ['file://other/share/.webpack/renderer/error_window/index.html', ['file://server/share/.webpack/renderer/main_window/index.html'], false],
        ['javascript:alert(1)', [devEntry], false],
        ['data:text/html,hello', [devEntry], false],
        ['about:blank', [devEntry], false],
        ['about:blank#app', [devEntry], false],
        ['', [devEntry], false],
        ['not a URL', [devEntry], false],
        ['http://[', [devEntry], false],
        ['/main_window', [devEntry], false],
        [devEntry, [], false],
        [devEntry, ['invalid', devEntry], true],
        [macEntry, ['invalid', 'file:///%zz/main/index.html', macEntry], true],
        ['https://evil.test/', ['invalid'], false],
    ])('%s with %j -> %s', (url, entries, expected) => {
        expect(isAppUrl(url as string, entries as string[])).toBe(expected);
    });
});

describe('isAppUrl: голый % в пути установки', () => {
    // Forge подставляет путь в entry как есть; адрес страницы может прийти и с голым "%"
    // (URL-парсер оставляет его как есть), и с %25 — доверять нужно обоим.
    const rawEntry = 'file:///C:/Users/100%Pure/AppData/Local/BHORC%20SDA/.webpack/renderer/main_window/index.html';
    it('доверяет своим страницам, если в пути есть голый %', () => {
        expect(isAppUrl('file:///C:/Users/100%25Pure/AppData/Local/BHORC%20SDA/.webpack/renderer/confirmations_window/index.html', [rawEntry])).toBe(true);
        expect(isAppUrl(rawEntry, [rawEntry])).toBe(true);
    });
    it('и по-прежнему не доверяет чужим', () => {
        expect(isAppUrl('file:///C:/Users/100%25Pure/Evil/index.html', [rawEntry])).toBe(false);
        expect(isAppUrl('https://evil.test/', [rawEntry])).toBe(false);
    });
});

describe('подключение защиты', () => {
    it('application ставит защиту до создания окон и проверяет адрес в sendToMain', () => {
        const fs = require('fs');
        const path = require('path');
        const src: string = fs.readFileSync(path.join(__dirname, '..', 'application.ts'), 'utf8');
        const guardAt = src.indexOf('installNavigationGuard(getAppEntries())');
        const windowsAt = src.indexOf('new WindowsManager()');
        expect(guardAt).toBeGreaterThan(-1);
        expect(guardAt).toBeLessThan(windowsAt);
        expect(src).toMatch(/sendToMain[\s\S]*isAppUrl\(win\.webContents\.getURL\(\), getAppEntries\(\)\)/);
    });
});

describe('installNavigationGuard', () => {
    let contents: EventEmitter & { setWindowOpenHandler: jest.Mock };

    beforeAll(() => { installNavigationGuard([devEntry, macEntry, winEntry]); });
    beforeEach(() => {
        contents = Object.assign(new EventEmitter(), { setWindowOpenHandler: jest.fn() });
        app.emit('web-contents-created', {}, contents);
    });

    it('регистрирует защиту один раз', () => {
        const count = app.listenerCount('web-contents-created');
        installNavigationGuard(['https://evil.test/']);
        expect(app.listenerCount('web-contents-created')).toBe(count);
        expect(contents.listenerCount('will-navigate')).toBe(1);
        expect(contents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    });

    it.each(['will-navigate', 'will-redirect'])('%s блокирует чужие адреса и разрешает страницы приложения', name => {
        for (const url of ['https://evil.test/', 'about:blank', 'data:text/html,hello', 'invalid']) {
            const event = { preventDefault: jest.fn() };
            contents.emit(name, event, url);
            expect(event.preventDefault).toHaveBeenCalledTimes(1);
        }
        for (const url of [devEntry, `${macRoot}/confirmations_window/index.html`, winEntry]) {
            const event = { preventDefault: jest.fn() };
            contents.emit(name, event, url);
            expect(event.preventDefault).not.toHaveBeenCalled();
        }
    });

    it.each(['https://example.test/', 'http://example.test/', devEntry])('открывает %s снаружи и запрещает Electron popup', url => {
        const open = contents.setWindowOpenHandler.mock.calls[0][0];
        expect(open({ url })).toEqual({ action: 'deny' });
        expect(shell.openExternal).toHaveBeenCalledWith(url);
    });

    it.each(['file:///etc/passwd', 'data:text/html,hello', 'javascript:alert(1)', 'about:blank', 'mailto:user@example.test', 'invalid'])('не открывает %s', url => {
        const open = contents.setWindowOpenHandler.mock.calls[0][0];
        expect(open({ url })).toEqual({ action: 'deny' });
        expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it('ошибка внешнего браузера не создаёт окно и не раскрывает URL', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        (shell.openExternal as jest.Mock).mockRejectedValueOnce(new Error('private-url'));
        const open = contents.setWindowOpenHandler.mock.calls[0][0];
        expect(open({ url: 'https://example.test/private-url' })).toEqual({ action: 'deny' });
        await Promise.resolve();
        expect(warn).toHaveBeenCalledWith('Не удалось открыть внешнюю ссылку');
        warn.mockRestore();
    });

    it('блокирует webview', () => {
        const event = { preventDefault: jest.fn() };
        contents.emit('will-attach-webview', event, {}, { src: devEntry });
        expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });
});
