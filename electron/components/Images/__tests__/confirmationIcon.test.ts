jest.mock('request', () => jest.fn());
jest.mock('fs', () => ({ createWriteStream: jest.fn() }));

import request from 'request';
import fs from 'fs';
import { PassThrough } from 'stream';
import { sanitizeConfirmationIconUrl } from '../confirmationIcon';
import downloadImage, { downloadConfirmationIcon, MAX_IMAGE_BYTES } from '../downloadImage';
import { DEFAULT_AVATAR_URL } from '../../Functions/sanitizeAvatarUrl';

const url = 'https://community.fastly.steamstatic.com/economy/image/abc_DEF-123/96fx96f';
let req: PassThrough & { abort: jest.Mock };
let output: PassThrough;

beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    req = Object.assign(new PassThrough(), { abort: jest.fn() });
    output = new PassThrough();
    output.resume();
    (request as unknown as jest.Mock).mockReturnValue(req);
    (fs.createWriteStream as jest.Mock).mockReturnValue(output);
});
afterEach(() => { jest.useRealTimers(); });

it.each(['community.fastly.steamstatic.com', 'community.akamai.steamstatic.com', 'community.cloudflare.steamstatic.com', 'community.steamstatic.com', 'steamcommunity-a.akamaihd.net', 'steamcommunity.com'])('accepts exact economy host %s', host => {
    const candidate = url.replace('community.fastly.steamstatic.com', host);
    expect(sanitizeConfirmationIconUrl(candidate)).toBe(candidate);
});

it('also accepts avatar-shaped trade confirmation icons', () => {
    expect(sanitizeConfirmationIconUrl(DEFAULT_AVATAR_URL)).toBe(DEFAULT_AVATAR_URL);
});

it.each([
    'https://evil.test/economy/image/abc', url + '?redirect=https://evil.test/', url + '\n',
    url.replace('https:', 'http:'), url.replace('https://', 'https://user:pass@'),
    url.replace('.com/', '.com.evil.test/'), url.replace('.com/', '.com:443/'),
    url.replace('/economy/', '/x/../economy/'), url.replace('/image/', '/image/%2e%2e/'),
    url.replace('/image/', '/image/a/../'), url.replace('/image/', '/image/a\\'),
    'file:///tmp/icon', 'data:image/svg+xml,<svg/>', 'http://unix:/tmp/socket:/icon', '', undefined, {},
])('rejects %j before request or disk write', async value => {
    expect(sanitizeConfirmationIconUrl(value)).toBeNull();
    await expect(downloadConfirmationIcon(value as any, '/unused/icon', null)).rejects.toThrow('Invalid');
    expect(request).not.toHaveBeenCalled();
    expect(fs.createWriteStream).not.toHaveBeenCalled();
});

it.each([null, 'http://proxy.test:8080'])('uses the requested route %s and disables all redirects', async proxy => {
    const promise = downloadConfirmationIcon(url, '/unused/icon', proxy);
    req.emit('response', { statusCode: 200 });
    req.end(Buffer.from('raster-bytes'));
    await promise;
    expect(request).toHaveBeenCalledWith({ url, proxy: proxy || undefined, followRedirect: false, followAllRedirects: false, timeout: 15000 });
    expect(fs.createWriteStream).toHaveBeenCalledWith('/unused/icon', { mode: 0o600 });
    expect(jest.getTimerCount()).toBe(0);
});

it.each([301, 302, 307, 404])('rejects status %s without following Location', async statusCode => {
    const promise = downloadConfirmationIcon(url, '/unused/icon', null);
    req.emit('response', { statusCode, headers: { location: 'https://evil.test/leak' } });
    await expect(promise).rejects.toThrow('HTTP');
    expect(req.abort).toHaveBeenCalledTimes(1);
    expect(fs.createWriteStream).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
});

it('aborts slow downloads at the total deadline', async () => {
    const promise = downloadConfirmationIcon(url, '/unused/icon', null);
    const assertion = expect(promise).rejects.toThrow('timed out');
    jest.advanceTimersByTime(15000);
    await assertion;
    expect(req.abort).toHaveBeenCalledTimes(1);
    req.emit('response', { statusCode: 200 });
    expect(fs.createWriteStream).not.toHaveBeenCalled();
});

it('aborts oversized images and destroys partial output', async () => {
    const promise = downloadConfirmationIcon(url, '/unused/icon', null);
    req.emit('response', { statusCode: 200 });
    req.write(Buffer.alloc(MAX_IMAGE_BYTES + 1));
    await expect(promise).rejects.toThrow('too large');
    expect(req.abort).toHaveBeenCalledTimes(1);
    expect(output.destroyed).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
});

it('aborts on stream errors without returning a partial image', async () => {
    const promise = downloadConfirmationIcon(url, '/unused/icon', null);
    req.emit('response', { statusCode: 200 });
    output.emit('error', new Error('disk full'));
    await expect(promise).rejects.toThrow('disk full');
    expect(req.abort).toHaveBeenCalledTimes(1);
});

it('avatar wrapper keeps the original strict allowlist and proxy argument', async () => {
    await expect(downloadImage(url, '/unused/avatar', null)).rejects.toThrow('Invalid avatar');
    expect(request).not.toHaveBeenCalled();
    const promise = downloadImage(DEFAULT_AVATAR_URL, '/unused/avatar', 'http://proxy.test:8080');
    req.emit('response', { statusCode: 200 });
    req.end(Buffer.from('raster-bytes'));
    await promise;
    expect(request).toHaveBeenCalledWith({ url: DEFAULT_AVATAR_URL, proxy: 'http://proxy.test:8080', followRedirect: false, followAllRedirects: false, timeout: 15000 });
});

it('avatar downloads also abort at the total deadline and release their caller', async () => {
    const promise = downloadImage(DEFAULT_AVATAR_URL, '/unused/avatar', 'http://unresponsive-proxy.test:8080');
    const assertion = expect(promise).rejects.toThrow('timed out');
    jest.advanceTimersByTime(15000);
    await assertion;
    expect(req.abort).toHaveBeenCalledTimes(1);
});

it('avatar downloads also stop at the streaming byte limit', async () => {
    const promise = downloadImage(DEFAULT_AVATAR_URL, '/unused/avatar', null);
    req.emit('response', { statusCode: 200 });
    req.write(Buffer.alloc(MAX_IMAGE_BYTES + 1));
    await expect(promise).rejects.toThrow('too large');
    expect(req.abort).toHaveBeenCalledTimes(1);
    expect(output.destroyed).toBe(true);
});
