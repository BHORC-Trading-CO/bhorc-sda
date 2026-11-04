import React, { Dispatch, SetStateAction, useEffect } from "react";
import CConfirmation from "steamcommunity/classes/CConfirmation";
import Button from "../../../globalComponents/Button/Button";
import "./SellItem.css";
import { useTranslation } from "react-i18next";
import useAccountImage from "../../../globalComponents/Images/useAccountImage";
import Icon, { IconName } from "../../../globalComponents/Icon/Icon";

interface Item { selected: boolean, confirmation: CConfirmation };

// Значок типа на плитке картинки: EConfirmationType steamcommunity (2 — обмен, 3 — лот на рынке).
// В наборе Icon нет стрелок обмена и ценника: обмен — «люди», лот — «выставить».
const typeIcon = (type: number): IconName => type === 2 ? "users" : type === 3 ? "upload" : "shieldCheck";

function SellItem(props: sellItemInterface) {
  const { item, onChange, accountId } = props;
  const { t } = useTranslation();
  const icon = useAccountImage('icon', accountId, item.confirmation.icon);
  const type = item.confirmation.type;
  const typeLabel = t(type === 2 ? "confirmations.types.trade" : type === 3 ? "confirmations.types.listing" : "confirmations.types.unknown");

  return (
    <div className={`sell-item-container${item.selected ? " sell-item-container--selected" : ""}`}>
      <div className="sell-item-logo">
        {icon.src
          ? <img src={icon.src} onError={icon.onError} alt="" />
          : <Icon name="image" size={20} className="sell-item-logo__placeholder" />}
        <span className="sell-item-type">
          <Icon name={typeIcon(type)} size={13} title={typeLabel} />
        </span>
      </div>
      <div className="sell-item-info">
        <div className="sell-item-name" title={item.confirmation.title}>
          {item.confirmation.title}
        </div>
        {/* steamcommunity заполняет receiving только у обменов; у лотов и прочих он пустой — строку не рисуем. */}
        {item.confirmation.receiving ? <div className="sell-item-price-container">
          <div className="sell-item-price-new" title={item.confirmation.receiving}>{item.confirmation.receiving}</div>
        </div> : null}
        <div className="sell-item-date-container">
          {item.confirmation.time}
        </div>
      </div>
      <div className="sell-item-confirm-container">
        <Button
          text={item.selected ? t("confirmations.item.deselect") : t("confirmations.item.select")}
          icon={item.selected ? "check" : undefined}
          size="large"
          color={item.selected ? "dark-pink" : "light-grey"}
          hoverColor={item.selected ? "dark-pink" : "grey"}
          onClick={() => {
            onChange(!item.selected);
          }}
        ></Button>
      </div>
    </div>
  );
}

interface sellItemInterface {
  accountId: string;
  item: Item;
  onChange: (isSelect: boolean) => void;
}

export default SellItem;
