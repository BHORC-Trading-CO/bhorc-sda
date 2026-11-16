jest.mock('../steamAccountManager', () => ({ __esModule: true, default: { getById: jest.fn() } }));
import manager from '../steamAccountManager';
import respond from '../Listeners/steamAccountConfirmListener';
import getList from '../Listeners/steamAccountGetConfirmationsListener';
import SteamAccountChannels from '../../../interfaces/IpcChannels/SteamAccountChannels';

const ref = { id: '1', nonce: 'synthetic-nonce-not-for-logs', type: 2, multi: true };
const params = { id: 'account', data: { allow: [ref], cancel: [] } };
const lookup = manager.getById as jest.Mock;
afterEach(() => jest.restoreAllMocks());

it('replies with account id and per-item results for allow and cancel', async () => {
    const account = { respondConfirmations: jest.fn().mockResolvedValueOnce([{ id: '1', ok: true }]).mockResolvedValueOnce([{ id: '2', ok: false, message: 'Expired' }]) };
    lookup.mockReturnValue(account);
    const event = { reply: jest.fn() };
    const cancel = [{ ...ref, id: '2' }];
    await respond(event as any, { id: 'account', data: { allow: [ref], cancel } });
    expect(account.respondConfirmations.mock.calls).toEqual([[[ref], true], [cancel, false]]);
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, { id: 'account', results: [{ id: '1', ok: true }, { id: '2', ok: false, message: 'Expired' }] });
});

it.each([new Error('Proxy is unavailable'), 'Steam said no', { message: 'Session expired' }])('sends response errors as strings on the dedicated channel (%#)', async error => {
    lookup.mockReturnValue({ respondConfirmations: jest.fn().mockRejectedValue(error) });
    const event = { reply: jest.fn() };
    await respond(event as any, params);
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM_ERROR, { id: 'account', err: typeof error === 'string' ? error : error.message });
    expect(event.reply).not.toHaveBeenCalledWith('ERROR', expect.anything());
});

it('missing account also uses the dedicated string error', async () => {
    lookup.mockReturnValue(undefined);
    const event = { reply: jest.fn() };
    await respond(event as any, params);
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM_ERROR, { id: 'account', err: expect.any(String) });
});

it('returns DTOs without logging confirmation nonces', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    lookup.mockReturnValue({ getConfirmations: jest.fn().mockResolvedValue([ref]) });
    const event = { reply: jest.fn() };
    await getList(event as any, 'account');
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_GET_CONFIRMATIONS, { id: 'account', confirmations: [ref] });
    expect(log).not.toHaveBeenCalled();
});

it('getlist errors cross IPC as message strings', async () => {
    lookup.mockReturnValue({ getConfirmations: jest.fn().mockRejectedValue(new Error('Not Logged In')) });
    const event = { reply: jest.fn() };
    await getList(event as any, 'account');
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_GET_CONFIRMATIONS_ERROR, { id: 'account', err: 'Not Logged In' });
});

it('stopped allow results prevent the cancel group from sending and preserve unknown results for refresh', async () => {
    const unknown = { id: '1', ok: false, stopped: true, unknown: true, message: 'Outcome unknown; refresh the list' };
    const account = { respondConfirmations: jest.fn().mockResolvedValue([unknown]) };
    lookup.mockReturnValue(account);
    const event = { reply: jest.fn() };
    await respond(event as any, { id: 'account', data: { allow: [ref], cancel: [{ ...ref, id: '2' }] } });
    expect(account.respondConfirmations).toHaveBeenCalledTimes(1);
    expect(event.reply).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, { id: 'account', results: [unknown, { id: '2', ok: false, stopped: true, notSent: true, message: unknown.message }] });
});
