jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string, options?: { date?: string }) => (options?.date ? `${key}(${options.date})` : key) }),
}));
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KtStatus, MarketStatus, TradeStatus, statusRank } from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/AccountStatusBadges";

// SDA-31: KT, Market and Trades columns have three states. Unknown must never look like OK, and
// booleans saved by older versions must render exactly as before.
const render = (component: React.FC<{ value: unknown }>, value: unknown) =>
    renderToStaticMarkup(React.createElement(component as React.FC<any>, { value }));
const tone = (html: string) => (html.match(/status-badge--(\w+)/) || [])[1];
const textOutsideSvg = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ");

describe("status badges", () => {
    it.each([
        [KtStatus, false, "success", "accounts.table.status.ok", "accounts.table.status.ktOk"],
        [KtStatus, true, "danger", "accounts.table.status.locked", "accounts.table.status.ktLocked"],
        [MarketStatus, true, "success", "accounts.table.status.ok", "accounts.table.status.marketOk"],
        [MarketStatus, false, "danger", "accounts.table.status.no", "accounts.table.status.marketBlocked"],
        [MarketStatus, "Dec 1, 2026", "warning", "accounts.table.status.later", "accounts.table.status.marketLater(Dec 1, 2026)"],
        [TradeStatus, true, "success", "accounts.table.status.ok", "accounts.table.status.tradeOk"],
        [TradeStatus, false, "danger", "accounts.table.status.no", "accounts.table.status.tradeBlocked"],
    ])("legacy stored value %#: %p renders as before", (component, value, expectedTone, label, tip) => {
        const html = render(component as React.FC<any>, value);
        expect(tone(html)).toBe(expectedTone);
        expect(html).toContain(label);
        expect(html).toContain(tip);
        expect(html).not.toContain("<svg");
    });

    it.each([
        [KtStatus, null, "accounts.table.status.ktUnknown"],
        [KtStatus, undefined, "accounts.table.status.ktUnknown"],
        [MarketStatus, null, "accounts.table.status.marketUnknown"],
        [MarketStatus, undefined, "accounts.table.status.marketUnknown"],
        [TradeStatus, null, "accounts.table.status.tradeUnknown"],
        [TradeStatus, undefined, "accounts.table.status.tradeUnknown"],
    ])("unknown %#: a neutral badge with a lucide icon, a text label and its own tooltip", (component, value, tip) => {
        const html = render(component as React.FC<any>, value);
        expect(tone(html)).toBe("neutral");
        expect(html).toMatch(/<svg[^>]*lucide-circle-help/);
        expect(textOutsideSvg(html)).toContain("accounts.table.status.unknown");
        expect(html).toContain(tip);
        expect(html).not.toContain("accounts.table.status.ok");
    });

    it("the neutral tone uses the redesign tokens", () => {
        const css = fs.readFileSync(path.join(__dirname, "../../../../src/globalComponents/Table/Table.css"), "utf8");
        const rule = (css.match(/\.status-badge--neutral\s*\{([^}]*)\}/) || [])[1] || "";
        expect(rule).toMatch(/color:\s*var\(--sda-text-muted\)/);
        expect(rule).toMatch(/background:\s*var\(--sda-surface-3\)/);
    });

    it("sorting puts unknown between the two known values and keeps false before true", () => {
        // Wrapped like table rows: Array.sort would move a bare undefined to the end on its own
        const rows = [true, null, "Dec 1, 2026", false, undefined].map((value) => ({ value }));
        const sorted = rows.sort((a, b) => statusRank(a.value) - statusRank(b.value)).map((row) => row.value);
        expect(sorted).toEqual([false, null, undefined, "Dec 1, 2026", true]);
    });
});
