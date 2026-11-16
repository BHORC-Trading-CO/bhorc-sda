import { confirmationErrorMessage, fetchConfirmations, isBatchableConfirmation, parseConfirmations, respondToConfirmations, scrubConfirmationSecrets } from '../Functions/mobileConfirmations';
import fixture from './fixtures/mobileConfirmations.json';

const SECRET = Buffer.from('synthetic-identity').toString('base64');
const ref = (id: string, type = 2, multi = true) => ({ id, nonce: `fake-${id}`, type, multi });
const client = (implementation?: any) => ({
    steamID: { getSteamID64: () => '76561198000000001' },
    _notifySessionExpired: jest.fn(),
    httpRequest: jest.fn(implementation || ((_options, callback) => callback(null, { statusCode: 200 }, fixture))),
} as any);

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('parses synthetic types 2/3/9/12/13/99, all summaries, warnings, labels, and nullable creators', async () => {
    const confirmations = await fetchConfirmations(client(), SECRET, 1700000000);
    expect(confirmations.map(c => c.type)).toEqual([2, 3, 9, 12, 13, 99]);
    expect(confirmations[0]).toMatchObject({ id: '1002', nonce: 'synthetic-trade', creatorId: null, summary: fixture.conf[0].summary, acceptLabel: 'Send offer', cancelLabel: 'Cancel offer', createdAt: 1700000000 });
    expect(confirmations[2]).toMatchObject({ creatorId: null, warn: 'Only approve a request you started', icon: '', multi: true });
    expect(confirmations[5].typeName).toBe('Future action');
});

it('skips missing ids/nonces without logging and tolerates malformed optional fields', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseConfirmations([null, {}, { id: '1' }, { nonce: 'private' }, { id: '', nonce: 'private' }, {
        id: 7, nonce: 8, creator_id: null, type: '12', summary: ['line', null, {}], creation_time: 'bad', warn: {},
    }])).toEqual([expect.objectContaining({ id: '7', nonce: '8', type: 12, creatorId: null, summary: ['line'], createdAt: 0, warn: null })]);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
});

it.each([2, 3, 5, 6, 9, 10, 11, 12, 13, 99])('defaults missing multi only for trades/listings (%i)', type => {
    const [confirmation] = parseConfirmations([{ id: '1', nonce: 'fake', type }]);
    expect(confirmation.multi).toBe(type === 2 || type === 3);
    expect(parseConfirmations([{ id: '1', nonce: 'fake', type, multi: false }])[0].multi).toBe(false);
});

it.each([5, 6, 9, 10, 11, 12, 13])('never batches protected type %i even if Steam supplies multi=true', type => {
    expect(isBatchableConfirmation(ref('1', type))).toBe(false);
});

it('reports needauth and notifies session expiration', async () => {
    const community = client((_options, callback) => callback(null, {}, { success: false, needauth: true }));
    await expect(fetchConfirmations(community, SECRET)).rejects.toThrow('Not Logged In');
    expect(community._notifySessionExpired).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not Logged In' }));
});

it.each([{ message: 'Steam message' }, { detail: 'Steam detail' }])('preserves list errors %j', body => {
    return expect(fetchConfirmations(client((_options, callback) => callback(null, {}, { success: false, ...body })), SECRET)).rejects.toThrow(body.message || body.detail);
});

it('rejects synchronous request errors, missing login, and malformed JSON', async () => {
    await expect(fetchConfirmations(client(() => { throw new Error('blocked route'); }), SECRET)).rejects.toThrow('blocked route');
    await expect(fetchConfirmations({ ...client(), steamID: null }, SECRET)).rejects.toThrow('Not Logged In');
    await expect(fetchConfirmations(client((_options, callback) => callback(null, {}, '<html>')), SECRET)).rejects.toThrow('Failed to get confirmation list');
});

it('bounds a request whose callback never fires', async () => {
    jest.useFakeTimers();
    const pending = expect(fetchConfirmations(client(() => undefined), SECRET)).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(31000);
    await pending;
});

it('sends one trade POST then sequential API-key/purchase GETs with fresh t and >=1s spacing', async () => {
    jest.useFakeTimers({ now: 1700000000250 });
    const calls: any[] = [];
    const community = client((options, callback, source) => {
        calls.push({ ...options, at: Date.now(), source });
        callback(null, { statusCode: 200 }, { success: true });
    });
    const refs = [ref('1'), ref('2'), ref('9', 9), ref('12', 12, true)];
    const pending = respondToConfirmations(community, SECRET, refs, true);
    await jest.advanceTimersByTimeAsync(2500);
    expect(await pending).toEqual(refs.map(r => ({ id: r.id, ok: true })));
    expect(calls.map(c => [c.method, c.uri.split('/').pop()])).toEqual([['POST', 'multiajaxop'], ['GET', 'ajaxop'], ['GET', 'ajaxop']]);
    expect(calls[0].form).toMatchObject({ op: 'allow', 'cid[]': ['1', '2'], 'ck[]': ['fake-1', 'fake-2'], m: 'react', tag: 'allow' });
    expect(calls[1].qs).toMatchObject({ cid: '9', ck: 'fake-9' });
    expect(calls[2].qs).toMatchObject({ cid: '12', ck: 'fake-12' });
    expect(calls.map(c => (c.form || c.qs).t)).toEqual([1700000000, 1700000001, 1700000002]);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(1000);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(1000);
    expect(calls.every(c => c.source === 'steamcommunity')).toBe(true);
});

it.each(['steam', 'http'])('falls back only from an explicit batch refusal (%s) and keeps each item message', async failure => {
    jest.useFakeTimers();
    const community = client((options, callback) => {
        if (options.method === 'POST') callback(null, { statusCode: failure === 'http' ? 500 : 200 }, failure === 'http' ? undefined : { success: false, message: 'Batch failed' });
        else callback(null, { statusCode: 200 }, options.qs.cid === '1' ? { success: true, message: 'Done' } : { success: false, message: 'Item expired' });
    });
    const pending = respondToConfirmations(community, SECRET, [ref('1'), ref('2')], false);
    await jest.advanceTimersByTimeAsync(2500);
    expect(await pending).toEqual([{ id: '1', ok: true, message: 'Done' }, { id: '2', ok: false, message: 'Item expired' }]);
    expect(community.httpRequest).toHaveBeenCalledTimes(3);
    expect(community.httpRequest.mock.calls[1][0].qs.op).toBe('cancel');
});

it('uses ajaxop for a single multi item and serializes overlapping allow/cancel calls', async () => {
    jest.useFakeTimers({ now: 1700000000000 });
    const community = client();
    const first = respondToConfirmations(community, SECRET, [ref('1')], true);
    const second = respondToConfirmations(community, SECRET, [ref('2')], false);
    await jest.advanceTimersByTimeAsync(1500);
    await Promise.all([first, second]);
    const calls = community.httpRequest.mock.calls;
    expect(calls.map(([options]) => [options.method, options.qs.op, options.qs.t])).toEqual([['GET', 'allow', 1700000000], ['GET', 'cancel', 1700000001]]);
});

it('waits for one response before starting the next', async () => {
    jest.useFakeTimers();
    let complete: any;
    const community = client((_options, callback) => { complete = callback; });
    const pending = respondToConfirmations(community, SECRET, [ref('9', 9), ref('12', 12, false)], true);
    await jest.advanceTimersByTimeAsync(5000);
    expect(community.httpRequest).toHaveBeenCalledTimes(1);
    complete(null, {}, { success: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(community.httpRequest).toHaveBeenCalledTimes(2);
    complete(null, {}, { success: true });
    await expect(pending).resolves.toEqual([{ id: '9', ok: true }, { id: '12', ok: true }]);
});

it('does not send a queued item after its account route changes', async () => {
    jest.useFakeTimers();
    const community = client();
    let allowed = true;
    const pending = respondToConfirmations(community, SECRET, [ref('9', 9), ref('12', 12, false), ref('13', 13)], true, () => {
        if (!allowed) throw new Error('Proxy is unavailable');
    });
    await jest.advanceTimersByTimeAsync(0);
    allowed = false;
    await jest.advanceTimersByTimeAsync(1500);
    expect(await pending).toEqual([{ id: '9', ok: true }, { id: '12', ok: false, stopped: true, message: 'Proxy is unavailable' }, { id: '13', ok: false, stopped: true, notSent: true, message: 'Proxy is unavailable' }]);
    expect(community.httpRequest).toHaveBeenCalledTimes(1);
});

it('does no request for an empty selection or missing nonce', async () => {
    const community = client();
    expect(await respondToConfirmations(community, SECRET, [], true)).toEqual([]);
    expect(await respondToConfirmations(community, SECRET, [{ ...ref('1'), nonce: '' }], true)).toEqual([{ id: '1', ok: false, message: 'Missing confirmation id or nonce' }]);
    expect(community.httpRequest).not.toHaveBeenCalled();
});

describe.each(['batch', 'singles'])('%s operation stop rules', mode => {
    const selection = () => mode === 'batch' ? [ref('1'), ref('2'), ref('9', 9)] : [ref('9', 9), ref('12', 12, true)];

    it('needauth stops after one request and notifies session expiry once', async () => {
        const community = client((_options, callback) => callback(null, { statusCode: 200 }, { success: false, needauth: true }));
        const results = await respondToConfirmations(community, SECRET, selection(), true);
        expect(results.every(result => !result.ok && result.stopped && result.message === 'Not Logged In')).toBe(true);
        expect(results.some(result => result.unknown)).toBe(false);
        expect(community.httpRequest).toHaveBeenCalledTimes(1);
        expect(community._notifySessionExpired).toHaveBeenCalledTimes(1);
    });

    it.each(['PROXY_UNAVAILABLE', 'CONFIRMATION_ROUTE_CHANGED'])('%s stops without individual retries', async code => {
        const community = client((_options, callback) => callback(Object.assign(new Error('Connection blocked'), { code })));
        const results = await respondToConfirmations(community, SECRET, selection(), false);
        expect(results.every(result => result.stopped && result.message === 'Connection blocked' && !result.unknown)).toBe(true);
        expect(community.httpRequest).toHaveBeenCalledTimes(1);
    });

    it('HTTP 429 stops with Steam message instead of multiplying requests', async () => {
        const community = client((_options, callback) => callback(Object.assign(new Error('HTTP error 429'), { code: 429 }), { statusCode: 429 }, { success: false, message: 'Wait before trying again' }));
        const results = await respondToConfirmations(community, SECRET, selection(), true);
        expect(results.every(result => result.stopped && result.message === 'Wait before trying again' && !result.unknown)).toBe(true);
        expect(community.httpRequest).toHaveBeenCalledTimes(1);
    });

    it.each(['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'])('%s reports unknown outcomes and never resends', async code => {
        const community = client((_options, callback) => callback(Object.assign(new Error(code), { code }), { statusCode: 200 }, { success: false, message: 'Incomplete response must not trigger fallback' }));
        const refs = selection();
        const results = await respondToConfirmations(community, SECRET, refs, true);
        const attempted = mode === 'batch' ? 2 : 1;
        expect(results.slice(0, attempted)).toEqual(refs.slice(0, attempted).map(r => ({ id: r.id, ok: false, stopped: true, unknown: true, message: 'Outcome unknown; refresh the confirmation list before retrying' })));
        expect(results.slice(attempted).every(result => result.notSent && result.stopped && !result.unknown)).toBe(true);
        expect(community.httpRequest).toHaveBeenCalledTimes(1);
    });

    it('callback deadline reports unknown, ignores late replies, and never resends', async () => {
        jest.useFakeTimers();
        let complete: any;
        const community = client((_options, callback) => { complete = callback; });
        const pending = respondToConfirmations(community, SECRET, selection(), true);
        await jest.advanceTimersByTimeAsync(31000);
        const results = await pending;
        expect(results[0]).toMatchObject({ ok: false, stopped: true, unknown: true, message: expect.stringContaining('refresh') });
        complete(null, {}, { success: true });
        complete(null, {}, { success: false, needauth: true });
        await jest.advanceTimersByTimeAsync(5000);
        expect(community.httpRequest).toHaveBeenCalledTimes(1);
        expect(community._notifySessionExpired).not.toHaveBeenCalled();
        expect(results[0].unknown).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
    });
});

it('a route guard failure before the batch makes no HTTP request', async () => {
    const community = client();
    const beforeRequest = jest.fn(() => { throw new Error('Route changed'); });
    const results = await respondToConfirmations(community, SECRET, [ref('1'), ref('2'), ref('9', 9)], true, beforeRequest);
    expect(results.every(result => result.stopped && result.message === 'Route changed')).toBe(true);
    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(community.httpRequest).not.toHaveBeenCalled();
});

it('a malformed batch response is unknown, not an explicit refusal eligible for fallback', async () => {
    const community = client((_options, callback) => callback(null, { statusCode: 200 }, '<html>'));
    const results = await respondToConfirmations(community, SECRET, [ref('1'), ref('2')], true);
    expect(results.every(result => result.unknown && result.stopped)).toBe(true);
    expect(community.httpRequest).toHaveBeenCalledTimes(1);
});

it('needauth during fallback stops the remaining fallback and non-batch requests', async () => {
    jest.useFakeTimers();
    const community = client((options, callback) => callback(null, { statusCode: 200 }, options.method === 'POST'
        ? { success: false, message: 'Batch rejected' } : { success: false, needauth: true }));
    const pending = respondToConfirmations(community, SECRET, [ref('1'), ref('2'), ref('9', 9)], true);
    await jest.advanceTimersByTimeAsync(5000);
    expect((await pending).every(result => result.stopped && result.message === 'Not Logged In')).toBe(true);
    expect(community.httpRequest).toHaveBeenCalledTimes(2);
    expect(community._notifySessionExpired).toHaveBeenCalledTimes(1);
});

it('purchases with multi=true always use individual GET requests until the live probe', async () => {
    jest.useFakeTimers();
    const community = client();
    const pending = respondToConfirmations(community, SECRET, [ref('12a', 12, true), ref('12b', 12, true)], true);
    await jest.advanceTimersByTimeAsync(1500);
    expect(await pending).toEqual([{ id: '12a', ok: true }, { id: '12b', ok: true }]);
    expect(community.httpRequest.mock.calls.map(([options]) => [options.method, options.qs.cid])).toEqual([['GET', '12a'], ['GET', '12b']]);
});

// A signed mobileconf URL carries the confirmation key (k) and the item nonce (ck); the request
// library quotes the URL in some transport errors (redirect loop), and error text reaches the window.
describe('signed URLs never reach error text', () => {
    const signedUrl = (endpoint: string, extra = '') =>
        `https://steamcommunity.com/mobileconf/${endpoint}?op=allow&cid=1002&ck=NONCE-VALUE&p=android:device&a=76561198000000001&k=SIGNATURE-VALUE&t=1700000000&m=react&tag=allow${extra}`;
    const redirectLoop = (endpoint: string) =>
        Object.assign(new Error(`Exceeded maxRedirects. Probably stuck in a redirect loop ${signedUrl(endpoint)}`), {});
    const clean = (message: unknown) => {
        expect(String(message)).not.toContain('NONCE-VALUE');
        expect(String(message)).not.toContain('SIGNATURE-VALUE');
        expect(String(message)).not.toMatch(/[?&](k|ck)=/);
    };

    it('scrubs query strings and stray secret parameters, keeps ordinary text', () => {
        expect(scrubConfirmationSecrets(`stuck in a redirect loop ${signedUrl('ajaxop')}`))
            .toBe('stuck in a redirect loop https://steamcommunity.com/mobileconf/ajaxop');
        expect(scrubConfirmationSecrets(`GET ${signedUrl('getlist', '#frag')} failed`)).toBe('GET https://steamcommunity.com/mobileconf/getlist failed');
        expect(scrubConfirmationSecrets('body was ck[]=AAA&ck%5B%5D=BBB&k=CCC&nonce=DDD&ok=1')).toBe('body was ck[]=***&ck%5B%5D=***&k=***&nonce=***&ok=1');
        expect(scrubConfirmationSecrets('You cannot confirm this trade right now. Try again in 5 minutes.'))
            .toBe('You cannot confirm this trade right now. Try again in 5 minutes.');
        expect(scrubConfirmationSecrets('HTTP error 429')).toBe('HTTP error 429');
        clean(confirmationErrorMessage(redirectLoop('ajaxop')));
    });

    it('a list error that quotes the signed URL is shown without the key', async () => {
        const community = client((_options, callback) => callback(redirectLoop('getlist')));
        const error: Error = await fetchConfirmations(community, SECRET).then(() => { throw new Error('must reject'); }, e => e);
        expect(error.message).toContain('redirect loop');
        expect(error.message).toContain('https://steamcommunity.com/mobileconf/getlist');
        clean(error.message);
    });

    it('fallback rows that were never sent do not inherit the signed URL of another row', async () => {
        jest.useFakeTimers();
        let call = 0;
        const community = client((_options, callback) => {
            call += 1;
            // 1: Steam refuses the batch -> individual fallback; 2: the first single request dies quoting its URL.
            if (call === 1) return callback(null, { statusCode: 200 }, { success: false, message: 'Batch refused' });
            return callback(redirectLoop('ajaxop'));
        });
        const pending = respondToConfirmations(community, SECRET, [ref('1'), ref('2'), ref('3')], true);
        await jest.advanceTimersByTimeAsync(5000);
        const results = await pending;

        expect(community.httpRequest).toHaveBeenCalledTimes(2);
        expect(results.map(r => r.ok)).toEqual([false, false, false]);
        expect(results[0]).toMatchObject({ unknown: true });
        expect(results[1]).toMatchObject({ notSent: true });
        expect(results[2]).toMatchObject({ notSent: true });
        for (const result of results) clean(result.message);
        expect(results[1].message).toContain('redirect loop');
    });

    it('a Steam message that happens to contain a link keeps the link but loses its query', async () => {
        const community = client((_options, callback) => callback(null, { statusCode: 200 }, { success: false, message: 'See https://help.steampowered.com/en/faqs/view/1?token=abc for details' }));
        await expect(fetchConfirmations(community, SECRET)).rejects.toThrow('See https://help.steampowered.com/en/faqs/view/1 for details');
    });
});
