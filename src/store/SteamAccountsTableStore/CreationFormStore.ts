import CreationStepType from "../../../electron/interfaces/SteamAccount/CreationStepType";
import GuardSetupResultInterface from '../../../electron/interfaces/SteamAccount/GuardSetupResultInterface';
import ProxySetupInterface from "../../../electron/interfaces/Proxy/ProxySetupInterface";
import SteamAccountsTableStore from "./SteamAccountsTableStore"
import MaFileInterface from "../../../electron/interfaces/SteamAccount/MaFileInterface";
import SmaFileInterface from "../../../electron/interfaces/SteamAccount/SmaFileInterface";
import store from "../store";
import { makeAutoObservable, toJS } from "mobx";
import i18n from "../../i18n/i18n";

class CreationFormStore {
    root: SteamAccountsTableStore;
    switches: {
        creationType: 'new' | 'import',
        guardConnectingType: 'new' | 'maFile',
        proxy: 'noProxy' | 'newProxy' | 'savedProxy'
    }
    currentProcess: 'creation' | 'guardConnecting' | 'dataFilling';
    guardSetupProcessError: string;
    guardSetupProcessStep: CreationStepType;
    guardSetupResult: GuardSetupResultInterface | null;
    creationProcessError: string;
    creationProcessStep: CreationStepType;
    isOpen: boolean;
    content: {
        accountName: string,
        password: string,
        proxy: {
            new: ProxySetupInterface,
            savedId: string | null
        },
        useSteamCookies: boolean,
        maFile: MaFileInterface | null,
        importedAccounts: { smaFile: SmaFileInterface, proxyId: string | null, tempId: string }[],
        profileName: string,
        mail: string,
        mailPassword: string,
    };

    constructor(root: SteamAccountsTableStore) {
        this.root = root;
        this.switches = {
            creationType: 'new',
            guardConnectingType: 'new',
            proxy: 'noProxy'
        }
        this.currentProcess = 'dataFilling';
        this.isOpen = false;
        this.guardSetupProcessError = '';
        this.guardSetupProcessStep = 'start';
        this.guardSetupResult = null;
        this.creationProcessError = '';
        this.creationProcessStep = 'start'
        this.content = {
            accountName: "",
            password: "",
            proxy: {
                new: { host: '', port: '', username: '', password: '' },
                savedId: null
            },
            useSteamCookies: true,
            maFile: null,
            importedAccounts: [],
            mail: "",
            mailPassword: "",
            profileName: ""
        }

        window.Main.steamAccounts.onCreationProcessStep((event, step) => {
            this.setCreationProcessStep(step);
        });
        window.Main.steamAccounts.onCreationProcessError((event, error) => {
            this.setCreationProcessStep('error');
            this.setCreationProcessError(String(error));
        });
        window.Main.guardConnection.onSetupStep((event, step) => {
            this.setGuardSetupProcessStep(step);
        });
        window.Main.guardConnection.onSetupResult((event, result) => {
            this.setGuardSetupResult(result);
        });
        window.Main.guardConnection.onSetupError((event, error) => {
            this.setGuardSetupProcessStep('error');
            this.setGuardSetupProcessError(String(error));
        });

        makeAutoObservable(this);
    }

    open() {
        this.isOpen = true;
        this.content.accountName = "";
        this.content.password = "";
        this.content.maFile = null;
        this.content.importedAccounts = [];
        this.content.proxy.new = { host: "", port: "", username: "", password: "" };
        this.content.proxy.savedId = null;
        this.runDataFillingProcess();
    }
    close() {
        if (this.currentProcess === 'creation' && !(this.creationProcessStep === 'end' || this.creationProcessStep === 'error')) {
            // danger: только вид кнопки подтверждения в Prompt (SDA-9), поведение то же.
            const content = {
                text: i18n.t('accounts.creation.abortPrompt.text'),
                type: 'question' as const,
                title: i18n.t('accounts.creation.abortPrompt.title'),
                acceptButtonText: i18n.t('common.buttons.abort'),
                danger: true,
                cb: () => {
                    this.isOpen = false;
                    window.Main.steamAccounts.abortCreation();
                }
            };
            return store.windows.prompt(content);
        }
        if (this.currentProcess === 'guardConnecting' && !(this.guardSetupProcessStep === 'end' || this.guardSetupProcessStep === 'error')) {
            // danger: только вид кнопки подтверждения в Prompt (SDA-9), поведение то же.
            const content = {
                text: i18n.t('guard.abortPrompt.text'),
                type: 'question' as const,
                title: i18n.t('guard.abortPrompt.title'),
                acceptButtonText: i18n.t('common.buttons.abort'),
                danger: true,
                cb: () => {
                    this.isOpen = false;
                    window.Main.guardConnection.abortSetup();
                }
            };
            return store.windows.prompt(content);
        }
        this.isOpen = false;
    }
    getContent() { return toJS(this.content); }

    setCreationProcessError(error: string) { this.creationProcessError = error; }
    setCreationProcessStep(step: CreationStepType) { this.creationProcessStep = step; }
    setGuardSetupProcessError(error: string) { this.guardSetupProcessError = error; }
    setGuardSetupProcessStep(step: CreationStepType) { this.guardSetupProcessStep = step; }
    setGuardSetupResult(result: GuardSetupResultInterface | null) { this.guardSetupResult = result; }

    get hasValidProxySelection() {
        return this.switches.proxy !== "savedProxy" || !!this.content.proxy.savedId;
    }
    private validateProxySelection() {
        if (this.hasValidProxySelection) return true;
        store.windows.openMiniNotification({ type: "error", text: i18n.t("accounts.table.proxyMissingHint") });
        return false;
    }
    runCreationProcess() {
        if (!this.validateProxySelection()) return;
        const content = this.getContent();
        if (!content.maFile || !content.accountName || !content.password) return;

        let proxyId: string | null = null;
        let newProxy: ProxySetupInterface | null = null;

        switch (this.switches.proxy) {
            case "newProxy":
                newProxy = content.proxy.new;
                break;
            case "savedProxy":
                proxyId = content.proxy.savedId;
                break;
            case "noProxy":
                break;
        }

        window.Main.steamAccounts.creationProcess({
            accountName: content.accountName,
            password: content.password,
            maFile: content.maFile,
            familyViewPin: null,
            mail: content.mail,
            mailPassword: content.mailPassword,
            profileName: content.profileName,
            useSteamCookies: content.useSteamCookies
        }, {
            proxyMode: this.switches.proxy,
            proxyId: proxyId,
            newProxy: newProxy
        });
        this.currentProcess = 'creation';
        this.creationProcessStep = 'start';
        this.creationProcessError = '';
    }
    runGuardSetupProcess() {
        if (!this.validateProxySelection()) return;
        const content = this.getContent();
        if (!content.accountName || !content.password) return;

        let proxyId: string | null = null;
        let newProxy: ProxySetupInterface | null = null;

        switch (this.switches.proxy) {
            case "newProxy":
                newProxy = content.proxy.new;
                break;
            case "savedProxy":
                proxyId = content.proxy.savedId;
                break;
            case "noProxy":
                break;
        }

        window.Main.guardConnection.setup(content, { proxyMode: this.switches.proxy, proxyId: proxyId, newProxy: newProxy });
        this.currentProcess = 'guardConnecting';
        this.guardSetupProcessStep = 'start';
        this.guardSetupProcessError = '';
        this.guardSetupResult = null;
    }
    runDataFillingProcess() { this.currentProcess = 'dataFilling'; }
    editContent(newContent: { [K in keyof typeof this.content]?: typeof this.content[K] }) { this.content = { ...this.content, ...newContent }; }
    editSwitches(newSwitches: { [K in keyof typeof this.switches]?: typeof this.switches[K] }) { this.switches = { ...this.switches, ...newSwitches }; }
}

export default CreationFormStore;