import '../../../../../css/Panel.css';
import './ProxiesPanel.css';
import Button from "../../../../../globalComponents/Button/Button";
import Search from "../../../../../globalComponents/Search/Search";
import Icon from "../../../../../globalComponents/Icon/Icon";
import { observer } from 'mobx-react';
import store from '../../../../../store/store';
import { useTranslation } from 'react-i18next';

const ProxiesPanel = observer(() => {
    const { t } = useTranslation();
    return (
        <div className="panel proxies-panel">
            <div className="panel-content">
                <h1 className="panel-text_main">{t("proxies.panel.title")}</h1>
                <div className="panel-content__options">
                    {/* <div className="header-content__buttons-container">
            <div className="button-default" id="panel_settings" onClick={()=>{
              store.openTableSettings();
            }}></div>
            <div className="button-default" id="panel_refresh"></div>
          </div> */}
                    <Button
                        view="icon"
                        hoverColor="gradient"
                        color="grey"
                        size="large"
                        icon="folder"
                        className="button-default"
                        onClick={() => {
                            window.Main.window.openAppdata();
                        }}
                        altText={t("common.openDataFolder")}
                    />

                    <Button
                        view="icon"
                        hoverColor="gradient"
                        color="grey"
                        size="large"
                        icon="sliders"
                        className="button-default"
                        testId="table-settings"
                        onClick={() => {
                            store.proxiesTable.openTableSettings();
                        }}
                        altText={t("tableSettings.title")}
                    />

                    <Button
                        view="icon"
                        hoverColor="gradient"
                        color="grey"
                        size="large"
                        icon="refresh"
                        iconMotion="spin"
                        className="button-default"
                        onClick={() => {
                            window.Main.proxies.refresh();
                        }}
                        altText={t("common.reloadAll")}
                    />

                    <Search value={store.proxiesTable.searchString} onChange={(value) => {
                        store.proxiesTable.search(value);
                    }}></Search>


                    <button
                        type="button"
                        className="proxy-panel-cta proxy-panel-cta--secondary"
                        data-testid="bulk-proxies"
                        title={t("proxies.panel.bulkHint")}
                        onClick={() => {
                            store.proxiesTable.openBulkForm();
                        }}
                    >{t("proxies.panel.importList")}</button>

                    <button
                        type="button"
                        className="proxy-panel-cta proxy-panel-cta--primary"
                        data-testid="add-proxy"
                        onClick={() => {
                            store.proxiesTable.openCreationForm();
                        }}
                    >
                        <Icon name="plus" motion="pop" />
                        {t("proxies.panel.add")}
                    </button>

                    <Button
                        view="icon"
                        hoverColor="light-grey"
                        color="grey"
                        size="large"
                        icon={store.proxiesTable.showDeleted ? "eye" : "eyeOff"}
                        className="button-default"
                        testId="show-archived"
                        onClick={() => {
                            if (store.proxiesTable.showDeleted)
                                for (var i = store.proxiesTable.activePage; i >= 1; i--) {
                                    const proxiesInPage = store.proxiesTable.getProxiesByPages()[i - 1];
                                    console.log(i, proxiesInPage);
                                    if (proxiesInPage.length != 0 && (proxiesInPage.filter(p => p.deleted).length != proxiesInPage.length)) {
                                        store.proxiesTable.setActivePage(i, true);
                                        break;
                                    }
                                    if (i == 1) {
                                        store.proxiesTable.setActivePage(1, true);
                                        break;
                                    }
                                }
                            store.proxiesTable.changeShowStatus();
                        }}
                    />
                </div>
            </div>
        </div>
    );
});

export default ProxiesPanel;
