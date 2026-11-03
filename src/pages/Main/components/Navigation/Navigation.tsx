import React, { KeyboardEvent, useEffect, useState } from "react";
import "./Navigation.css";
import store from "../../../../store/store";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import ReactTooltip from "react-tooltip";
import LanguageSwitcher from "./LanguageSwitcher";

// Один тултип на все пункты узкой навигации, где видны только иконки.
const TOOLTIP_ID = "navigation-tooltip";

// Пункты меню — div с role="button": Enter и пробел делают то же, что клик.
const onActivateKey = (handler: () => void) => (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handler();
  }
};

const Navigation = observer(() => {
  const { t } = useTranslation("shell");
  const [isCompress, setIsCompress] = useState(false);
  const buttonsClass = isCompress ? "navigation-button_mini" : "navigation-button";

  useEffect(() => {
    const handleResize = () => setIsCompress(window.innerWidth < 1200);
    // Сразу при монтировании: окно могло открыться уже узким.
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const groups = store.groups.getGroups();

  // Общие свойства пункта: активное состояние классом, а не inline-цветом;
  // в узкой навигации подпись уходит в тултип и aria-label.
  const itemProps = (
    label: string,
    isActive: boolean,
    onSelect: () => void,
    extraClass = ""
  ) => ({
    className: `${buttonsClass} navigation-item${extraClass}${isActive ? " navigation-item_active" : ""}`,
    role: "button",
    tabIndex: 0,
    "aria-current": isActive ? ("page" as const) : undefined,
    "aria-label": isCompress ? label : undefined,
    "data-tip": isCompress ? label : undefined,
    "data-for": isCompress ? TOOLTIP_ID : undefined,
    onClick: onSelect,
    onKeyDown: onActivateKey(onSelect),
  });

  const isSteamAccountsActive =
    store.tabs.active === "steamAccounts" && store.groups.activeGroupId === null;
  const isProxiesActive = store.tabs.active === "proxies";

  return (
    <div className="navigation">
      <div className="navigation-content">
        <div className="navigation-logo-container">
          <img
            src="./assets/img/Logo.svg"
            className="navigation-logo"
            alt={isCompress ? "BHORC SDA" : ""}
          />
          {isCompress ? "" : <div className="navigation-logo-text">BHORC SDA</div>}
        </div>

        <div className="navigation-items">
          <div
            {...itemProps(t("navigation.steamAccounts"), isSteamAccountsActive, () => {
              store.tabs.setActive("steamAccounts");
              store.groups.setActiveGroup(null);
            })}
          >
            <div className="navigation-img" id="navigation-steam-accounts"></div>
            {isCompress ? (
              ""
            ) : (
              <div className="button__text_navigation text-white-large">
                {t("navigation.steamAccounts")}
              </div>
            )}
          </div>

          {/* Группы аккаунтов — фильтруют таблицу Steam аккаунтов по группе */}
          {groups.map((group) => {
            const isActive =
              store.tabs.active === "steamAccounts" &&
              store.groups.activeGroupId === group.id;
            const openEditForm = () => store.groups.openEditForm(group.id);
            return (
              <div
                key={group.id}
                {...itemProps(
                  `${group.name} (${group.steamAccountIds.length})`,
                  isActive,
                  () => {
                    store.tabs.setActive("steamAccounts");
                    store.groups.setActiveGroup(group.id);
                  },
                  isCompress ? "" : " navigation-group-button"
                )}
              >
                <svg
                  className="navigation-group-icon"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2c.4 0 .78.16 1.06.44L11 6.7c.28.28.66.44 1.06.44h6.44A1.5 1.5 0 0 1 20 8.64V17.5A1.5 1.5 0 0 1 18.5 19h-14A1.5 1.5 0 0 1 3 17.5v-11z"
                    fill="currentColor"
                  />
                </svg>
                {isCompress ? (
                  ""
                ) : (
                  <>
                    <div className="navigation-group-name text-white-large" title={group.name}>
                      {group.name}
                      <span className="navigation-group-count">
                        {group.steamAccountIds.length}
                      </span>
                    </div>
                    <div
                      className="navigation-group-edit text-white-large"
                      role="button"
                      tabIndex={0}
                      title={t("navigation.editGroup")}
                      aria-label={t("navigation.editGroup")}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditForm();
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        onActivateKey(openEditForm)(e);
                      }}
                    >
                      ✎
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <div
            {...itemProps(t("navigation.proxies"), isProxiesActive, () => {
              store.tabs.setActive("proxies");
            })}
          >
            <div className="navigation-img" id="navigation-proxy"></div>
            {isCompress ? (
              ""
            ) : (
              <div className="button__text_navigation text-white-large">
                {t("navigation.proxies")}
              </div>
            )}
          </div>

          {/* Вкладка «Расширения» скрыта: ExtensionsTab пока заглушка.
              Чтобы вернуть, добавить пункт через itemProps с иконкой id="navigation-extension". */}
        </div>
      </div>
      <LanguageSwitcher isCompress={isCompress} />
      {/* key пересоздаёт тултип при смене групп: v4 привязывается к data-tip только при монтировании. */}
      {isCompress ? (
        <ReactTooltip
          key={groups.map((group) => group.id).join(",")}
          id={TOOLTIP_ID}
          className="navigation-tooltip"
          place="right"
          effect="solid"
        />
      ) : null}
    </div>
  );
});

export default Navigation;
