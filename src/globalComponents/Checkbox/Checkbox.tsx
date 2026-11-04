import react, { FC } from 'react';
import Icon from '../Icon/Icon';
import './Checkbox.css';

const Checkbox: FC<{ isChecked?: boolean | null | undefined, onChange: (isChecked: boolean) => void, disabled?: boolean, ariaLabel?: string }> = (props) => {
    const toggle = () => {
        if (props.disabled) return;
        props.onChange(!props.isChecked);
    };

    return (
        <div
            className={`checkbox sda-checkbox ${props.isChecked ? "checkbox-checked" : "checkbox-default"}${props.disabled ? " sda-checkbox--disabled" : ""}`}
            role="checkbox"
            aria-checked={!!props.isChecked}
            aria-disabled={props.disabled || undefined}
            aria-label={props.ariaLabel}
            tabIndex={props.disabled ? -1 : 0}
            style={{ cursor: props.disabled ? 'not-allowed' : 'pointer' }}
            onClick={toggle}
            onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault();
                    toggle();
                }
            }}
        >
            {props.isChecked ? <Icon name="check" size={14} /> : null}
        </div>

    );
}

export default Checkbox;
