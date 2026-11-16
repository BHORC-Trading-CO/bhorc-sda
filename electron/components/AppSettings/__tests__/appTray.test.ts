import fs from "fs";
import path from "path";
import { Menu, nativeImage } from "electron";
import AppTray from "../appTray";
import { setMainLanguage } from "../../../i18n";
import { trayIcon, windowIcon } from "../../application/WindowsManager/windowChrome";
import en from "../../../locales/en/main.json";
import uk from "../../../locales/uk/main.json";
import ru from "../../../locales/ru/main.json";

// The tray icon (SDA-35): icon per platform, menu "Show window" / "Quit" in the interface language.

const ROOT = path.join(__dirname, "../../../..");
const buildFromTemplate = jest.spyOn(Menu, "buildFromTemplate");
const lastLabels = () => {
    const calls = buildFromTemplate.mock.calls;
    return (calls[calls.length - 1][0] as any[]).filter((item) => item.type !== "separator").map((item) => item.label);
};
const lastItems = () => {
    const calls = buildFromTemplate.mock.calls;
    return (calls[calls.length - 1][0] as any[]).filter((item) => item.type !== "separator");
};

let trays: AppTray[] = [];
function makeTray(platform: NodeJS.Platform) {
    const onShow = jest.fn();
    const onQuit = jest.fn();
    const tray = new AppTray(onShow, onQuit, platform);
    trays.push(tray);
    return { tray, onShow, onQuit };
}

beforeEach(() => setMainLanguage("en"));
afterEach(() => {
    trays.forEach((tray) => tray.destroy());
    trays = [];
    setMainLanguage("en");
});

describe("menu labels follow the language", () => {
    it.each([["en", en], ["uk", uk], ["ru", ru]] as const)("%s at creation", (language, locale) => {
        setMainLanguage(language);
        const { tray } = makeTray("win32");
        expect(tray.create()).toBe(true);
        expect(lastLabels()).toEqual([locale.tray.show, locale.tray.quit]);
    });

    it("the menu is rebuilt when the language changes", () => {
        const { tray } = makeTray("darwin");
        tray.create();
        expect(lastLabels()).toEqual([en.tray.show, en.tray.quit]);
        setMainLanguage("uk");
        expect(lastLabels()).toEqual([uk.tray.show, uk.tray.quit]);
        setMainLanguage("ru");
        expect(lastLabels()).toEqual([ru.tray.show, ru.tray.quit]);
        const tray2 = (tray as any).tray;
        expect(tray2.setContextMenu).toHaveBeenCalledTimes(3);
    });

    it("after destroy a language change no longer touches the menu", () => {
        const { tray } = makeTray("win32");
        tray.create();
        const native = (tray as any).tray;
        tray.destroy();
        expect(native.isDestroyed()).toBe(true);
        const before = buildFromTemplate.mock.calls.length;
        setMainLanguage("uk");
        expect(buildFromTemplate.mock.calls.length).toBe(before);
        expect(tray.ready).toBe(false);
    });
});

describe("menu items and clicks", () => {
    it("Show window and Quit call their handlers", () => {
        const { tray, onShow, onQuit } = makeTray("win32");
        tray.create();
        const [show, quit] = lastItems();
        show.click();
        expect(onShow).toHaveBeenCalledTimes(1);
        quit.click();
        expect(onQuit).toHaveBeenCalledTimes(1);
    });

    it.each(["win32", "linux"] as const)("%s: a click on the icon opens the window", (platform) => {
        const { tray, onShow } = makeTray(platform);
        tray.create();
        (tray as any).tray.emit("click");
        expect(onShow).toHaveBeenCalledTimes(1);
    });

    it("macOS: a click opens the menu, not the window", () => {
        const { tray, onShow } = makeTray("darwin");
        tray.create();
        expect((tray as any).tray.listenerCount("click")).toBe(0);
        expect(onShow).not.toHaveBeenCalled();
    });

    it("create twice keeps one icon", () => {
        const { tray } = makeTray("win32");
        tray.create();
        const first = (tray as any).tray;
        expect(tray.create()).toBe(true);
        expect((tray as any).tray).toBe(first);
    });
});

describe("icon", () => {
    it.each([
        ["win32", "icon.ico", false],
        ["darwin", "trayTemplate.png", true],
        ["linux", "tray.png", false],
    ] as const)("%s uses %s (template: %s)", (platform, file, template) => {
        const { tray } = makeTray(platform);
        tray.create();
        const image = (nativeImage.createFromPath as jest.Mock).mock.results.slice(-1)[0].value;
        expect(path.basename(image.file)).toBe(file);
        if (template) expect(image.setTemplateImage).toHaveBeenCalledWith(true);
        else expect(image.setTemplateImage).not.toHaveBeenCalled();
    });

    it("tray icons sit next to the window icons, in the assets folder webpack copies for npm start and the package", () => {
        for (const platform of ["win32", "darwin", "linux"] as const) {
            expect(path.dirname(trayIcon(platform))).toBe(path.dirname(windowIcon(platform, "main")));
        }
        expect(fs.readFileSync(path.join(ROOT, "webpack/renderer.webpack.js"), "utf8")).toMatch(/from:\s*"\.\/assets",\s*to:\s*"\.\/assets"/);
    });

    it.each([
        ["trayTemplate.png", 16],
        ["trayTemplate@2x.png", 32],
        ["tray.png", 32],
    ])("assets/%s exists, %i px", (file, size) => {
        const png = fs.readFileSync(path.join(ROOT, "assets", file));
        expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
    });

    it("assets/icon.ico has the 16 and 32 px images Windows takes for the tray", () => {
        const ico = fs.readFileSync(path.join(ROOT, "assets/icon.ico"));
        const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
        expect(sizes).toEqual(expect.arrayContaining([16, 32]));
    });
});

describe("no tray icon", () => {
    it("missing icon file: create fails, nothing is left behind", () => {
        (nativeImage.createFromPath as jest.Mock).mockReturnValueOnce({ isEmpty: () => true, setTemplateImage: jest.fn() });
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const { tray } = makeTray("linux");
        expect(tray.create()).toBe(false);
        expect(tray.failed).toBe(true);
        expect(tray.ready).toBe(false);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("tray icon not found"));
        log.mockRestore();
    });

    it("Tray constructor throws: create fails; a later create can still succeed", () => {
        const electron = require("electron");
        const spy = jest.spyOn(electron, "Tray").mockImplementationOnce(() => { throw new Error("no tray host"); });
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const { tray } = makeTray("linux");
        try {
            expect(tray.create()).toBe(false);
            expect(tray.failed).toBe(true);
        } finally {
            spy.mockRestore();
            log.mockRestore();
        }
        expect(tray.create()).toBe(true);
        expect(tray.failed).toBe(false);
    });
});
