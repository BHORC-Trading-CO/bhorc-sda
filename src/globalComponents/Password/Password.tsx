import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../Icon/Icon";
import "./Password.css";

// Маска фиксированной длины: колонка не раздувается от длинных паролей и не выдаёт их длину
const MASK = "••••••••";

function Password(props: IPasswordProps) {
  const [show, setShow] = useState(false);
  const { t } = useTranslation();
  const { password, style, placeholder } = props;
  const toggleLabel = show ? t("common.hidePassword") : t("common.showPassword");

  return (
    <div className="password text-white-large" style={style}>
      {/* Открытый пароль читается целиком: прокрутка по горизонтали и полное значение в подсказке */}
      <div
        className={`password__text${show ? " password__text--revealed" : ""}`}
        style={{ maxWidth: '150px' }}
        title={show && password.length > 0 ? password : undefined}
        tabIndex={show && password.length > 0 ? 0 : undefined}
      >
        {password.length === 0 ? placeholder : (show ? password : MASK)}
      </div>
      <button
        type="button"
        className="password__button"
        aria-label={toggleLabel}
        aria-pressed={show}
        title={toggleLabel}
        onClick={() => {
          setShow(!show);
        }}
      >
        <Icon name={show ? "eyeOff" : "eye"} size={14} />
      </button>
    </div>
  );
}

interface IPasswordProps {
  password: string;
  style?: React.CSSProperties;
  placeholder?: string;
}

export default Password;
