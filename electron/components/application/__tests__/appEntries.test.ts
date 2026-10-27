import { getAppEntries } from '../appEntries';
import { isAppUrl } from '../navigationGuard';

const names = ['MAIN', 'AUTH', 'CONFIRMATIONS', 'ASK_FAMILY_PIN', 'ERROR'];

afterEach(() => {
    for (const name of names) delete (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`];
});

it('не доверяет никакому адресу без webpack entries', () => {
    expect(getAppEntries()).toEqual([]);
    expect(isAppUrl('http://localhost:3000/main_window', getAppEntries())).toBe(false);
});

it.each(['http://localhost:3000', 'file:///Applications/BHORC%20SDA.app/.webpack/renderer'])('собирает настроенные entries для %s без отсутствующего AUTH', base => {
    for (const name of names.filter(name => name !== 'AUTH')) {
        (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`] = `${base}/${name.toLowerCase()}_window${base.startsWith('file:') ? '/index.html' : ''}`;
    }
    const entries = getAppEntries();
    expect(entries).toHaveLength(4);
    for (const entry of entries) expect(isAppUrl(entry, entries)).toBe(true);
});

it('учитывает AUTH, если Forge определил этот entry', () => {
    (global as any).AUTH_WINDOW_WEBPACK_ENTRY = 'http://localhost:4000/auth_window';
    expect(getAppEntries()).toEqual(['http://localhost:4000/auth_window']);
});
