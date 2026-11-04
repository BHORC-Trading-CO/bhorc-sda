import React, { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tip } from "../../../../../../globalComponents/Table/Cells";
import Icon from "../../../../../../globalComponents/Icon/Icon";
import { GUARD_PERIOD_SEC, guardSecondsLeft } from "./guardSecondsLeft";
import "./GuardCode.css";

/**
 * Фаза кольца в момент смены кода: сколько секунд текущего периода уже прошло (с долями, чтобы
 * кольцо опустело ровно к смене кода). Отрицательный animation-delay ставит 30-секундную
 * CSS-анимацию сразу в эту точку.
 */
const ringDelay = (nowMs: number): string =>
  `-${GUARD_PERIOD_SEC - guardSecondsLeft(nowMs) + (nowMs % 1000) / 1000}s`;

/** Кольцо 16 px. Монтируется заново на каждый новый код (key={code} снаружи): фаза считается один
 *  раз при монтировании и дальше не меняется, иначе смена delay сдвинула бы идущую анимацию. */
const GuardRing: FC = () => {
  const [delay] = useState(() => ringDelay(Date.now()));
  return (
    <svg className="guard-code__ring" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="guard-code__ring-track" cx="8" cy="8" r="7" />
      <circle className="guard-code__ring-fill" cx="8" cy="8" r="7" style={{ animationDelay: delay }} />
    </svg>
  );
};

// Код Guard: кольцо обратного отсчёта, код моноширинным, значок копирования.
// Кольцо — одна CSS-анимация на строку (GuardCode.css), без таймеров и без перерисовки React
// каждую секунду. Фаза считается, когда приходит новый код.
// Клик (или Enter/пробел) копирует код, значок на 1,5 с меняется на галочку.
const GuardCode: FC<{ code?: string }> = ({ code }) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timer = setTimeout(() => setIsCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const copy = () => {
    if (!code) return;
    setIsCopied(true);
    navigator.clipboard.writeText(code);
  };

  return (
    <Tip tip={isCopied ? t("guard.code.copied") : t("guard.code.copy")}>
      <span
        className={`guard-code${isCopied ? " guard-code--copied" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`${t("guard.code.copy")}: ${code || ""}`}
        onClick={copy}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            copy();
          }
        }}
      >
        <GuardRing key={code} />
        <span className="guard-code__value">{code}</span>
        <span className="guard-code__copy">
          {isCopied ? <Icon name="check" size={13} /> : <Icon name="copy" size={13} motion="pop" />}
        </span>
      </span>
    </Tip>
  );
};

export default GuardCode;
