import fs from "fs";
import os from "os";
import path from "path";

import { ensureSecureDnsOff, LOCAL_STATE_FILE, withSecureDnsOff } from "../secureDnsPref";

// SDA-26: DNS-over-HTTPS в браузере аккаунта шёл бы мимо прокси. Выключается настройкой профиля.
describe("withSecureDnsOff", () => {
  it("пустой или отсутствующий файл: только выключенный secure DNS", () => {
    expect(JSON.parse(withSecureDnsOff(null))).toEqual({ dns_over_https: { mode: "off" } });
    expect(JSON.parse(withSecureDnsOff(""))).toEqual({ dns_over_https: { mode: "off" } });
  });

  it("остальные настройки профиля не трогает", () => {
    const before = { browser: { enabled_labs_experiments: ["x"] }, profile: { info_cache: { Default: { name: "acc" } } } };
    expect(JSON.parse(withSecureDnsOff(JSON.stringify(before)))).toEqual({ ...before, dns_over_https: { mode: "off" } });
  });

  it.each(["automatic", "secure"])("режим %s, включённый пользователем или по умолчанию, выключается", (mode) => {
    const before = { dns_over_https: { mode, templates: "https://dns.example/dns-query" } };
    expect(JSON.parse(withSecureDnsOff(JSON.stringify(before))).dns_over_https).toEqual({
      mode: "off",
      templates: "https://dns.example/dns-query",
    });
  });

  it("уже выключенный режим даёт тот же текст: лишней записи не будет", () => {
    const text = JSON.stringify({ a: 1, dns_over_https: { mode: "off" } });
    expect(withSecureDnsOff(text)).toBe(text);
  });

  it.each(["{not json", "[1,2]", "null", "\"text\"", '{"dns_over_https":"automatic"}'])(
    "битое или не то по форме содержимое (%s) не роняет запуск",
    (text) => {
      expect(JSON.parse(withSecureDnsOff(text)).dns_over_https).toEqual({ mode: "off" });
    }
  );
});

describe("ensureSecureDnsOff", () => {
  const dirs: string[] = [];
  const makeProfile = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sda-secure-dns-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });
  const read = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, LOCAL_STATE_FILE), "utf8"));

  it("в существующем профиле выключает secure DNS и сохраняет остальное", async () => {
    const dir = makeProfile();
    fs.writeFileSync(path.join(dir, LOCAL_STATE_FILE), JSON.stringify({ os_crypt: { encrypted_key: "k" }, dns_over_https: { mode: "automatic" } }));

    await ensureSecureDnsOff(dir);

    expect(read(dir)).toEqual({ os_crypt: { encrypted_key: "k" }, dns_over_https: { mode: "off" } });
    expect(fs.readdirSync(dir)).toEqual([LOCAL_STATE_FILE]); // временный файл не остался
  });

  it("профиль без Local State и даже без папки получает файл с выключенным secure DNS", async () => {
    const dir = path.join(makeProfile(), "fresh profile");

    await ensureSecureDnsOff(dir);

    expect(read(dir)).toEqual({ dns_over_https: { mode: "off" } });
  });

  it("если всё уже выключено, файл не переписывается", async () => {
    const dir = makeProfile();
    const file = path.join(dir, LOCAL_STATE_FILE);
    fs.writeFileSync(file, JSON.stringify({ dns_over_https: { mode: "off" } }));
    const before = fs.statSync(file).mtimeMs;

    await ensureSecureDnsOff(dir);

    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it("ошибку чтения, отличную от «файла нет», пробрасывает: без настройки браузер запускать нельзя", async () => {
    const dir = makeProfile();
    fs.mkdirSync(path.join(dir, LOCAL_STATE_FILE)); // на месте файла папка

    await expect(ensureSecureDnsOff(dir)).rejects.toBeTruthy();
  });
});
