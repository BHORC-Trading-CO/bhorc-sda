import react, { FC, useState } from 'react';
import { observer } from 'mobx-react';
import store from '../../../../../../../../store/store';
import CreationStepType from '../../../../../../../../../electron/interfaces/SteamAccount/CreationStepType';
import LoadingIcons from 'react-loading-icons'
import './AccountCreation.css';
import Button from '../../../../../../../../globalComponents/Button/Button';
import { useTranslation } from 'react-i18next';

const AccountCreation: FC = observer(() => {
    const Page: FC<{ step: CreationStepType }> = observer(({ step }) => {
        const { t } = useTranslation();
        switch (step) {
            case "start":
                return <Step title={t('accounts.creation.steps.start.title')} text={t('steps.startText')} />
            case "loginByPassword":
                return <Step title={t('steps.loginByPassword')} text={t('accounts.creation.steps.loginByPassword.text')} />
            case "checkLoginStatus":
                return <Step title={t('accounts.creation.steps.checkLoginStatus.title')} text={t('accounts.creation.steps.checkLoginStatus.text')} />
            case "askPin":
                return <Step title={t('accounts.creation.steps.askPin.title')} text={t('accounts.creation.steps.askPin.text')} />
            case "tryPin":
                return <Step title={t('accounts.creation.steps.tryPin.title')} text='' />
            case "loadData":
                return <Step title={t('accounts.creation.steps.loadData.title')} text={t('accounts.creation.steps.loadData.text')} />
            case "link":
                return <Step title={t('accounts.creation.steps.link.title')} text='' />;
            case "import":
                return <Step title={t('accounts.creation.steps.import.title')} text='' />
            case "end":
                return (<div className='account-creation_step'>
                    <div className='title'>{t('accounts.creation.steps.end.title')}</div>
                    <div className='text'>{t('common.canCloseWindow')}</div>
                </div>);
            case "error":
                return (<div className='account-creation_step'>
                    <div className='title'>{t('common.errorTitle')}</div>
                    <div className='text text_error'>{store.steamAccountsTable.creationForm.creationProcessError}</div>
                </div>);
            default:
                return <>{t('common.unknownStep', { step })}</>;
        }
    });

    return (
        <>
            <Page step={store.steamAccountsTable.creationForm.creationProcessStep} />
        </>
    );
});

const Step: FC<{ title: string, text: string }> = (props) => {
    const { title, text } = props;
    const { t } = useTranslation();

    return <div className='account-creation_step'>
        <div className='title'>{title}</div>
        <div className='text'>{text}</div>
        <LoadingIcons.BallTriangle style={{ width: '50px', height: '50px', marginBottom: '30px' }} />
        <Button size='medium' text={t('accounts.creation.abort')} color='grey' hoverColor='light-grey' onClick={() => {
            store.steamAccountsTable.creationForm.close();
        }} />
    </div>
}

export default AccountCreation;