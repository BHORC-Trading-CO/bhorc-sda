import react, { FC, useState } from 'react';
import { observer } from 'mobx-react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon/Icon';
import './input.css';

const Input: FC<{ value: string, type?: react.HTMLInputTypeAttribute, style?: React.CSSProperties, onChange?: (newValue: string) => void, placeholder?: string, readonly?: boolean }> = observer((props) => {
    const [inputType, setInputType] = useState(props.type)
    const { t } = useTranslation();
    const isPassword = props.type == 'password';
    const isShown = inputType == 'text';
    const eyeLabel = isShown ? t('accounts.form.hidePassword') : t('accounts.form.showPassword');
    return (
        <div className='input-container'>
        <input
            type={inputType ? inputType : 'text'}
            className={`input-text text-grey-medium${isPassword ? ' input-text_with-eye' : ''}`}
            placeholder={props.placeholder ? props.placeholder : ""}
            aria-label={props.placeholder ? props.placeholder : undefined}
            value={props.value}
            style={props.style}
            onChange={(event) => {
                const text = event.target.value;
                if (props.onChange) props.onChange(text);
            }}
            readOnly={props.readonly ? true : false}
        ></input>
        {isPassword ?
            <button
                type='button'
                className='input-eye'
                aria-label={eyeLabel}
                aria-pressed={isShown}
                title={eyeLabel}
                onClick={() => { isShown ? setInputType('password') : setInputType('text') }}
            >
                {/* Иконка — действие кнопки: пароль виден — «скрыть», скрыт — «показать». Цвет в input.css. */}
                <Icon name={isShown ? 'eyeOff' : 'eye'} size={14} className='input-eye__icon' />
            </button>
            : <></>}
        </div>
    );
});

export default Input;
