import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Icon, { IconName } from "../../../src/globalComponents/Icon/Icon";
import { confirmationTypeIcon } from "../../../src/pages/Confirmations/confirmationPresentation";

// Обёртка Icon (R1): каждое имя из IconName рисуется инлайн-SVG lucide. Имена берём из самого
// типа в исходнике, чтобы новое имя без иконки в карте не прошло незамеченным.
const source = fs.readFileSync(path.join(__dirname, "../../../src/globalComponents/Icon/Icon.tsx"), "utf8");
const typeBlock = (source.match(/export type IconName =([\s\S]*?);/) || [])[1] || "";
const NAMES = [...typeBlock.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) as IconName[];

describe("Icon", () => {
    test("every IconName renders an inline svg", () => {
        expect(NAMES.length).toBeGreaterThan(40);
        for (const name of NAMES) {
            const html = renderToStaticMarkup(React.createElement(Icon, { name }));
            expect({ name, svg: html.startsWith("<svg") && html.includes("sda-icon") }).toEqual({ name, svg: true });
        }
    });

    test("confirmation types: trade is arrowLeftRight, market listing is tag", () => {
        expect(renderToStaticMarkup(React.createElement(Icon, { name: "arrowLeftRight" }))).toContain("lucide-arrow-left-right");
        expect(renderToStaticMarkup(React.createElement(Icon, { name: "tag" }))).toContain("lucide-tag");
        // SDA-7: карта «тип → значок» вынесена в confirmationPresentation (все типы Steam, а не 2 и 3).
        expect(confirmationTypeIcon(2)).toBe("arrowLeftRight");
        expect(confirmationTypeIcon(3)).toBe("tag");
        const sellItem = fs.readFileSync(path.join(__dirname, "../../../src/pages/Confirmations/SellItem/SellItem.tsx"), "utf8");
        expect(sellItem).toContain("confirmationTypeIcon(confirmation.type)");
    });

    test("SDA-7 confirmation types: purchase, API key, security, family, refund; anything else is the shield", () => {
        expect([12, 9, 5, 6, 10, 11, 13, 99].map(confirmationTypeIcon)).toEqual(["shoppingCart", "key", "shieldAlert", "shieldAlert", "users", "users", "undo", "shieldCheck"]);
        expect(renderToStaticMarkup(React.createElement(Icon, { name: "shoppingCart" }))).toContain("lucide-shopping-cart");
        expect(renderToStaticMarkup(React.createElement(Icon, { name: "key" }))).toContain("lucide-key-round");
    });
});
