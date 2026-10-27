import { app, shell } from 'electron';
import { posix } from 'path';

function filePath(url: URL): string | null {
    // URL использует / на любой ОС. Закодированные разделители не должны менять границы пути.
    if (/%2f|%5c/i.test(url.pathname)) return null;
    const decoded = decodeURIComponent(url.pathname);
    if (/[\0\\]/.test(decoded)) return null;
    const windowsPath = /^\/[a-z]:\//i.test(decoded) || Boolean(url.hostname);
    // Windows убирает конечные точки/пробелы в компонентах пути; не допускаем такие алиасы.
    if (windowsPath && decoded.split('/').some(part => /[. ]$/.test(part))) return null;
    const normalized = posix.normalize(decoded);
    return windowsPath ? normalized.toLowerCase() : normalized;
}

export function isAppUrl(url: string, entries: string[]): boolean {
    try {
        const target = new URL(url);
        if (!['http:', 'https:', 'file:'].includes(target.protocol)) return false;
        const targetPath = target.protocol === 'file:' ? filePath(target) : null;
        return entries.some(entry => {
            try {
                const appUrl = new URL(entry);
                if (target.protocol === 'http:' || target.protocol === 'https:') {
                    return target.origin === appUrl.origin;
                }
                if (appUrl.protocol !== 'file:' || target.hostname !== appUrl.hostname || !targetPath) return false;
                const entryPath = filePath(appUrl);
                if (!entryPath) return false;
                // .../.webpack/renderer/<окно>/index.html -> .../.webpack/renderer/.
                const rendererRoot = posix.dirname(posix.dirname(entryPath));
                return rendererRoot !== '/' && targetPath.startsWith(rendererRoot + '/');
            } catch {
                return false;
            }
        });
    } catch {
        return false;
    }
}

let installed = false;

export function installNavigationGuard(entries: string[]): void {
    if (installed) return;
    installed = true;
    const appEntries = [...entries];
    app.on('web-contents-created', (_event, contents) => {
        const guardNavigation = (event: Electron.Event, url: string) => {
            if (!isAppUrl(url, appEntries)) event.preventDefault();
        };
        contents.on('will-navigate', guardNavigation);
        contents.on('will-redirect', guardNavigation);
        contents.setWindowOpenHandler(({ url }) => {
            try {
                const protocol = new URL(url).protocol;
                if (protocol === 'http:' || protocol === 'https:') {
                    void shell.openExternal(url).catch(() => {
                        console.warn('Не удалось открыть внешнюю ссылку');
                    });
                }
            } catch {
                // Некорректный URL также не должен создавать окно.
            }
            return { action: 'deny' };
        });
        contents.on('will-attach-webview', event => event.preventDefault());
    });
}
