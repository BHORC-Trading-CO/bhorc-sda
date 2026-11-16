// Chromium reads --disable-features as one comma-separated list; a repeated switch is not merged,
// the last value wins (Electron's appendSwitch also replaces the value). Every place that disables
// features therefore extends the list that is already there instead of setting a new one,
// otherwise the features disabled earlier come back on.

export const DISABLE_FEATURES_SWITCH = "disable-features";

/**
 * DNS-over-HTTPS. When the system resolver is a DoH provider (1.1.1.1, 8.8.8.8), Chromium
 * upgrades lookups to its DoH endpoint (chrome.cloudflare-dns.com, dns.google) and connects to
 * it directly from the real IP, outside any account proxy.
 *
 * These feature names are a second layer for the app's own Chromium (Electron 17 = Chromium 98)
 * next to app.configureHostResolver, which is the documented control. They are NOT used for the
 * account browsers: on Chromium 154 neither name changes the secure DNS setting (measured), so
 * those are handled by a profile preference instead (SteamAccount/Chrome/secureDnsPref.ts).
 */
export const SECURE_DNS_FEATURES: readonly string[] = ["DnsOverHttps", "DnsOverHttpsUpgrade"];

/** "A,B" + "B,C" + ["D"] -> "A,B,C,D": order kept, duplicates and empty entries dropped. */
export function mergeFeatureLists(...lists: Array<string | readonly string[] | null | undefined>): string {
    const merged: string[] = [];
    for (const list of lists) {
        const items = typeof list === "string" ? list.split(",") : list ?? [];
        for (const item of items) {
            const name = item.trim();
            if (name && !merged.includes(name)) merged.push(name);
        }
    }
    return merged.join(",");
}
