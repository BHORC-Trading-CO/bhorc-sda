import React, { useState, FC } from "react";
import ProxyInterface from "../../../../../../../../../electron/interfaces/Proxy/ProxyInterface";
import TableProxyInterface from "../../../../../../../../../electron/interfaces/Proxy/TableProxyInterface";
import "./SavedProxiesItem.css";
import store from "../../../../../../../../store/store";
import Icon from "../../../../../../../../globalComponents/Icon/Icon";

const SavedProxiesItem: FC<{
  proxy: TableProxyInterface,
  isActive: boolean,
  onClick: (proxyId: string) => void
}> = ({ proxy, isActive, onClick }) => {
  // Строка целиком — цель клика (раньше только кружок справа). Обработчик тот же.
  const select = () => {
    onClick(proxy.id);
  };
  return (
    <div
      className={`saved-proxies-item-container${isActive ? " saved-proxies-item-container_active" : ""}`}
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
    >
      <div className="saved-proxies-item-cell">{proxy.number}</div>
      <div className="saved-proxies-item-cell" title={proxy.host}>{proxy.host}</div>
      <div className="saved-proxies-item-cell">{proxy.port}</div>
      <div className="saved-proxies-item-cell proxy-account-item-container">
        {proxy.steamAccounts.map((account) => {
          return <div className="proxy-account-item" key={account.number}>{account.number}</div>
        })}
      </div>
      <div className="saved-proxies-item-cell saved-proxies-item-check">
        <div className={isActive ? "checkbox-circle-checked" : "checkbox-circle-default"}>
          {isActive ? <Icon name="check" size={14} /> : null}
        </div>
      </div>
    </div>
  );
};

export default SavedProxiesItem;
