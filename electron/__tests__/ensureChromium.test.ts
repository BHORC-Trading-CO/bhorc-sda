const { ensureChromium, MAX_ATTEMPTS } = require("../../scripts/ensureChromium");

// SDA-30: postinstall пакета chromium глотает ошибку скачивания, npm install остаётся зелёным.
describe("ensureChromium", () => {
  const quiet = () => undefined;

  /** Пакет chromium, у которого бинарник появляется после N-й установки (0 = есть сразу). */
  function fakeChromium(appearsAfterInstalls: number | null, installImpl?: () => Promise<void>) {
    let installs = 0;
    const install = jest.fn(async () => {
      installs += 1;
      if (installImpl) await installImpl();
    });
    return {
      get path() {
        return appearsAfterInstalls !== null && installs >= appearsAfterInstalls ? "/fake/chrome.exe" : undefined;
      },
      install,
    };
  }

  it("бинарник на месте: ничего не качает", async () => {
    const chromium = fakeChromium(0);
    const result = await ensureChromium({ platform: "win32", arch: "x64", chromium, log: quiet });

    expect(result).toEqual({ ok: true, path: "/fake/chrome.exe", attempts: 0 });
    expect(chromium.install).not.toHaveBeenCalled();
  });

  it("бинарника нет: докачивает и проверяет результат", async () => {
    const chromium = fakeChromium(1);
    const result = await ensureChromium({ platform: "win32", arch: "x64", chromium, log: quiet });

    expect(result).toEqual({ ok: true, path: "/fake/chrome.exe", attempts: 1 });
    expect(chromium.install).toHaveBeenCalledTimes(1);
  });

  it("install молча не справился (как у node-chromium): пробует ещё и в итоге сообщает о провале", async () => {
    const chromium = fakeChromium(null);
    const result = await ensureChromium({ platform: "linux", arch: "x64", chromium, log: quiet });

    expect(result).toEqual({ ok: false, attempts: MAX_ATTEMPTS });
    expect(chromium.install).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("исключение из install не роняет проверку, следующая попытка идёт", async () => {
    let calls = 0;
    const chromium = fakeChromium(2, async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket hang up");
    });
    const result = await ensureChromium({ platform: "win32", arch: "x64", chromium, log: quiet });

    expect(result).toEqual({ ok: true, path: "/fake/chrome.exe", attempts: 2 });
  });

  it("на darwin/arm64 бинарник из пакета не нужен: не проверяет и не качает", async () => {
    const chromium = fakeChromium(null);
    const result = await ensureChromium({ platform: "darwin", arch: "arm64", chromium, log: quiet });

    expect(result).toEqual({ ok: true, skipped: true, attempts: 0 });
    expect(chromium.install).not.toHaveBeenCalled();
  });
});
