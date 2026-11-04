import { RefObject, useEffect, useRef } from "react";

// Фокус модальных окон (MiniWindow, Prompt). Затемнение перекрывает только мышь, а клавиатура
// раньше уходила за окно: Tab доходил до таблицы и верхней панели, и фон можно было нажать,
// бросив незаполненную форму. Здесь:
//  - при открытии фокус переходит внутрь окна (если окно не поставило его само);
//  - Tab и Shift+Tab ходят по кругу внутри окна, фокус, ушедший за окно, возвращается;
//  - Escape делает то же, что Отмена/крестик окна (никогда не подтверждение);
//  - после закрытия фокус возвращается на элемент, с которого окно открыли.
// Окна лежат стопкой (Prompt поверх формы): клавиши обрабатывает только верхнее, а когда оно
// закрывается, фокус возвращается в окно под ним.

export interface ModalEntry {
    container: () => HTMLElement | null;
    onEscape: () => void;
}

const stack: ModalEntry[] = [];

const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
].join(",");

/** Элементы окна, доступные с Tab, в порядке документа; скрытые (display: none) пропускаются. */
export function focusableIn(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el =>
        el.getAttribute("aria-hidden") !== "true" && el.getClientRects().length > 0);
}

/** Куда перевести фокус по Tab: по кругу внутри окна; если фокус снаружи — на первый (Shift — на последний). */
export function nextFocusTarget(container: HTMLElement, active: Element | null, backwards: boolean): HTMLElement {
    const items = focusableIn(container);
    if (items.length === 0) return container;
    const index = active ? items.indexOf(active as HTMLElement) : -1;
    if (index === -1) return backwards ? items[items.length - 1] : items[0];
    return items[(index + (backwards ? -1 : 1) + items.length) % items.length];
}

/** Верхнее открытое окно, которое ещё в документе. */
function topContainer(): { entry: ModalEntry, container: HTMLElement } | null {
    for (let i = stack.length - 1; i >= 0; i--) {
        const container = stack[i].container();
        if (container && container.isConnected) return { entry: stack[i], container };
    }
    return null;
}

export function handleModalKeyDown(event: KeyboardEvent) {
    const top = topContainer();
    if (!top || event.defaultPrevented || event.isComposing) return;
    if (event.key === "Escape") {
        event.preventDefault();
        top.entry.onEscape();
    } else if (event.key === "Tab") {
        event.preventDefault();
        nextFocusTarget(top.container, document.activeElement, event.shiftKey).focus();
    }
}

export function handleModalFocusIn(event: FocusEvent) {
    const top = topContainer();
    if (!top || top.container.contains(event.target as Node)) return;
    nextFocusTarget(top.container, null, false).focus();
}

export function pushModal(entry: ModalEntry) {
    if (stack.length === 0) {
        document.addEventListener("keydown", handleModalKeyDown);
        document.addEventListener("focusin", handleModalFocusIn);
    }
    stack.push(entry);
}

export function popModal(entry: ModalEntry) {
    const index = stack.indexOf(entry);
    if (index !== -1) stack.splice(index, 1);
    if (stack.length === 0) {
        document.removeEventListener("keydown", handleModalKeyDown);
        document.removeEventListener("focusin", handleModalFocusIn);
    }
}

/** Вернуть фокус после закрытия: на элемент, открывший окно, а если его уже нет — в окно под ним. */
export function restoreFocus(opener: Element | null) {
    if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
        return;
    }
    const top = topContainer();
    if (top && !top.container.contains(document.activeElement)) nextFocusTarget(top.container, null, false).focus();
}

/**
 * Подключает окно к стопке модальных окон.
 * @param ref контейнер окна (элемент с role="dialog"; нужен tabIndex={-1} на случай окна без кнопок)
 * @param onEscape то же действие, что Отмена/крестик
 * @param initialFocus куда поставить фокус при открытии; по умолчанию первый доступный элемент окна
 */
export default function useModalFocus(
    ref: RefObject<HTMLElement>,
    onEscape: () => void,
    initialFocus?: (container: HTMLElement) => HTMLElement | null | undefined,
) {
    const onEscapeRef = useRef(onEscape);
    onEscapeRef.current = onEscape;
    // Открывший элемент запоминаем при первой отрисовке: эффекты дочерних компонентов (например,
    // фокус в поле названия группы) выполняются раньше эффекта окна и уже переносят фокус внутрь.
    const openerRef = useRef<Element | null | undefined>(undefined);
    if (openerRef.current === undefined) openerRef.current = typeof document === "undefined" ? null : document.activeElement;

    useEffect(() => {
        const entry: ModalEntry = { container: () => ref.current, onEscape: () => onEscapeRef.current() };
        pushModal(entry);
        const container = ref.current;
        if (container && !container.contains(document.activeElement)) {
            (initialFocus?.(container) || nextFocusTarget(container, null, false)).focus();
        }
        const opener = openerRef.current ?? null;
        return () => {
            popModal(entry);
            restoreFocus(opener);
        };
    }, []);
}
