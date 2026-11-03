import sanitizeAvatarUrl from "../../../../../../../electron/components/Functions/sanitizeAvatarUrl";
import react, { FC } from 'react';
import MiniWindow from '../../../../components/MiniWindow/MiniWindow';
import { observer } from 'mobx-react-lite';
import './SteamAccountEditForm.css';
import '../SteamAccountsCreationForm/components/DataFilling/DataFilling.css';
import store from '../../../../../../store/store';
import Input from '../../../../../../globalComponents/Input/Input';
import Delimeter from '../../../../../../globalComponents/Delimeter/Delimeter';
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
    const pin = steamAccount.familyViewPin === 0 ? '' : String(steamAccount.familyViewPin);
    return <div className='steam-account_edit-form'>
        <div className='steam-data-block'>
            <div className="steam-data-title text-white-medium">{t('accounts.form.existingAccountData')}</div>
            <div className="steam-data-input__wrapper">
                <img src={sanitizeAvatarUrl(steamAccount.secondary?.avatarUrl)} alt="" className='steam-account-avatar' style={{ width: '40px', height: '40px', marginRight: '10px' }} />
                <Input value={steamAccount.accountName} placeholder={t('accounts.form.steamLogin')} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, accountName: newValue } });
                    changeThisProperties.accountName = newValue;
                }} />
                <div className="steam-data-input__delimener"></div>
                <Input type='password' value={steamAccount.password} placeholder={t('accounts.form.steamPassword')} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, password: newValue } });
                    changeThisProperties.password = newValue;
                }} />
                <div className="steam-data-input__delimener"></div>
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
        </div>
        <Delimeter marginBottom='25px' marginTop='0px' />
        <div className='steam-data-block'>
            <div className="steam-data-title text-white-medium">{t('accounts.form.secondaryData')}</div>
            <div className="steam-data-input__wrapper">
                <Input value={steamAccount.mail ? steamAccount.mail : ""} placeholder={t('accounts.form.mail')} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, mail: newValue } });
                    changeThisProperties.mail = newValue;
                }} />
                <div className="steam-data-input__delimener"></div>
                <Input type="password" value={steamAccount.mailPassword ? steamAccount.mailPassword : ""} placeholder={t('accounts.form.mailPassword')} onChange={(newValue) => {
                    store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, mailPassword: newValue } });
                    changeThisProperties.mailPassword = newValue;
                }} />
            </div>
            <div className="steam-data-input__wrapper">
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Checkbox isChecked={steamAccount.useSteamCookies} onChange={(newValue) => {
                        store.steamAccountsTable.editingForm.editContent({ steamAccount: { ...steamAccount, useSteamCookies: newValue } });
                        changeThisProperties.useSteamCookies = newValue;
                    }} /><span style={{ lineHeight: '25px' }}>{t('accounts.form.useSteamCookies')}</span>
                </div>

            </div>
        </div>
        <Delimeter marginBottom='25px' marginTop='20px' />
        <div className='proxy-block'>
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
            /><br />

            <div className='steam-account-creation_proxy-block'>
                {
                    <ProxyBlock />
                }
            </div>
        </div>
        <div className='steam-data-block' style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', marginBottom: '20px' }}>
            <Button text={t('common.buttons.cancel')} size='medium' color='grey' hoverColor='light-grey' onClick={() => {
                store.steamAccountsTable.editingForm.close();
            }} />
            <Button text={t('common.buttons.saveChanges')} size='medium' color='gradient' hoverColor='gradient' onClick={() => {
                let proxyId: string | null = steamAccount.proxy ? steamAccount.proxy.id : null;
                if (store.steamAccountsTable.editingForm.switches.proxy === "noProxy") {
                    proxyId = null;
                } else if (store.steamAccountsTable.editingForm.switches.proxy === "newProxy") {
                    store.proxiesTable.createNew(content.proxy.new, { steamAccountIds: [steamAccount.id], profileIds: [] });
                    window.Main.steamAccounts.edit(steamAccount.id, changeThisProperties);
                    store.steamAccountsTable.editSteamAccount(steamAccount.id, changeThisProperties);
                    store.steamAccountsTable.editingForm.close();
                    return;
                } else if (store.steamAccountsTable.editingForm.switches.proxy === "savedProxy") {
                    proxyId = content.proxy.savedId;
                }

                window.Main.steamAccounts.edit(steamAccount.id, changeThisProperties, { proxyId: proxyId });
                store.steamAccountsTable.editSteamAccount(steamAccount.id, changeThisProperties);
                store.steamAccountsTable.editingForm.close();
            }} />
        </div>
    </div>;
});

const ProxyBlock: FC = observer(() => {
    const CreationFormSwitches = store.steamAccountsTable.editingForm.switches;
    const content = store.steamAccountsTable.editingForm.getContent();

    switch (CreationFormSwitches.proxy) {
        case "noProxy":
            return <div className='info-block'>
                <Trans i18nKey="proxyBlock.notSet" components={{ br: <br /> }} />
            </div>
        case "newProxy":
            return <CreateProxyBlock proxy={content.proxy.new} onChange={(newProxyData) => {
                store.steamAccountsTable.editingForm.editContent({ proxy: { ...content.proxy, new: newProxyData } });
            }} />
        case "savedProxy":
            return <SavedProxiesBlock proxies={store.proxiesTable.getProxies()} activeId={content.proxy.savedId} onChange={(newProxyId) => {
                store.steamAccountsTable.editingForm.editContent({ proxy: { ...content.proxy, savedId: newProxyId } });
            }} />
    }
});

export default SteamAccountsEditForm;