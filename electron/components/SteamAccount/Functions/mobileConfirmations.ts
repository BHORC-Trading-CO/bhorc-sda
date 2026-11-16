import type SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import type { MobileConfirmation, MobileConfirmationRef, MobileConfirmationResult } from '../../../interfaces/SteamAccount/MobileConfirmationInterface';
import { t } from '../../../i18n';

// Purchases stay individual until D-sda7 §7 P2/P4 verifies Steam's multi flag.
const NEVER_BATCH_TYPES = new Set([5, 6, 9, 10, 11, 12, 13]);
const REQUEST_TIMEOUT = 30000;
type FailureKind = 'steam' | 'http' | 'auth' | 'route' | 'throttled' | 'unknown';

const MAX_MESSAGE_LENGTH = 1000;

/**
 * Error text from this module is shown in the confirmations window, and a signed mobileconf
 * request carries the confirmation key (k) and the item nonce (ck). Two layers keep them out:
 *
 * 1. redactValues (the one that counts): the module knows the exact key and nonces of the request
 *    it made, so it removes those VALUES from any text, whatever the format: plain, URL-encoded,
 *    inside JSON, behind encoded delimiters.
 * 2. scrubConfirmationSecrets (this function): a format-based net for text whose origin is not a
 *    request of ours. It cuts the query off mobileconf URLs and masks k/ck/nonce parameters. Other
 *    links are left alone: a Steam help link in a message must stay usable.
 */
export function scrubConfirmationSecrets(message: string): string {
    const bounded = message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message;
    return bounded
        .replace(/https?:\/\/[^\s"'<>]*\/mobileconf\/[^\s"'<>]*/gi, url => url.split(/[?#]|%3F|%23/i)[0])
        .replace(/"(ck|k|nonce)"\s*:\s*"[^"]*"/gi, '"$1":"***"')
        .replace(/\b(ck(?:\[\]|%5B%5D)?|k|nonce)=(?:"[^"]*"|[^&\s"'<>]+)/gi, '$1=***');
}

/** Removes the given secret values from the text in their plain and URL-encoded spellings. */
export function redactValues(message: string, secrets: Iterable<unknown>): string {
    let result = message;
    for (const secret of secrets) {
        const value = typeof secret === 'number' ? String(secret) : secret;
        // A value this short cannot be told apart from ordinary text.
        if (typeof value !== 'string' || value.length < 4) continue;
        const once = encodeURIComponent(value);
        for (const spelling of new Set([value, once, encodeURIComponent(once)])) {
            result = result.split(spelling).join('***');
        }
    }
    return result;
}

class ConfirmationRequestError extends Error {
    constructor(readonly kind: FailureKind, message: string, readonly code?: string | number) {
        super(scrubConfirmationSecrets(message));
    }
}
const errorCode = (error: unknown) => (error as { code?: string | number } | null)?.code;
const failureKind = (error: unknown): FailureKind => error instanceof ConfirmationRequestError ? error.kind : 'unknown';
const canRetryIndividually = (error: unknown) => ['steam', 'http'].includes(failureKind(error));
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const identifier = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
    return null;
};

export function confirmationErrorMessage(error: unknown): string {
    const message = error && typeof error === 'object' && 'message' in error
        ? (error as { message: unknown }).message : error;
    return scrubConfirmationSecrets(String(message || t('errors.confirmations.actFailed')));
}

export function isBatchableConfirmation(ref: MobileConfirmationRef): boolean {
    return ref.multi === true && !NEVER_BATCH_TYPES.has(ref.type);
}

/** No CConfirmation constructor: incomplete entries must not break the whole list. */
export function parseConfirmations(value: unknown): MobileConfirmation[] {
    if (!Array.isArray(value)) return [];
    const confirmations: MobileConfirmation[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const id = identifier(entry.id);
        const nonce = identifier(entry.nonce);
        // Deliberately do not log rejected entries: they can contain nonces.
        if (!id || !nonce) continue;
        const type = Number.isInteger(Number(entry.type)) ? Number(entry.type) : 0;
        const timestamp = Number(entry.creation_time);
        confirmations.push({
            id, nonce, type,
            creatorId: identifier(entry.creator_id),
            typeName: text(entry.type_name),
            headline: text(entry.headline),
            summary: Array.isArray(entry.summary) ? entry.summary.filter((line: unknown) => typeof line === 'string') : [],
            warn: text(entry.warn) || null,
            icon: text(entry.icon),
            multi: entry.multi === undefined ? type === 2 || type === 3 : entry.multi === true,
            acceptLabel: text(entry.accept),
            cancelLabel: text(entry.cancel),
            createdAt: Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8640000000000 ? timestamp : 0,
        });
    }
    return confirmations;
}

function mobileRequest(
    community: SteamCommunity, identitySecret: string,
    endpoint: 'getlist' | 'ajaxop' | 'multiajaxop', tag: 'conf' | 'allow' | 'cancel',
    time: number, params: Record<string, unknown> = {},
): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
        if (!community.steamID) return reject(new ConfirmationRequestError('auth', 'Not Logged In'));
        const fields = {
            ...params,
            p: SteamTotp.getDeviceID(community.steamID.getSteamID64()),
            a: community.steamID.getSteamID64(),
            k: SteamTotp.generateConfirmationKey(identitySecret, time, tag),
            t: time, m: 'react', tag,
        };
        const options = {
            uri: `https://steamcommunity.com/mobileconf/${endpoint}`,
            method: endpoint === 'multiajaxop' ? 'POST' : 'GET',
            // Keys already contain []; prevent request/qs from appending [0], [1].
            ...(endpoint === 'multiajaxop' ? { form: fields, qsStringifyOptions: { arrayFormat: 'repeat' } } : { qs: fields }),
            json: true,
            timeout: REQUEST_TIMEOUT,
        };
        // The key and nonces of THIS request: nothing that leaves it may contain them.
        const secrets = [fields.k, identitySecret, ...[params.ck, params['ck[]']].flat()];
        const seal = (error: unknown) => new ConfirmationRequestError(
            failureKind(error), redactValues(confirmationErrorMessage(error), secrets), errorCode(error),
        );
        // Also bound a stalled pre-request hook; all callback exceptions reject the promise.
        let settled = false;
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(seal(error));
        };
        // httpRequest exposes no abort handle. A late reply cannot change an unknown
        // outcome or trigger resends after this deadline.
        const timer = setTimeout(() => fail(new ConfirmationRequestError('unknown', t('errors.confirmations.timedOut'))), REQUEST_TIMEOUT + 1000);
        const callback = (err: unknown, response?: { statusCode?: number }, body?: any) => {
            if (settled) return;
            clearTimeout(timer);
            try {
                if (body?.needauth) {
                    const authError = new ConfirmationRequestError('auth', 'Not Logged In');
                    fail(authError);
                    (community as SteamCommunity & { _notifySessionExpired?: (error: Error) => void })._notifySessionExpired?.(authError);
                    return;
                }
                const message = text(body?.message) || text(body?.detail);
                const status = response?.statusCode;
                const code = errorCode(err);
                if (code === 'PROXY_UNAVAILABLE' || code === 'CONFIRMATION_ROUTE_CHANGED') {
                    return fail(new ConfirmationRequestError('route', confirmationErrorMessage(err), code));
                }
                if (status === 401 || (err && confirmationErrorMessage(err) === 'Not Logged In')) {
                    return fail(new ConfirmationRequestError('auth', 'Not Logged In'));
                }
                if (status === 429 || code === 429) {
                    return fail(new ConfirmationRequestError('throttled', message || 'HTTP error 429', 429));
                }
                // Transport errors take priority over any partial response body.
                if (err && (typeof code === 'string' || !status || status < 300)) {
                    return fail(new ConfirmationRequestError('unknown', confirmationErrorMessage(err), code));
                }
                if (status && status >= 300) {
                    return fail(new ConfirmationRequestError('http', message || `HTTP error ${status}`, status));
                }
                if (body?.success === false || body?.success === 0) {
                    return fail(new ConfirmationRequestError('steam', message || t(endpoint === 'getlist' ? 'errors.confirmations.listFailed' : 'errors.confirmations.actFailed')));
                }
                if (!body || (body.success !== true && body.success !== 1)) {
                    return fail(new ConfirmationRequestError('unknown', message || t(endpoint === 'getlist' ? 'errors.confirmations.listFailed' : 'errors.confirmations.actFailed')));
                }
                settled = true;
                // Steam's own text on success goes to the window too.
                if (typeof body.message === 'string') body.message = redactValues(scrubConfirmationSecrets(body.message), secrets);
                resolve(body);
            } catch (error) {
                fail(error);
            }
        };
        try {
            // Installed typings omit the public (options, callback, source) overload.
            const httpRequest = community.httpRequest as unknown as (options: object, completion: typeof callback, source: string) => void;
            httpRequest.call(community, options, callback, 'steamcommunity');
        } catch (error) {
            const code = errorCode(error);
            fail(new ConfirmationRequestError(code === 'PROXY_UNAVAILABLE' || code === 'CONFIRMATION_ROUTE_CHANGED' ? 'route' : 'unknown', confirmationErrorMessage(error), code));
        }
    });
}

export function fetchConfirmations(community: SteamCommunity, identitySecret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<MobileConfirmation[]> {
    return mobileRequest(community, identitySecret, 'getlist', 'conf', nowSec).then(body => parseConfirmations(body.conf));
}

interface ResponseQueue { tail: Promise<unknown>; lastRequestAt?: number; lastTime?: number }
const queues = new WeakMap<SteamCommunity, ResponseQueue>();

export function respondToConfirmations(community: SteamCommunity, identitySecret: string, refs: MobileConfirmationRef[], accept: boolean, beforeRequest?: () => void): Promise<MobileConfirmationResult[]> {
    let queue = queues.get(community);
    if (!queue) {
        queue = { tail: Promise.resolve() };
        queues.set(community, queue);
    }
    const state = queue;
    const operation = state.tail.then(async () => {
        const results = new Map<string, MobileConfirmationResult>();
        const unique = refs.filter((ref, index) => refs.findIndex(other => other.id === ref.id) === index);
        const valid = unique.filter(ref => {
            if (identifier(ref.id) && identifier(ref.nonce)) return true;
            results.set(ref.id, { id: ref.id, ok: false, message: t('errors.confirmations.missingRef') });
            return false;
        });
        const batch = valid.filter(isBatchableConfirmation);
        const singles = valid.filter(ref => !isBatchableConfirmation(ref));
        const tag = accept ? 'allow' : 'cancel';
        const request = async (group: MobileConfirmationRef[], multi: boolean) => {
            const delay = state.lastRequestAt === undefined ? 0 : Math.max(
                0, state.lastRequestAt + 1000 - Date.now(), ((state.lastTime || 0) + 1) * 1000 - Date.now(),
            );
            if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
            try { beforeRequest?.(); }
            catch (error) { throw new ConfirmationRequestError('route', confirmationErrorMessage(error), errorCode(error)); }
            state.lastRequestAt = Date.now();
            state.lastTime = Math.floor(state.lastRequestAt / 1000);
            const body = await mobileRequest(community, identitySecret, multi ? 'multiajaxop' : 'ajaxop', tag, state.lastTime,
                multi ? { op: tag, 'cid[]': group.map(ref => ref.id), 'ck[]': group.map(ref => ref.nonce) }
                    : { op: tag, cid: group[0].id, ck: group[0].nonce });
            for (const ref of group) results.set(ref.id, { id: ref.id, ok: true, ...(text(body.message) ? { message: body.message } : {}) });
        };
        const stop = (error: unknown, attempted: MobileConfirmationRef[]) => {
            for (const ref of valid) {
                if (results.has(ref.id)) continue;
                const notSent = !attempted.includes(ref);
                const unknown = !notSent && failureKind(error) === 'unknown';
                results.set(ref.id, {
                    id: ref.id, ok: false, stopped: true,
                    message: unknown ? t('errors.confirmations.outcomeUnknown') : confirmationErrorMessage(error),
                    ...(unknown ? { unknown: true } : {}), ...(notSent ? { notSent: true } : {}),
                });
            }
        };
        if (batch.length >= 2) {
            try { await request(batch, true); }
            catch (error) {
                if (canRetryIndividually(error)) singles.unshift(...batch);
                else stop(error, batch);
            }
        } else {
            singles.unshift(...batch);
        }
        for (const ref of singles) {
            if (results.has(ref.id)) continue;
            try { await request([ref], false); }
            catch (error) {
                if (canRetryIndividually(error)) results.set(ref.id, { id: ref.id, ok: false, message: confirmationErrorMessage(error) });
                else stop(error, [ref]);
            }
        }
        // Last exit: a row can carry the message of another row's request, so every message is
        // cleared of every nonce of this operation once more.
        const nonces = refs.map(ref => ref.nonce);
        return unique.map(ref => {
            const result = results.get(ref.id)!;
            return typeof result.message === 'string' ? { ...result, message: redactValues(result.message, nonces) } : result;
        });
    });
    state.tail = operation.catch(() => undefined);
    return operation;
}
