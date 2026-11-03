import AvalibleFieldTypes from "../AvalibleFieldTypes";
import Field from "../Field";

// title — только запасной вариант: интерфейс показывает название колонки по type
// (renderer: fields.<table>.<type> в locales). У старых пользователей в config.json лежат русские title.
const steamAccountsTableFields: Field[] = [
    {
        type: AvalibleFieldTypes.number,
        title: "№",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.startButton,
        title: "Browser start button",
        isSortable: false,
        isVisible: true,
        showTtitleInTable: false
    },
    {
        type: AvalibleFieldTypes.steamAccountAvatar,
        title: "Steam avatar",
        isSortable: false,
        isVisible: true,
        showTtitleInTable: false
    },
    {
        type: AvalibleFieldTypes.steamGuard,
        title: "Guard code",
        isSortable: false,
        isVisible: true,
        showTtitleInTable: false
    },
    {
        type: AvalibleFieldTypes.steamAccountButtons,
        title: "Guard actions",
        isSortable: false,
        isVisible: true,
        showTtitleInTable: false
    },
    {
        type: AvalibleFieldTypes.steamAccountLevel,
        title: "lvl",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.steamAccountName,
        title: "Steam login",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.steamAccountBalance,
        title: "Steam balance",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.steamPassword,
        title: "Steam password",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },

    {
        type: AvalibleFieldTypes.ktState,
        title: "Account lock status",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.tpState,
        title: "Market status",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.tradeState,
        title: "Trade status",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },

    {
        type: AvalibleFieldTypes.steamAccountNickname,
        title: "Steam nickname",
        isSortable: true,
        isVisible: false,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.steamId,
        title: "Steam ID",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.mail,
        title: "Email",
        isSortable: true,
        isVisible: false,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.mailPassword,
        title: "Email password",
        isSortable: false,
        isVisible: false,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.linkedProxies,
        title: "Linked proxy",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleFieldTypes.group,
        title: "Group",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    }
];

export default steamAccountsTableFields;