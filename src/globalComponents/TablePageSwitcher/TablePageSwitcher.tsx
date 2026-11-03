import React, { FC } from 'react';
import './TablePageSwitcher.css';
import Dropdown from 'react-dropdown';
import { useTranslation } from 'react-i18next';

// Стрелки — кнопки: фокус, имя для скринридера, неактивное состояние; клики те же, что были у картинок
const PageButton: FC<{ disabled: boolean, label: string, img: string, imgDisabled: string, onClick: () => void }> = (p) => (
    <button
        type="button"
        className="page-switcher-btn"
        aria-label={p.label}
        title={p.label}
        aria-disabled={p.disabled || undefined}
        onClick={() => {
            if (p.disabled) return;
            p.onClick();
        }}
    >
        <img src={p.disabled ? p.imgDisabled : p.img} className="page-switcher-img" alt="" />
    </button>
);

const TablePageSwitcher: FC<{
    options?: {
        numberOfElementsInPage?: number,
        avalible?: number[]
    }
    pageSize: number,
    numberOfElements: number,
    numberOfPages: number,
    activePageNumber: number,
    onChangeActivePage: (newActivePageNumber: number) => void,
    onChangePageSize: (newPageSize: number) => void
}> = ({ options = { numberOfElementsInPage: 10, avalible: [5, 10, 15] }, pageSize, numberOfPages, activePageNumber, onChangeActivePage, onChangePageSize, numberOfElements }) => {
    const { t } = useTranslation();
    const atFirst = activePageNumber === 1 || numberOfPages === 0;
    const atLast = activePageNumber === numberOfPages || numberOfPages === 0;

    return <>
        <div className='table-footer-left'>
            <div className='table-footer-left_item'><span className="text-grey-large">{t("pagination.total")}</span><span className="table-footer-value">{numberOfElements}</span></div>
            <div className='table-footer-left_item'><span className="text-grey-large">{t("pagination.page")}</span><span className="table-footer-value">{activePageNumber} / {numberOfPages === 0 ? 1 : numberOfPages}</span></div>
            <div className='table-footer-left_item'>
                <span className="text-grey-large">{t("pagination.pageSize")}</span>
                <Dropdown options={options.avalible!.map(el => String(el))} onChange={(el) => {
                    onChangePageSize(Number(el.value));
                }} value={String(pageSize)} />
            </div>
            <div className='table-footer-left_item table-footer-img-item'>
                <PageButton disabled={atFirst} label={t("pagination.first")} img="./assets/img/firstPageArrow.svg" imgDisabled="./assets/img/firstPageArrowNonActive.svg" onClick={() => onChangeActivePage(1)} />
                <PageButton disabled={atFirst} label={t("pagination.prev")} img="./assets/img/prevPage.svg" imgDisabled="./assets/img/prevPageNonActive.svg" onClick={() => onChangeActivePage(activePageNumber - 1)} />
                <PageButton disabled={atLast} label={t("pagination.next")} img="./assets/img/nextPage.svg" imgDisabled="./assets/img/nextPageNonActive.svg" onClick={() => onChangeActivePage(activePageNumber + 1)} />
                <PageButton disabled={atLast} label={t("pagination.last")} img="./assets/img/lastPageArrow.svg" imgDisabled="./assets/img/lastPageArrowNonActive.svg" onClick={() => onChangeActivePage(numberOfPages)} />
            </div>
        </div>
    </>;
}
export default TablePageSwitcher;
