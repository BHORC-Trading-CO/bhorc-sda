import { FC } from "react";
import "./Brand.css";

interface BrandProps {
    /** Размер знака в px: 26 — верхняя панель, 24 — места потеснее. */
    size?: 24 | 26;
    /** false — только знак (узкая навигация); название тогда в aria-label знака. */
    wordmark?: boolean;
}

/**
 * Логотип BHORC SDA (R1): знак «S» и надпись «BHORC SDA», «SDA» в циановом градиенте.
 * Знак инлайн, без загрузки файла (CSP default-src 'self'): та же геометрия и цвета, что в
 * assets/logo/sda-mark.svg, из которого scripts/make-icons.mjs собирает иконки приложения.
 * Менять оба места вместе — designGuard.test.ts сверяет многоугольники.
 */
const Brand: FC<BrandProps> = ({ size = 26, wordmark = true }) => (
    <span className={`brand brand_size-${size}`}>
        <svg
            className="brand-mark"
            viewBox="0 0 64 64"
            width={size}
            height={size}
            focusable="false"
            aria-hidden={wordmark || undefined}
            role={wordmark ? undefined : "img"}
            aria-label={wordmark ? undefined : "BHORC SDA"}
        >
            <polygon points="28.1,9 61.1,9 55.6,19 33.6,19 28.1,29 18.6,29 19.7,27 18.2,27" fill="#f4f4f5" />
            <polygon points="35.8,35 45.3,35 44.2,37 45.7,37 35.8,55 2.8,55 8.3,45 30.3,45" fill="#f4f4f5" />
            <polygon points="18.2,27 51.2,27 45.7,37 12.7,37" fill="#22d3ee" />
        </svg>
        {wordmark ? (
            <span className="brand-wordmark">
                BHORC <span className="brand-wordmark-accent">SDA</span>
            </span>
        ) : null}
    </span>
);

export default Brand;
