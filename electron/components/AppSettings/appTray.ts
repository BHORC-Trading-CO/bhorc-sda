import { Menu, MenuItemConstructorOptions, nativeImage, Tray } from "electron";
import i18n, { t } from "../../i18n";
import { trayIcon } from "../application/WindowsManager/windowChrome";

/** Product name in the tray tooltip (not translated, like the dialog titles in application.ts). */
const TOOLTIP = "BHORC SDA";

/**
 * The tray icon (SDA-35): Windows notification area, macOS menu bar, Linux where a tray host
 * exists. Menu: "Show window" and "Quit"; the labels follow the interface language. Click on the
 * icon opens the window on Windows/Linux; on macOS a click opens the menu, as menu-bar items do.
 */
export default class AppTray {
    private tray: Tray | null = null;
    /** The last create() threw (missing icon, no tray support): callers fall back to a visible window. */
    failed = false;

    constructor(
        private readonly onShow: () => void,
        private readonly onQuit: () => void,
        private readonly platform: NodeJS.Platform = process.platform,
    ) {}

    get ready(): boolean {
        return this.tray !== null && !this.tray.isDestroyed();
    }

    menuTemplate(): MenuItemConstructorOptions[] {
        return [
            { label: t("tray.show"), click: () => this.onShow() },
            { type: "separator" },
            { label: t("tray.quit"), click: () => this.onQuit() },
        ];
    }

    /** Rebuilt on every language change: menu items keep the label they were built with. */
    private readonly rebuildMenu = () => {
        if (this.ready) this.tray!.setContextMenu(Menu.buildFromTemplate(this.menuTemplate()));
    };

    /** Creates the icon once; true when it exists. Must run after app 'ready'. */
    create(): boolean {
        if (this.ready) return true;
        try {
            const file = trayIcon(this.platform);
            const image = nativeImage.createFromPath(file);
            if (image.isEmpty()) throw new Error(`tray icon not found: ${file}`);
            if (this.platform === "darwin") image.setTemplateImage(true);
            this.tray = new Tray(image);
            this.tray.setToolTip(TOOLTIP);
            if (this.platform !== "darwin") this.tray.on("click", () => this.onShow());
            this.rebuildMenu();
            i18n.on("languageChanged", this.rebuildMenu);
            this.failed = false;
            return true;
        } catch (err) {
            console.log(`Tray icon was not created: ${err instanceof Error ? err.message : err}`);
            this.destroy();
            this.failed = true;
            return false;
        }
    }

    destroy() {
        i18n.off("languageChanged", this.rebuildMenu);
        if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
        this.tray = null;
    }
}
