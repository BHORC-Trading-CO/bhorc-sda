// Привязка аккаунтов в окнах прокси: галочка — общий доступный Checkbox (role="checkbox",
// aria-checked, фокус Tab, Пробел/Enter), а не div только под мышь.
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => options ? `${key}|${JSON.stringify(options)}` : key }),
}));
// Настоящий Checkbox, но его props видны тесту: так вызываем его обработчик клавиш без DOM.
const mockCheckboxProps: any[] = [];
jest.mock("../../../../src/globalComponents/Checkbox/Checkbox", () => {
    const Real = jest.requireActual("../../../../src/globalComponents/Checkbox/Checkbox").default;
    return { __esModule: true, default: (props: any) => { mockCheckboxProps.push(props); return Real(props); } };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AccountItem from "../../../../src/pages/Main/tabs/ProxiesTab/components/AccountItem/AccountItem";

const RealCheckbox = jest.requireActual("../../../../src/globalComponents/Checkbox/Checkbox").default;
const steamAccount = { id: "a1", number: 7, accountName: "fixture_login", proxy: null, proxyState: "none", proxyId: null, secondary: { avatarUrl: "" } } as any;

function render(linked: string[], account = steamAccount) {
    mockCheckboxProps.length = 0;
    const setLinks = jest.fn();
    const html = renderToStaticMarkup(React.createElement(AccountItem, { steamAccount: account, links: { steamAccountIds: linked }, setLinks }));
    return { html, setLinks, props: mockCheckboxProps[0] };
}
// Нажатие клавиши на элементе, который рисует настоящий Checkbox с этими props.
function press(props: any, key: string) {
    const element = RealCheckbox(props);
    const preventDefault = jest.fn();
    element.props.onKeyDown({ key, preventDefault });
    return preventDefault;
}

it("exposes a focusable, labelled checkbox with its checked state", () => {
    const off = render([]);
    expect(off.html).toMatch(/role="checkbox"[^>]*aria-checked="false"[^>]*aria-label="proxies\.links\.toggle\|\{&quot;name&quot;:&quot;fixture_login&quot;\}"[^>]*tabindex="0"/);
    const on = render(["a1"]);
    expect(on.html).toMatch(/role="checkbox"[^>]*aria-checked="true"/);
});

it("Space links an unlinked account and unlinks a linked one, keeping other links", () => {
    const off = render(["other"]);
    expect(press(off.props, " ")).toHaveBeenCalled();
    expect(off.setLinks).toHaveBeenCalledWith({ steamAccountIds: ["other", "a1"] });

    const on = render(["other", "a1"]);
    press(on.props, " ");
    expect(on.setLinks).toHaveBeenCalledWith({ steamAccountIds: ["other"] });
});

it("an account without a login is named by its number", () => {
    const { props } = render([], { ...steamAccount, accountName: "" });
    expect(props.ariaLabel).toBe('proxies.links.toggle|{"name":"#7"}');
});
