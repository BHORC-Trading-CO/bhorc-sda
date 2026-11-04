import react, { FC, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../../globalComponents/Icon/Icon';
import useModalFocus, { focusableIn } from '../../../../globalComponents/Modal/useModalFocus';

interface MiniWindowInterface {
    title: string;
    width: string;
    height: string;
    maxHeight?: string;
    content: JSX.Element;
    onClose: () => void;
}

let nextTitleId = 0;

const MiniWindow: FC<MiniWindowInterface> = observer((props) => {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLDivElement>(null);
    const [titleId] = useState(() => `sda-dialog-title-${++nextTitleId}`);
    // Фокус и клавиши окна (useModalFocus): Escape — как крестик; при открытии фокус на первом
    // поле или кнопке содержимого, а не на крестике в заголовке.
    useModalFocus(dialogRef, () => props.onClose(), (dialog) => {
        const content = dialog.querySelector<HTMLElement>('.form-content');
        return content ? focusableIn(content)[0] : null;
    });
    return (
        <div className='darkBackground' onClick={(event) => {
            const target = event.target as HTMLDivElement;
            if (target.className === 'darkBackground') props.onClose();
        }}>
            <div className='form table-settings' ref={dialogRef} role='dialog' aria-modal='true' aria-labelledby={titleId} tabIndex={-1}
                style={{ width: props.width, height: props.height }}>
                <div className='form-caption'>
                    <div id={titleId}>{props.title}</div>
                    {/* Крестик — кнопка с иконкой lucide; клик по svg внутри тоже закрывает окно. */}
                    <button type='button' className='form-cross' aria-label={t('common.buttons.close')} title={t('common.buttons.close')} onClick={props.onClose}>
                        <Icon name='x' size={16} motion='pop' />
                    </button>
                </div>
                <div className='form-content' style={{ height: `calc(${props.height} - 40px)`, maxHeight: `calc(${props.maxHeight} - 40px)`, overflow: 'auto', minHeight: '200px' }}>
                    {props.content}
                </div>
            </div>
        </div>
    );
});


export default MiniWindow;
