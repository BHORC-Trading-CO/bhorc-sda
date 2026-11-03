import { useTranslation } from "react-i18next";
import i18n, { LANGUAGES, Language } from "../../../../i18n/i18n";

// Короткие подписи сегментов; полное самоназвание языка — в title/aria-label.
const SHORT_NAMES: Record<Language, string> = { en: "EN", uk: "UA", ru: "RU" };

const LanguageSwitcher = ({ isCompress }: { isCompress: boolean }) => {
  const { t } = useTranslation("shell");
  const active = i18n.resolvedLanguage || i18n.language;

  const choose = (language: Language) => {
    if (language === active) return;
    // main сохранит выбор и разошлёт его во все окна, включая это.
    if (window.Language) window.Language.set(language);
    else i18n.changeLanguage(language);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("languageSwitcher.label")}
      className={`navigation-language${isCompress ? " navigation-language_mini" : ""}`}
    >
      {LANGUAGES.map((language) => {
        const name = t(`languageSwitcher.names.${language}`);
        const isActive = language === active;
        return (
          <button
            key={language}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={name}
            title={name}
            lang={language}
            className={`navigation-language-option${isActive ? " navigation-language-option_active" : ""}`}
            onClick={() => choose(language)}
          >
            {SHORT_NAMES[language]}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
