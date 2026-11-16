// SDA-37: "×" in the search field. There is no DOM in jest (node), so the markup is checked with
// renderToStaticMarkup and the click/Escape behaviour through the pure helpers the component calls.
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Search from "../../../src/globalComponents/Search/Search";
import { canClearSearch, clearSearch, handleSearchKeyDown } from "../../../src/globalComponents/Search/searchClear";

const SRC = path.join(__dirname, "../../../src");
const render = (value: string) => renderToStaticMarkup(React.createElement(Search, { value, placeholder: "Search accounts", onChange: () => {} }));
const key = (name: string, isComposing = false) => ({ key: name, nativeEvent: { isComposing }, preventDefault: jest.fn(), stopPropagation: jest.fn() });

describe("markup", () => {
    it("an empty field has no clear button", () => {
        const html = render("");
        expect(html).not.toContain("<button");
        expect(html).not.toContain("common.clearSearch");
    });

    it("a field with text has a real button with a localized name and the X icon", () => {
        const html = render("steam");
        expect(html).toContain('value="steam"');
        const button = html.match(/<button[^>]*>([\s\S]*?)<\/button>/);
        expect(button).not.toBeNull();
        expect(button![0]).toMatch(/^<button type="button" class="search-clear" aria-label="common\.clearSearch" title="common\.clearSearch">/);
        expect(button![1]).toContain("lucide-x");
        expect(button![1]).toContain('aria-hidden="true"');
        // A native button without tabindex=-1: reachable with Tab right after the input.
        expect(button![0]).not.toContain("tabindex");
        expect(html.indexOf("<input")).toBeLessThan(html.indexOf("<button"));
    });

    it("the button sits in a slot that is there either way, so nothing moves when it appears", () => {
        const strip = (html: string) => html.replace(/<button[\s\S]*?<\/button>/, "").replace(/ value="[^"]*"/, "");
        expect(strip(render(""))).toBe(strip(render("steam")));
        expect(render("")).toContain('<span class="search-clear-slot"></span>');
        const css = fs.readFileSync(path.join(SRC, "globalComponents/Search/Search.css"), "utf8");
        const slot = css.match(/\.search-clear-slot\s*\{([^}]*)\}/);
        expect(slot).not.toBeNull();
        expect(slot![1]).toMatch(/width:\s*20px/);
        expect(slot![1]).toMatch(/height:\s*20px/);
        expect(slot![1]).toMatch(/flex-shrink:\s*0/);
    });
});

describe("clearing", () => {
    it("the button is shown only for a non-empty query", () => {
        expect(canClearSearch("")).toBe(false);
        expect(canClearSearch("a")).toBe(true);
        expect(canClearSearch(" ")).toBe(true);
    });

    it("clear empties the query through onChange and returns focus to the input", () => {
        const order: string[] = [];
        const onChange = jest.fn(() => order.push("change"));
        const input = { focus: jest.fn(() => order.push("focus")) };
        clearSearch(onChange, input);
        expect(onChange).toHaveBeenCalledWith("");
        expect(input.focus).toHaveBeenCalledTimes(1);
        expect(order).toEqual(["change", "focus"]);
        expect(() => clearSearch(onChange, null)).not.toThrow();
    });

    it("Escape in a field with text clears it and is consumed", () => {
        const clear = jest.fn();
        const event = key("Escape");
        expect(handleSearchKeyDown(event, "steam", clear)).toBe(true);
        expect(clear).toHaveBeenCalledTimes(1);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
    });

    it.each([
        ["Escape in an empty field", key("Escape"), ""],
        ["Escape while an IME is composing", key("Escape", true), "steam"],
        ["another key", key("Enter"), "steam"],
        ["Backspace", key("Backspace"), "steam"],
    ])("%s is left alone (a dialog around can still close on Escape)", (_name, event, value) => {
        const clear = jest.fn();
        expect(handleSearchKeyDown(event, value, clear)).toBe(false);
        expect(clear).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
    });
});

describe("call sites and strings", () => {
    it("every <Search> passes the store value: the field stays controlled", () => {
        const walk = (dir: string, out: string[] = []): string[] => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full, out);
                else if (entry.name.endsWith(".tsx")) out.push(full);
            }
            return out;
        };
        const usages: string[] = [];
        for (const file of walk(SRC)) {
            const source = fs.readFileSync(file, "utf8");
            for (const match of source.matchAll(/<Search\b([\s\S]*?)(?:\/>|<\/Search>)/g)) {
                usages.push(path.relative(SRC, file));
                expect({ file: path.relative(SRC, file), controlled: /\bvalue=\{/.test(match[1]) }).toEqual({ file: path.relative(SRC, file), controlled: true });
            }
        }
        expect(usages.sort()).toEqual([
            "pages/Main/tabs/ProxiesTab/components/ProxiesPanel.tsx",
            "pages/Main/tabs/SteamAccountsTab/components/SteamAccountsPanel.tsx",
        ]);
    });

    it.each(["en", "uk", "ru"])("%s has the button name", (language) => {
        const common = JSON.parse(fs.readFileSync(path.join(SRC, "locales", language, "common.json"), "utf8"));
        expect(typeof common.common.clearSearch).toBe("string");
        expect(common.common.clearSearch.length).toBeGreaterThan(0);
    });
});
