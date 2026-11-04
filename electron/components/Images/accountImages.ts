import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import downloadImage, { downloadConfirmationIcon, MAX_IMAGE_BYTES } from './downloadImage';
import sanitizeAvatarUrl, { DEFAULT_AVATAR_URL } from '../Functions/sanitizeAvatarUrl';
import { sanitizeConfirmationIconUrl } from './confirmationIcon';

interface ImageAccount {
    params: { id: string, secondary?: { avatarUrl?: string } };
    proxyUrl(): string | null;
}

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
    private waiting: Array<() => void> = [];
    private inFlight = new Map<string, Promise<string | null>>();

    constructor(private cacheDirectory: () => string, private getAccount: (id: string) => ImageAccount | null) {}

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
        if (!account || account.params.id !== id) throw new Error('Image account not found');
        account.proxyUrl(); // missing -> null даже при наличии кеша; direct только при deliberate none.
        return account;
    }

    private schedule(task: () => Promise<string | null>): Promise<string | null> {
        return new Promise(resolve => {
            const run = () => {
                this.active++;
                Promise.resolve().then(task).catch(() => null).then(resolve).finally(() => {
                    this.active--;
                    this.waiting.shift()?.();
                });
            };
            if (this.active < 4) run();
            else this.waiting.push(run);
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
        const existing = this.inFlight.get(file);
        if (existing) return existing;
        const result = this.schedule(async () => {
            const currentAccount = () => {
                const account = this.account(id);
                if (kind === 'avatar' && account.params.secondary?.avatarUrl !== url) throw new Error('Avatar changed');
                return account;
            };
            currentAccount();
            const cached = await this.read(file);
            if (cached) { currentAccount(); return cached; }
            const temporary = `${file}.part`;
            try {
                await fs.mkdir(this.cacheDirectory(), { recursive: true, mode: 0o700 });
                // После очереди и всех fs await: удалённый прокси не превращается в direct.
                const proxy = currentAccount().proxyUrl();
                if (kind === 'avatar') await downloadImage(url, temporary, proxy);
                else await downloadConfirmationIcon(url, temporary, proxy);
                const data = await this.read(temporary);
                if (!data) return null;
                currentAccount();
                await fs.rename(temporary, file);
                return data;
            } finally {
                await fs.unlink(temporary).catch(() => {});
            }
        });
        this.inFlight.set(file, result);
        result.finally(() => { this.inFlight.delete(file); });
        return result;
    }
}
