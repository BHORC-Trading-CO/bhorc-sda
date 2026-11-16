enum AppSettingsChannels {
    /** Request the Settings page state; the reply comes on the same channel as AppSettingsView. */
    'APP_SETTINGS_GET' = 'APP_SETTINGS_GET',
    /** Save one switch, AppSettingsPatch { key, value }. Reply: APP_SETTINGS_GET with the full state (and APP_SETTINGS_ERROR when rejected). */
    'APP_SETTINGS_SAVE' = 'APP_SETTINGS_SAVE',
    /** Save rejected or the login item could not be changed; the text is translated in main. */
    'APP_SETTINGS_ERROR' = 'APP_SETTINGS_ERROR'
}

export default AppSettingsChannels;
