import React, { useState, FC } from "react";
import classNames from "classnames";
import "./Button.css";
import LoadingIcons from 'react-loading-icons'
import ReactTooltip from "react-tooltip";
import uuid from 'react-uuid';

const Button: FC<IButtonProps> = (props: IButtonProps) => {
  const [hover, setHover] = useState(false);
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
    img,
    text,
    type = 'button',
    hoverImg = img,
    hoverColor = "gradient",
    className,
    onClick,
    isNonGuardButton = true,
    altText,
    ariaLabel,
    iconMask,
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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      type={type}
      data-tip="React-tooltip"
      data-for={uniqueId}
    >
      {
        isLoad ?
          <LoadingIcons.Bars style={{ width: '20px', height: '20px' }} /> :
          <>
            {img ? (
              iconMask
                // Иконка-маска красится токенами (цвет покоя, ховера, опасного действия) вместо пары svg
                ? <span className="button__icon button__icon--mask" style={{ WebkitMaskImage: `url(${img})` }} aria-hidden="true"></span>
                : <img className="button__icon" src={hover ? hoverImg : img} alt=""></img>
            ) : null}
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
  img?: string;
  hoverImg?: string;
  text?: string;
  type?: "button" | "submit" | "reset";
  style?: {},
  onClick?: () => void;
  isNonGuardButton?: boolean;
  altText?: string,
  ariaLabel?: string,
  /** Рисовать img как CSS-маску, цвет иконки задаёт CSS (hoverImg тогда не нужен) */
  iconMask?: boolean,
  testId?: string
}

export default Button;
