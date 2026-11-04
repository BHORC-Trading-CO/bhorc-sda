import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import downloadImage, { downloadConfirmationIcon, MAX_IMAGE_BYTES } from './downloadImage';
import sanitizeAvatarUrl, { DEFAULT_AVATAR_URL } from '../Functions/sanitizeAvatarUrl';
import { sanitizeConfirmationIconUrl } from './confirmationIcon';

interface ImageAccount {
    params: { id: string, secondary?: { avatarUrl?: string } };
    proxyId?: string | null;
    proxyState?: string;
    proxyUrl(): string | null;
}

const CACHE_FILE = /^([A-Za-z0-9_-]{1,128})-[a-f0-9]{40}\.(?:jpg|img)(?:\.part)?$/;
type QueuedDownload = { id: string, run: () => void, cancel: () => void };
type Failure = { id: string, revision: number, attempts: number, retryAt: number };

/** Только растровые данные; HTML/SVG с CDN не попадают в renderer. */
function imageDataUrl(bytes: Buffer): string | null {
    let mime: string;
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
    else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png';
    else if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) mime = 'image/gif';
    else if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
    else return null;
    return `data:${mime};base64,${bytes.toString('base64')}`;
}

export default class AccountImages {
    private active = 0;
    private avatars: QueuedDownload[] = [];
    private icons: QueuedDownload[] = [];
    private inFlight = new Map<string, { id: string, result: Promise<string | null> }>();
    private failures = new Map<string, Failure>();
    private routes = new Map<string, string>();
    private revisions = new Map<string, number>();
    private removed = new Set<string>();

    constructor(private cacheDirectory: () => string, private getAccount: (id: string) => ImageAccount | null,
        private now: () => number = Date.now) {}

    /** Явный relink тоже сбрасывает backoff, даже если URL прокси не изменился. */
    invalidateRoute(id: string): void {
        this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
        this.failures.forEach((failure, key) => { if (failure.id === id) this.failures.delete(key); });
    }

    async removeAccount(id: string): Promise<void> {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return;
        this.removed.add(id);
        this.invalidateRoute(id);
        const retain = (task: QueuedDownload) => {
            if (task.id !== id) return true;
            task.cancel();
            return false;
        };
        this.icons = this.icons.filter(retain);
        this.avatars = this.avatars.filter(retain);
        // Запрет новых задач — синхронно, sweep — после старых writer/rename.
        await Promise.all(Array.from(this.inFlight.values()).filter(job => job.id === id).map(job => job.result));
        const files = await this.cacheFiles();
        await Promise.all(files.filter(file => CACHE_FILE.exec(file)?.[1] === id)
            .map(file => this.unlink(path.join(this.cacheDirectory(), file))));
    }

    async pruneOrphans(): Promise<void> {
        const ids = new Set<string>();
        for (const file of await this.cacheFiles()) {
            const id = CACHE_FILE.exec(file)?.[1];
            // Архивные и missing-proxy аккаунты существуют и сохраняют кеш.
            if (id && !this.getAccount(id)) ids.add(id);
        }
        await Promise.all(Array.from(ids).map(id => this.removeAccount(id)));
    }

    private async cacheFiles(): Promise<string[]> {
        try { return await fs.readdir(this.cacheDirectory()); }
        catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []; throw err; }
    }

    private async unlink(file: string): Promise<void> {
        try { await fs.unlink(file); }
        catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
    }

    private observeRoute(account: ImageAccount): void {
        let proxy: string | null;
        let error: unknown;
        let failed = false;
        try { proxy = account.proxyUrl(); } catch (err) { error = err; failed = true; proxy = null; }
        // Не сохраняем пароль прокси в ключе/логах backoff.
        const key = createHash('sha256').update(JSON.stringify([account.proxyId, account.proxyState, proxy, failed])).digest('hex');
        const id = account.params.id;
        if (this.routes.get(id) !== key) {
            this.invalidateRoute(id);
            this.routes.set(id, key);
        }
        if (failed) throw error;
    }

    async getAvatar(accountId: unknown): Promise<string | null> {
        try {
            const account = this.account(accountId);
            const url = account.params.secondary?.avatarUrl;
            if (!url || url === DEFAULT_AVATAR_URL || sanitizeAvatarUrl(url) !== url) return null;
            return await this.load(account.params.id, url, 'avatar');
        } catch { return null; }
    }

    async getConfirmationIcon(accountId: unknown, value: unknown): Promise<string | null> {
        try {
            const url = sanitizeConfirmationIconUrl(value);
            if (!url) return null;
            return await this.load(this.account(accountId).params.id, url, 'icon');
        } catch { return null; }
    }

    private account(id: unknown): ImageAccount {
        // Имя файла — один сегмент, включая импортированные ID.
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid image account');
        const account = this.getAccount(id);
        if (!account || account.params.id !== id || this.removed.has(id)) throw new Error('Image account not found');
        this.observeRoute(account); // missing -> null даже при наличии кеша; direct только при deliberate none.
        return account;
    }

    private schedule(id: string, kind: 'avatar' | 'icon', task: () => Promise<string | null>): Promise<string | null> {
        return new Promise(resolve => {
            const run = () => {
                this.active++;
                Promise.resolve().then(task).catch(() => null).then(resolve).finally(() => {
                    this.active--;
                    (this.icons.shift() || this.avatars.shift())?.run();
                });
            };
            if (this.active < 4) run();
            else (kind === 'icon' ? this.icons : this.avatars).push({ id, run, cancel: () => resolve(null) });
        });
    }

    private async read(file: string): Promise<string | null> {
        try {
            const stat = await fs.stat(file);
            if (!stat.isFile() || stat.size === 0 || stat.size > MAX_IMAGE_BYTES) return null;
            const bytes = await fs.readFile(file);
            return bytes.length <= MAX_IMAGE_BYTES ? imageDataUrl(bytes) : null;
        } catch { return null; }
    }

    private load(id: string, url: string, kind: 'avatar' | 'icon'): Promise<string | null> {
        const hash = createHash('sha1').update(url).digest('hex');
        const file = path.join(this.cacheDirectory(), `${id}-${hash}.${kind === 'avatar' ? 'jpg' : 'img'}`);
        const failureKey = `${id}:${hash}`;
        const existing = this.inFlight.get(file);
        if (existing) return existing.result;
        const currentAccount = () => {
            const account = this.account(id);
            if (kind === 'avatar' && account.params.secondary?.avatarUrl !== url) throw new Error('Avatar changed');
            return account;
        };
        const backingOff = () => (this.failures.get(failureKey)?.retryAt ?? 0) > this.now();
        const load = async () => {
            currentAccount();
            const cached = await this.read(file);
            currentAccount();
            // Кеш не занимает сетевой слот и не ждёт медленных прокси.
            if (cached) { this.failures.delete(failureKey); return cached; }
            if (backingOff()) return null;
            return this.schedule(id, kind, async () => {
                currentAccount();
                if (backingOff()) return null;
                await fs.mkdir(this.cacheDirectory(), { recursive: true, mode: 0o700 });
                const proxy = currentAccount().proxyUrl();
                const revision = this.revisions.get(id)!;
                const temporary = `${file}.part`;
                try {
                    if (kind === 'avatar') await downloadImage(url, temporary, proxy);
                    else await downloadConfirmationIcon(url, temporary, proxy);
                    const data = await this.read(temporary);
                    if (!data) throw new Error('Invalid image bytes');
                    currentAccount();
                    await fs.rename(temporary, file);
                    currentAccount();
                    this.failures.delete(failureKey);
                    return data;
                } catch {
                    try {
                        currentAccount();
                        // Старый transfer не восстанавливает backoff после relink/delete.
                        if (this.revisions.get(id) === revision) {
                            const attempts = Math.min((this.failures.get(failureKey)?.attempts ?? 0) + 1, 3);
                            this.failures.set(failureKey, { id, revision, attempts, retryAt: this.now() + [60000, 300000, 900000][attempts - 1] });
                        }
                    } catch { /* Исчезнувший аккаунт/маршрут не оставляет negative cache. */ }
                    return null;
                } finally {
                    await fs.unlink(temporary).catch(() => {});
                }
            });
        };
        const result = load().catch(() => null);
        this.inFlight.set(file, { id, result });
        result.finally(() => { this.inFlight.delete(file); });
        return result;
    }
}
