import { makeAutoObservable } from "mobx";
import { Store } from "./store";
import {
    BrowserExtensionView,
    BrowserSettingsError,
    BrowserSettingsSection,
    BrowserSettingsView,
} from "../../electron/interfaces/Browser/BrowserSettingsInterface";

// Стор страницы Browser (SDA-6): общие для всех аккаунтов стартовые ссылки и расширения.
// Каждое действие сразу сохраняется; main проверяет и отвечает сохранённым состоянием,
// при отказе — текстом ошибки и прежним состоянием.
class BrowserSettingsStore {
    root: Store;
    isLoaded: boolean;
    startLinks: string[];
    extensions: BrowserExtensionView[];
    /** Последний отказ main; блок страницы, где его показать, тоже говорит main. */
    error: BrowserSettingsError | null;
    isPicking: boolean;

    constructor(root: Store) {
        this.root = root;
        this.isLoaded = false;
        this.startLinks = [];
        this.extensions = [];
        this.error = null;
        this.isPicking = false;

        makeAutoObservable(this, { root: false });

        window.Main.browser.onGet((event, settings) => this.apply(settings));
        window.Main.browser.onError((event, error) => this.setError(error));
        this.load();
    }

    /** При открытии страницы: свежее состояние папок, старая ошибка больше не к месту. */
    load() {
        this.error = null;
        window.Main.browser.get();
    }

    apply(settings: BrowserSettingsView) {
        this.startLinks = settings.startLinks;
        this.extensions = settings.extensions;
        this.isLoaded = true;
        this.isPicking = false;
    }

    setError(error: BrowserSettingsError | null) {
        this.error = error;
    }

    private save(startLinks: string[], extensions: BrowserExtensionView[]) {
        this.error = null;
        // Сразу показываем изменение; ответ main его подтвердит или вернёт прежнее.
        this.startLinks = startLinks;
        this.extensions = extensions;
        window.Main.browser.save({
            startLinks: [...startLinks],
            extensions: extensions.map(({ path, enabled }) => ({ path, enabled })),
        });
    }

    addLink(link: string) {
        this.save([...this.startLinks, link], this.extensions);
    }

    updateLink(index: number, link: string) {
        this.save(this.startLinks.map((current, i) => (i === index ? link : current)), this.extensions);
    }

    removeLink(index: number) {
        this.save(this.startLinks.filter((_, i) => i !== index), this.extensions);
    }

    moveLink(index: number, delta: -1 | 1) {
        const target = index + delta;
        if (target < 0 || target >= this.startLinks.length) return;
        const links = [...this.startLinks];
        [links[index], links[target]] = [links[target], links[index]];
        this.save(links, this.extensions);
    }

    setExtensionEnabled(path: string, enabled: boolean) {
        this.save(
            this.startLinks,
            this.extensions.map((extension) => (extension.path === path ? { ...extension, enabled } : extension))
        );
    }

    removeExtension(path: string) {
        this.save(this.startLinks, this.extensions.filter((extension) => extension.path !== path));
    }

    pickExtension() {
        this.error = null;
        this.isPicking = true;
        window.Main.browser.pickExtension();
    }

    errorFor(section: BrowserSettingsSection) {
        return this.error && this.error.section === section ? this.error.message : null;
    }
}

export default BrowserSettingsStore;
