import React, { useState, FC } from "react";
import classNames from "classnames";
import "./Button.css";
import ReactTooltip from "react-tooltip";
import uuid from 'react-uuid';
import Icon, { IconMotion, IconName } from "../Icon/Icon";

const Button: FC<IButtonProps> = (props: IButtonProps) => {
  // id подсказки один на всё время жизни кнопки: раньше uuid() пересоздавался на каждом рендере
  const [uniqueId] = useState(() => uuid());

  const {
    isLoad,
    style,
    disabled,
    inactive,
    view = "default",
    color = "gradient",
    size,
    icon,
    iconMotion = "pop",
    text,
    type = 'button',
    hoverColor = "gradient",
    className,
    onClick,
    isNonGuardButton = true,
    altText,
    ariaLabel,
    testId
  } = props;

  const buttonClass = classNames(
    "button",
    `button--view-${view}`,
    `button--${color}`,
    `button--size-${size}`,
    `button--hoverColor-${disabled || isLoad || inactive ? color : hoverColor}`,
    `${className}`,
    { "button--inactive": inactive, "button--loading": isLoad }
  );

  // Кнопке без текста имя для скринридера берём из подсказки
  const label = ariaLabel || (!text && altText ? altText : undefined);

  return (
    <button
      style={{ cursor: disabled ? 'not-allowed' : (isLoad ? 'default' : 'pointer'), ...style }}
      disabled={disabled}
      aria-disabled={inactive || undefined}
      aria-label={label}
      aria-busy={isLoad || undefined}
      data-testid={testId}
      className={buttonClass}
      onClick={onClick}
      type={type}
      data-tip="React-tooltip"
      data-for={uniqueId}
    >
      {
        isLoad ?
          <Icon name="loader" size={18} motion="spinAlways" className="button__loader" /> :
          <>
            {/* Цвет иконки (покой, ховер, опасное действие) задаёт Button.css через currentColor */}
            {icon ? <Icon name={icon} size={16} motion={iconMotion} className="button__icon" /> : null}
            {text ? <span className="button__text">{text}</span> : null}
          </>
      }
      { altText ?
      <ReactTooltip place="top" type="dark" effect="float" id={uniqueId}>
        <span>{altText}</span>
      </ReactTooltip> : <></>}
    </button>
  );
}

export type view = "icon" | "default";

export type size = "tiny" | "small" | "medium" | "large";

export type color = "grey" | "gradient" | "light-grey" | "dark-pink";

export type hoverColor = "grey" | "gradient" | "light-grey" | "dark-pink" | "danger";


interface IButtonProps {
  isLoad?: boolean,
  disabled?: boolean,
  /** Выглядит неактивной, но остаётся кликабельной (обработчик сам решает, что делать) */
  inactive?: boolean,
  view?: view;
  size: size;
  color?: color;
  className?: string;
  hoverColor?: hoverColor;
  /** Иконка lucide слева от текста (или единственная у view="icon") */
  icon?: IconName;
  /** Анимация иконки при наведении на кнопку: pop по умолчанию, spin для «Обновить» */
  iconMotion?: IconMotion;
  text?: string;
  type?: "button" | "submit" | "reset";
  style?: {},
  onClick?: () => void;
  isNonGuardButton?: boolean;
  altText?: string,
  ariaLabel?: string,
  testId?: string
}

export default Button;
