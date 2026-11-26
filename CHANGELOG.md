# Changelog

All notable changes to BHORC SDA. Versions follow the installers published on
[GitHub Releases](https://github.com/BHORC-Trading-CO/bhorc-sda/releases).

## Unreleased

### Added
- Registration date column in the accounts table.
- A failed sign-in or refresh is visible in the row: the button turns amber and names the reason. The same failure of several accounts gives one message with their numbers and logins.
- "Reload all data" shows that it is running and ignores a second click.
- Proxy tests tell "works, but Steam answered 429 or 403" apart from "does not work"; a test of many proxies ends with one summary.
- Proxies can be pasted as `host:port`, `host:port:user:pass`, `user:pass@host:port` and `http://user:pass@host:port`; a rejected line stays in the field with the reason.
- `.smaFile` carries the mail, the mail password and the cookie choice, and marks an account whose proxy is missing.

### Changed
- Sign-ins and data loads go through queues. At startup the app used to sign in to every account and download the market page for every account at once.
- A sign-in that failed, for example because the proxy was down at startup, is retried on the next refresh. New and imported accounts sign in right away.
- "Reload all data" skips archived accounts and refreshes the data of the active ones.
- Bulk actions affect only the selected rows you can see. Selection and sorting survive a new account list.
- On import the proxy chosen in the preview wins over the one in the file.
- Closing the main window on Windows with other windows open closes the app when "keep running in the tray" is off; a second launch always shows the main window.

### Fixed
- A proxy that accepts the connection and stays silent no longer leaves rows, the confirmations window, the account browser and "Reload all data" waiting forever.
- Changing or deleting a proxy in the middle of a refresh, a sign-in or a browser start no longer lets the rest go through the old proxy, and its result is not saved as fresh.
- The confirmations window right after startup, import or account creation answered "Not Logged In"; it could also stay empty when its data came before the page was ready.
- Reloading, searching and selecting with many accounts: a search keystroke with 136 accounts took about 0.3 s, now about 0.05 s (Windows, CI machine). Guard-code timers no longer pile up, and codes are right after the computer sleeps.
- An imported account without a session made the main window blank on every start; one account without a secret left the others without Guard codes.
- "Add account" could save another account's maFile under the typed login. A maFile with an expired session is now added by password.
- An export right after an edit saved the old password, maFile or session.
- "Abort" in the add-account and Guard wizards did not abort; a failed sign-in or a closed code window left them waiting. An account whose Guard has just been enabled is saved before its profile is loaded.
- A proxy edit with a wrong address replaced the working one before it was refused. A password with ":" was cut on bulk import.
- Deleting an account left its browser running without a Stop button.
- "Focus" opened a blank tab. The launch-at-startup switch did not notice that Windows had turned it off.
- A restored account could share its number with another one, and the revealed password could move to another row when the order changed.

### Security and privacy
- A plain `http://` address in Steam's sign-in answer is not opened: the sign-in library would have sent it past the proxy, together with the token.
- A proxy host is accepted only as a DNS name, an IPv4 address or a bracketed IPv6 address. Other text could be read by the account browser as a rule that sends HTTPS traffic directly; a stored proxy with such a host counts as missing.

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
