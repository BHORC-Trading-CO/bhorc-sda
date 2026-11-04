import react, { FC } from 'react';
import CreationStepType from '../../../../../../../../../electron/interfaces/SteamAccount/CreationStepType';
import store from '../../../../../../../../store/store';
import Button from '../../../../../../../../globalComponents/Button/Button';
import { observer } from 'mobx-react';
import { useTranslation } from 'react-i18next';

const Page: FC<{ step: CreationStepType }> = observer(({ step }) => {
    const { t } = useTranslation();
    switch (step) {
        case "start":
            return <Step title={t('guard.steps.start.title')} text={t('steps.startText')} />;
        case "loginByPassword":
            return <Step title={t('steps.loginByPassword')} text='' />;
        case "askEmailCode":
            return <Step title={t('guard.steps.askEmailCode.title')} text={t('guard.steps.askEmailCode.text')} />;
        case "tryEmailCode":
            return <Step title={t('guard.steps.tryEmailCode.title')} text='' />;
        case "enableTwoFactor":
            return <Step title={t('guard.steps.enableTwoFactor.title')} text={t('guard.steps.enableTwoFactor.text')} />;
        case "askSmsCode":
            return <Step title={t('guard.steps.askSmsCode.title')} text={t('guard.steps.askSmsCode.text')} />;
        case "trySmsCode":
            return <Step title={t('guard.steps.trySmsCode.title')} text='' />;
        case "finalizeTwoFactor":
            return <Step title={t('guard.steps.finalizeTwoFactor.title')} text={t('guard.steps.finalizeTwoFactor.text')} />
        case "loadData":
            return <Step title={t('guard.steps.loadData.title')} text='' />;
        case "import":
            return <Step title={t('guard.steps.import.title')} text='' />
        case "link":
            return <Step title={t('guard.steps.link.title')} text='' />;
        case "end":
            return <Result />;
        case "error":
            return <><div className='account-creation_step'>
                <div className='title'>{t('common.errorTitle')}</div>
                <div className='text text_error'>{store.steamAccountsTable.creationForm.guardSetupProcessError}</div>
            </div>{store.steamAccountsTable.creationForm.guardSetupResult && <Result recoveryOnly />}</>
        default:
            return <>{t('common.unknownStep', { step })}</>;
    }
});

const GuardSetup: FC = observer(() => {
    console.log(store.steamAccountsTable.creationForm.guardSetupProcessStep);
    return (
        <>
            <Page step={store.steamAccountsTable.creationForm.guardSetupProcessStep} />
        </>
    );
});

// Финальный экран. Главное здесь — revocation code: Steam выдаёт его ровно один
// раз, и без него аутентификатор с аккаунта уже не снять. Поэтому окно нельзя
// закрыть "мимо" кода — он показан крупно и рядом с кнопкой копирования.
const Result: FC<{ recoveryOnly?: boolean }> = observer(({ recoveryOnly }) => {
    const result = store.steamAccountsTable.creationForm.guardSetupResult;
    const { t } = useTranslation();

    return <div className='account-creation_step'>
        {!recoveryOnly && <div className='title'>{t('guard.result.title')}</div>}
        {result
            ? <>
                <div className='text'>{t('guard.result.account', { name: result.accountName })}</div>
                <div className='text'>{t('guard.result.steamId', { id: result.steamId })}</div>
                {result.proxy ? <div className='text'>{t('guard.result.proxy', { proxy: result.proxy })}</div> : null}
                <div className='text' style={{ marginTop: '15px' }}>
                    {t('guard.result.revocationCode')}
                </div>
                <div className='title title_code' style={{ userSelect: 'text', letterSpacing: '2px' }}>
                    {result.revocationCode}
                </div>
                <div className='text' style={{ maxWidth: '420px', textAlign: 'center' }}>
                    {t('guard.result.saveIt')}
                </div>
                <Button size='medium' text={t('guard.result.copyCode')} color='grey' hoverColor='light-grey' onClick={() => {
                    navigator.clipboard.writeText(result.revocationCode);
                }} />
            </>
            : <div className='text'>{t('common.canCloseWindow')}</div>}
        <Button size='medium' text={t('common.buttons.close')} color='grey' hoverColor='light-grey' onClick={() => {
            store.steamAccountsTable.creationForm.close();
        }} />
    </div>;
});

const Step: FC<{ title: string, text: string }> = (props) => {
    const { title, text } = props;
    const { t } = useTranslation();

    return <div className='account-creation_step'>
        <div className='title'>{title}</div>
        <div className='text'>{text}</div>
        {/* Шаг идёт: кольцо с циановой дугой крутится классом .sda-spin (motion.css, выключено при
            reduced motion). Только CSS, без импорта Icon: GuardSetup рендерится в jest-тесте без
            загрузчика CSS. Декоративное: что происходит, говорит заголовок шага. */}
        <span className='account-creation_loader sda-spin' aria-hidden='true'></span>
        <Button size='medium' text={t('guard.abort')} color='grey' hoverColor='light-grey' onClick={() => {
            store.steamAccountsTable.creationForm.close();
        }} />
    </div>
}

export default GuardSetup;