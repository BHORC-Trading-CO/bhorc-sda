import React, { FC, useEffect, useReducer, useRef, useState } from 'react';
import TitleBar from '../../globalComponents/TitleBar/TitleBar';
import Button from '../../globalComponents/Button/Button';
import Icon from '../../globalComponents/Icon/Icon';
import "./Confirmation.css"
import SellItem from './SellItem/SellItem';
import { Trans, useTranslation } from 'react-i18next';
import stripLeadingEmoji from './stripLeadingEmoji';
import { confirmationReducer, confirmationRef, initialConfirmationState, isBatchable, requiresSecurityWarning } from './confirmationState';
import type { MobileConfirmation } from './confirmationState';
import ApiKeyWarning from './ApiKeyWarning';

const Confirmations: FC = () => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [id, setId] = useState('');
    const accountId = useRef('');
    const inFlight = useRef(false);
    const [state, dispatch] = useReducer(confirmationReducer, initialConfirmationState);
    const [securityWarning, setSecurityWarning] = useState<MobileConfirmation | null>(null);
    const translation = useRef(t);
    translation.current = t;

    useEffect(() => {
        const api = window.Confirmations.api;
        const subscriptions = [
            api.onGetParams((_event, params) => {
                accountId.current = params.id;
                setId(params.id);
                setName(params.steamAccountName);
                dispatch({ type: 'reset' });
                api.getConfirmations(params.id);
            }),
            api.onGetConfirmations((_event, data) => {
                if (accountId.current === data.id) dispatch({ type: 'loaded', confirmations: data.confirmations });
            }),
            api.onGetConfirmationsError((_event, data) => {
                if (accountId.current === data.id) dispatch({ type: 'loadError', error: data.err });
            }),
            api.onRespondConfirmations((_event, data) => {
                if (accountId.current !== data.id) return;
                inFlight.current = false;
                // Неизвестный исход нужно сверить со списком. Остановка из-за входа, маршрута
                // или 429 не должна сразу слать ещё один запрос по тому же маршруту.
                const refresh = !data.results.some(result => result.stopped) || data.results.some(result => result.unknown);
                dispatch({ type: 'results', results: data.results, fallbackError: translation.current('confirmations.actionError'), refresh });
                if (refresh) api.getConfirmations(data.id);
            }),
            api.onRespondConfirmationsError((_event, data) => {
                if (accountId.current !== data.id) return;
                inFlight.current = false;
                dispatch({ type: 'responseError', error: data.err });
            }),
        ];
        return () => subscriptions.forEach(unsubscribe => unsubscribe());
    }, []);

    // «Выбрать все», счётчик и полоса снизу — только для пакетных подтверждений (SDA-7):
    // покупка, API-ключ и подтверждения безопасности идут по одному кнопками в своей карточке.
    const batchItems = state.items.filter(item => isBatchable(item.confirmation));
    const selected = batchItems.filter(item => item.selected);
    const busy = state.loading || state.responding !== null;
    const controlsDisabled = busy || securityWarning !== null;
    const errorText = state.error ? stripLeadingEmoji(String(state.error)) || t('confirmations.error') : '';
    const refresh = () => {
        if (controlsDisabled || !id) return;
        dispatch({ type: 'loading' });
        window.Confirmations.api.getConfirmations(id);
    };
    const respond = (confirmations: MobileConfirmation[], accept: boolean, warningApproved = false) => {
        if (busy || (securityWarning && !warningApproved) || inFlight.current || !id || !confirmations.length) return;
        inFlight.current = true;
        const refs = confirmations.map(confirmationRef);
        dispatch({ type: 'responding', accept, ids: refs.map(ref => ref.id) });
        try {
            window.Confirmations.api.respondConfirmations(id, { allow: accept ? refs : [], cancel: accept ? [] : refs });
        } catch (error) {
            inFlight.current = false;
            dispatch({ type: 'responseError', error: error instanceof Error ? error.message : String(error) });
        }
    };

    return (
        <div className='confirmation-wrapper'>
            {/* Пока открыто предупреждение, фон выключен и скрыт от клавиатуры и скринридера. */}
            <fieldset className='confirmation-main' disabled={securityWarning !== null} aria-hidden={securityWarning ? true : undefined}>
                {/* Заголовок окна — имя аккаунта: окон подтверждений бывает открыто несколько. */}
                <TitleBar platform={window.Confirmations.platform} title={name || t('confirmations.title')} />
                <div className='confirmation-container'>
                    <div className='confirmation-info-container'>
                        <h2 className='confirmation-heading'>{t('confirmations.title')}</h2>
                        <div className='confirmation-toolbar'>
                            {batchItems.length > 0 && <>
                                <div className='sell-items-count-selected'>
                                    <Trans t={t} i18nKey='confirmations.selectedOf' values={{ selected: selected.length, total: batchItems.length }} components={{ n: <span className='confirmation-count' /> }} />
                                </div>
                                <button type='button' className='confirmation-icon-button' disabled={controlsDisabled} title={t('confirmations.toggleAll')} aria-label={t('confirmations.toggleAll')} onClick={() => { if (!controlsDisabled) dispatch({ type: 'toggleAll' }); }}>
                                    <Icon name='check' size={16} motion='pop' />
                                </button>
                            </>}
                            <button type='button' className='confirmation-icon-button' disabled={controlsDisabled} title={t('confirmations.refresh')} aria-label={t('confirmations.refresh')} onClick={refresh}>
                                <Icon name='refresh' size={16} motion='spin' />
                            </button>
                        </div>
                    </div>
                    {/* Ошибка при непустом списке — полосой над карточками: строки с ответом Steam остаются видны. */}
                    {errorText && !busy && state.items.length > 0 && <div className='confirmation-banner confirmation-banner--error' role='alert'>
                        <Icon name='alert' size={16} className='confirmation-banner-icon' />
                        <span className='confirmation-banner-text'>{errorText}</span>
                        <button type='button' className='confirmation-retry' disabled={controlsDisabled} onClick={refresh}>{t('confirmations.retry')}</button>
                    </div>}
                    {state.purchaseNotice && !busy && <div className='confirmation-banner confirmation-banner--notice' role='status'>
                        <Icon name='info' size={16} className='confirmation-banner-icon' />
                        <span className='confirmation-banner-text'>{t('confirmations.purchaseMayBeCompleted')}</span>
                    </div>}
                    <div className='sell-items-container' aria-busy={busy}>
                        {busy ? <div className='centered-block confirmation-state' role='status'>
                            <Icon name='loader' size={20} motion='spinAlways' className='confirmation-state-icon confirmation-state-icon--loader' />
                            <div className='confirmation-state-message'>
                                {state.responding
                                    ? <Trans t={t} i18nKey={state.responding.accept ? 'confirmations.confirming' : 'confirmations.declining'} count={state.responding.count} components={{ n: <span className='confirmation-count' /> }} />
                                    : t('confirmations.loading')}
                            </div>
                        </div> : errorText && !state.items.length ? <div className='centered-block confirmation-state confirmation-state--error' role='alert'>
                            <Icon name='alert' size={20} className='confirmation-state-icon' />
                            <div className='confirmation-state-message'>{errorText}</div>
                            <button type='button' className='confirmation-retry' disabled={controlsDisabled} onClick={refresh}>{t('confirmations.retry')}</button>
                        </div> : state.items.length > 0 ? state.items.map(item => <SellItem key={item.confirmation.id} accountId={id} item={item} disabled={controlsDisabled}
                            onChange={isSelected => { if (!controlsDisabled) dispatch({ type: 'select', id: item.confirmation.id, selected: isSelected }); }}
                            onRespond={accept => {
                                if (controlsDisabled) return;
                                if (accept && requiresSecurityWarning(item.confirmation.type)) setSecurityWarning(item.confirmation);
                                else respond([item.confirmation], accept);
                            }} />) : <div className='centered-block confirmation-state' role='status'>
                            <Icon name='shieldCheck' size={20} className='confirmation-state-icon' />
                            <div className='confirmation-state-text'>{t('confirmations.empty')}</div>
                        </div>}
                    </div>
                    {batchItems.length > 0 && <div className='sell-items-confirms-button-container'>
                        <Button
                            className={`confirmation-decline${selected.length === 0 ? ' confirmation-action-inactive' : ''}`}
                            text={t('confirmations.declineSelected')}
                            size='large'
                            color='grey'
                            hoverColor='grey'
                            disabled={controlsDisabled}
                            onClick={() => respond(selected.map(item => item.confirmation), false)}
                        />
                        <Button
                            className={`confirmation-confirm${selected.length === 0 ? ' confirmation-action-inactive' : ' sda-sweep'}`}
                            text={t('confirmations.confirmSelected')}
                            size='large'
                            color='grey'
                            hoverColor='grey'
                            disabled={controlsDisabled}
                            onClick={() => respond(selected.map(item => item.confirmation), true)}
                        />
                    </div>}
                </div>
            </fieldset>
            {securityWarning && <ApiKeyWarning confirmation={securityWarning} onCancel={() => setSecurityWarning(null)} onConfirm={() => {
                setSecurityWarning(null);
                respond([securityWarning], true, true);
            }} />}
        </div>
    );
}

export default Confirmations;
