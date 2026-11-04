import React, { Dispatch, SetStateAction, useEffect } from "react";
import CConfirmation from "steamcommunity/classes/CConfirmation";
import Button from "../../../globalComponents/Button/Button";
import "./SellItem.css";
import { useTranslation } from "react-i18next";
import useAccountImage from "../../../globalComponents/Images/useAccountImage";

interface Item { selected: boolean, confirmation: CConfirmation };

function SellItem(props: sellItemInterface) {
  const { item, onChange, accountId } = props;
  const { t } = useTranslation();
  const icon = useAccountImage('icon', accountId, item.confirmation.icon);

  return (
    <div className={`sell-item-container${item.selected ? " sell-item-container--selected" : ""}`}>
      <div className="sell-item-logo">
        <img src={icon.src || './assets/img/Photo.svg'} onError={icon.onError} style={{ width: "50px" }} alt="" />
      </div>
      <div className="sell-item-info">
        <div className="sell-item-name text-medium-white" title={item.confirmation.title}>
          {item.confirmation.title}
        </div>
        <div className="sell-item-price-container">
          <div className="sell-item-price-new text-pink-small" title={item.confirmation.receiving}>{item.confirmation.receiving}</div>
        </div>
        <div className="sell-item-date-container text-grey-small">
          {item.confirmation.time}
        </div>
      </div>
      <div className="sell-item-confirm-container">
        <Button
          text={item.selected ? t("confirmations.item.deselect") : t("confirmations.item.select")}
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
