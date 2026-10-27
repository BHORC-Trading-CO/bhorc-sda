const { copyExternalModules } = require("./webpack/copyExternalModules");

module.exports = {
  packagerConfig: {
    name: "BHORC SDA",
    // На Windows имя исполняемого файла и Squirrel id пока прежние: v1.0.5 ставилась как
    // ElectronStarter/trademanager.exe, и новые поставили бы вторую копию рядом вместо
    // обновления. Меняем только после проверки обновления на Windows. Windows-сборку
    // собирают на Windows, поэтому выбираем по платформе сборки.
    executableName: process.platform === "win32" ? "trademanager" : "bhorc-sda",
    appBundleId: "co.bhorc.sda",
    icon: "assets/icon",
    extraResource: ["assets"],
  },
  hooks: {
    /**
     * Возвращает в сборку внешние модули (webpack/externals.js).
     *
     * Именно packageAfterPrune, а не packageAfterCopy: plugin-webpack
     * обнуляет dependencies в package.json собранного приложения, после чего
     * packager вычищает node_modules целиком. Всё, что скопировано раньше
     * prune, будет удалено.
     */
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      const count = copyExternalModules(__dirname, buildPath);
      console.log(`\nВнешних модулей скопировано в сборку: ${count}`);
    },
  },
  plugins: [
    [
      "@electron-forge/plugin-webpack",
      {
        devContentSecurityPolicy:
          "default-src * self blob: data: gap:; style-src * self 'unsafe-inline' blob: data: gap:; script-src * 'self' 'unsafe-eval' 'unsafe-inline' blob: data: gap:; object-src * 'self' blob: data: gap:; img-src * self 'unsafe-inline' blob: data: gap:; connect-src self * 'unsafe-inline' blob: data: gap:; frame-src * self blob: data: gap:;",
        mainConfig: "./webpack/main.webpack.js",
        renderer: {
          config: "./webpack/renderer.webpack.js",
          entryPoints: [
            {
              html: "./public/index.html",
              js: "./src/index.tsx",
              name: "main_window",
              preload: { js: "./electron/bridges/mainBridge.ts" },
            },
            {
              html: "./public/index.html",
              js: "./src/index.tsx",
              name: "ask_family_pin_window",
              preload: { js: "./electron/bridges/askFamilyPinBridge.ts" },
            },
            {
              html: "./public/index.html",
              js: "./src/index.tsx",
              name: "confirmations_window",
              preload: { js: "./electron/bridges/confirmationsBridge.ts" },
            },
            {
              html: "./public/index.html",
              js: "./src/index.tsx",
              name: "error_window",
              preload: { js: "./electron/bridges/errorWindowBridge.ts" },
            },
          ],
        },
      },
    ],
  ],
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: { name: "ElectronStarter", setupExe: "BHORC-SDA-Setup.exe" },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
};
