import { FC, ReactNode } from 'react';
import './TitleBar.css';

interface TitleBarProps {
    /** process.platform из preload окна (window.<Bridge>.platform): отступ под системные кнопки. */
    platform: NodeJS.Platform;
    /** Заголовок окна; без него — название приложения и версия. */
    title?: string;
    /** Элементы полосы (навигация, меню). Кнопки, ссылки и поля внутри не перетаскивают окно. */
    children?: ReactNode;
}

/**
 * Полоса заголовка окна (R1) вместо прежнего Attic. Кнопки окна системные (windowChrome.ts в main):
 * светофор macOS слева, кнопки Windows (titleBarOverlay) справа; полоса оставляет под них место.
 * Пустая часть полосы перетаскивает окно (-webkit-app-region: drag).
 */
const TitleBar: FC<TitleBarProps> = ({ platform, title, children }) => (
    <div className="titlebar" data-platform={platform}>
        <div className="titlebar-title">
            {title !== undefined ? title : (
                <>
                    <span className="titlebar-name">BHORC SDA</span>
                    <span className="titlebar-version">v{__APP_VERSION__}</span>
                </>
            )}
        </div>
        {children}
    </div>
);

export default TitleBar;
