import useAccountImage from "../../../../../../globalComponents/Images/useAccountImage";
import react, { FC } from 'react';
import MiniWindow from '../../../../components/MiniWindow/MiniWindow';
import { observer } from 'mobx-react-lite';
import './SteamAccountEditForm.css';
import '../SteamAccountsCreationForm/components/DataFilling/DataFilling.css';
import store from '../../../../../../store/store';
import Input from '../../../../../../globalComponents/Input/Input';
import CreateProxyBlock from '../ProxyBlock/CreateProxyBlock/CreateProxyBlock';
import SavedProxiesBlock from '../ProxyBlock/SavedProxiesBlock/SavedProxies';
import Navigation from '../../../../../../globalComponents/Navigation/Navigation';
import Button from '../../../../../../globalComponents/Button/Button';
import TableSteamAccountInterface from '../../../../../../../electron/interfaces/SteamAccount/TableSteamAccountInterface';
import MaFileImport from '../MaFileImport/MaFileImport';
import Checkbox from '../../../../../../globalComponents/Checkbox/Checkbox';
import { Trans, useTranslation } from 'react-i18next';

const changeThisProperties: { [K in keyof TableSteamAccountInterface]?: TableSteamAccountInterface[K] } = {};

const SteamAccountsEditForm: FC = observer(() => {
    const { t } = useTranslation();
    if (!store.steamAccountsTable.editingForm.isOpen) return <></>;
    const content = store.steamAccountsTable.editingForm.getContent();
    const steamAccountId = content.steamAccount.id;
    const steamAccount = Object.values(store.steamAccountsTable.getSteamAccounts()).filter(sa => sa.id === steamAccountId)[0];

    return (
        <MiniWindow title={t('accounts.editing.title', { number: steamAccount.number, name: steamAccount.accountName })} height='' width='750px' maxHeight='900px' content={<EditFormContent />} onClose={() => {
            store.steamAccountsTable.editingForm.close();
        }} />
    );
});

const EditFormContent = observer(() => {
    const { t } = useTranslation();
    const content = store.steamAccountsTable.editingForm.getContent();
    const switches = store.steamAccountsTable.editingForm.getSwitches();
    const steamAccount = content.steamAccount;
    const steamAccountInStorage = Object.values(store.steamAccountsTable.getSteamAccounts()).filter(sa => sa.id === steamAccount.id)[0];
    const avatar = useAccountImage('avatar', steamAccount.id, steamAccount.secondary?.avatarUrl, `${steamAccountInStorage.proxyState}:${steamAccountInStorage.proxyId}`);
    const pin = steamAccount.familyViewPin === 0 ? '' : String(steamAccount.familyViewPin);
    return <div className='steam-account_edit-form'>
        <section className='sda-form-section steam-data-block'>
            <div className="sda-form-section__head">
                <h3 className="sda-form-section__title">{t('accounts.form.accountSection')}</h3>
            </div>
            <div className="steam-data-input__wrapper">
                <img src={avatar.src || './assets/img/User.svg'} onError={avatar.onError} alt="" className='steam-account-avatar steam-account_edit-form__avatar' />
                <Input value={steamAccount.accountName} placeholder={t('accounts.form.steamLogin')} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, accountName: newValue } });
                    changeThisProperties.accountName = newValue;
                }} />
                <Input type='password' value={steamAccount.password} placeholder={t('accounts.form.steamPassword')} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, password: newValue } });
                    changeThisProperties.password = newValue;
                }} />
                {
                    steamAccountInStorage.familyViewPin ?
                        <Input type='password' value={pin} placeholder={t('accounts.form.pin')} onChange={(newValue) => {
                            if (newValue != '' && !Number(newValue)) return;
                            if (newValue.length > 4) return;
                            if (newValue.length === 0) {
                                changeThisProperties.familyViewPin = null;
                                return store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, familyViewPin: null } });
                            }
                            store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, familyViewPin: Number(newValue) } });
                            changeThisProperties.familyViewPin = Number(newValue);
                        }} />
                        :
                        <></>
                }
            </div>
            <MaFileImport currentMaFile={content.steamAccount.maFile} onChange={(newMaFile) => {
                if (!newMaFile) return;

                if (newMaFile.account_name != content.steamAccount.accountName) {
                    return store.windows.openMiniNotification({
                        type: 'error',
                        text: t('accounts.form.maFileNameMismatch')
                    })
                }
                store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...content.steamAccount, maFile: newMaFile } });
                changeThisProperties.maFile = newMaFile;
            }} />
        </section>
        <section className='sda-form-section steam-data-block'>
            <div className="sda-form-section__head">
                <h3 className="sda-form-section__title">{t('accounts.form.secondaryData')}</h3>
                <span className="sda-form-section__badge">{t('accounts.form.optional')}</span>
            </div>
            <div className="steam-data-input__wrapper">
                <Input value={steamAccount.mail ? steamAccount.mail : ""} placeholder={t('accounts.form.mail')} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, mail: newValue } });
                    changeThisProperties.mail = newValue;
                }} />
                <Input type="password" value={steamAccount.mailPassword ? steamAccount.mailPassword : ""} placeholder={t('accounts.form.mailPassword')} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, mailPassword: newValue } });
                    changeThisProperties.mailPassword = newValue;
                }} />
            </div>
            <div className="steam-data-checkbox">
                <Checkbox isChecked={steamAccount.useSteamCookies} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, useSteamCookies: newValue } });
                    changeThisProperties.useSteamCookies = newValue;
                }} /><span>{t('accounts.form.useSteamCookies')}</span>
            </div>
        </section>
        <section className='sda-form-section proxy-block'>
            <div className="sda-form-section__head">
                <h3 className="sda-form-section__title">{t('proxyBlock.title')}</h3>
            </div>
            <Navigation
                buttons={[
                    {
                        text: t('proxyBlock.noProxy'),
                        id: 'noProxy'
                    },
                    {
                        text: t('proxyBlock.newProxy'),
                        id: 'newProxy'
                    },
                    {
                        text: t('proxyBlock.savedProxy'),
                        id: 'savedProxy'
                    }
                ]}
                selectedId={switches.proxy}
                onChange={(newId: any) => {
                    store.steamAccountsTable.editingForm.editSwitches({ proxy: newId });
                }}
            />

            <div className='steam-account-creation_proxy-block'>
                {
                    <ProxyBlock />
                }
            </div>
        </section>
        {/* Отмена слева, основное действие справа; панель липкая при прокрутке. */}
        <div className='sda-form-footer'>
            <Button text={t('common.buttons.cancel')} size='medium' color='grey' hoverColor='light-grey' onClick={() => {
                store.steamAccountsTable.editingForm.close();
            }} />
            <Button text={t('common.buttons.saveChanges')} size='medium' color='gradient' hoverColor='gradient' onClick={() => {
                if (store.steamAccountsTable.editingForm.switches.proxy === "newProxy") {
                    store.proxiesTable.createNew(content.proxy.new, { steamAccountIds: [steamAccount.id], profileIds: [] });
                    window.Main.steamAccounts.edit(steamAccount.id, changeThisProperties);
                    store.steamAccountsTable.editSteamAccount(steamAccount.id, changeThisProperties);
                    store.steamAccountsTable.editingForm.close();
                    return;
                } else if (store.steamAccountsTable.editingForm.switches.proxy === "savedProxy") {
                    if (!content.proxy.savedId && !(steamAccount.proxyState === "missing" && content.proxy.savedId === steamAccount.proxyId)) {
                        store.windows.openMiniNotification({ type: 'error', text: t('accounts.table.proxyMissingHint') });
                        return;
                    }
                }

                const links = store.steamAccountsTable.editingForm.getProxyLinkChange();
                if (links) window.Main.steamAccounts.edit(steamAccount.id, changeThisProperties, links);
                else window.Main.steamAccounts.edit(steamAccount.id, changeThisProperties);
                store.steamAccountsTable.editSteamAccount(steamAccount.id, changeThisProperties);
                store.steamAccountsTable.editingForm.close();
            }} />
        </div>
    </div>;
});

const ProxyBlock: FC = observer(() => {
    // Trans не подписан на смену языка — хук перерисовывает блок при переключении.
    const { t } = useTranslation();
    const CreationFormSwitches = store.steamAccountsTable.editingForm.switches;
    const content = store.steamAccountsTable.editingForm.getContent();

    switch (CreationFormSwitches.proxy) {
        case "noProxy":
            return <div className='info-block sda-callout'>
                <div>
                    <Trans i18nKey="proxyBlock.notSet" components={{ br: <br /> }} />
                </div>
            </div>
        case "newProxy":
            return <CreateProxyBlock proxy={content.proxy.new} onChange={(newProxyData) => {
                store.steamAccountsTable.editingForm.editContent({ proxy: { ...content.proxy, new: newProxyData } });
            }} />
        case "savedProxy":
            if (content.steamAccount.proxyState === "missing") {
                return <div>
                    <p style={{ color: "var(--sda-danger)" }}>{t("accounts.table.proxyMissingHint")}</p>
                    <div className="input-container"><select className="input-text" aria-label={t("proxyBlock.savedProxy")} value={content.proxy.savedId ?? ""} onChange={event => {
                        store.steamAccountsTable.editingForm.editContent({ proxy: { ...content.proxy, savedId: event.target.value } });
                    }}>
                        <option value={content.steamAccount.proxyId ?? ""} disabled>{t("accounts.table.proxyMissing")}</option>
                        {store.proxiesTable.getProxies().filter(proxy => !proxy.deleted && proxy.id !== content.steamAccount.proxyId).map(proxy =>
                            <option key={proxy.id} value={proxy.id}>{`(#${proxy.number}) ${proxy.host}:${proxy.port}`}</option>)}
                    </select></div>
                </div>;
            }
            return <>
                <SavedProxiesBlock proxies={store.proxiesTable.getProxies()} activeId={content.proxy.savedId} onChange={(newProxyId) => {
                    // Direct traffic requires selecting the separate No proxy option.
                    if (newProxyId !== null) store.steamAccountsTable.editingForm.editContent({ proxy: { ...content.proxy, savedId: newProxyId } });
                }} />
            </>
    }
});

export default SteamAccountsEditForm;
