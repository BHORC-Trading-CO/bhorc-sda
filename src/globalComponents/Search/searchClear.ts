// Clearing the search field (SDA-37): the "×" button and Escape. Kept out of the component so the
// behaviour is testable without a DOM.

/** The clear button is shown only when there is something to clear. */
export function canClearSearch(value: string): boolean {
    return value.length > 0;
}

/** Clears the query (the field is controlled, so through onChange) and puts the caret back into the field. */
export function clearSearch(onChange: (value: string) => void, input: { focus(): void } | null): void {
    onChange("");
    if (input) input.focus();
}

export interface SearchKeyEvent {
    key: string;
    nativeEvent?: { isComposing?: boolean };
    preventDefault(): void;
    stopPropagation(): void;
}

/**
 * Escape in a field with text clears it and is consumed, so a dialog or menu around the field does
 * not close on the same key. In an empty field (or while an IME is composing) Escape is left alone.
 * Returns true when the key was handled.
 */
export function handleSearchKeyDown(event: SearchKeyEvent, value: string, clear: () => void): boolean {
    if (event.key !== "Escape" || !canClearSearch(value) || event.nativeEvent?.isComposing) return false;
    event.preventDefault();
    event.stopPropagation();
    clear();
    return true;
}
