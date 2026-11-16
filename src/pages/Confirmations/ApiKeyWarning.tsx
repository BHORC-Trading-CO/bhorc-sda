import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../globalComponents/Icon/Icon';
import useModalFocus from '../../globalComponents/Modal/useModalFocus';
import type { MobileConfirmation } from './confirmationState';

// Warning before a takeover-class accept (API key, phone change, account recovery).
// Focus is handled by the shared modal stack: Tab stays inside, focus that lands outside
// returns, Escape is "Go back" (never confirm), and focus goes back to the row on close.
export default function ApiKeyWarning({ confirmation, onCancel, onConfirm }: {
    confirmation: MobileConfirmation; onCancel: () => void; onConfirm: () => void;
}) {
    const { t } = useTranslation();
    const warning = confirmation.type === 5 ? 'phoneChange' : confirmation.type === 6 ? 'accountRecovery' : 'apiKey';
    const dialog = useRef<HTMLDivElement>(null);
    const cancelButton = useRef<HTMLButtonElement>(null);
    // The safe action gets the initial focus: Enter right after opening goes back.
    useModalFocus(dialog, onCancel, () => cancelButton.current);
    // A click on the backdrop neither closes the warning nor takes focus out of it.
    return <div className='darkBackground' onMouseDown={event => {
        if (event.target === event.currentTarget) { event.preventDefault(); cancelButton.current?.focus(); }
    }}>
        <div ref={dialog} className='confirmation-warning' role='alertdialog' aria-modal='true' aria-labelledby='confirmation-warning-title' aria-describedby='confirmation-warning-text' tabIndex={-1}>
            <span className='confirmation-warning-icon' aria-hidden='true'><Icon name='alert' size={20} /></span>
            <h2 id='confirmation-warning-title' className='confirmation-warning-title'>{t(`confirmations.${warning}.title`)}</h2>
            <p id='confirmation-warning-text' className='confirmation-warning-text'>{t(`confirmations.${warning}.warning`)}</p>
            <div className='confirmation-warning-context'>
                <strong>{confirmation.headline}</strong>
                {confirmation.summary.map((line, index) => <div key={index}>{line}</div>)}
            </div>
            <div className='confirmation-modal-actions'>
                <button ref={cancelButton} type='button' className='confirmation-modal-button' onClick={onCancel}>{t('confirmations.apiKey.back')}</button>
                <button type='button' className='confirmation-modal-button confirmation-modal-button--danger' onClick={onConfirm}>{t(`confirmations.${warning}.confirm`)}</button>
            </div>
        </div>
    </div>;
}
