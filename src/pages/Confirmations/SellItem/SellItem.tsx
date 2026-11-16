import React from "react";
import Button from "../../../globalComponents/Button/Button";
import "./SellItem.css";
import { useTranslation } from "react-i18next";
import useAccountImage from "../../../globalComponents/Images/useAccountImage";
import Icon from "../../../globalComponents/Icon/Icon";
import formatConfirmationTime from "./formatConfirmationTime";
import { isBatchable } from "../confirmationState";
import type { ConfirmationItem } from "../confirmationState";
import { confirmationTypeIcon, confirmationTypeLabel } from "../confirmationPresentation";

function SellItem(props: sellItemInterface) {
  const { item, onChange, onRespond, accountId, disabled } = props;
  const { t, i18n } = useTranslation();
  const confirmation = item.confirmation;
  const icon = useAccountImage('icon', accountId, item.confirmation.icon);
  const typeLabel = confirmationTypeLabel(confirmation, t);
  const typeIcon = confirmationTypeIcon(confirmation.type);
  const title = confirmation.headline || typeLabel;
  const nameId = `confirmation-${confirmation.id}-name`;
  // creation_time из getlist — секунды Unix; 0 — Steam не прислал время. В подсказке — исходное
  // значение в UTC, в строке — местное время на языке интерфейса.
  const iso = confirmation.createdAt ? new Date(confirmation.createdAt * 1000).toISOString() : "";

  return (
    <div className={`sell-item-container${item.selected ? " sell-item-container--selected" : ""}`}>
      <div className="sell-item-logo">
        {/* Картинка приходит из main как data: URL (SDA-22). Без неё (API-ключ, безопасность)
            плитка показывает значок типа, а не пустую картинку. */}
        {icon.src
          ? <>
            <img src={icon.src} onError={icon.onError} alt="" />
            <span className="sell-item-type">
              <Icon name={typeIcon} size={13} />
            </span>
          </>
          : <Icon name={typeIcon} size={20} className="sell-item-logo__placeholder confirmation-type-icon" />}
      </div>
      <div className="sell-item-info">
        <span className="confirmation-type-badge">{typeLabel}</span>
        <strong className="sell-item-name" id={nameId}>{title}</strong>
        {/* Все строки summary от Steam: что отдаём и получаем, предмет, цена, домен ключа. */}
        {confirmation.summary.map((line, index) => <div className="confirmation-summary" key={index}>{line}</div>)}
        {confirmation.warn ? <div className="confirmation-warn">{confirmation.warn}</div> : null}
        {confirmation.type === 12 ? <div className="confirmation-purchase-hint">
          {t(item.error ? "confirmations.purchaseMayBeCompleted" : "confirmations.purchaseHint")}
        </div> : null}
        <time className="sell-item-date-container" dateTime={iso || undefined} title={iso || undefined}>
          {iso ? formatConfirmationTime(iso, i18n.language) : t("confirmations.time.unknown")}
        </time>
        {item.error ? <div className={item.unknown ? "confirmation-item-unknown" : "confirmation-item-error"} role="alert">
          {item.unknown ? t("confirmations.outcomeUnknown") : <>{item.notSent && <span>{t("confirmations.notSent")} </span>}{item.error}</>}
        </div> : null}
      </div>
      <div className="sell-item-confirm-container">
        {isBatchable(confirmation)
          ? <Button
            text={item.selected ? t("confirmations.item.deselect") : t("confirmations.item.select")}
            icon={item.selected ? "check" : undefined}
            size="large"
            color={item.selected ? "dark-pink" : "light-grey"}
            hoverColor={item.selected ? "dark-pink" : "grey"}
            disabled={disabled}
            onClick={() => {
              onChange(!item.selected);
            }}
          ></Button>
          // Не пакетные (покупка, API-ключ, безопасность): свои кнопки, по одному запросу на карточку.
          // В подсказке — подпись действия от Steam, если она пришла.
          : <div className="confirmation-row-actions">
            <button type="button" className="confirmation-row-action confirmation-row-confirm" disabled={disabled} title={confirmation.acceptLabel || undefined} aria-describedby={nameId} onClick={() => onRespond(true)}>
              {t("confirmations.item.confirm")}
            </button>
            <button type="button" className="confirmation-row-action confirmation-row-decline" disabled={disabled} title={confirmation.cancelLabel || undefined} aria-describedby={nameId} onClick={() => onRespond(false)}>
              {t("confirmations.item.decline")}
            </button>
          </div>}
      </div>
    </div>
  );
}

interface sellItemInterface {
  accountId: string;
  item: ConfirmationItem;
  disabled: boolean;
  onChange: (isSelect: boolean) => void;
  onRespond: (accept: boolean) => void;
}

export default SellItem;
