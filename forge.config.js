const fs = require('fs');
const path = require('path');

// Модули, вынесенные в externals в webpack/main.webpack.js — webpack их НЕ бандлит,
// поэтому в собранном приложении они должны физически лежать в resources/app/node_modules
// вместе со всеми транзитивными зависимостями. Держать список в синхроне с webpack/main.webpack.js.
const EXTERNAL_MODULES = [
  'puppeteer',
  'puppeteer-extra',
  'puppeteer-extra-plugin-stealth',
  'puppeteer-extra-plugin-minmax',
  'sharp',
  'chromium',
  'steam-session',
  'steamcommunity',
];

const PROJECT_ROOT = __dirname;
const ROOT_MODULES = path.join(PROJECT_ROOT, 'node_modules');

// Резолв пакета по правилам node: ищем <requirerDir>/node_modules/<dep>, поднимаясь вверх,
// с фоллбэком на корневой node_modules. Возвращает абсолютный путь к каталогу пакета или null.
function resolvePackageDir(depName, requirerDir) {
  let dir = requirerDir;
  // поднимаемся по дереву каталогов, проверяя локальные node_modules (вложенные установки npm)
  for (;;) {
    const candidate = path.join(dir, 'node_modules', depName);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const rootCandidate = path.join(ROOT_MODULES, depName);
  if (fs.existsSync(path.join(rootCandidate, 'package.json'))) return rootCandidate;
  return null;
}

function readDeps(pkgDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    return Object.keys({ ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) });
  } catch {
    return [];
  }
}

// Собирает замыкание зависимостей externals и копирует каждый пакет в buildPath,
// сохраняя относительный путь от корня проекта (чтобы вложенные node_modules резолвились).
function copyExternalsClosure(buildPath) {
  const visited = new Set(); // абсолютные пути уже обработанных каталогов пакетов
  const queue = [];

  for (const name of EXTERNAL_MODULES) {
    const dir = resolvePackageDir(name, PROJECT_ROOT);
    if (dir) queue.push(dir);
    else console.warn(`[forge] external module not found in node_modules: ${name}`);
  }

  let copied = 0;
  while (queue.length) {
    const pkgDir = queue.shift();
    if (visited.has(pkgDir)) continue;
    visited.add(pkgDir);

    const rel = path.relative(PROJECT_ROOT, pkgDir); // напр. node_modules/steamcommunity
    const dest = path.join(buildPath, rel);
    if (!fs.existsSync(dest)) {
      fs.cpSync(pkgDir, dest, { recursive: true });
      copied++;
    }

    for (const dep of readDeps(pkgDir)) {
      const depDir = resolvePackageDir(dep, pkgDir);
      if (depDir && !visited.has(depDir)) queue.push(depDir);
    }
  }

  console.log(`[forge] copied ${copied} external module(s) into ${path.join(buildPath, 'node_modules')}`);
}

module.exports = {
  packagerConfig: {
    name: 'Trademanager',
    executableName: 'trademanager',
    icon: 'assets/icon',
    extraResource: ['assets'],
  },
  hooks: {
    // buildPath — каталог скопированного приложения (будущий resources/app)
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      copyExternalsClosure(buildPath);
    },
  },
  plugins: [
    [
      '@electron-forge/plugin-webpack',
      {
        devContentSecurityPolicy:
          "default-src * self blob: data: gap:; style-src * self 'unsafe-inline' blob: data: gap:; script-src * 'self' 'unsafe-eval' 'unsafe-inline' blob: data: gap:; object-src * 'self' blob: data: gap:; img-src * self 'unsafe-inline' blob: data: gap:; connect-src self * 'unsafe-inline' blob: data: gap:; frame-src * self blob: data: gap:;",
        mainConfig: './webpack/main.webpack.js',
        renderer: {
          config: './webpack/renderer.webpack.js',
          entryPoints: [
            {
              html: './public/index.html',
              js: './src/index.tsx',
              name: 'main_window',
              preload: { js: './electron/bridges/mainBridge.ts' },
            },
            {
              html: './public/index.html',
              js: './src/index.tsx',
              name: 'ask_family_pin_window',
              preload: { js: './electron/bridges/askFamilyPinBridge.ts' },
            },
            {
              html: './public/index.html',
              js: './src/index.tsx',
              name: 'confirmations_window',
              preload: { js: './electron/bridges/confirmationsBridge.ts' },
            },
            {
              html: './public/index.html',
              js: './src/index.tsx',
              name: 'error_window',
              preload: { js: './electron/bridges/errorWindowBridge.ts' },
            },
          ],
        },
      },
    ],
  ],
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: { name: 'ElectronStarter' },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
};
