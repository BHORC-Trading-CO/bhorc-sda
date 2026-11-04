jest.mock('request', () => jest.fn());

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import request from 'request';
import AccountImages from '../accountImages';
import { MAX_IMAGE_BYTES } from '../downloadImage';

const avatar = `https://avatars.fastly.steamstatic.com/${'a'.repeat(40)}_full.jpg`;
const icon = 'https://community.fastly.steamstatic.com/economy/image/item/96fx96f';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
type Request = PassThrough & { abort: jest.Mock };
let directory: string;
let requests: Request[];
let images: AccountImages;
const until = async (condition: () => boolean) => {
    for (let i = 0; i < 100 && !condition(); i++) await new Promise(resolve => setImmediate(resolve));
    expect(condition()).toBe(true);
};

beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sda-image-queue-'));
    requests = [];
    (request as unknown as jest.Mock).mockImplementation(() => {
        const req = Object.assign(new PassThrough(), { abort: jest.fn() });
        req.abort.mockImplementation(() => req.destroy());
        requests.push(req);
        return req;
    });
    images = new AccountImages(() => directory, id => ({ params: { id, secondary: { avatarUrl: avatar } }, proxyUrl: () => 'http://proxy.test:8080' }));
});
afterEach(async () => {
    jest.useRealTimers();
    await fs.rm(directory, { recursive: true, force: true });
});

it('four stalled avatars abort and release the queue for a successful confirmation icon', async () => {
    const avatars = Array.from({ length: 4 }, (_, n) => images.getAvatar(`account${n}`));
    await until(() => requests.length === 4);
    const confirmation = images.getConfirmationIcon('account4', icon);
    jest.advanceTimersByTime(15000);
    expect(await Promise.all(avatars)).toEqual([null, null, null, null]);
    await until(() => requests.length === 5);
    expect(requests.slice(0, 4).every(req => req.abort.mock.calls.length === 1)).toBe(true);
    requests[4].emit('response', { statusCode: 200 });
    requests[4].end(jpeg);
    expect(await confirmation).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    expect((request as unknown as jest.Mock).mock.calls.every(([options]) => options.proxy === 'http://proxy.test:8080')).toBe(true);
    expect(await fs.readdir(directory)).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
});

it('an immediate stream failure cannot leave a partial cache entry', async () => {
    const result = images.getAvatar('account');
    await until(() => requests.length === 1);
    requests[0].emit('response', { statusCode: 200 });
    requests[0].emit('error', new Error('connection reset'));
    expect(await result).toBeNull();
    // Дать незавершённому open/close файлового потока закончиться.
    await new Promise(resolve => setImmediate(resolve));
    expect(await fs.readdir(directory)).toEqual([]);
});

it('oversized avatar streaming aborts before it can become a cache hit', async () => {
    const result = images.getAvatar('account');
    await until(() => requests.length === 1);
    requests[0].emit('response', { statusCode: 200 });
    requests[0].write(Buffer.alloc(MAX_IMAGE_BYTES + 1));
    expect(await result).toBeNull();
    await new Promise(resolve => setImmediate(resolve));
    expect(requests[0].abort).toHaveBeenCalledTimes(1);
    expect(await fs.readdir(directory)).toEqual([]);
});
