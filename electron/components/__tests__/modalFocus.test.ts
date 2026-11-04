// Стопка модальных окон (useModalFocus): Tab по кругу внутри верхнего окна, Escape — только
// верхнему окну, фокус снаружи возвращается, после закрытия — на открывший элемент или в окно
// под ним. DOM в jest нет (node), поэтому элементы — минимальные заглушки с focus/contains.
class FakeElement {
    isConnected = true;
    hidden = false;
    children: FakeElement[] = [];
    constructor(public name: string) {}
    focus() { (globalThis as any).document.activeElement = this; }
    getAttribute() { return null; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    querySelectorAll() { return this.children; }
    contains(node: unknown): boolean { return node === this || this.children.includes(node as FakeElement); }
}

import { focusableIn, nextFocusTarget, handleModalKeyDown, handleModalFocusIn, pushModal, popModal, restoreFocus, ModalEntry } from "../../../src/globalComponents/Modal/useModalFocus";

const dialog = (name: string, items: string[]) => {
    const container = new FakeElement(name);
    container.children = items.map((item) => new FakeElement(`${name}:${item}`));
    return container;
};
const key = (keyName: string, shiftKey = false) => ({ key: keyName, shiftKey, defaultPrevented: false, isComposing: false, preventDefault: jest.fn() }) as any;
const active = () => (globalThis as any).document.activeElement?.name;
let entries: ModalEntry[];
const open = (container: FakeElement, onEscape = jest.fn()) => {
    const entry = { container: () => container as any, onEscape };
    pushModal(entry);
    entries.push(entry);
    return onEscape;
};

beforeEach(() => {
    entries = [];
    (globalThis as any).HTMLElement = FakeElement;
    (globalThis as any).document = { activeElement: null, addEventListener: jest.fn(), removeEventListener: jest.fn() };
});
afterEach(() => {
    entries.forEach(popModal);
    delete (globalThis as any).document;
    delete (globalThis as any).HTMLElement;
});

it("Tab and Shift+Tab cycle inside the dialog, skipping hidden controls", () => {
    const form = dialog("group", ["name", "hidden", "cancel", "create"]);
    form.children[1].hidden = true;
    expect(focusableIn(form as any).map((el: any) => el.name)).toEqual(["group:name", "group:cancel", "group:create"]);
    open(form);
    form.children[0].focus();
    handleModalKeyDown(key("Tab"));
    expect(active()).toBe("group:cancel");
    handleModalKeyDown(key("Tab"));
    handleModalKeyDown(key("Tab"));
    expect(active()).toBe("group:name");
    const back = key("Tab", true);
    handleModalKeyDown(back);
    expect(active()).toBe("group:create");
    expect(back.preventDefault).toHaveBeenCalled();
});

it("focus outside the dialog comes back in: Tab to the first control, Shift+Tab to the last", () => {
    const form = dialog("group", ["name", "create"]);
    const background = new FakeElement("table:row-edit");
    expect(nextFocusTarget(form as any, background as any, false)).toBe(form.children[0]);
    expect(nextFocusTarget(form as any, background as any, true)).toBe(form.children[1]);
    open(form);
    handleModalFocusIn({ target: background } as any);
    expect(active()).toBe("group:name");
    expect(nextFocusTarget(dialog("empty", []) as any, null, false).name).toBe("empty");
});

it("a Prompt above a dialog owns Tab and Escape; after it closes the dialog does again", () => {
    const form = dialog("edit-group", ["name", "delete", "save"]);
    const prompt = dialog("prompt", ["cancel", "accept"]);
    const closeForm = open(form);
    const cancelPrompt = open(prompt);
    prompt.children[1].focus();
    handleModalKeyDown(key("Tab"));
    expect(active()).toBe("prompt:cancel");
    handleModalKeyDown(key("Escape"));
    expect(cancelPrompt).toHaveBeenCalledTimes(1);
    expect(closeForm).not.toHaveBeenCalled();

    popModal(entries.pop()!);
    prompt.isConnected = false;
    restoreFocus(form.children[1] as any);
    expect(active()).toBe("edit-group:delete");
    handleModalKeyDown(key("Escape"));
    expect(closeForm).toHaveBeenCalledTimes(1);
});

it("restores focus to the opener, or into the dialog below when the opener is gone", () => {
    const form = dialog("creation", ["tab-new", "cancel"]);
    open(form);
    const detached = new FakeElement("creation:cross");
    detached.isConnected = false;
    restoreFocus(detached as any);
    expect(active()).toBe("creation:tab-new");

    popModal(entries.pop()!);
    const opener = new FakeElement("panel:add-account");
    restoreFocus(opener as any);
    expect(active()).toBe("panel:add-account");
});

it("keys already handled by a control, and IME composition, are left alone", () => {
    const onEscape = open(dialog("group", ["name"]));
    handleModalKeyDown({ ...key("Escape"), defaultPrevented: true });
    handleModalKeyDown({ ...key("Escape"), isComposing: true });
    expect(onEscape).not.toHaveBeenCalled();
});

it("listeners are installed for the first dialog and removed with the last", () => {
    const doc = (globalThis as any).document;
    open(dialog("a", ["x"]));
    open(dialog("b", ["y"]));
    expect(doc.addEventListener).toHaveBeenCalledTimes(2);
    popModal(entries.pop()!);
    expect(doc.removeEventListener).not.toHaveBeenCalled();
    popModal(entries.pop()!);
    expect(doc.removeEventListener).toHaveBeenCalledWith("keydown", handleModalKeyDown);
    expect(doc.removeEventListener).toHaveBeenCalledWith("focusin", handleModalFocusIn);
});
