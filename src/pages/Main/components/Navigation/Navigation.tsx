import React, { KeyboardEvent, useEffect, useState } from "react";
import "./Navigation.css";
import store from "../../../../store/store";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import ReactTooltip from "react-tooltip";
import LanguageSwitcher from "./LanguageSwitcher";
import Icon, { IconName } from "../../../../globalComponents/Icon/Icon";

// Один тултип на все пункты узкой навигации, где видны только иконки.
const TOOLTIP_ID = "navigation-tooltip";

// Иконка пункта: подпрыгивает при наведении, у активного (aria-current) — циановая, пружиной
// увеличена и со свечением (motion.css). Цвет покоя и ховера — от пункта (Navigation.css).
const NavIcon = ({ name, className = "navigation-img" }: { name: IconName; className?: string }) => (
  <Icon name={name} size={20} motion="pop" className={`${className} sda-nav-activate`} />
);

// Пункты меню — div с role="button": Enter и пробел делают то же, что клик.
const onActivateKey = (handler: () => void) => (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handler();
  }
};

const Navigation = observer(() => {
  const { t } = useTranslation("shell");
  // Сразу по ширине окна: при узком старте первая отрисовка уже компактная, без скачка.
  const [isCompress, setIsCompress] = useState(() => window.innerWidth < 1200);
  const buttonsClass = isCompress ? "navigation-button_mini" : "navigation-button";

  useEffect(() => {
    const handleResize = () => setIsCompress(window.innerWidth < 1200);
    // Ширина могла измениться между первой отрисовкой и подпиской.
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
  const isBrowserActive = store.tabs.active === "browser";

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
            <NavIcon name="users" />
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
                <NavIcon name="folder" className="navigation-group-icon" />
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
                      <Icon name="pencil" size={14} />
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
            <NavIcon name="link" />
            {isCompress ? (
              ""
            ) : (
              <div className="button__text_navigation text-white-large">
                {t("navigation.proxies")}
              </div>
            )}
          </div>

          {/* Страница Browser (SDA-6): стартовые ссылки и расширения браузеров аккаунтов. */}
          <div
            {...itemProps(t("navigation.browser"), isBrowserActive, () => {
              store.tabs.setActive("browser");
            })}
            data-testid="nav-browser"
          >
            <NavIcon name="globe" />
            {isCompress ? (
              ""
            ) : (
              <div className="button__text_navigation text-white-large">
                {t("navigation.browser")}
              </div>
            )}
          </div>
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
