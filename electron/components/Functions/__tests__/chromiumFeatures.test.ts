import { foldDisableFeaturesArgs, mergeFeatureLists, SECURE_DNS_FEATURES } from "../chromiumFeatures";

const PUPPETEER_DEFAULTS = [
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints",
    "--enable-features=NetworkServiceInProcess2",
];

describe("mergeFeatureLists", () => {
    it("adds DoH to an empty or missing list", () => {
        expect(mergeFeatureLists("", SECURE_DNS_FEATURES)).toBe("DnsOverHttps");
        expect(mergeFeatureLists(undefined, SECURE_DNS_FEATURES)).toBe("DnsOverHttps");
        expect(mergeFeatureLists(null, SECURE_DNS_FEATURES)).toBe("DnsOverHttps");
    });

    it("extends an existing list instead of replacing it, keeping its order", () => {
        expect(mergeFeatureLists("Translate,MediaRouter", SECURE_DNS_FEATURES)).toBe("Translate,MediaRouter,DnsOverHttps");
    });

    it("drops duplicates, blanks and stray spaces", () => {
        expect(mergeFeatureLists(" A ,,DnsOverHttps,", "A,B", ["DnsOverHttps", " ", "C"])).toBe("A,DnsOverHttps,B,C");
    });
});

describe("foldDisableFeaturesArgs", () => {
    it("folds puppeteer's default --disable-features and ours into one flag and ignores the default one", () => {
        const folded = foldDisableFeaturesArgs(PUPPETEER_DEFAULTS, ["--disable-quic", "--disable-features=DnsOverHttps", "--lang=uk-UA"]);
        expect(folded.args).toEqual([
            "--disable-quic",
            "--lang=uk-UA",
            "--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,DnsOverHttps",
        ]);
        expect(folded.ignoreDefaultArgs).toEqual([PUPPETEER_DEFAULTS[2]]);
    });

    it("leaves exactly one --disable-features in what Chrome receives", () => {
        const folded = foldDisableFeaturesArgs(PUPPETEER_DEFAULTS, ["--disable-features=DnsOverHttps", "--disable-features=Foo"]);
        // What puppeteer 19 passes to Chrome: defaults minus ignoreDefaultArgs, then our args.
        const chromeArgs = [...PUPPETEER_DEFAULTS.filter((arg) => !folded.ignoreDefaultArgs.includes(arg)), ...folded.args];
        const disable = chromeArgs.filter((arg) => arg.startsWith("--disable-features="));
        expect(disable).toEqual(["--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,DnsOverHttps,Foo"]);
        // --enable-features is a different switch and stays as it is.
        expect(chromeArgs).toContain("--enable-features=NetworkServiceInProcess2");
    });

    it("never ignores the merged flag itself when puppeteer already disables the same features", () => {
        const defaults = ["--disable-features=Translate,DnsOverHttps"];
        const folded = foldDisableFeaturesArgs(defaults, ["--disable-features=DnsOverHttps"]);
        expect(folded.args).toEqual(["--disable-features=Translate,DnsOverHttps"]);
        // puppeteer filters ignored args from our args too, by exact string.
        expect(folded.ignoreDefaultArgs).toEqual([]);
    });

    it("without our --disable-features nothing changes", () => {
        const args = ["--disable-quic"];
        expect(foldDisableFeaturesArgs(PUPPETEER_DEFAULTS, args)).toEqual({ args: ["--disable-quic"], ignoreDefaultArgs: [] });
    });

    it("works when puppeteer has no --disable-features of its own", () => {
        expect(foldDisableFeaturesArgs(["--headless"], ["--disable-features=DnsOverHttps"])).toEqual({
            args: ["--disable-features=DnsOverHttps"],
            ignoreDefaultArgs: [],
        });
    });
});
