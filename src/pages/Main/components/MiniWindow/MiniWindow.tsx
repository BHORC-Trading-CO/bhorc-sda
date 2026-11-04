import react, { FC } from 'react';
import { observer } from 'mobx-react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../../globalComponents/Icon/Icon';

interface MiniWindowInterface {
    title: string;
    width: string;
    height: string;
    maxHeight?: string;
    content: JSX.Element;
    onClose: () => void;
}

const MiniWindow: FC<MiniWindowInterface> = observer((props) => {
    const { t } = useTranslation();
    return (
        <div className='darkBackground' onClick={(event) => {
            const target = event.target as HTMLDivElement;
            if (target.className === 'darkBackground') props.onClose();
        }}>
            <div className='form table-settings' style={{ width: props.width, height: props.height }}>
                <div className='form-caption'>
                    <div>{props.title}</div>
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