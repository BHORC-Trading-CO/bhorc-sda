import path from 'path';
import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * Рамка окна по платформе (R1). Кнопки окна — системные, а не свои (бывший Attic):
 * - macOS: светофор поверх полосы TitleBar высотой 48px (--sda-titlebar-height),
 *   y = (48 - 14) / 2 — кнопки по центру полосы по вертикали;
 * - Windows: системные кнопки заголовка поверх полосы (titleBarOverlay) в её цвете;
 * - остальные: обычная системная рамка.
 * Полоса перетаскивается через -webkit-app-region: drag (src/globalComponents/TitleBar).
 */
export function windowChrome(platform: NodeJS.Platform): Partial<BrowserWindowConstructorOptions> {
    switch (platform) {
        case 'darwin':
            return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 17 } };
        case 'win32':
            return { titleBarStyle: 'hidden', titleBarOverlay: { color: '#18181b', symbolColor: '#d4d4d8', height: 48 } };
        default:
            return { frame: true };
    }
}

/** Окна приложения: иконка окна подтверждений — с галочкой. */
export type AppWindowKind = 'main' | 'ask' | 'confirmations' | 'auth' | 'error';

/**
 * Иконка окна (BrowserWindow.icon), единственное место, где она задаётся. assets копируются в сборку
 * рядом с main: .webpack/renderer/assets (renderer.webpack.js).
 * - Windows: assets/icon.ico — размеры 16–256, до 32 px знак крупнее (scripts/make-icons.mjs).
 *   Одну png 512 Windows сам уменьшает для заголовка и панели задач, и «S» там не читается.
 * - macOS BrowserWindow.icon не использует (иконка из бандла, icon.icns); остальные — png 512.
 */
export function windowIcon(platform: NodeJS.Platform, kind: AppWindowKind): string {
    const file = platform === 'win32' ? 'icon.ico' : kind === 'confirmations' ? 'confirmationsIcon.png' : 'newIcon.png';
    return path.join(__dirname, '../renderer/assets', file);
}
