// Иконки приложения из знака assets/logo/sda-mark.svg (редизайн R1). Запуск: node scripts/make-icons.mjs
// Пишет (файлы коммитятся):
//   assets/icon.png 1024 и assets/icon.icns (iconutil, только macOS) — сетка macOS: плитка 824 из 1024 с тенью;
//   assets/icon.ico 16–256 — плитка почти во весь квадрат, записи PNG;
//   assets/newIcon.png и assets/confirmationsIcon.png 512 — иконки окон (windowsConfig.ts, WindowsManager.ts),
//   у окна подтверждений циановый значок с галочкой.
// forge.config.js указывает icon: "assets/icon", packager дописывает .icns на macOS и .ico на Windows.
// Плитка — тёмный скруглённый квадрат (суперэллипс) с градиентом #27272a → #09090b, знак на 62 % её размера;
// до 32 px знак крупнее (80 %) и плитка без полей, иначе «S» в 16 px не читается.
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "assets");
const UNITS = 1024; // координаты плитки; рендер в нужный размер задают width/height
const BORDER = "#27272a"; // обводка плитки = --sda-border (src/css/tokens.css), сверяет designGuard.test.ts
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICONSET = [
    [16, "16x16"], [32, "16x16@2x"], [32, "32x32"], [64, "32x32@2x"], [128, "128x128"],
    [256, "128x128@2x"], [256, "256x256"], [512, "256x256@2x"], [512, "512x512"], [1024, "512x512@2x"],
];

// Содержимое знака без обёртки <svg> и комментариев: вкладывается в плитку как есть.
const markSvg = fs.readFileSync(path.join(ASSETS, "logo/sda-mark.svg"), "utf8");
const markInner = markSvg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg\b[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();
if (!markInner.includes("<polygon")) throw new Error("assets/logo/sda-mark.svg: no polygons found");

/** Суперэллипс |x|^5 + |y|^5 = 1 в квадрате (x, y, side): форма «squircle» иконок macOS. */
function squircle(x, y, side, steps = 256) {
    const r = side / 2;
    const cx = x + r;
    const cy = y + r;
    const pts = [];
    for (let i = 0; i < steps; i++) {
        const t = (i / steps) * 2 * Math.PI;
        const c = Math.cos(t);
        const s = Math.sin(t);
        pts.push(`${(cx + r * Math.sign(c) * Math.abs(c) ** 0.4).toFixed(2)},${(cy + r * Math.sign(s) * Math.abs(s) ** 0.4).toFixed(2)}`);
    }
    return `M${pts.join("L")}Z`;
}

/**
 * SVG плитки размером size px.
 * mac — сетка macOS (плитка 824 из 1024 по центру, тень снизу); иначе плитка почти во весь квадрат.
 * badge — циановый значок с галочкой справа снизу (окно подтверждений).
 */
function tileSvg(size, { mac = false, badge = false } = {}) {
    const small = size <= 32;
    const inset = mac && !small ? 100 : 16;
    const side = UNITS - 2 * inset;
    const shape = squircle(inset, inset, side);
    // Обводка как в макете (1px на 112px), но не тоньше 0.75 px итогового размера: край плитки виден на тёмной панели.
    const stroke = Math.max(side / 112, (0.75 * UNITS) / size);
    const markSide = side * (small ? 0.8 : 0.62);
    const markAt = inset + (side - markSide) / 2;
    const shadow = mac && !small
        ? `<filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>`
        : "";
    const shadowShape = shadow ? `<path d="${shape}" fill="#000" fill-opacity="0.45" transform="translate(0 12)" filter="url(#blur)"/>` : "";
    let badgeSvg = "";
    if (badge) {
        const r = side * 0.15;
        const bx = inset + side * 0.77;
        const by = inset + side * 0.77;
        const p = (dx, dy) => `${(bx + dx * r).toFixed(2)},${(by + dy * r).toFixed(2)}`;
        badgeSvg =
            `<circle cx="${bx}" cy="${by}" r="${(r + side * 0.03).toFixed(2)}" fill="#09090b"/>` +
            `<circle cx="${bx}" cy="${by}" r="${r.toFixed(2)}" fill="#22d3ee"/>` +
            `<path d="M${p(-0.45, 0.02)}L${p(-0.13, 0.34)}L${p(0.46, -0.27)}" fill="none" stroke="#09090b" ` +
            `stroke-width="${(r * 0.24).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${UNITS} ${UNITS}">
<defs>
<radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="${inset + side * 0.3}" cy="${inset}" r="${side * 1.2}">
<stop offset="0" stop-color="#27272a"/><stop offset="0.55" stop-color="#111113"/><stop offset="1" stop-color="#09090b"/>
</radialGradient>
<clipPath id="tile"><path d="${shape}"/></clipPath>
${shadow}
</defs>
${shadowShape}
<path d="${shape}" fill="url(#bg)"/>
<path d="${shape}" fill="none" stroke="${BORDER}" stroke-width="${(stroke * 2).toFixed(2)}" clip-path="url(#tile)"/>
<svg x="${markAt}" y="${markAt}" width="${markSide}" height="${markSide}" viewBox="0 0 64 64">${markInner}</svg>
${badgeSvg}
</svg>`;
}

const render = (size, opts) => sharp(Buffer.from(tileSvg(size, opts))).png({ compressionLevel: 9 }).toBuffer();

/** ICO с PNG-записями (Windows Vista+): каталог из 16-байтных записей, затем сами PNG. */
function buildIco(images) {
    const header = Buffer.alloc(6 + 16 * images.length);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2); // 1 — иконка
    header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach(({ size, png }, i) => {
        const entry = 6 + i * 16;
        header[entry] = size >= 256 ? 0 : size; // 0 означает 256
        header[entry + 1] = size >= 256 ? 0 : size;
        header.writeUInt16LE(1, entry + 4); // плоскости
        header.writeUInt16LE(32, entry + 6); // бит на пиксель
        header.writeUInt32LE(png.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += png.length;
    });
    return Buffer.concat([header, ...images.map((image) => image.png)]);
}

async function main() {
    const write = (name, data) => {
        fs.writeFileSync(path.join(ASSETS, name), data);
        console.log(`assets/${name} (${data.length} bytes)`);
    };

    write("icon.png", await render(1024, { mac: true }));
    write("newIcon.png", await render(512));
    write("confirmationsIcon.png", await render(512, { badge: true }));
    const icoImages = [];
    for (const size of ICO_SIZES) icoImages.push({ size, png: await render(size) });
    write("icon.ico", buildIco(icoImages));

    if (process.platform !== "darwin") {
        console.warn("assets/icon.icns skipped: iconutil is macOS only");
        return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sda-icons-"));
    try {
        const iconset = path.join(tmp, "icon.iconset");
        fs.mkdirSync(iconset);
        for (const [size, name] of ICONSET) {
            fs.writeFileSync(path.join(iconset, `icon_${name}.png`), await render(size, { mac: true }));
        }
        const icns = path.join(ASSETS, "icon.icns");
        execFileSync("iconutil", ["-c", "icns", "-o", icns, iconset]);
        console.log(`assets/icon.icns (${fs.statSync(icns).size} bytes)`);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
