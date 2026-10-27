# BHORC SDA

## What it is

BHORC SDA is an open-source desktop app for managing many Steam accounts and their Steam Guard authenticators. It supports:

- Steam Guard codes and trade/market confirmations.
- Per-account proxies.
- Isolated browser profiles with fingerprints configured for each proxy's geographic location.
- Account groups and bulk proxy import.
- maFile import.

## Status

Beta. The user interface is currently in Russian.

## Download

Download builds from [GitHub Releases](https://github.com/BHORC-Trading-CO/bhorc-sda/releases).

## Build from source

Use Node.js 22. On macOS, install Python 3.11 and set `PYTHON=python3.11` for node-gyp before installing dependencies or building:

```sh
export PYTHON=python3.11
```

Clone this repository and run these commands from its root:

```sh
npm ci
npm start
```

`npm start` runs the development app. To build installers and verify the packaged dependencies:

```sh
npm run make
npm run verify:package
```

Build output is under `out/BHORC SDA-<platform>-<arch>/`. On macOS the bundle is `BHORC SDA.app`. Forge copies external modules into the packaged app through the `packageAfterPrune` hook; the module list is in `webpack/externals.js`.

On arm64 macOS, the first account-browser start downloads native Chromium. Later starts reuse the cached download.

## Where data lives

The application keeps the folder name `trademanager-open-source` for compatibility with existing installations. Rebranding does not move or rename it.

| OS | Data directory |
| --- | --- |
| Windows | `%APPDATA%\trademanager-open-source` |
| macOS | `~/Library/Application Support/trademanager-open-source` |
| Linux | `$XDG_CONFIG_HOME/trademanager-open-source`, or `~/.config/trademanager-open-source` when unset |

This directory contains the `electron-store` configuration (`config.json`), account data, maFiles, proxies, groups, browser profiles, pending authenticators, and Chromium cache.

Data, including maFiles and passwords, is currently stored **unencrypted on disk**. Keep the machine secure and protect access to this directory and its backups.

## Credits

Fork of [rawr111/trademanager-open-source](https://github.com/rawr111/trademanager-open-source), originally created by Mikhail Gladkikh (rawr111). The upstream project declared the MIT license in `package.json` from its first commit (`a438367`), but did not include a LICENSE file.

## License

[MIT](LICENSE). Copyright (c) 2023 Mikhail Gladkikh (rawr111) and Copyright (c) 2026 BHORC.
