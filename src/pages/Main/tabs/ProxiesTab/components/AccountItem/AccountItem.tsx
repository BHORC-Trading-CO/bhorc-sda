import useAccountImage from "../../../../../../globalComponents/Images/useAccountImage";
import React from "react";
import SteamAccountInterface from "../../../../../../../electron/interfaces/SteamAccount/SteamAccountInterface";
import TableSteamAccountInterface from "../../../../../../../electron/interfaces/SteamAccount/TableSteamAccountInterface";
import Button from "../../../../../../globalComponents/Button/Button";
import Checkbox from "../../../../../../globalComponents/Checkbox/Checkbox";
import Icon from "../../../../../../globalComponents/Icon/Icon";
import "./AccountItem.css";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";

const AccountItem = observer((props: {
  steamAccount: TableSteamAccountInterface,
  links: { steamAccountIds: string[] },
  setLinks: (links: { steamAccountIds: string[] }) => void
}) => {
  const { steamAccount, links, setLinks } = props;
  const { t } = useTranslation();
  const avatar = useAccountImage('avatar', steamAccount.id, steamAccount.secondary?.avatarUrl, `${steamAccount.proxyState}:${steamAccount.proxyId}`);

  return (
    <div className="account-item">
      <div className="account-wrapper text-white-medium">
        {avatar.src ? (
          <img src={avatar.src} onError={avatar.onError} alt="" className="account-logo" />
        ) : (
          <span className="account-logo account-logo--placeholder" aria-hidden="true">
            <Icon name="user" />
          </span>
        )}
        <div className="account-item-text">
          {steamAccount.number}
        </div>
        <div className="account-item-text" title={steamAccount.accountName}>
          {steamAccount.accountName || <span className="proxy-empty-cell">—</span>}
        </div>
        <div className={`account-item-text account-item-proxy${steamAccount.proxy ? '' : ' proxy-empty-cell'}`}
          title={steamAccount.proxy ? `#${steamAccount.proxy.number} ${steamAccount.proxy.host}:${steamAccount.proxy.port}` : t('proxies.links.empty')}>
          {steamAccount.proxy ? `#${steamAccount.proxy.number} ${steamAccount.proxy.host}:${steamAccount.proxy.port}` : '—'}
        </div>
      </div>
      <div className="account-wrapper">
        <div
          onClick={() => {
            if (links.steamAccountIds.includes(steamAccount.id)) {
              const index = links.steamAccountIds.findIndex(id => id === steamAccount.id);
              setLinks({ ...links, steamAccountIds: [...links.steamAccountIds.slice(0, index), ...links.steamAccountIds.slice(index + 1)] });
            } else {
              setLinks({ ...links, steamAccountIds: [...links.steamAccountIds, steamAccount.id] });
            }
          }}
          className={links.steamAccountIds.includes(steamAccount.id) ? "checkbox-checked" : "checkbox-default__proxy"}
        >
          <Icon name="check" size={14} />
        </div>
      </div>
    </div>
  );
});

export default AccountItem;
