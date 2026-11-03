import AvalibleTypes from "../AvalibleFieldTypes";
import Field from "../Field";

// title — только запасной вариант: интерфейс показывает название колонки по type
// (renderer: fields.<table>.<type> в locales). У старых пользователей в config.json лежат русские title.
const proxiesTableFields: Field[] = [
    {
        type: AvalibleTypes.number,
        title: "№",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleTypes.proxyHost,
        title: "Proxy host",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleTypes.proxyPort,
        title: "Proxy port",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleTypes.proxyUsername,
        title: "Proxy login",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleTypes.proxyPassword,
        title: "Proxy password",
        isSortable: true,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleTypes.linkedSteamAccounts,
        title: "Linked Steam accounts",
        isSortable: false,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleTypes.linkedProfiles,
        title: "Linked profiles",
        isSortable: false,
        isVisible: true,
        showTtitleInTable: true
    },
    {
        type: AvalibleTypes.testProxyButton,
        title: "Test button",
        isSortable: false,
        isVisible: true,
        showTtitleInTable: false
    }
];

export default proxiesTableFields;