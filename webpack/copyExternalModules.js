const fs = require("fs");
const path = require("path");

const externals = require("./externals");

/**
 * Резолвит папку пакета так же, как это делает node: идёт вверх по цепочке
 * node_modules, начиная с fromDir, и останавливается на projectDir.
 */
function resolvePackageDir(name, fromDir, projectDir) {
  let dir = fromDir;

  while (true) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;

    const parent = path.dirname(dir);
    if (dir === projectDir || parent === dir) return null;
    dir = parent;
  }
}

/**
 * Собирает транзитивное замыкание зависимостей внешних модулей.
 * peerDependencies берутся, только если реально установлены — иначе их
 * отсутствие штатно (у плагинов puppeteer-extra peer — сам puppeteer).
 */
function collectPackageDirs(projectDir) {
  const found = new Set();
  const missing = new Set();

  const visit = (name, fromDir) => {
    const dir = resolvePackageDir(name, fromDir, projectDir);
    if (!dir) {
      missing.add(name);
      return;
    }
    if (found.has(dir)) return;
    found.add(dir);

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    } catch {
      return;
    }

    const deps = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    };
    for (const dep of Object.keys(deps)) visit(dep, dir);
  };

  for (const name of externals) visit(name, projectDir);

  const unresolvedExternals = externals.filter((name) => missing.has(name));
  if (unresolvedExternals.length > 0) {
    throw new Error(
      `Не найдены внешние модули: ${unresolvedExternals.join(", ")}. ` +
        `Выполните npm install перед сборкой.`
    );
  }

  return [...found].sort();
}

/**
 * Кладёт внешние модули в собранное приложение.
 *
 * plugin-webpack форджа обнуляет dependencies в package.json собранного
 * приложения и оставляет пустой node_modules, а packager после этого делает
 * prune. В итоге всё, что перечислено в externals, из сборки пропадает и
 * приложение падает на старте с "Cannot find module 'steamcommunity'".
 * Раньше это лечилось ручным копированием модулей в resources (шаг 5 README).
 */
function copyExternalModules(projectDir, buildPath) {
  const packageDirs = collectPackageDirs(projectDir);

  for (const source of packageDirs) {
    const relative = path.relative(projectDir, source);
    const destination = path.join(buildPath, relative);

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, force: true });
  }

  return packageDirs.length;
}

module.exports = { copyExternalModules, collectPackageDirs };
