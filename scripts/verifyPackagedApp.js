/**
 * Проверяет собранное приложение в out/ — то, что раньше приходилось проверять
 * руками, запуская .app и глядя, не падает ли он на старте.
 *
 * Ловит ровно ту поломку, ради которой появился хук packageAfterPrune:
 * plugin-webpack обнуляет dependencies в package.json собранного приложения,
 * packager вычищает node_modules, и всё из webpack externals пропадает —
 * приложение умирает на первом require с "Cannot find module 'steamcommunity'".
 *
 * Запуск: npm run verify:package (после npm run package либо npm run make).
 */

const fs = require("fs");
const path = require("path");

const externals = require("../webpack/externals");

const OUT_DIR = path.resolve(__dirname, "..", "out");

/**
 * Ищет папку приложения внутри out/. Раскладка разная по платформам:
 *   Windows/Linux — out/<Name>-<platform>-<arch>/resources/app
 *   macOS         — out/<Name>-darwin-<arch>/<Name>.app/Contents/Resources/app
 */
function findPackagedAppDirs() {
  if (!fs.existsSync(OUT_DIR)) {
    throw new Error(`Нет папки ${OUT_DIR}. Сначала выполните npm run package.`);
  }

  const found = [];

  for (const entry of fs.readdirSync(OUT_DIR)) {
    const base = path.join(OUT_DIR, entry);
    if (!fs.statSync(base).isDirectory() || entry === "make") continue;

    const candidates = [path.join(base, "resources", "app")];

    for (const nested of fs.readdirSync(base)) {
      if (nested.endsWith(".app")) {
        candidates.push(path.join(base, nested, "Contents", "Resources", "app"));
      }
    }

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, "package.json"))) found.push(candidate);
    }
  }

  if (found.length === 0) {
    throw new Error(`В ${OUT_DIR} не нашлось собранного приложения.`);
  }
  return found;
}

/**
 * Ищем модуль ТОЛЬКО внутри node_modules собранного приложения.
 *
 * require.resolve({ paths }) здесь не годится: node всё равно поднимается вверх
 * по дереву каталогов, а собранное приложение лежит внутри репозитория — и
 * модуль находится в node_modules самого проекта. Проверка при этом проходит
 * даже на пустой сборке, то есть даёт ложный зелёный.
 */
function resolveInsideApp(nodeModules, name) {
  const packageDir = path.join(nodeModules, name);
  const manifestPath = path.join(packageDir, "package.json");

  if (!fs.existsSync(manifestPath)) {
    return `модуля "${name}" нет в сборке (${path.join("node_modules", name)})`;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return `битый package.json у "${name}": ${err.message}`;
  }

  // Точка входа: main, либо index.js рядом. main может указывать и на папку.
  const entry = path.join(packageDir, manifest.main || "index.js");
  const candidates = [entry, `${entry}.js`, path.join(entry, "index.js")];
  if (!candidates.some((candidate) => fs.existsSync(candidate))) {
    return `у "${name}" нет точки входа (${manifest.main || "index.js"})`;
  }

  return null;
}

/** Все папки .bin внутри node_modules — фордж их вычищает, возвращать нельзя. */
function findBinDirs(root) {
  const found = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (entry.name === ".bin") {
        found.push(path.join(dir, entry.name));
        continue;
      }
      // Внутрь самих пакетов не лезем глубже node_modules — .bin живёт только там.
      if (entry.name === "node_modules" || dir.endsWith("node_modules")) {
        walk(path.join(dir, entry.name));
      }
    }
  };

  walk(root);
  return found;
}

function verify(appDir) {
  const problems = [];
  const nodeModules = path.join(appDir, "node_modules");

  for (const name of externals) {
    const problem = resolveInsideApp(nodeModules, name);
    if (problem) problems.push(problem);
  }

  const bins = findBinDirs(nodeModules);
  for (const bin of bins) {
    problems.push(`лишняя папка .bin в сборке: ${path.relative(appDir, bin)}`);
  }

  return problems;
}

function main() {
  const appDirs = findPackagedAppDirs();
  let failed = false;

  for (const appDir of appDirs) {
    const problems = verify(appDir);
    if (problems.length === 0) {
      console.log(`OK  ${appDir}`);
      console.log(`    внешних модулей разрешается: ${externals.length}, лишних .bin нет`);
    } else {
      failed = true;
      console.error(`FAIL ${appDir}`);
      for (const problem of problems) console.error(`     - ${problem}`);
    }
  }

  if (failed) process.exit(1);
}

if (require.main === module) main();

module.exports = { findPackagedAppDirs, findBinDirs, verify };
