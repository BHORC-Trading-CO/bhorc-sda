import { mergeFeatureLists, SECURE_DNS_FEATURES } from "../chromiumFeatures";

const DOH = "DnsOverHttps,DnsOverHttpsUpgrade";

describe("mergeFeatureLists", () => {
    it("adds the DoH features to an empty or missing list", () => {
        expect(mergeFeatureLists("", SECURE_DNS_FEATURES)).toBe(DOH);
        expect(mergeFeatureLists(undefined, SECURE_DNS_FEATURES)).toBe(DOH);
        expect(mergeFeatureLists(null, SECURE_DNS_FEATURES)).toBe(DOH);
    });

    it("extends an existing list instead of replacing it, keeping its order", () => {
        expect(mergeFeatureLists("Translate,MediaRouter", SECURE_DNS_FEATURES)).toBe(`Translate,MediaRouter,${DOH}`);
    });

    it("drops duplicates, blanks and stray spaces", () => {
        expect(mergeFeatureLists(" A ,,DnsOverHttps,", "A,B", ["DnsOverHttps", " ", "C"])).toBe("A,DnsOverHttps,B,C");
    });
});
