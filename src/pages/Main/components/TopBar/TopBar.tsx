import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import ReactTooltip from "react-tooltip";
import store from "../../../../store/store";
import TitleBar from "../../../../globalComponents/TitleBar/TitleBar";
import Brand from "../../../../globalComponents/Brand/Brand";
import Icon, { IconName } from "../../../../globalComponents/Icon/Icon";
import LanguageMenu from "./LanguageMenu";
import "./TopBar.css";

type Tab = typeof store.tabs.active;

const NAV_ITEMS: { tab: Tab; icon: IconName }[] = [
  { tab: "steamAccounts", icon: "users" },
  { tab: "proxies", icon: "link" },
  { tab: "browser", icon: "globe" },
];

// Уже 1200px у пунктов только иконки, подпись — в тултипе и aria-label (как в прежней навигации).
const COMPACT_WIDTH = 1200;
const TOOLTIP_ID = "topbar-nav-tooltip";

/**
 * Верхняя панель главного окна (R2): полоса TitleBar с логотипом, разделами и меню языка.
 * Пустая часть полосы тянет окно; кнопки внутри — no-drag (TitleBar.css). Отступы под кнопки
 * окна (светофор macOS слева, кнопки Windows справа) задаёт TitleBar, поэтому меню языка
 * никогда не попадает под кнопки заголовка Windows.
 */
const TopBar = observer(() => {
  const { t } = useTranslation("shell");
  // Сразу по ширине окна: при узком старте первая отрисовка уже компактная, без скачка.
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < COMPACT_WIDTH);

  useEffect(() => {
    const handleResize = () => setIsCompact(window.innerWidth < COMPACT_WIDTH);
    // Ширина могла измениться между первой отрисовкой и подпиской.
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      {/* title="": вместо названия и версии TitleBar — логотип; версия — внизу меню языка. */}
      <TitleBar platform={window.Main.platform} title="">
        <div className="topbar">
          <Brand size={26} />
          <span className="topbar-divider" aria-hidden="true" />
          <nav className="topbar-nav" aria-label={t("navigation.label")}>
            {NAV_ITEMS.map(({ tab, icon }) => {
              const label = t(`navigation.${tab}`);
              const isActive = store.tabs.active === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  className={`topbar-nav-item${isCompact ? " topbar-nav-item_compact" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={isCompact ? label : undefined}
                  data-tip={isCompact ? label : undefined}
                  data-for={isCompact ? TOOLTIP_ID : undefined}
                  data-testid={`nav-${tab}`}
                  onClick={() => store.tabs.setActive(tab)}
                >
                  {/* Активный пункт: иконка циановая, пружиной до 1.15 и со свечением (motion.css). */}
                  <Icon name={icon} size={16} motion="pop" className="sda-nav-activate" />
                  {isCompact ? null : <span className="topbar-nav-label">{label}</span>}
                </button>
              );
            })}
          </nav>
          <div className="topbar-right">
            <LanguageMenu />
          </div>
        </div>
      </TitleBar>
      {/* Тултип вне полосы заголовка: он выходит за её 48px и не должен попадать в область перетаскивания. */}
      {isCompact ? (
        <ReactTooltip
          id={TOOLTIP_ID}
          className="topbar-tooltip"
          place="bottom"
          effect="solid"
          backgroundColor="#27272a"
          textColor="#f4f4f5"
          arrowColor="#27272a"
        />
      ) : null}
    </>
  );
});

export default TopBar;
