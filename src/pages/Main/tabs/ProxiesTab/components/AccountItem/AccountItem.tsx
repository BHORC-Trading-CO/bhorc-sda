import sanitizeAvatarUrl from "../../../../../../../electron/components/Functions/sanitizeAvatarUrl";
import React from "react";
import SteamAccountInterface from "../../../../../../../electron/interfaces/SteamAccount/SteamAccountInterface";
import TableSteamAccountInterface from "../../../../../../../electron/interfaces/SteamAccount/TableSteamAccountInterface";
import Button from "../../../../../../globalComponents/Button/Button";
import Checkbox from "../../../../../../globalComponents/Checkbox/Checkbox";
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

  return (
    <div className="account-item">
      <div className="account-wrapper text-white-medium">
        <img
          src={sanitizeAvatarUrl(steamAccount.secondary?.avatarUrl)}
          className="account-logo"
        ></img>
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
        ></div>
      </div>
    </div>
  );
});

export default AccountItem;
