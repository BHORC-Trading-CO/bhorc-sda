import Chrome from "../Chrome";

function makeChrome(id: string) {
  const params = {
    id,
    secondary: { nickname: "nick", avatarUrl: "" },
  } as any;
  return new Chrome(params);
}

describe("Chrome.accountFingerprint — стабильный per-account отпечаток (MEDIUM-1)", () => {
  it("детерминирован по id (одинаков между инстансами)", () => {
    const a1 = (makeChrome("acc-AAA") as any).accountFingerprint();
    const a2 = (makeChrome("acc-AAA") as any).accountFingerprint();
    expect(a1).toEqual(a2);
  });

  it("значения в допустимых диапазонах", () => {
    const fp = (makeChrome("acc-XYZ") as any).accountFingerprint();
    expect([4, 8, 12, 16]).toContain(fp.hardwareConcurrency);
    expect([8, 16]).toContain(fp.deviceMemory);
  });

  it("разные аккаунты дают разные отпечатки (хотя бы по одному из полей)", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const fps = ids.map((id) => (makeChrome(id) as any).accountFingerprint());
    const distinct = new Set(fps.map((f: any) => `${f.hardwareConcurrency}/${f.deviceMemory}`));
    // Не должны все 8 аккаунтов оказаться идентичными.
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe("Chrome.generateChromeFlags — anti-leak флаги (MEDIUM-3 + privacy)", () => {
  it("содержит WebRTC/QUIC/фоновые анти-лик флаги", () => {
    const chrome = makeChrome("acc-1");
    const flags = chrome.generateChromeFlags();
    expect(flags).toEqual(
      expect.arrayContaining([
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--enforce-webrtc-ip-permission-check",
        "--disable-quic",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-domain-reliability",
        "--no-pings",
        "--dns-prefetch-disable",
      ])
    );
  });

  it("при наличии прокси добавляет --proxy-server", () => {
    const chrome = makeChrome("acc-2");
    chrome.proxy = { server: "1.2.3.4:8080", username: "u", password: "p" };
    expect(chrome.generateChromeFlags()).toContain("--proxy-server=1.2.3.4:8080");
  });

  it("при заданной локали добавляет --lang", () => {
    const chrome = makeChrome("acc-3");
    chrome.locale = "uk-UA";
    expect(chrome.generateChromeFlags()).toContain("--lang=uk-UA");
  });
});
