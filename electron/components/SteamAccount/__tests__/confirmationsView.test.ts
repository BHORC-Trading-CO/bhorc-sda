// CSS imports resolve to __mocks__/styleStub.js (jest.config.js). The window title is the
// redesign's TitleBar (no hooks), so it renders as is.
jest.mock('../../../../src/globalComponents/Images/useAccountImage', () => ({ __esModule: true, default: jest.fn(() => ({ src: null, onError: jest.fn() })) }));
jest.mock('../../../../src/globalComponents/Button/Button', () => ({ __esModule: true, default: (props: any) => require('react').createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.text) }));
// The redesigned window renders counts through <Trans> (numbers in Geist Mono) and the time
// in the interface language (i18n.language).
jest.mock('react-i18next', () => {
    const actual = jest.requireActual('react-i18next');
    return {
        useTranslation: () => ({ t: mockI18n.t, i18n: mockI18n }),
        Trans: (props: any) => require('react').createElement(actual.Trans, { ...props, i18n: mockI18n }),
    };
});
jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return { ...actual, useEffect: jest.fn(actual.useEffect), useReducer: jest.fn(actual.useReducer), useState: jest.fn(actual.useState), useRef: jest.fn(actual.useRef) };
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import fs from 'fs';
import path from 'path';
import en from '../../../../src/locales/en/common.json';
import uk from '../../../../src/locales/uk/common.json';
import ru from '../../../../src/locales/ru/common.json';
import SellItem from '../../../../src/pages/Confirmations/SellItem/SellItem';
import ApiKeyWarning from '../../../../src/pages/Confirmations/ApiKeyWarning';
import Confirmations from '../../../../src/pages/Confirmations/Confirmations';
import { confirmationReducer as reduce, initialConfirmationState as initial, isBatchable, requiresSecurityWarning } from '../../../../src/pages/Confirmations/confirmationState';
import Button from '../../../../src/globalComponents/Button/Button';
import useAccountImage from '../../../../src/globalComponents/Images/useAccountImage';
import formatConfirmationTime from '../../../../src/pages/Confirmations/SellItem/formatConfirmationTime';
import { parseConfirmations, isBatchableConfirmation } from '../Functions/mobileConfirmations';
import fixture from './fixtures/mobileConfirmations.json';

const mockI18n = i18next.createInstance();
mockI18n.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en }, uk: { translation: uk }, ru: { translation: ru } }, initImmediate: false });
const confirmations = parseConfirmations(fixture.conf);
const loaded = () => reduce(initial, { type: 'loaded', confirmations });
const renderItem = (index: number, overrides = {}) => renderToStaticMarkup(React.createElement(SellItem, {
    item: { confirmation: { ...confirmations[index], ...overrides }, selected: false }, accountId: 'fake-account',
    disabled: false, onChange: jest.fn(), onRespond: jest.fn(),
}));
// Batch rows keep the redesign's Select/Selected toggle (a Button) instead of a checkbox.
const selectToggle = () => `>${mockI18n.t('confirmations.item.select')}</button>`;
// Text as the user reads it: <Trans> wraps the numbers in mono spans.
const visible = (html: string) => html.replace(/<[^>]+>/g, '');
const plain = (key: string, options: object) => String(mockI18n.t(key, options)).replace(/<\/?n>/g, '');
afterEach(() => {
    jest.restoreAllMocks(); jest.useRealTimers();
    for (const hook of ['useEffect', 'useReducer', 'useState', 'useRef'] as const) {
        (React[hook] as jest.Mock).mockReset().mockImplementation(jest.requireActual('react')[hook]);
    }
    delete (globalThis as any).window; delete (globalThis as any).document; delete (globalThis as any).HTMLElement;
});

it('select-all counts only eligible items and the renderer/main batch rules agree', () => {
    const selected = reduce(loaded(), { type: 'toggleAll' });
    expect(selected.items.filter(item => item.selected).map(item => item.confirmation.type)).toEqual([2, 3]);
    expect(reduce(selected, { type: 'toggleAll' }).items.every(item => !item.selected)).toBe(true);
    for (let type = 0; type < 100; type++) {
        const ref = { id: '1', nonce: 'fake', type, multi: true };
        expect(isBatchable(ref)).toBe(isBatchableConfirmation(ref));
    }
    expect(reduce(loaded(), { type: 'select', id: '1009', selected: true }).items[2].selected).toBe(false);
});

it('a response error stops the spinner, keeps items, and exposes its string', () => {
    const responding = reduce(loaded(), { type: 'responding', accept: true, ids: ['1009'] });
    const result = reduce(responding, { type: 'responseError', error: 'Proxy is unavailable' });
    expect(result.responding).toBeNull();
    expect(result.loading).toBe(false);
    expect(result.error).toBe('Proxy is unavailable');
    expect(result.items).toHaveLength(6);
});

it('refresh removes absent failed rows, preserves listed errors, and does not restore successes', () => {
    const result = reduce(loaded(), { type: 'results', results: [{ id: '1002', ok: true }, { id: '1012', ok: false, message: 'Please retry' }], fallbackError: 'Failed' });
    expect(result.items.some(item => item.confirmation.id === '1002')).toBe(false);
    expect(result.items.find(item => item.confirmation.id === '1012')?.error).toBe('Please retry');
    const refreshed = reduce(result, { type: 'loaded', confirmations });
    expect(refreshed.items.some(item => item.confirmation.id === '1002')).toBe(false);
    expect(refreshed.items.find(item => item.confirmation.id === '1012')?.error).toBe('Please retry');
    const omitted = reduce(refreshed, { type: 'loaded', confirmations: [] });
    expect(omitted.items).toEqual([]);
    expect(omitted.purchaseNotice).toBe(true);
    expect(reduce(omitted, { type: 'loaded', confirmations: [] }).purchaseNotice).toBe(false);
    expect(reduce(omitted, { type: 'loadError', error: 'Offline' }).loading).toBe(false);
});

it.each(['en', 'uk', 'ru'])('%s renders badges, all summary lines, ISO/local time, single buttons and warnings', language => {
    mockI18n.changeLanguage(language);
    const trade = renderItem(0);
    expect(trade).toContain(selectToggle());
    expect(trade).toContain('Extra summary');
    expect(trade).toContain('<strong');
    expect(trade).toContain('2023-11-14T22:13:20.000Z');
    // Main's readable local time in the interface language (the ISO value stays in the tooltip).
    expect(trade).toContain(formatConfirmationTime('2023-11-14T22:13:20.000Z', language));
    const api = renderItem(2);
    expect(api).not.toContain(selectToggle());
    expect(api).toContain(mockI18n.t('confirmations.types.apiKey'));
    expect(api).toContain(mockI18n.t('confirmations.item.confirm'));
    expect(api).toContain(mockI18n.t('confirmations.item.decline'));
    expect(api).toContain('Only approve a request you started');
    expect(api).toContain('confirmation-type-icon');
    const purchase = renderItem(3);
    expect(purchase).toContain(mockI18n.t('confirmations.purchaseHint'));
    // Entry 1012 is a real getlist sample (ids and nonce replaced): Steam calls the type
    // "Account Security" and gives no item, price or quantity for a purchase.
    expect(purchase).toContain(mockI18n.t('confirmations.types.purchase'));
    expect(purchase).not.toContain('Account Security');
    expect(purchase).toContain('Community Market');
    expect(purchase).toContain('Purchase confirmation needed');
    expect(purchase).not.toContain(selectToggle());
    expect(renderItem(5)).toContain('Future action');
});

it.each(['en', 'uk', 'ru'])('%s tile uses a local type icon without a Steam image, and a missing time is named', language => {
    mockI18n.changeLanguage(language);
    expect(renderItem(2)).toContain('lucide-key-round');
    expect(renderItem(3)).toContain('lucide-shopping-cart');
    const noTime = renderItem(0, { createdAt: 0 });
    expect(noTime).toContain(mockI18n.t('confirmations.time.unknown'));
    expect(noTime).not.toContain('datetime=');
    // With the routed data: URL the image fills the tile and the type moves to the corner badge.
    (useAccountImage as jest.Mock).mockReturnValueOnce({ src: 'data:image/png;base64,AAAA', onError: jest.fn() });
    const withImage = renderItem(0);
    expect(withImage).toContain('<img src="data:image/png;base64,AAAA"');
    expect(withImage).toContain('sell-item-type');
    expect(withImage).toContain('lucide-arrow-left-right');
});

it('never emits a remote icon URL or executable Steam markup into the renderer', () => {
    expect(renderItem(0)).not.toContain('https://');
    expect(renderItem(0, { summary: ['<img src="https://evil.test/">'] })).toContain('&lt;img');
});

// The branch's relative time ("21 хвилину тому") gave way to main's absolute local time
// (formatConfirmationTime, its own tests); the counts that remain plural are the progress lines.
it.each(['uk', 'ru'])('%s progress counts resolve all required plural forms, including 21', language => {
    mockI18n.changeLanguage(language);
    for (const key of ['confirmations.confirming', 'confirmations.declining']) {
        for (const count of [1, 2, 5, 21]) {
            const text = plain(key, { count });
            expect(text).toContain(String(count));
            expect(text).not.toBe(key);
        }
    }
});

it('API key warning is an explicit modal with request details and a safe back action', () => {
    mockI18n.changeLanguage('en');
    const html = renderToStaticMarkup(React.createElement(ApiKeyWarning, { confirmation: confirmations[2], onCancel: jest.fn(), onConfirm: jest.fn() }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('trade theft scheme');
    expect(html).toContain('localhost');
    expect(html).toContain('Go back');
});

it('the mounted window subscribes to results/errors, refreshes the list, ignores other accounts, and cleans up', () => {
    jest.useFakeTimers();
    const dispatch = jest.fn();
    (React.useReducer as jest.Mock).mockReturnValue([initial, dispatch]);
    const effects: (() => any)[] = [];
    (React.useEffect as jest.Mock).mockImplementation(effect => { effects.push(effect); });
    const handlers: Record<string, any> = {};
    const unsubscribe = jest.fn();
    const api: any = { getConfirmations: jest.fn() };
    for (const name of ['onGetParams', 'onGetConfirmations', 'onGetConfirmationsError', 'onRespondConfirmations', 'onRespondConfirmationsError']) {
        api[name] = (handler: any) => { handlers[name] = handler; return unsubscribe; };
    }
    (globalThis as any).window = { Confirmations: { api } };
    renderToStaticMarkup(React.createElement(Confirmations));
    const cleanup = effects[0]();
    handlers.onGetParams({}, { id: 'account', steamAccountName: 'fake' });
    handlers.onRespondConfirmationsError({}, { id: 'account', err: 'Offline' });
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'responseError', error: 'Offline' });
    const count = dispatch.mock.calls.length;
    handlers.onRespondConfirmationsError({}, { id: 'other', err: 'Wrong account' });
    expect(dispatch).toHaveBeenCalledTimes(count);
    handlers.onRespondConfirmations({}, { id: 'account', results: [{ id: '1', ok: true }] });
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'results', results: [{ id: '1', ok: true }] }));
    expect(api.getConfirmations).toHaveBeenCalledTimes(2);
    handlers.onRespondConfirmations({}, { id: 'account', results: [{ id: '1012', ok: false, unknown: true, stopped: true, message: 'Outcome unknown' }] });
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'results', refresh: true }));
    expect(api.getConfirmations).toHaveBeenCalledTimes(3);
    for (const message of ['Not Logged In', 'Proxy unavailable', 'HTTP error 429']) {
        handlers.onRespondConfirmations({}, { id: 'account', results: [{ id: '1', ok: false, stopped: true, message }] });
        expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'results', refresh: false }));
    }
    expect(api.getConfirmations).toHaveBeenCalledTimes(3);
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(5);
    expect(jest.getTimerCount()).toBe(0);
});

it('confirmation code contains no console calls that could disclose a nonce/key/cookie', () => {
    const root = path.resolve(__dirname, '../../../..');
    const files = [
        'src/pages/Confirmations/Confirmations.tsx', 'src/pages/Confirmations/SellItem/SellItem.tsx',
        'electron/components/SteamAccount/Functions/mobileConfirmations.ts',
        'electron/components/SteamAccount/Listeners/steamAccountConfirmListener.ts',
        'electron/components/SteamAccount/Listeners/steamAccountGetConfirmationsListener.ts',
    ];
    for (const file of files) expect(fs.readFileSync(path.join(root, file), 'utf8')).not.toMatch(/console\.(log|warn|error|info|debug)\s*\(/);
});

it('select-all never includes failed ids absent from the latest getlist', () => {
    const failed = reduce(loaded(), { type: 'results', results: [{ id: '1002', ok: false, message: 'Expired' }], fallbackError: 'Failed' });
    const latest = [{ ...confirmations[0], id: 'new-trade' }, confirmations[1]];
    const selected = reduce(reduce(failed, { type: 'loaded', confirmations: latest }), { type: 'toggleAll' });
    expect(selected.items.filter(item => item.selected).map(item => item.confirmation.id)).toEqual(['new-trade', '1003']);
    expect(reduce(selected, { type: 'select', id: '1002', selected: true }).items.map(item => item.confirmation.id)).not.toContain('1002');
});

function elements(tree: any): any[] {
    if (!React.isValidElement(tree)) return [];
    return [tree, ...React.Children.toArray((tree.props as any).children).flatMap(elements)];
}

function windowView(state = loaded(), warning: any = null) {
    const dispatch = jest.fn();
    const setWarning = jest.fn();
    (React.useReducer as jest.Mock).mockReturnValue([state, dispatch]);
    (React.useRef as jest.Mock).mockImplementation(value => ({ current: value }));
    (React.useEffect as jest.Mock).mockImplementation(() => undefined);
    (React.useState as jest.Mock)
        .mockReturnValueOnce(['fake', jest.fn()]).mockReturnValueOnce(['account', jest.fn()])
        .mockReturnValueOnce([warning, setWarning]);
    const api = { respondConfirmations: jest.fn(), getConfirmations: jest.fn() };
    (globalThis as any).window = { Confirmations: { api } };
    const tree = Confirmations({});
    return { tree, nodes: elements(tree), dispatch, setWarning, api };
}

it('unknown purchase outcomes show a history notice after removal and never invite a blind repeat', () => {
    mockI18n.changeLanguage('en');
    const unknown = reduce(loaded(), { type: 'results', results: [{ id: '1012', ok: false, unknown: true, stopped: true, message: 'Transport timeout' }], fallbackError: 'Failed' });
    expect(unknown.loading).toBe(true);
    expect(unknown.items.find(item => item.confirmation.id === '1012')?.unknown).toBe(true);
    const row = renderToStaticMarkup(React.createElement(SellItem, { item: unknown.items[3], accountId: 'account', disabled: true, onChange: jest.fn(), onRespond: jest.fn() }));
    expect(row).toContain(mockI18n.t('confirmations.outcomeUnknown'));
    expect(row).toContain(mockI18n.t('confirmations.purchaseMayBeCompleted'));
    expect(row).not.toContain(mockI18n.t('confirmations.purchaseHint'));
    expect(row).not.toContain('start the purchase again');
    const refreshed = reduce(unknown, { type: 'loaded', confirmations: [] });
    const { tree } = windowView(refreshed);
    const html = renderToStaticMarkup(tree as any);
    expect(html).toContain(mockI18n.t('confirmations.purchaseMayBeCompleted'));
    expect(html).not.toContain('sell-item-container');
});

it('auth/route/throttle results stop loading without an automatic refresh', () => {
    const state = reduce(loaded(), { type: 'results', results: [{ id: '1002', ok: false, stopped: true, message: 'HTTP error 429' }], fallbackError: 'Failed', refresh: false });
    expect(state.loading).toBe(false);
    expect(state.responding).toBeNull();
    expect(state.items[0].error).toBe('HTTP error 429');
});

it.each([5, 6, 9])('type %i warning disables/hides every background control and blocks covered actions', type => {
    const selected = reduce(loaded(), { type: 'toggleAll' });
    const warning = { ...confirmations[2], type };
    const { tree, nodes, api, dispatch, setWarning } = windowView(selected, warning);
    const background = nodes.find(node => node.type === 'fieldset');
    expect(background.props).toMatchObject({ disabled: true, 'aria-hidden': true });
    expect(nodes.filter(node => node.type === 'button' || node.type === Button || node.type === SellItem).every(node => node.props.disabled)).toBe(true);
    for (const node of nodes) {
        if (node.type === Button || node.type === 'button') node.props.onClick?.();
        if (node.type === SellItem) { node.props.onRespond(true); node.props.onRespond(false); node.props.onChange(true); }
    }
    expect(api.respondConfirmations).not.toHaveBeenCalled();
    expect(api.getConfirmations).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(setWarning).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(tree as any)).toContain('<fieldset class="confirmation-main" disabled="" aria-hidden="true">');
    nodes.find(node => node.type === ApiKeyWarning).props.onConfirm();
    expect(api.respondConfirmations).toHaveBeenCalledWith('account', { allow: [{ id: warning.id, nonce: warning.nonce, type, multi: warning.multi }], cancel: [] });
});

it.each([5, 6, 9, 10, 11])('type %i opens a warning only for takeover-class accepts; declines remain direct', type => {
    const confirmation = { ...confirmations[2], type };
    const state = reduce(initial, { type: 'loaded', confirmations: [confirmation] });
    const { nodes, setWarning, api } = windowView(state);
    const row = nodes.find(node => node.type === SellItem);
    row.props.onRespond(true);
    if ([5, 6, 9].includes(type)) {
        expect(requiresSecurityWarning(type)).toBe(true);
        expect(setWarning).toHaveBeenCalledWith(confirmation);
        expect(api.respondConfirmations).not.toHaveBeenCalled();
    } else {
        expect(requiresSecurityWarning(type)).toBe(false);
        expect(setWarning).not.toHaveBeenCalled();
        expect(api.respondConfirmations).toHaveBeenCalledTimes(1);
    }
    const declineView = windowView(state);
    declineView.nodes.find(node => node.type === SellItem).props.onRespond(false);
    expect(declineView.setWarning).not.toHaveBeenCalled();
    expect(declineView.api.respondConfirmations).toHaveBeenCalledWith('account', { allow: [], cancel: [expect.objectContaining({ type })] });
});

it.each(['en', 'uk', 'ru'])('%s renders type-specific phone/recovery/API warnings and takeover text', language => {
    mockI18n.changeLanguage(language);
    for (const [type, key] of [[5, 'phoneChange'], [6, 'accountRecovery'], [9, 'apiKey']] as const) {
        const html = renderToStaticMarkup(React.createElement(ApiKeyWarning, { confirmation: { ...confirmations[2], type }, onCancel: jest.fn(), onConfirm: jest.fn() }));
        expect(html).toContain(mockI18n.t(`confirmations.${key}.title`));
        expect(html).toContain(mockI18n.t(`confirmations.${key}.warning`));
        expect(html).toContain(mockI18n.t(`confirmations.${key}.confirm`));
    }
});

// The warning now uses the shared modal stack (useModalFocus): the keys and focusin are handled
// on the document, so the test drives those handlers. DOM nodes are minimal stand-ins, as in
// electron/components/__tests__/modalFocus.test.ts.
it('modal traps focus after backdrop/outside focus, cycles Tab, handles Escape and restores focus', () => {
    class FakeElement {
        isConnected = true;
        children: FakeElement[] = [];
        focus() { document.activeElement = this; }
        getAttribute() { return null; }
        getClientRects() { return [{}]; }
        querySelectorAll() { return this.children; }
        contains(node: unknown): boolean { return node === this || this.children.includes(node as FakeElement); }
    }
    (globalThis as any).HTMLElement = FakeElement;
    const previous = Object.assign(new FakeElement(), { focus: jest.fn() });
    const document: any = { activeElement: previous, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    (globalThis as any).document = document;
    const cancel = new FakeElement();
    const confirm = new FakeElement();
    const dialog = new FakeElement();
    dialog.children = [cancel, confirm];
    // ApiKeyWarning: dialog, cancel button; then useModalFocus's own refs.
    (React.useRef as jest.Mock).mockReturnValueOnce({ current: dialog }).mockReturnValueOnce({ current: cancel }).mockImplementation(value => ({ current: value }));
    let effect: any;
    (React.useEffect as jest.Mock).mockImplementation(callback => { effect = callback; });
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const tree = ApiKeyWarning({ confirmation: confirmations[2], onCancel, onConfirm });
    expect(elements(tree).find(node => node.props.role === 'alertdialog').props).toMatchObject({ 'aria-modal': 'true', tabIndex: -1 });
    const cleanup = effect();
    expect(document.activeElement).toBe(cancel);
    const keydown = document.addEventListener.mock.calls.find(([event]: [string]) => event === 'keydown')[1];
    const key = (name: string, shiftKey = false) => ({ key: name, shiftKey, defaultPrevented: false, isComposing: false, preventDefault: jest.fn() });
    keydown(key('Tab'));
    expect(document.activeElement).toBe(confirm);
    keydown(key('Tab', true));
    expect(document.activeElement).toBe(cancel);
    const outside = {};
    document.activeElement = outside;
    const focusin = document.addEventListener.mock.calls.find(([event]: [string]) => event === 'focusin')[1];
    focusin({ target: outside });
    expect(document.activeElement).toBe(cancel);
    document.activeElement = confirm;
    const backdrop = { target: outside, currentTarget: outside, preventDefault: jest.fn() };
    tree.props.onMouseDown(backdrop);
    expect(backdrop.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(cancel);
    keydown(key('Escape'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    cleanup();
    expect(document.removeEventListener).toHaveBeenCalledWith('focusin', focusin);
    expect(document.removeEventListener).toHaveBeenCalledWith('keydown', keydown);
    expect(previous.focus).toHaveBeenCalledTimes(1);
});

it('multi=true purchases have per-row controls and are excluded from select-all/footer counts', () => {
    const purchase = { ...confirmations[3], multi: true };
    const state = reduce(reduce(initial, { type: 'loaded', confirmations: [confirmations[0], purchase] }), { type: 'toggleAll' });
    expect(state.items.filter(item => item.selected).map(item => item.confirmation.id)).toEqual(['1002']);
    expect(renderItem(3, { multi: true })).not.toContain(selectToggle());
    expect(renderItem(3, { multi: true })).toContain(mockI18n.t('confirmations.item.confirm'));
    const { tree } = windowView(state);
    expect(visible(renderToStaticMarkup(tree as any))).toContain(plain('confirmations.selectedOf', { selected: 1, total: 1 }));
});

it('an error never hangs the window: a banner with retry over the kept rows, the error state when empty', () => {
    mockI18n.changeLanguage('en');
    const failed = reduce(reduce(loaded(), { type: 'responding', accept: true, ids: ['1009'] }), { type: 'responseError', error: 'Proxy is unavailable' });
    const withRows = renderToStaticMarkup(windowView(failed).tree as any);
    expect(withRows).toContain('confirmation-banner--error');
    expect(withRows).toContain('role="alert"');
    expect(withRows).toContain('Proxy is unavailable');
    expect(withRows).toContain(mockI18n.t('confirmations.retry'));
    expect(withRows.match(/sell-item-container/g)).toHaveLength(confirmations.length);
    expect(withRows).not.toContain(mockI18n.t('confirmations.loading'));
    const empty = reduce(reduce(initial, { type: 'loaded', confirmations: [] }), { type: 'loadError', error: 'Not Logged In' });
    const emptyHtml = renderToStaticMarkup(windowView(empty).tree as any);
    expect(emptyHtml).toContain('confirmation-state--error');
    expect(emptyHtml).toContain('Not Logged In');
    expect(emptyHtml).not.toContain('sell-item-container');
    // Without batch-capable rows there is no select-all, counter or footer.
    const singles = reduce(initial, { type: 'loaded', confirmations: [confirmations[2], confirmations[3]] });
    const singlesHtml = renderToStaticMarkup(windowView(singles).tree as any);
    expect(singlesHtml).not.toContain(mockI18n.t('confirmations.toggleAll'));
    expect(singlesHtml).not.toContain('sell-items-confirms-button-container');
});

// The footer sends exactly the rows that are selected at the moment of the click:
// selected.map(item => item.confirmation) -> confirmationRef. So what must hold is the state.
it('a refresh drops every selection, so a reordered list or a new nonce can never ride on an old selection', () => {
    const selected = reduce(reduce(loaded(), { type: 'select', id: '1002', selected: true }), { type: 'select', id: '1003', selected: true });
    expect(selected.items.filter(item => item.selected).map(item => item.confirmation.id)).toEqual(['1002', '1003']);

    // Steam returns the same ids in another order, one of them with a new nonce, one gone.
    const fresh = [
        { ...confirmations[1], nonce: 'rotated-nonce' },
        { ...confirmations[3] },
        { ...confirmations[0] },
    ];
    const refreshed = reduce(selected, { type: 'loaded', confirmations: fresh });

    expect(refreshed.items.some(item => item.selected)).toBe(false);
    expect(refreshed.items.map(item => item.confirmation.id)).toEqual(['1003', '1012', '1002']);
    expect(refreshed.items[0].confirmation.nonce).toBe('rotated-nonce');

    // Selecting again after the refresh yields the new nonce, and only that row.
    const again = reduce(refreshed, { type: 'select', id: '1003', selected: true });
    const payload = again.items.filter(item => item.selected).map(item => item.confirmation);
    expect(payload.map(c => ({ id: c.id, nonce: c.nonce }))).toEqual([{ id: '1003', nonce: 'rotated-nonce' }]);
});

it('selecting one row never selects another, and protected rows cannot be selected by id', () => {
    const one = reduce(loaded(), { type: 'select', id: '1003', selected: true });
    expect(one.items.filter(item => item.selected).map(item => item.confirmation.id)).toEqual(['1003']);
    for (const id of ['1009', '1012', '1013', 'no-such-id']) {
        const tried = reduce(one, { type: 'select', id, selected: true });
        expect(tried.items.filter(item => item.selected).map(item => item.confirmation.id)).toEqual(['1003']);
    }
});
