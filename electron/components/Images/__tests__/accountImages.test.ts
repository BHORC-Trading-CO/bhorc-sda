jest.mock('../downloadImage', () => ({ ...jest.requireActual('../downloadImage'), __esModule: true, default: jest.fn(), downloadConfirmationIcon: jest.fn() }));

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import AccountImages from '../accountImages';
import downloadImage, { downloadConfirmationIcon } from '../downloadImage';
import ProxyUnavailableError from '../../Proxy/ProxyUnavailableError';
import { DEFAULT_AVATAR_URL } from '../../Functions/sanitizeAvatarUrl';

const avatar = `https://avatars.fastly.steamstatic.com/${'a'.repeat(40)}_full.jpg`;
const icon = 'https://community.cloudflare.steamstatic.com/economy/image/test_token-1/96fx96f';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const data = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
const proxy = 'http://test-user:test-password@proxy.test:8080';
let directory: string;
let accounts: Record<string, any>;
let getAccount: jest.Mock;
let images: AccountImages;
let now: number;

const account = (id: string, route: string | null = proxy) => ({ params: { id, secondary: { avatarUrl: avatar } }, proxyUrl: jest.fn(() => route) });
const download = downloadImage as jest.Mock;
const downloadIcon = downloadConfirmationIcon as jest.Mock;
const writeImage = async (_url: string, file: string) => { await fs.writeFile(file, jpeg); };
const until = async (condition: () => boolean) => {
    for (let i = 0; i < 100 && !condition(); i++) await new Promise(resolve => setImmediate(resolve));
    expect(condition()).toBe(true);
};

beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sda-images-'));
    accounts = { a1: account('a1') };
    getAccount = jest.fn(id => accounts[id] || null);
    now = 0;
    images = new AccountImages(() => directory, getAccount, () => now);
    download.mockReset().mockImplementation(writeImage);
    downloadIcon.mockReset().mockImplementation(writeImage);
});
afterEach(async () => { jest.restoreAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });

it('downloads through the owning proxy, returns raster data, and commits the hashed cache atomically', async () => {
    expect(await images.getAvatar('a1')).toBe(data);
    const filename = `a1-${createHash('sha1').update(avatar).digest('hex')}.jpg`;
    expect(download).toHaveBeenCalledWith(avatar, path.join(directory, filename + '.part'), proxy);
    expect(await fs.readdir(directory)).toEqual([filename]);
});

it('deliberate none passes null to the existing downloader', async () => {
    accounts.a1 = account('a1', null);
    expect(await images.getAvatar('a1')).toBe(data);
    expect(download).toHaveBeenCalledWith(avatar, expect.any(String), null);
});

it('a missing route makes neither avatar nor icon request, even with a populated cache', async () => {
    await images.getAvatar('a1');
    await images.getConfirmationIcon('a1', icon);
    download.mockClear(); downloadIcon.mockClear();
    accounts.a1.proxyUrl.mockImplementation(() => { throw new ProxyUnavailableError('deleted-proxy'); });
    expect(await images.getAvatar('a1')).toBeNull();
    expect(await images.getConfirmationIcon('a1', icon)).toBeNull();
    expect(download).not.toHaveBeenCalled();
    expect(downloadIcon).not.toHaveBeenCalled();
});

it('cache hits survive a new service instance and make no request', async () => {
    await images.getAvatar('a1');
    download.mockClear();
    images = new AccountImages(() => directory, getAccount);
    expect(await images.getAvatar('a1')).toBe(data);
    expect(download).not.toHaveBeenCalled();
});

it.each(['https://evil.test/avatar.jpg', avatar + '?token=private', avatar + '\n', 'file:///etc/passwd', DEFAULT_AVATAR_URL, ''])('does not download rejected/default avatar %j', async url => {
    accounts.a1.params.secondary.avatarUrl = url;
    expect(await images.getAvatar('a1')).toBeNull();
    expect(download).not.toHaveBeenCalled();
});

it.each(['../escape', 'a/b', 'a\\b', '', {}, undefined, 'missing-account'])('rejects unknown/unsafe account %j without network', async id => {
    expect(await images.getAvatar(id)).toBeNull();
    expect(await images.getConfirmationIcon(id, icon)).toBeNull();
    expect(download).not.toHaveBeenCalled();
    expect(downloadIcon).not.toHaveBeenCalled();
});

it('deduplicates simultaneous requests for one account and URL', async () => {
    expect(await Promise.all(Array.from({ length: 20 }, () => images.getAvatar('a1')))).toEqual(Array(20).fill(data));
    expect(download).toHaveBeenCalledTimes(1);
});

it('does not share downloads between accounts with different routes', async () => {
    accounts.a2 = account('a2', 'http://other-proxy.test:8080');
    await Promise.all([images.getAvatar('a1'), images.getAvatar('a2')]);
    expect(download).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenCalledWith(avatar, expect.stringContaining('/a2-'), 'http://other-proxy.test:8080');
});

it('caps downloads at four and resolves queued routes after deletion/change', async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    let calls = 0;
    download.mockImplementation(async (_url, file) => {
        active++; peak = Math.max(peak, active);
        if (++calls <= 4) await new Promise<void>(resolve => releases.push(resolve));
        await fs.writeFile(file, jpeg);
        active--;
    });
    for (let n = 0; n < 7; n++) accounts[`a${n}`] = account(`a${n}`);
    const results = Array.from({ length: 4 }, (_, n) => images.getAvatar(`a${n}`));
    await until(() => releases.length === 4);
    results.push(...Array.from({ length: 3 }, (_, n) => images.getAvatar(`a${n + 4}`)));
    expect(download).toHaveBeenCalledTimes(4);
    accounts.a4.proxyUrl.mockImplementation(() => { throw new ProxyUnavailableError('gone'); });
    accounts.a5.proxyUrl.mockReturnValue('http://new-proxy.test:9090');
    delete accounts.a6;
    releases.forEach(release => release());
    expect(await Promise.all(results)).toEqual([data, data, data, data, null, data, null]);
    expect(peak).toBe(4);
    expect(download).toHaveBeenCalledTimes(5);
    expect(download).toHaveBeenLastCalledWith(avatar, expect.stringContaining('/a5-'), 'http://new-proxy.test:9090');
});

it('does not cache partial failures and permits a later retry', async () => {
    download.mockImplementationOnce(async (_url, file) => { await fs.writeFile(file, jpeg); throw new Error('reset'); });
    expect(await images.getAvatar('a1')).toBeNull();
    expect(await fs.readdir(directory)).toEqual([]);
    now += 60000;
    expect(await images.getAvatar('a1')).toBe(data);
    expect(download).toHaveBeenCalledTimes(2);
});

it('reads cached avatars and icons while all download slots are stalled; icons take the next slot', async () => {
    await images.getAvatar('a1');
    await images.getConfirmationIcon('a1', icon);
    download.mockClear(); downloadIcon.mockClear();
    const releases: Array<() => void> = [];
    download.mockImplementation(async (url, file) => {
        await new Promise<void>(resolve => releases.push(resolve));
        await writeImage(url, file);
    });
    for (let n = 0; n < 8; n++) accounts[`queued${n}`] = account(`queued${n}`);
    const active = Array.from({ length: 4 }, (_, n) => images.getAvatar(`queued${n}`));
    await until(() => releases.length === 4);
    const queued = Array.from({ length: 4 }, (_, n) => images.getAvatar(`queued${n + 4}`));
    await until(() => (images as any).avatars.length === 4);
    const urgent = images.getConfirmationIcon('queued4', icon);
    await until(() => (images as any).icons.length === 1);
    expect(await images.getAvatar('a1')).toBe(data);
    expect(await images.getConfirmationIcon('a1', icon)).toBe(data);
    expect(download).toHaveBeenCalledTimes(4);
    expect(downloadIcon).not.toHaveBeenCalled();
    const avatarCallsAtIcon: number[] = [];
    downloadIcon.mockImplementation(async (url, file) => {
        avatarCallsAtIcon.push(download.mock.calls.length);
        await writeImage(url, file);
    });
    releases[0]();
    expect(await urgent).toBe(data);
    expect(avatarCallsAtIcon).toEqual([4]);
    await until(() => releases.length === 5);
    releases.slice(1).forEach(release => release());
    await until(() => releases.length === 8);
    releases.slice(5).forEach(release => release());
    expect(await Promise.all([...active, ...queued])).toEqual(Array(8).fill(data));
});

it('backs off failed account/URL requests for 1, 5, then 15 minutes without a permanent block', async () => {
    download.mockRejectedValue(new Error('offline'));
    const delays = [60000, 300000, 900000, 900000];
    for (let index = 0; index < delays.length; index++) {
        expect(await images.getAvatar('a1')).toBeNull();
        expect(download).toHaveBeenCalledTimes(index + 1);
        now += delays[index] - 1;
        expect(await images.getAvatar('a1')).toBeNull();
        expect(download).toHaveBeenCalledTimes(index + 1);
        now++;
    }
    download.mockImplementation(writeImage);
    expect(await images.getAvatar('a1')).toBe(data);
    // A successful transfer resets the escalation if the cache is later evicted.
    await fs.unlink(path.join(directory, (await fs.readdir(directory))[0]));
    download.mockRejectedValue(new Error('offline again'));
    expect(await images.getAvatar('a1')).toBeNull();
    now += 60000;
    download.mockImplementation(writeImage);
    expect(await images.getAvatar('a1')).toBe(data);
    expect(download).toHaveBeenCalledTimes(7);
});

it('keeps failure backoff separate per account and URL, including icons', async () => {
    accounts.a2 = account('a2');
    downloadIcon.mockRejectedValue(new Error('offline'));
    const otherIcon = icon.replace('test_token-1', 'other-token');
    await images.getConfirmationIcon('a1', icon);
    await images.getConfirmationIcon('a1', icon);
    expect(downloadIcon).toHaveBeenCalledTimes(1);
    await images.getConfirmationIcon('a2', icon);
    await images.getConfirmationIcon('a1', otherIcon);
    expect(downloadIcon).toHaveBeenCalledTimes(3);
    expect(await images.getAvatar('a1')).toBe(data);
});

it.each(['endpoint', 'credentials', 'proxyId', 'explicit relink'])('clears failure backoff after %s changes', async change => {
    accounts.a1.proxyId = 'proxy-a';
    download.mockRejectedValueOnce(new Error('offline'));
    expect(await images.getAvatar('a1')).toBeNull();
    expect(await images.getAvatar('a1')).toBeNull();
    expect(download).toHaveBeenCalledTimes(1);
    if (change === 'endpoint') accounts.a1.proxyUrl.mockReturnValue('http://new.test:8080');
    if (change === 'credentials') accounts.a1.proxyUrl.mockReturnValue('http://user:changed@proxy.test:8080');
    if (change === 'proxyId') accounts.a1.proxyId = 'proxy-b';
    if (change === 'explicit relink') images.invalidateRoute('a1');
    expect(await images.getAvatar('a1')).toBe(data);
    expect(download).toHaveBeenCalledTimes(2);
});

it('a failure from before relink cannot restore the cleared backoff', async () => {
    let reject!: (error: Error) => void;
    download.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const pending = images.getAvatar('a1');
    await until(() => Boolean(reject));
    images.invalidateRoute('a1');
    reject(new Error('old route failed'));
    expect(await pending).toBeNull();
    expect(await images.getAvatar('a1')).toBe(data);
    expect(download).toHaveBeenCalledTimes(2);
});

it('permanent removal deletes avatar, icon and partial files for the exact account ID only', async () => {
    const suffix = '-'.concat('a'.repeat(40));
    const deleted = ['a1' + suffix + '.jpg', 'a1' + suffix + '.img', 'a1' + suffix + '.img.part', 'a1' + suffix + '.jpg.part'];
    const retained = ['a1-child' + suffix + '.jpg', 'unrelated.txt'];
    await Promise.all([...deleted, ...retained].map(file => fs.writeFile(path.join(directory, file), jpeg)));
    delete accounts.a1;
    await images.removeAccount('a1');
    expect((await fs.readdir(directory)).sort()).toEqual(retained.sort());
});

it('startup prune removes orphan files but keeps archived and missing-proxy records', async () => {
    accounts.archived = { ...account('archived'), params: { id: 'archived', deleted: true } };
    accounts.missing = account('missing');
    accounts.missing.proxyUrl.mockImplementation(() => { throw new ProxyUnavailableError('gone'); });
    const suffix = '-'.concat('b'.repeat(40), '.img.part');
    await Promise.all(['archived', 'missing', 'orphan'].map(id => fs.writeFile(path.join(directory, id + suffix), jpeg)));
    await images.pruneOrphans();
    expect((await fs.readdir(directory)).sort()).toEqual(['archived' + suffix, 'missing' + suffix]);
    expect(accounts.missing.proxyUrl).not.toHaveBeenCalled();
    await fs.rm(directory, { recursive: true });
    await expect(images.pruneOrphans()).resolves.toBeUndefined();
});

it('removal waits for a rename already in progress before sweeping', async () => {
    const originalRename = fs.rename.bind(fs);
    let release!: () => void;
    jest.spyOn(fs, 'rename').mockImplementationOnce(async (from, to) => {
        await new Promise<void>(resolve => { release = resolve; });
        await originalRename(from, to);
    });
    const result = images.getAvatar('a1');
    await until(() => Boolean(release));
    delete accounts.a1;
    const removed = images.removeAccount('a1');
    release();
    expect(await result).toBeNull();
    await removed;
    expect(await fs.readdir(directory)).toEqual([]);
    expect(await images.getAvatar('a1')).toBeNull();
});

it('removal cancels a queued account without waiting for unrelated stalled downloads', async () => {
    const releases: Array<() => void> = [];
    download.mockImplementation(async (url, file) => {
        await new Promise<void>(resolve => releases.push(resolve));
        await writeImage(url, file);
    });
    for (let n = 0; n < 4; n++) accounts[`busy${n}`] = account(`busy${n}`);
    const busy = Array.from({ length: 4 }, (_, n) => images.getAvatar(`busy${n}`));
    await until(() => releases.length === 4);
    const queued = images.getAvatar('a1');
    await until(() => (images as any).avatars.length === 1);
    delete accounts.a1;
    await images.removeAccount('a1');
    expect(await queued).toBeNull();
    releases.forEach(release => release());
    await Promise.all(busy);
    expect(download).toHaveBeenCalledTimes(4);
    expect((await fs.readdir(directory)).some(file => file.startsWith('a1-'))).toBe(false);
});

it('rejects non-raster responses without caching or leaking them to the renderer', async () => {
    download.mockImplementation(async (_url, file) => { await fs.writeFile(file, '<svg><script>fetch("https://evil.test")</script></svg>'); });
    expect(await images.getAvatar('a1')).toBeNull();
    expect(await fs.readdir(directory)).toEqual([]);
});

it('rejects an oversized response before reading it into a data URL', async () => {
    download.mockImplementation(async (_url, file) => { await fs.writeFile(file, jpeg); await fs.truncate(file, 4 * 1024 * 1024 + 1); });
    expect(await images.getAvatar('a1')).toBeNull();
    expect(await fs.readdir(directory)).toEqual([]);
});

it('returns placeholder if the route disappears while downloading', async () => {
    download.mockImplementation(async (url, file) => {
        await writeImage(url, file);
        accounts.a1.proxyUrl.mockImplementation(() => { throw new ProxyUnavailableError('gone'); });
    });
    expect(await images.getAvatar('a1')).toBeNull();
    expect(await fs.readdir(directory)).toEqual([]);
});

it('routes and deduplicates confirmation icons, then serves the cache', async () => {
    expect(await Promise.all([images.getConfirmationIcon('a1', icon), images.getConfirmationIcon('a1', icon)])).toEqual([data, data]);
    expect(downloadIcon).toHaveBeenCalledTimes(1);
    expect(downloadIcon).toHaveBeenCalledWith(icon, expect.stringContaining('/a1-'), proxy);
    expect(download).not.toHaveBeenCalled();
    downloadIcon.mockClear();
    expect(await images.getConfirmationIcon('a1', icon)).toBe(data);
    expect(downloadIcon).not.toHaveBeenCalled();
    expect(await images.getConfirmationIcon('a1', 'https://evil.test/icon')).toBeNull();
    expect(downloadIcon).not.toHaveBeenCalled();
});
