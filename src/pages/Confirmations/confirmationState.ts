import type { MobileConfirmation, MobileConfirmationRef, MobileConfirmationResult } from '../../../electron/interfaces/SteamAccount/MobileConfirmationInterface';

export type { MobileConfirmation };
export interface ConfirmationItem { selected: boolean; confirmation: MobileConfirmation; error?: string; unknown?: boolean; notSent?: boolean }
export interface ConfirmationState {
    items: ConfirmationItem[];
    loading: boolean;
    responding: null | { accept: boolean; count: number };
    error: string;
    purchaseNotice: boolean;
    // Keep acknowledged successes out of an eventually consistent getlist response.
    completed: string[];
}
export const initialConfirmationState: ConfirmationState = { items: [], loading: true, responding: null, error: '', purchaseNotice: false, completed: [] };

// Kept in the renderer: the main process independently enforces the same rule.
// Purchases stay individual until D-sda7 §7 P2/P4 verifies Steam's multi flag.
export const isBatchable = (ref: MobileConfirmationRef) => ref.multi === true && ![5, 6, 9, 10, 11, 12, 13].includes(ref.type);
export const requiresSecurityWarning = (type: number) => [5, 6, 9].includes(type);
export const confirmationRef = ({ id, nonce, type, multi }: MobileConfirmation): MobileConfirmationRef => ({ id, nonce, type, multi });

type Action =
    | { type: 'reset' | 'loading' | 'toggleAll' }
    | { type: 'loaded'; confirmations: MobileConfirmation[] }
    | { type: 'loadError' | 'responseError'; error: string }
    | { type: 'select'; id: string; selected: boolean }
    | { type: 'responding'; accept: boolean; ids: string[] }
    | { type: 'results'; results: MobileConfirmationResult[]; fallbackError: string; refresh?: boolean };

export function confirmationReducer(state: ConfirmationState, action: Action): ConfirmationState {
    switch (action.type) {
        case 'reset': return initialConfirmationState;
        case 'loading': return { ...state, loading: true, error: '' };
        case 'loadError': return { ...state, loading: false, error: action.error };
        case 'responseError': return { ...state, loading: false, responding: null, error: action.error };
        case 'loaded': {
            const previous = new Map(state.items.map(item => [item.confirmation.id, item]));
            const items: ConfirmationItem[] = action.confirmations.filter(c => !state.completed.includes(c.id)).map(confirmation => ({
                confirmation, selected: false, error: previous.get(confirmation.id)?.error,
                unknown: previous.get(confirmation.id)?.unknown, notSent: previous.get(confirmation.id)?.notSent,
            }));
            // A fresh getlist is authoritative: absent ids must never remain actionable.
            const listed = new Set(action.confirmations.map(confirmation => confirmation.id));
            const purchaseNotice = state.items.some(item => item.confirmation.type === 12 && item.error && !listed.has(item.confirmation.id));
            return { ...state, items, loading: false, error: '', purchaseNotice };
        }
        case 'select': return { ...state, items: state.items.map(item => item.confirmation.id === action.id && isBatchable(item.confirmation) ? { ...item, selected: action.selected } : item) };
        case 'toggleAll': {
            const selected = !state.items.some(item => item.selected && isBatchable(item.confirmation));
            return { ...state, items: state.items.map(item => ({ ...item, selected: selected && isBatchable(item.confirmation) })) };
        }
        case 'responding': return {
            ...state, error: '', responding: { accept: action.accept, count: action.ids.length },
            items: state.items.map(item => action.ids.includes(item.confirmation.id) ? { ...item, error: undefined, unknown: undefined, notSent: undefined } : item),
        };
        case 'results': {
            const results = new Map(action.results.map(result => [result.id, result]));
            return {
                ...state, loading: action.refresh !== false, responding: null, error: '',
                completed: Array.from(new Set([...state.completed, ...action.results.filter(result => result.ok).map(result => result.id)])),
                items: state.items.filter(item => !results.get(item.confirmation.id)?.ok).map(item => {
                    const result = results.get(item.confirmation.id);
                    return result ? { ...item, selected: false, error: result.message || action.fallbackError, unknown: result.unknown, notSent: result.notSent } : item;
                }),
            };
        }
    }
}
