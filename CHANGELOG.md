# Changelog

All notable changes to BHORC SDA. Versions follow the installers published on
[GitHub Releases](https://github.com/BHORC-Trading-CO/bhorc-sda/releases).

## 1.1.0 (first public release)

Changes are listed against the internal 1.0.5 build (Trademanager).

### Added
- English, Ukrainian and Russian interface, switched from the top bar.
- A new look: top navigation, account groups as a row of tabs, native window buttons, new icons and logo.
- Browser page: pages to open when an account's browser starts, unpacked extensions to load into it, and a switch to bring back the tabs of the previous session instead of the start pages.
- Confirmations for market purchases, market listings and API keys. Purchases, API keys and account security changes are confirmed one at a time; an API key only after a warning. A failed confirmation no longer leaves the window waiting: it ends with Steam's message, an error of ours, or a warning that the outcome is unknown.
- Settings page: keep running in the tray when the window is closed, launch at system startup, and start minimized when launched that way.
- Clear button in the search field.

### Changed
- An account whose linked proxy is missing stays offline. It never falls back to your own address.
- The trade status no longer comes from opening a trade offer to a third-party account; it comes from Steam's own eligibility check.
- Red flag, Market and Trades show "unknown" when a status has never been checked or its check has failed, instead of "OK". If a refresh fails before the checks run, the last known statuses stay. A red flag is also raised for a disabled, locked or trade-banned account.
- Nickname, level and avatar come from Steam's mini profile, about 1 KB instead of the 73 KB profile page, which remains the fallback.
- The integration with market.csgo.com (TM) is removed.
- The Apple Silicon build no longer carries an Intel browser it could not run: the packaged app went from 685 MB to 303 MB. It downloads its own Chromium on the first browser start.

### Fixed
- The account browser did not start on Windows when the build had no browser inside ("An `executablePath` or `channel` must be specified"). The app now downloads the browser itself in that case, and builds are checked for it.
- The Steam balance did not load: it was requested from the store with a session that is valid only for the community site. It is now read from the market page the app already loads.
- An account with an avatar frame showed a placeholder instead of its avatar.
- The level could be read from a friend's badge on the profile page.
- Cancelled edits of one account could be saved into another account.
- After a failed balance load the accounts table could show another account's proxy and maFile.
- "Open data folder" did nothing when the path had a space, which on macOS is always.
- Reloading the window emptied the accounts table.
- Times in the confirmations window were raw ISO strings.

### Security and privacy
- The windows of the built app do not reach the network at all. Avatars and item icons are fetched by the main process, through the account's proxy when it has one.
- DNS-over-HTTPS is turned off, in the app and in every account browser: such requests bypass a proxy.
- The console masks known secret fields and several token patterns, and confirmations are not logged. One exception is deliberate: if a newly created authenticator cannot be saved to disk, its secrets are printed so that the Guard is not lost. `config.json` is created readable only by its owner; on Windows the permissions of the folder apply.
- Imported `.smaFile` data is not trusted: service fields cannot be overwritten and an avatar address must be Steam's.
- App windows cannot be navigated to other sites, and the main process ignores messages that do not come from the app's own pages.
- Error text in the confirmations window is restricted: a library error is shown only when it is plain prose, otherwise a short code or a general message; known key and nonce formats are masked in Steam's own messages.

### Known limits
- Data, including maFiles and passwords, is stored unencrypted on disk.
- The app is built on Electron 17, which no longer receives security updates. Moving to a current version is planned.
- Builds are not code-signed. Windows SmartScreen and macOS Gatekeeper may warn on first start; see the README.
- Developer Tools can be opened in the app's windows, and those windows hold account data, secrets included.
- The Chromium that the app downloads for account browsers is cached and not updated automatically.
- For an account with a proxy, the app asks ipwho.is through that proxy where the proxy is, to set the browser's time zone and language.
- Installing over the internal 1.0.5 build on Windows has not been tested.
