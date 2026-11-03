enum LanguageChannels {
    /** Синхронный запрос текущего языка (ipcRenderer.sendSync), чтобы первая отрисовка уже была на нём. */
    'GET_LANGUAGE' = 'GET_LANGUAGE',
    /** Смена языка из окна приложения. */
    'SET_LANGUAGE' = 'SET_LANGUAGE',
    /** Рассылка нового языка во все окна приложения. */
    'LANGUAGE_CHANGED' = 'LANGUAGE_CHANGED'
}

export default LanguageChannels;
