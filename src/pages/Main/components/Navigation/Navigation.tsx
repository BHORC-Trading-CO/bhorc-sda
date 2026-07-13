import React, { useEffect, useState } from "react";
import "./Navigation.css";
import Button from "../../../../globalComponents/Button/Button";
import store from "../../../../store/store";
import { observer } from "mobx-react";

const Navigation = observer(() => {
  const [isCompress, setIsCompress] = useState(false);
  const [buttonsClass, setButtonsClass] = useState("navigation-button");
  const [hoverTab, setHoverTab] = useState("");

  const handleResize = () => {
    if (window.innerWidth < 1200) {
      setIsCompress(true);
      setButtonsClass("navigation-button_mini");
    } else {
      setIsCompress(false);
      setButtonsClass("navigation-button");
    }
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);
  }, []);

  return (
    <div className="navigation">
      <div className="navigation-content">
        <div className="navigation-logo-container">
          <img src="./assets/img/Logo.svg" className="navigation-logo" />
          {isCompress ? "" : <img src="./assets/img/Logo_Text.svg"></img>}
        </div>

        <div className="navigation-items">
          <div
            className={buttonsClass}
            onClick={() => {
              store.tabs.setActive("steamAccounts");
              store.groups.setActiveGroup(null);
            }}
            onMouseEnter={() => {
              setHoverTab("steamAccounts");
            }}
            onMouseLeave={() => {
              setHoverTab("");
            }}
            style={{
              backgroundColor:
                hoverTab === "steamAccounts" ||
                (store.tabs.active === "steamAccounts" &&
                  store.groups.activeGroupId === null)
                  ? "#372447"
                  : "",
            }}
          >
            <div
              className="navigation-img"
              id={
                store.tabs.active === "steamAccounts" &&
                store.groups.activeGroupId === null
                  ? "navigation-steam-accounts-hover"
                  : "navigation-steam-accounts"
              }
            ></div>
            {isCompress ? (
              ""
            ) : (
              <div className="button__text_navigation text-white-large">
                Steam аккаунты
              </div>
            )}
          </div>

          {/* Группы аккаунтов — фильтруют таблицу Steam аккаунтов по группе */}
          {store.groups.getGroups().map((group) => {
            const isActive =
              store.tabs.active === "steamAccounts" &&
              store.groups.activeGroupId === group.id;
            return (
              <div
                key={group.id}
                className={`${buttonsClass}${isCompress ? "" : " navigation-group-button"}`}
                onClick={() => {
                  store.tabs.setActive("steamAccounts");
                  store.groups.setActiveGroup(group.id);
                }}
                onMouseEnter={() => setHoverTab(group.id)}
                onMouseLeave={() => setHoverTab("")}
                style={{
                  backgroundColor:
                    hoverTab === group.id || isActive ? "#372447" : "",
                }}
              >
                <svg
                  className="navigation-group-icon"
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
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
                    <div className="navigation-group-name text-white-large">
                      {group.name}
                      <span className="navigation-group-count">
                        {group.steamAccountIds.length}
                      </span>
                    </div>
                    <div
                      className="navigation-group-edit text-white-large"
                      title="Редактировать группу"
                      onClick={(e) => {
                        e.stopPropagation();
                        store.groups.openEditForm(group.id);
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
            className={buttonsClass}
            onClick={() => {
              store.tabs.setActive("proxies");
            }}
            onMouseEnter={() => {
              setHoverTab("proxies");
            }}
            onMouseLeave={() => {
              setHoverTab("");
            }}
            style={{
              backgroundColor:
                hoverTab === "proxies" || store.tabs.active === "proxies"
                  ? "#372447"
                  : "",
            }}
          >
            <div
              className="navigation-img"
              id={
                store.tabs.active === "proxies"
                  ? "navigation-proxy-hover"
                  : "navigation-proxy"
              }
            ></div>
            {isCompress ? (
              ""
            ) : (
              <div className="button__text_navigation text-white-large">
                Прокси
              </div>
            )}
          </div>

          {/* <div
            className={buttonsClass}
            onClick={() => {
              store.tabs.setActive("extensions");
            }}
            onMouseEnter={() => {
              setHoverTab("extensions");
            }}
            onMouseLeave={() => {
              setHoverTab("");
            }}
            style={{
              backgroundColor:
                hoverTab === "extensions" || store.tabs.active === "extensions"
                  ? "#372447"
                  : "",
            }}
          >
            <div
              className="navigation-img"
              id={
                store.tabs.active === "extensions"
                  ? "navigation-extension-hover"
                  : "navigation-extension"
              }
            ></div>
            {isCompress ? (
              ""
            ) : (
              <div className="button__text_navigation text-white-large">
                Расширения
              </div>
            )}
          </div> */}

          <div
            className={buttonsClass}
            onClick={() => {
              store.tabs.setActive("support");
            }}
            onMouseEnter={() => {
              setHoverTab("support");
            }}
            onMouseLeave={() => {
              setHoverTab("");
            }}
            style={{
              backgroundColor:
                hoverTab === "support" || store.tabs.active === "support"
                  ? "#372447"
                  : "",
            }}
          >
            <div
              className="navigation-img"
              id={
                store.tabs.active === "support"
                  ? "navigation-support-hover"
                  : "navigation-support"
              }
            ></div>
            {isCompress ? (
              ""
            ) : (
              <div className="button__text_navigation text-white-large">
                Поддержка
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default Navigation;
