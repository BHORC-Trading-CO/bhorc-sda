import "./Main.css";
import "../../css/Form.css";
import TopBar from "./components/TopBar/TopBar";
import GroupsRow from "./tabs/SteamAccountsTab/components/GroupsRow/GroupsRow";
import Prompt from "../../globalComponents/Prompt/Prompt";
import MiniNotification from "../../globalComponents/Notifications/MiniNotifitcation";
import ProxiesTab from "./tabs/ProxiesTab/ProxiesTab";
import SteamAccountsTab from "./tabs/SteamAccountsTab/SteamAccountsTab";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import store from "../../store/store";
import { observer } from "mobx-react";
import BrowserTab from "./tabs/BrowserTab/BrowserTab";

// Главное окно (R2): верхняя панель с разделами, под ней строка групп (только у Steam аккаунтов),
// ниже — открытый раздел.
const Main = observer(() => {
  return (
    <div className="layout">
      <DndProvider backend={HTML5Backend}>
        <TopBar />
        <GroupsRow />
        <div className="content">
          {store.tabs.active === "steamAccounts" ? <SteamAccountsTab /> : <></>}
          {store.tabs.active === "proxies" ? <ProxiesTab /> : <></>}
          {store.tabs.active === "browser" ? <BrowserTab /> : <></>}
        </div>
        <Prompt />
        <MiniNotification />
      </DndProvider>
    </div>
  );
});

export default Main;
