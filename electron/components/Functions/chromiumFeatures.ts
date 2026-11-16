// Chromium reads --disable-features as one comma-separated list; a repeated switch is not merged,
// the last value wins (Electron's appendSwitch also replaces the value). Every place that disables
// features therefore extends the list that is already there instead of setting a new one,
// otherwise the features disabled earlier come back on.

export const DISABLE_FEATURES_SWITCH = "disable-features";
const DISABLE_FEATURES_PREFIX = `--${DISABLE_FEATURES_SWITCH}=`;

/**
 * DNS-over-HTTPS. When the system resolver is a DoH provider (1.1.1.1, 8.8.8.8), Chromium
 * upgrades lookups to its DoH endpoint (chrome.cloudflare-dns.com, dns.google) and connects to
 * it directly from the real IP, outside any account proxy.
 */
export const SECURE_DNS_FEATURES: readonly string[] = ["DnsOverHttps"];

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

function isDisableFeaturesArg(arg: string): boolean {
    return arg.startsWith(DISABLE_FEATURES_PREFIX);
}

/**
 * puppeteer.launch puts its own default args (with its own --disable-features=...) before ours,
 * so a second --disable-features from us would switch its features back on. Folds every
 * --disable-features from the defaults and from args into one flag at the end of args and
 * returns the default flags to pass in ignoreDefaultArgs.
 */
export function foldDisableFeaturesArgs(defaultArgs: readonly string[], args: readonly string[]): { args: string[]; ignoreDefaultArgs: string[] } {
    const own = args.filter(isDisableFeaturesArg);
    if (!own.length) return { args: [...args], ignoreDefaultArgs: [] };
    const defaults = defaultArgs.filter(isDisableFeaturesArg);
    const merged = DISABLE_FEATURES_PREFIX + mergeFeatureLists(...[...defaults, ...own].map((arg) => arg.slice(DISABLE_FEATURES_PREFIX.length)));
    return {
        args: [...args.filter((arg) => !isDisableFeaturesArg(arg)), merged],
        // puppeteer drops ignored args by exact string from our args too: never ignore the merged flag itself.
        ignoreDefaultArgs: defaults.filter((arg) => arg !== merged),
    };
}
