// SDA-26: the app's own network service must not use DNS-over-HTTPS (it connected to
// chrome.cloudflare-dns.com from the real IP). Here only the wiring is checked; that no DoH
// connection leaves a packaged build is a separate check on the packaged app.
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { disableSecureDns } from "../secureDns";

function fakeApp(existing: string, ready = false) {
    const switches = new Map<string, string>();
    if (existing) switches.set("disable-features", existing);
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
        switches,
        commandLine: {
            getSwitchValue: jest.fn((name: string) => switches.get(name) ?? ""),
            // As in Electron: appending a switch again replaces its value.
            appendSwitch: jest.fn((name: string, value?: string) => { switches.set(name, value ?? ""); }),
        },
        configureHostResolver: jest.fn(),
        isReady: () => ready,
    });
}

it("adds the DoH features to --disable-features before ready and turns DoH off on ready", () => {
    const app = fakeApp("");
    disableSecureDns(app as any);
    expect(app.switches.get("disable-features")).toBe("DnsOverHttps,DnsOverHttpsUpgrade");
    expect(app.configureHostResolver).not.toHaveBeenCalled();
    app.emit("ready");
    app.emit("ready");
    expect(app.configureHostResolver).toHaveBeenCalledTimes(1);
    expect(app.configureHostResolver).toHaveBeenCalledWith({ secureDnsMode: "off" });
});

it("extends a --disable-features already given on the command line instead of overwriting it", () => {
    const app = fakeApp("CalculateNativeWinOcclusion,Translate");
    disableSecureDns(app as any);
    expect(app.commandLine.appendSwitch).toHaveBeenCalledTimes(1);
    expect(app.switches.get("disable-features")).toBe("CalculateNativeWinOcclusion,Translate,DnsOverHttps,DnsOverHttpsUpgrade");
});

it("does not duplicate a feature that is already disabled", () => {
    const app = fakeApp("DnsOverHttps");
    disableSecureDns(app as any);
    expect(app.switches.get("disable-features")).toBe("DnsOverHttps,DnsOverHttpsUpgrade");
});

it("configures the resolver at once if the app is already ready", () => {
    const app = fakeApp("", true);
    disableSecureDns(app as any);
    expect(app.configureHostResolver).toHaveBeenCalledWith({ secureDnsMode: "off" });
});

it("main.ts turns DoH off before firstStage can create a window, and dataDir stays the first import", () => {
    const main = fs.readFileSync(path.resolve(__dirname, "../../../main.ts"), "utf8");
    expect(main).toMatch(/^import ["']\.\/dataDir["'];/);
    expect(main).toMatch(/^disableSecureDns\(\);$/m);
    expect(main.indexOf("disableSecureDns();")).toBeLessThan(main.indexOf("application.firstStage("));
});
