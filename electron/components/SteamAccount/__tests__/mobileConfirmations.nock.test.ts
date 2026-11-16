jest.mock('../../application/application', () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
const mockRoute = { proxy: null as any, proxyState: 'none', proxyId: null as string | null };
jest.mock('../../Manager/Manager', () => ({ __esModule: true, default: { GetSteamAccountLinkedData: () => mockRoute } }));

import nock from 'nock';
import SteamID from 'steamid';
import SteamTotp from 'steam-totp';
import SteamAccount from '../SteamAccount';
import { fetchConfirmations } from '../Functions/mobileConfirmations';
import { STEAM_MOBILE_USER_AGENT, STEAM_ACCEPT_ENCODING } from '../Functions/steamUserAgent';

const SECRET = Buffer.from('synthetic-identity').toString('base64');
const STEAM_ID = '76561198000000001';
const account = () => {
    const instance = new SteamAccount({ id: 'mobileconf-test', accountName: 'fake', maFile: { identity_secret: SECRET }, secondary: {} } as any);
    instance.community.steamID = new SteamID(STEAM_ID);
    return instance;
};
const scope = () => nock('https://steamcommunity.com', { reqheaders: { 'user-agent': STEAM_MOBILE_USER_AGENT, 'accept-encoding': STEAM_ACCEPT_ENCODING } });
const validFields = (fields: Record<string, any>, tag: string) => {
    expect(fields).toMatchObject({ p: SteamTotp.getDeviceID(STEAM_ID), a: STEAM_ID, m: 'react', tag });
    expect(fields.k).toBe(SteamTotp.generateConfirmationKey(SECRET, Number(fields.t), tag));
    return true;
};

beforeEach(() => {
    nock.disableNetConnect();
    mockRoute.proxy = null; mockRoute.proxyState = 'none'; mockRoute.proxyId = null;
});
afterEach(() => {
    const pending = nock.pendingMocks();
    nock.cleanAll(); nock.enableNetConnect(); jest.restoreAllMocks();
    expect(pending).toEqual([]);
});

it('uses the account community headers, cookies, and exact signed getlist query', async () => {
    const instance = account();
    instance.community.setCookies(['sessionid=synthetic-session']);
    const endpoint = scope().matchHeader('cookie', /sessionid=synthetic-session/).get('/mobileconf/getlist')
        .query(fields => validFields(fields, 'conf')).reply(200, { success: true, conf: [] });
    expect(await instance.getConfirmations()).toEqual([]);
    expect(endpoint.isDone()).toBe(true);
});

it('encodes cid[]/ck[] in one POST for two trades and keeps op=cancel', async () => {
    let fields: any;
    const endpoint = scope().post('/mobileconf/multiajaxop', body => {
        fields = body;
        return true;
    }).reply(200, { success: true });
    expect(await account().respondConfirmations([
        { id: '1', nonce: 'fake-one', type: 2, multi: true }, { id: '2', nonce: 'fake-two', type: 2, multi: true },
    ], false)).toEqual([{ id: '1', ok: true }, { id: '2', ok: true }]);
    expect(endpoint.isDone()).toBe(true);
    validFields(fields, 'cancel');
    expect(fields['cid[]']).toEqual(['1', '2']);
    expect(fields['ck[]']).toEqual(['fake-one', 'fake-two']);
    expect(fields.op).toBe('cancel');
    expect(Object.keys(fields)).not.toContain('cid[0]');
});

it('uses a scalar GET for API-key requests even with multi=true', async () => {
    scope().get('/mobileconf/ajaxop').query(fields => {
        validFields(fields, 'allow');
        expect(fields).toMatchObject({ op: 'allow', cid: '9', ck: 'fake-key' });
        return true;
    }).reply(200, { success: false, message: 'Synthetic Steam refusal' });
    expect(await account().respondConfirmations([{ id: '9', nonce: 'fake-key', type: 9, multi: true }], true))
        .toEqual([{ id: '9', ok: false, message: 'Synthetic Steam refusal' }]);
});

it('preserves Steam messages on HTTP failures', async () => {
    scope().get('/mobileconf/getlist').query(true).reply(429, { success: false, message: 'Please wait' });
    await expect(account().getConfirmations()).rejects.toThrow('Please wait');
});

it('retains the real account proxy transport for mobileconf requests', async () => {
    mockRoute.proxy = { id: 'p1', host: 'proxy.test', port: '8080', username: '', password: '' };
    mockRoute.proxyState = 'ok'; mockRoute.proxyId = 'p1';
    const instance = account();
    const request = jest.spyOn(instance.community, 'request');
    // Nock answers before opening the tunnel. Inspect the real request's selected
    // proxy and tunnel agent as well, so a fresh/direct client would fail this test.
    scope().get('/mobileconf/getlist').query(true).reply(200, { success: true, conf: [] });
    expect(await instance.getConfirmations()).toEqual([]);
    const outgoing = request.mock.results[0].value;
    expect(outgoing.proxy.host).toBe('proxy.test:8080');
    expect(outgoing.agent.proxyOptions.host).toBe('proxy.test');
    expect(outgoing.agent.proxyOptions.port).toBe(8080);
});

it('the SDA-21 missing-proxy client rejects inside httpRequest without a socket', async () => {
    mockRoute.proxyState = 'missing'; mockRoute.proxyId = 'gone';
    const instance = account();
    await expect(fetchConfirmations(instance.community, SECRET)).rejects.toMatchObject({ code: 'PROXY_UNAVAILABLE' });
});
