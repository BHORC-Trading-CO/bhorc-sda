# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TradeManager — an Electron desktop app for managing multiple Steam accounts (Steam Guard / mobile authenticator, trade confirmations, proxies, and isolated browser profiles). The renderer is React + MobX; the Electron main process owns all Steam/network logic and persistent storage.

## Commands

- `npm start` — run in development (electron-forge + webpack dev server, hot reload).
- `npm run make` — build/compile distributables (Squirrel for Windows, zip for darwin, deb/rpm for Linux).
- `npm run package` — package the app without making installers.
- `npm run release` — publish via electron-forge.

There is **no test runner, linter, or typecheck script** configured. `tsc` runs with `noEmit` (`tsconfig.json` covers `src/` only); types are stripped by Babel at build time, so type errors do not fail the build. After packaging, required modules must be placed in the `resources` folder (see README).

## Architecture

Two processes communicate exclusively over Electron IPC. There is **no shared code import between `src/` and `electron/`** — the contract between them is the set of string channel names and TypeScript interfaces.

### Main process (`electron/`)
- Entry: `electron/main.ts` → `components/application/application.ts` (singleton). `firstStage` waits for `app.ready`, creates the main window, then `secondStage` calls `Manager.Load()` and registers all IPC listeners via `listenersRouters()`. (The `decrypt`/secret-key flow exists but is currently bypassed — `secondStage` is called directly.)
- **Managers are singletons** (`steamAccountManager`, `proxyManager`) holding live in-memory object arrays. `Manager` (`components/Manager/Manager.ts`) coordinates cross-entity concerns, primarily the **links** between accounts and proxies (`LinksStorage`).
- **`SteamAccount` class** (`components/SteamAccount/SteamAccount.ts`) is the core domain object. Each instance wraps: a `steamcommunity` client, a `steam-session` `LoginSession`, and a `Chrome` puppeteer browser. It handles login (maFile/TOTP via `steam-totp`), session refresh, family-view PIN, secondaries (balances), and trade confirmations. `SteamAccount.Generate()` is the static factory; `editParams()` mutates in memory **and** persists.
- **IPC listeners** live in `components/SteamAccount/Listeners/*` and `components/Proxy/...`, wired in `components/application/listenersRouters/*Router.ts`. Each listener is a thin handler that calls into a manager/domain method and replies to the `'ERROR'` channel on failure. Channel name constants live in `electron/interfaces/IpcChannels/*` — **use these enums, do not hardcode channel strings** (some legacy listeners still use raw strings like `'NEW_PROXY'`).
- **Multi-step flows** (`components/SteamAccount/Processes/*`) like account creation and guard setup stream progress back to the renderer step-by-step (`createProcessSendStep`).
- **Persistence** (`components/newStorage/*Storage.ts`): backed by `electron-store` (JSON on disk in appData). `SteamAccountStorage` encrypts/decrypts every record through `cryptoUserData`. Storage classes are static; `EditData` does a read-merge-write.
- **Browser automation** (`components/SteamAccount/Chrome/Chrome.ts`): per-account persistent puppeteer profile (`puppeteer-extra` + stealth), routed through the account's proxy.

### Renderer (`src/`)
- Entry `src/index.tsx` → `Router.tsx`. The same bundle serves four windows; the active window is determined at runtime by `window.getWindowName()` (set per-preload-bridge): `main`, `ask_family_pin_window`, `confirmations_window`, `error_window`.
- **State: MobX** (`src/store/store.ts`, a root store composing `SteamAccountsTableStore`, `ProxiesTableStore`, `WindowStore`, `TabsStore`). The root store subscribes to IPC `on*` events in its constructor and is instantiated only for the `main` window.
- **All backend access goes through `window.Main`**, exposed by `electron/bridges/mainBridge.ts` via `contextBridge`. The bridge groups methods into `steamAccounts`, `proxies`, `window`, `guardConnection`. Convention: imperative `send` methods (`get`, `edit`, `delete`) pair with `on*` subscription methods for the reply. Each window has its own preload bridge in `electron/bridges/`.

### Adding an end-to-end feature
1. Add a channel constant in the relevant `electron/interfaces/IpcChannels/*` enum.
2. Add a listener in `components/.../Listeners/`, register it in the matching `*Router.ts`.
3. Implement domain logic on the manager / `SteamAccount` / storage class.
4. Expose a `send` + `on*` method pair on the correct group in `mainBridge.ts`.
5. Wire it into the appropriate MobX store and React component under `src/`.

## Conventions & gotchas

- Comments and many error messages are in **Russian**; match the surrounding language when editing nearby code.
- Domain methods overwhelmingly return hand-rolled `new Promise((resolve, reject) => …)` wrappers around callback-based Steam libraries — follow that pattern rather than mixing in raw `async` over the same callbacks.
- Filesystem folder casing is inconsistent with imports (e.g. folders `Manager/`, `application/` are imported as `manager/manager`, `application/application`). This resolves on case-insensitive Windows; preserve existing import casing to avoid breaking other platforms.
- `package-lock.json` and `yarn.lock` both exist; the README instructs `npm install`.
