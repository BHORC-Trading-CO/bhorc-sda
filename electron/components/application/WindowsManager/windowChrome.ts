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
