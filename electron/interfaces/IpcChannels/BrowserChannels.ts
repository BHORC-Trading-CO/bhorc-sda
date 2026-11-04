enum BrowserChannels {
    /** Запрос настроек браузера; ответ на тот же канал — BrowserSettingsView. */
    'BROWSER_SETTINGS_GET' = 'BROWSER_SETTINGS_GET',
    /** Сохранить стартовые ссылки и список расширений. Ответ — BROWSER_SETTINGS_GET (и BROWSER_SETTINGS_ERROR, если отклонено). */
    'BROWSER_SETTINGS_SAVE' = 'BROWSER_SETTINGS_SAVE',
    /** Выбрать папку расширения в нативном диалоге main и добавить её в список. */
    'BROWSER_PICK_EXTENSION' = 'BROWSER_PICK_EXTENSION',
    /** Отказ сохранения или выбора папки; текст уже переведён в main. */
    'BROWSER_SETTINGS_ERROR' = 'BROWSER_SETTINGS_ERROR'
}

export default BrowserChannels;
