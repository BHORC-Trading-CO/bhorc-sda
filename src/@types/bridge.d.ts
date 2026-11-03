import bridge from '../../electron/bridges/bridge';

declare global {
  // eslint-disable-next-line
  interface Window {
    Main: typeof bridge.mainApi,
    Confirmations: typeof bridge.confirmationsApi,
    AskFamilyPin: typeof bridge.askFamilyPinApi,
    Auth: typeof bridge.authApi,
    ErrorWindow: typeof bridge.errorApi,
    /** Язык интерфейса, есть во всех окнах (electron/bridges/languageBridge.ts). */
    Language: typeof bridge.languageApi,
    getWindowName: () => string
  }
}
