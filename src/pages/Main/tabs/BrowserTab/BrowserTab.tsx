import React, { FC, FormEvent, KeyboardEvent, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import "../../../../css/Panel.css";
import "./BrowserTab.css";
import store from "../../../../store/store";
import { DEFAULT_START_LINK, MAX_START_LINKS, StartLinkError, startLinkError } from "./startLinkValidation";

// Страница Browser (SDA-6): общие для всех аккаунтов стартовые ссылки и распакованные расширения.

/** Кнопка-иконка: подпись в тултипе и aria-label, иконка — маска из assets, цвет задаёт CSS. */
const IconButton: FC<{
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  flip?: boolean;
  testId?: string;
}> = ({ label, icon, onClick, disabled, danger, flip, testId }) => (
  <button
    type="button"
    className={`browser-icon-button${danger ? " browser-icon-button--danger" : ""}`}
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    data-testid={testId}
  >
    <span
      className={`browser-icon-button__icon${flip ? " browser-icon-button__icon--flip" : ""}`}
      style={{ WebkitMaskImage: `url(./assets/img/${icon})` }}
      aria-hidden="true"
    ></span>
  </button>
);

/** Плюс из Mark.svg маской: url картинок задаём из TSX, а не в CSS (как в GlobalStyle.ts). */
const PlusIcon: FC = () => (
  <span className="browser-button__plus" style={{ WebkitMaskImage: "url(./assets/img/Mark.svg)" }} aria-hidden="true"></span>
);

const Switch: FC<{ checked: boolean; label: string; onChange: (checked: boolean) => void }> = ({ checked, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={label}
    className={`browser-switch${checked ? " browser-switch--on" : ""}`}
    onClick={() => onChange(!checked)}
  >
    <span className="browser-switch__knob" aria-hidden="true"></span>
  </button>
);

const StartLinkRow: FC<{ link: string; index: number; total: number }> = observer(({ link, index, total }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<StartLinkError | null>(null);
  const errorId = `browser-link-error-${index}`;

  const cancel = () => {
    setDraft(null);
    setError(null);
  };
  const commit = () => {
    if (draft === null) return;
    const value = draft.trim();
    const others = store.browserSettings.startLinks.filter((_, i) => i !== index);
    const problem = startLinkError(value, others, false);
    if (problem) {
      setError(problem);
      return;
    }
    if (value !== link) store.browserSettings.updateLink(index, value);
    cancel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <li className="browser-row browser-link">
      <span className="browser-link__index" aria-hidden="true">{index + 1}</span>
      {draft === null ? (
        <>
          <span className="browser-link__url" title={link}>{link}</span>
          <div className="browser-row__actions">
            <IconButton
              label={t("browser.links.moveUp")}
              icon="ArrowDown.svg"
              flip
              disabled={index === 0}
              onClick={() => store.browserSettings.moveLink(index, -1)}
            />
            <IconButton
              label={t("browser.links.moveDown")}
              icon="ArrowDown.svg"
              disabled={index === total - 1}
              onClick={() => store.browserSettings.moveLink(index, 1)}
            />
            <IconButton label={t("browser.links.edit")} icon="Edit.svg" onClick={() => setDraft(link)} />
            <IconButton
              label={t("browser.links.remove")}
              icon="Trash.svg"
              danger
              onClick={() => store.browserSettings.removeLink(index)}
            />
          </div>
        </>
      ) : (
        <div className="browser-link__edit">
          <div className="browser-link__edit-row">
            <input
              className="browser-input"
              value={draft}
              autoFocus
              spellCheck={false}
              aria-label={t("browser.links.editLabel")}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={onKeyDown}
            />
            <button type="button" className="browser-button browser-button--accent" onClick={commit}>
              {t("common.buttons.save")}
            </button>
            <button type="button" className="browser-button" onClick={cancel}>
              {t("common.buttons.cancel")}
            </button>
          </div>
          {error ? (
            <p className="browser-field-error" id={errorId} role="alert">
              {t(`browser.links.errors.${error}`, { max: MAX_START_LINKS })}
            </p>
          ) : null}
        </div>
      )}
    </li>
  );
});

const StartLinksCard = observer(() => {
  const { t } = useTranslation();
  const links = store.browserSettings.startLinks;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<StartLinkError | null>(null);
  const isFull = links.length >= MAX_START_LINKS;
  const mainError = store.browserSettings.errorFor("links");

  const add = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    const problem = startLinkError(value, links, true);
    if (problem) {
      setError(problem);
      return;
    }
    store.browserSettings.addLink(value);
    setDraft("");
    setError(null);
  };

  return (
    <section className="browser-card" aria-labelledby="browser-links-title" data-testid="browser-links">
      <div className="browser-card__head">
        <h2 className="browser-card__title" id="browser-links-title">{t("browser.links.title")}</h2>
        <span className="browser-card__badge">{t("browser.links.count", { used: links.length, max: MAX_START_LINKS })}</span>
      </div>
      <p className="browser-card__hint">{t("browser.links.hint")}</p>
      {links.length ? (
        <ol className="browser-list">
          {links.map((link, index) => (
            <StartLinkRow
              key={`${link}#${links.slice(0, index).filter((other) => other === link).length}`}
              link={link}
              index={index}
              total={links.length}
            />
          ))}
        </ol>
      ) : (
        <p className="browser-empty">{t("browser.links.empty", { link: DEFAULT_START_LINK })}</p>
      )}
      <form className="browser-add" onSubmit={add} noValidate>
        <input
          className="browser-input"
          value={draft}
          placeholder="https://steamcommunity.com/market/"
          spellCheck={false}
          aria-label={t("browser.links.newLabel")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "browser-add-error" : undefined}
          disabled={isFull}
          data-testid="browser-link-input"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
        <button type="submit" className="browser-button browser-button--accent" disabled={isFull} data-testid="browser-link-add">
          <PlusIcon />
          {t("browser.links.add")}
        </button>
      </form>
      {error || isFull ? (
        <p className={error ? "browser-field-error" : "browser-card__hint"} id="browser-add-error" role={error ? "alert" : undefined}>
          {t(`browser.links.errors.${error || "tooMany"}`, { max: MAX_START_LINKS })}
        </p>
      ) : null}
      {mainError ? <p className="browser-field-error" role="alert">{mainError}</p> : null}
    </section>
  );
});

const ExtensionsCard = observer(() => {
  const { t } = useTranslation();
  const { extensions, isPicking } = store.browserSettings;
  const enabledCount = extensions.filter((extension) => extension.enabled).length;
  const mainError = store.browserSettings.errorFor("extensions");

  return (
    <section className="browser-card" aria-labelledby="browser-extensions-title" data-testid="browser-extensions">
      <div className="browser-card__head">
        <h2 className="browser-card__title" id="browser-extensions-title">{t("browser.extensions.title")}</h2>
        {extensions.length ? (
          <span className="browser-card__badge">{t("browser.extensions.count", { on: enabledCount, total: extensions.length })}</span>
        ) : null}
        <button
          type="button"
          className="browser-button browser-button--accent browser-card__action"
          disabled={isPicking}
          data-testid="browser-add-extension"
          onClick={() => store.browserSettings.pickExtension()}
        >
          <PlusIcon />
          {isPicking ? t("browser.extensions.picking") : t("browser.extensions.add")}
        </button>
      </div>
      <div className="browser-note" role="note">
        <span className="browser-note__mark" aria-hidden="true">!</span>
        <p className="browser-note__text">{t("browser.extensions.warning")}</p>
      </div>
      <p className="browser-card__hint">{t("browser.extensions.hint")}</p>
      {extensions.length ? (
        <ul className="browser-list">
          {extensions.map((extension) => (
            <li
              key={extension.path}
              className={`browser-row browser-extension${extension.enabled ? "" : " browser-extension--off"}`}
            >
              <Switch
                checked={extension.enabled}
                label={t("browser.extensions.toggle", { name: extension.name })}
                onChange={(enabled) => store.browserSettings.setExtensionEnabled(extension.path, enabled)}
              />
              <span className="browser-extension__state" aria-hidden="true">
                {extension.enabled ? t("browser.extensions.on") : t("browser.extensions.off")}
              </span>
              <div className="browser-extension__info">
                <div className="browser-extension__title">
                  <span className="browser-extension__name" title={extension.name}>{extension.name}</span>
                  {extension.version ? <span className="browser-extension__version">{extension.version}</span> : null}
                </div>
                {/* Длинный путь режется слева: важнее конец — папка расширения. direction: rtl
                    в CSS, а LRM по краям держат слэши пути на своих местах. */}
                <div className="browser-extension__path" title={extension.path}>{`\u200E${extension.path}\u200E`}</div>
                {extension.status !== "ok" ? (
                  <div className="browser-extension__status">{t(`browser.extensions.status.${extension.status}`)}</div>
                ) : null}
              </div>
              <div className="browser-row__actions">
                <IconButton
                  label={t("browser.extensions.remove", { name: extension.name })}
                  icon="Trash.svg"
                  danger
                  onClick={() => store.browserSettings.removeExtension(extension.path)}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="browser-empty">{t("browser.extensions.empty")}</p>
      )}
      {mainError ? <p className="browser-field-error" role="alert">{mainError}</p> : null}
    </section>
  );
});

const BrowserTab: FC = observer(() => {
  const { t } = useTranslation();
  return (
    <div className="main browser-tab" data-testid="browser-tab">
      <div className="panel browser-panel">
        <div className="browser-panel__titles">
          <h1 className="panel-text_main">{t("browser.title")}</h1>
          <p className="browser-panel__subtitle">{t("browser.subtitle")}</p>
        </div>
      </div>
      <div className="browser-tab__body">
        {store.browserSettings.isLoaded ? (
          <div className="browser-tab__grid">
            <StartLinksCard />
            <ExtensionsCard />
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default BrowserTab;
