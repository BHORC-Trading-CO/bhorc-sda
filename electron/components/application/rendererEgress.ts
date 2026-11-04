import { app, session, Session } from 'electron';

/** Forge выдаёт http://localhost:3000/<window>; WS HMR использует тот же origin. */
export function shouldBlockRendererRequest(rawUrl: string, packaged: boolean, entries: string[]): boolean {
    try {
        const url = new URL(rawUrl);
        if (['file:', 'data:', 'blob:', 'about:', 'devtools:', 'chrome-devtools:'].includes(url.protocol)) return false;
        if (packaged || url.username || url.password) return true;
        return !entries.some(entry => {
            try {
                const dev = new URL(entry);
                if (!['http:', 'https:'].includes(dev.protocol) ||
                    !['localhost', '127.0.0.1', '[::1]'].includes(dev.hostname) || dev.username || dev.password) return false;
                const socket = new URL(dev.origin);
                socket.protocol = dev.protocol === 'https:' ? 'wss:' : 'ws:';
                return url.origin === dev.origin || url.origin === socket.origin;
            } catch { return false; }
        });
    } catch { return true; }
}

let installed = false;

/** Ставится до firstStage/ready: ни одно окно не успевает начать загрузку без фильтра. */
export function installRendererEgress(entries: string[]): void {
    if (installed) return;
    installed = true;
    const protectedSessions = new WeakSet<Session>();
    const loggedHosts = new Set<string>();
    const protect = (target: Session) => {
        if (protectedSessions.has(target)) return;
        protectedSessions.add(target);
        target.webRequest.onBeforeRequest((details, callback) => {
            const cancel = shouldBlockRendererRequest(details.url, app.isPackaged, entries);
            if (cancel) {
                try {
                    const host = new URL(details.url).hostname;
                    if (host && !loggedHosts.has(host)) {
                        loggedHosts.add(host);
                        // Только host: путь, query и userinfo могут содержать токены.
                        console.warn(`Renderer network request blocked: ${host}`);
                    }
                } catch { /* Не печатаем непроверенную строку URL. */ }
            }
            callback({ cancel });
        });
    };
    app.on('session-created', protect);
    app.on('web-contents-created', (_event, contents) => protect(contents.session));
    if (app.isReady()) protect(session.defaultSession);
    else app.once('ready', () => protect(session.defaultSession));
}
