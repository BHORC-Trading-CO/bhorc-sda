import { FC } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import "../../../../css/Panel.css";
import "../BrowserTab/BrowserTab.css";
import "./SettingsTab.css";
import store from "../../../../store/store";
import Icon from "../../../../globalComponents/Icon/Icon";
import { Switch } from "../BrowserTab/BrowserTab";

// Settings page (SDA-35, SDA-36): the tray and launch at login, in the look of the Browser page
// (same card, rows and switch). Each switch is saved at once; main has the final word.

const SettingRow: FC<{
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  nested?: boolean;
}> = ({ id, label, hint, checked, onChange, disabled, nested }) => (
  <li className={`browser-row settings-row${nested ? " settings-row--nested" : ""}${disabled ? " settings-row--disabled" : ""}`}>
    <Switch checked={checked} label={label} onChange={onChange} disabled={disabled} describedBy={`${id}-hint`} testId={id} />
    <div className="settings-row__text">
      <span className="settings-row__label">{label}</span>
      <span className="settings-row__hint" id={`${id}-hint`}>{hint}</span>
    </div>
  </li>
);

const BackgroundCard = observer(() => {
  const { t } = useTranslation();
  const { settings, loginItem, trayUnavailable, error } = store.appSettings;
  // macOS has no tray: the icon lives in the menu bar, and the Dock icon opens the window too.
  const isMac = window.Main.platform === "darwin";
  const loginSupported = loginItem === "supported";

  return (
    <section className="browser-card" aria-labelledby="settings-background-title" data-testid="settings-background">
      <div className="browser-card__head">
        <span className="browser-card__icon" aria-hidden="true"><Icon name="settings" /></span>
        <h2 className="browser-card__title" id="settings-background-title">{t("settings.background.title")}</h2>
      </div>
      <ul className="browser-list">
        <SettingRow
          id="settings-close-to-tray"
          label={t(isMac ? "settings.background.closeToTray.labelMac" : "settings.background.closeToTray.label")}
          hint={t(isMac ? "settings.background.closeToTray.hintMac" : "settings.background.closeToTray.hint")}
          checked={settings.closeToTray}
          onChange={(checked) => store.appSettings.set("closeToTray", checked)}
        />
        <SettingRow
          id="settings-launch-at-login"
          label={t("settings.background.launchAtLogin.label")}
          hint={loginSupported ? t("settings.background.launchAtLogin.hint") : t(`settings.background.launchAtLogin.${loginItem}`)}
          checked={settings.launchAtLogin}
          disabled={!loginSupported}
          onChange={(checked) => store.appSettings.set("launchAtLogin", checked)}
        />
        <SettingRow
          id="settings-start-minimized"
          nested
          label={t(isMac ? "settings.background.startMinimized.labelMac" : "settings.background.startMinimized.label")}
          hint={t(isMac ? "settings.background.startMinimized.hintMac" : "settings.background.startMinimized.hint")}
          checked={settings.startMinimized}
          disabled={!loginSupported || !settings.launchAtLogin}
          onChange={(checked) => store.appSettings.set("startMinimized", checked)}
        />
      </ul>
      {trayUnavailable ? (
        <div className="browser-note" role="note" data-testid="settings-tray-unavailable">
          <Icon name="alert" size={16} className="browser-note__mark" />
          <p className="browser-note__text">{t("settings.background.trayUnavailable")}</p>
        </div>
      ) : null}
      {error ? <p className="browser-field-error" role="alert">{error}</p> : null}
    </section>
  );
});

const SettingsTab: FC = observer(() => {
  const { t } = useTranslation();
  return (
    <div className="main browser-tab settings-tab" data-testid="settings-tab">
      <div className="panel browser-panel">
        <div className="browser-panel__titles">
          <h1 className="panel-text_main">{t("settings.title")}</h1>
          <p className="browser-panel__subtitle">{t("settings.subtitle")}</p>
        </div>
      </div>
      <div className="browser-tab__body">
        {store.appSettings.isLoaded ? (
          <div className="browser-tab__grid">
            <BackgroundCard />
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default SettingsTab;
