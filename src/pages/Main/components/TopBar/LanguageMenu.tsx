import { KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { LANGUAGES, Language } from "../../../../i18n/i18n";
import { LANGUAGE_META } from "../../../../../electron/interfaces/Language";
import Icon from "../../../../globalComponents/Icon/Icon";

const MENU_ID = "language-menu";
const TITLE_ID = "language-menu-title";

/**
 * Меню языка в верхней панели (R2): кнопка с иконкой, по клику — список языков из LANGUAGES и
 * LANGUAGE_META (код и самоназвание), у текущего — галочка. Закрывается выбором, Escape и кликом
 * вне меню. Внизу — версия приложения (раньше она была в полосе заголовка).
 */
const LanguageMenu = () => {
  // useTranslation подписывает компонент на смену языка: галочка и подписи обновляются сразу.
  const { t } = useTranslation("shell");
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = i18n.resolvedLanguage || i18n.language;

  const close = (returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    // Фокус на текущий язык: стрелки дальше ходят по пунктам.
    const items = menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]");
    const checked = menuRef.current?.querySelector<HTMLElement>("[aria-checked=true]");
    (checked || items?.[0])?.focus();

    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    // Окно потеряло фокус (клик в другом окне): меню не остаётся висеть.
    const onBlur = () => close(false);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [isOpen]);

  const choose = (language: Language) => {
    close(true);
    if (language === active) return;
    // main сохранит выбор и разошлёт его во все окна, включая это.
    if (window.Language) window.Language.set(language);
    else i18n.changeLanguage(language);
  };

  // Стрелки, Home и End — по пунктам по кругу. Tab закрывает меню: фокус сначала на кнопку
  // (пункт сейчас исчезнет), дальше Tab по умолчанию ведёт к следующему элементу после неё.
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") || []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") focusAt(index + 1);
    else if (event.key === "ArrowUp") focusAt(index - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(items.length - 1);
    else if (event.key === "Tab") return close(true);
    else return;
    event.preventDefault();
  };

  return (
    <div className="language-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`language-menu-button${isOpen ? " language-menu-button_open" : ""}`}
        aria-label={t("languageMenu.label")}
        title={isOpen ? undefined : t("languageMenu.label")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? MENU_ID : undefined}
        data-testid="lang-menu"
        onClick={() => (isOpen ? close(false) : setIsOpen(true))}
      >
        <Icon name="languages" size={16} />
      </button>

      {isOpen ? (
        // no-drag: верх выпадающего списка касается полосы заголовка.
        <div className="language-menu-popover no-drag">
          <div className="language-menu-title" id={TITLE_ID}>
            {t("languageMenu.title")}
          </div>
          <div id={MENU_ID} role="menu" aria-labelledby={TITLE_ID} ref={menuRef} onKeyDown={onMenuKeyDown}>
            {LANGUAGES.map((language) => {
              const meta = LANGUAGE_META[language];
              const isActive = language === active;
              return (
                <button
                  key={language}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  tabIndex={-1}
                  lang={language}
                  className={`language-menu-item${isActive ? " language-menu-item_active" : ""}`}
                  data-testid={`lang-${language}`}
                  onClick={() => choose(language)}
                >
                  <span className="language-menu-code">{meta.code}</span>
                  <span className="language-menu-name">{meta.nativeName}</span>
                  {isActive ? <Icon name="check" size={16} className="language-menu-check" /> : null}
                </button>
              );
            })}
          </div>
          <div className="language-menu-version">v{__APP_VERSION__}</div>
        </div>
      ) : null}
    </div>
  );
};

export default LanguageMenu;
