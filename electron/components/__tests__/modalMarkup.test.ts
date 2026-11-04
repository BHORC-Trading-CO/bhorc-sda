// Разметка общих окон: role="dialog", aria-modal и имя окна из его заголовка (aria-labelledby);
// у Prompt остаются классы кнопки подтверждения .notification__accept / .notification__accept_danger.
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const mockWindows: Record<string, any> = {};
jest.mock("../../../src/store/store", () => ({ __esModule: true, default: { get windows() { return mockWindows; } } }));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MiniWindow from "../../../src/pages/Main/components/MiniWindow/MiniWindow";
import Prompt from "../../../src/globalComponents/Prompt/Prompt";

it("MiniWindow is a modal dialog named by its title", () => {
    const html = renderToStaticMarkup(React.createElement(MiniWindow, { title: "New group", width: "440px", height: "", content: React.createElement("input"), onClose: () => {} }));
    const labelledBy = html.match(/role="dialog" aria-modal="true" aria-labelledby="([^"]+)" tabindex="-1"/);
    expect(labelledBy).not.toBeNull();
    expect(html).toContain(`<div id="${labelledBy![1]}">New group</div>`);
    const second = renderToStaticMarkup(React.createElement(MiniWindow, { title: "Other", width: "440px", height: "", content: React.createElement("input"), onClose: () => {} }));
    expect(second).not.toContain(`aria-labelledby="${labelledBy![1]}"`);
});

it.each([[false, "notification__accept"], [true, "notification__accept_danger"]])("Prompt danger=%s keeps its dialog role, title name and %s", (danger, acceptClass) => {
    Object.assign(mockWindows, { isPromptOpen: true, promptContent: { type: "question", title: "Delete group?", text: "Irreversible", danger }, closeNotification: jest.fn() });
    const html = renderToStaticMarkup(React.createElement(Prompt));
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="prompt-title" tabindex="-1"/);
    expect(html).toContain('id="prompt-title">Delete group?</h3>');
    expect(html).toMatch(new RegExp(`class="[^"]*\\b${acceptClass}\\b`));
});

it("a closed Prompt renders nothing", () => {
    Object.assign(mockWindows, { isPromptOpen: false });
    expect(renderToStaticMarkup(React.createElement(Prompt))).toBe("");
});
