# Changelog

All notable changes to BHORC SDA. Versions follow the installers published on
[GitHub Releases](https://github.com/BHORC-Trading-CO/bhorc-sda/releases).

## 1.1.0 — 2026-11-17

The first public release. Changes are listed against the internal 1.0.5 build (Trademanager).

### Added
- English, Ukrainian and Russian interface, switched from the top bar.
- A new look: top navigation, account groups as a row of tabs, native window buttons, new icons and logo.
- Browser page: pages to open when an account's browser starts, unpacked extensions to load into it, and a switch to bring back the tabs of the previous session instead of the start pages.
- Confirmations for market purchases, market listings and API keys. Purchases, API keys and account security changes are confirmed one at a time; an API key only after a warning. A failed confirmation shows Steam's message instead of leaving the window waiting.
- Settings page: keep running in the tray when the window is closed, launch at system startup, start minimized.
- Clear button in the search field.

### Changed
- An account whose linked proxy is missing stays offline. It never falls back to your own address.
- The trade status no longer comes from opening a trade offer to a third-party account; it comes from Steam's own eligibility check.
- Red flag, Market and Trades show "unknown" when a check has not run or has failed, instead of "OK". A red flag is also raised for a disabled, locked or trade-banned account.
- Nickname, level and avatar come from Steam's mini profile, a request about seventy times smaller than the profile page.
- The integration with market.csgo.com (TM) is removed.
- The macOS build no longer carries an Intel browser it could not run: the app is about 380 MB smaller.

### Fixed
- The account browser did not start on Windows when the build had no browser inside ("An `executablePath` or `channel` must be specified"). The app now downloads the browser itself in that case, and builds are checked for it.
- The Steam balance did not load for any account. It is now read from the market page the app already loads.
- An account with an avatar frame showed a placeholder instead of its avatar.
- The level could be read from a friend's badge on the profile page.
- Cancelled edits of one account could be saved into another account.
- After a failed balance load the accounts table could show another account's proxy and maFile.
- "Open data folder" did nothing when the path had a space, which on macOS is always.
- Reloading the window emptied the accounts table.
- Times in the confirmations window were raw ISO strings.

### Security and privacy
- App windows do not reach the network at all. Avatars and item icons are fetched by the main process through the account's proxy.
- DNS-over-HTTPS is turned off, in the app and in every account browser: such requests bypass a proxy.
- Secrets no longer get into the log: the console masks them, confirmations are not logged, and `config.json` is readable only by its owner.
- Imported `.smaFile` data is not trusted: service fields cannot be overwritten and an avatar address must be Steam's.
- App windows cannot be navigated to other sites, and the main process ignores messages from anything but its own windows.
- Error text shown in the confirmations window cannot contain the confirmation key or nonce.

### Known limits
- Data, including maFiles and passwords, is stored unencrypted on disk.
- The app is built on Electron 17, which no longer receives security updates. Moving to a current version is planned.
- Builds are not code-signed. Windows SmartScreen and macOS Gatekeeper will warn on first start; see the README.
- Installing over the internal 1.0.5 build on Windows has not been tested.
