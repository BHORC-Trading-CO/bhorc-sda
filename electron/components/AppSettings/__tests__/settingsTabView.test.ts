// Settings page markup (SDA-35, SDA-36): wording per platform, what is disabled and why.
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    Trans: () => null,
}));
const mockAppSettings: Record<string, any> = {};
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { get appSettings() { return mockAppSettings; } } }));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsTab from "../../../../src/pages/Main/tabs/SettingsTab/SettingsTab";

const g = globalThis as any;
const ALL_OFF = { closeToTray: false, launchAtLogin: false, startMinimized: false };

function render(platform: NodeJS.Platform, state: Record<string, any>) {
    g.window = { Main: { platform } };
    Object.assign(mockAppSettings, { isLoaded: true, settings: ALL_OFF, loginItem: "supported", trayUnavailable: false, error: null, set: jest.fn() }, state);
    return renderToStaticMarkup(React.createElement(SettingsTab));
}

/** The switch button of a row: its attributes up to the closing ">". */
function switchOf(html: string, id: string): string {
    const match = html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`));
    if (!match) throw new Error(`no switch ${id}`);
    return match[0];
}

afterEach(() => { delete g.window; });

it("Windows: tray wording, every switch reflects the stored value", () => {
    const html = render("win32", { settings: { closeToTray: true, launchAtLogin: true, startMinimized: false } });
    expect(html).toContain("settings.background.closeToTray.label<");
    expect(html).toContain("settings.background.startMinimized.label<");
    expect(html).not.toContain("labelMac");
    expect(switchOf(html, "settings-close-to-tray")).toContain('aria-checked="true"');
    expect(switchOf(html, "settings-launch-at-login")).toContain('aria-checked="true"');
    expect(switchOf(html, "settings-start-minimized")).toContain('aria-checked="false"');
    expect(switchOf(html, "settings-start-minimized")).not.toContain("disabled");
    expect(switchOf(html, "settings-close-to-tray")).toContain('aria-describedby="settings-close-to-tray-hint"');
});

it("macOS: menu bar wording", () => {
    const html = render("darwin", {});
    expect(html).toContain("settings.background.closeToTray.labelMac");
    expect(html).toContain("settings.background.closeToTray.hintMac");
    expect(html).toContain("settings.background.startMinimized.labelMac");
});

it("start minimized depends on launch at login", () => {
    const html = render("win32", { settings: { ...ALL_OFF, startMinimized: true } });
    expect(switchOf(html, "settings-start-minimized")).toContain('disabled=""');
});

it.each(["unsupportedPlatform", "notPackaged"])("login item %s: both startup switches disabled, with the reason", (support) => {
    const html = render("linux", { loginItem: support });
    expect(switchOf(html, "settings-launch-at-login")).toContain('disabled=""');
    expect(switchOf(html, "settings-start-minimized")).toContain('disabled=""');
    expect(switchOf(html, "settings-close-to-tray")).not.toContain("disabled");
    expect(html).toContain(`settings.background.launchAtLogin.${support}`);
    expect(html).not.toContain("settings.background.launchAtLogin.hint");
});

it("tray icon missing: a note says closing still quits; an error from main is shown", () => {
    const html = render("win32", { settings: { ...ALL_OFF, closeToTray: true }, trayUnavailable: true, error: "Could not change system startup: denied" });
    expect(html).toContain('data-testid="settings-tray-unavailable"');
    expect(html).toContain("settings.background.trayUnavailable");
    expect(html).toContain('role="alert">Could not change system startup: denied</p>');
});

it("nothing but the header until main has answered", () => {
    const html = render("win32", { isLoaded: false });
    expect(html).toContain("settings.title");
    expect(html).not.toContain("settings-close-to-tray");
});
