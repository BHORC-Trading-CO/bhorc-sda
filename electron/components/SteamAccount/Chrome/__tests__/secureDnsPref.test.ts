import fs from "fs";
import os from "os";
import path from "path";

import { ensureSecureDnsOff, LOCAL_STATE_FILE, withSecureDnsOff, writeLocalState } from "../secureDnsPref";

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

// Повторное ревью: отменённый запуск дописывал свои файлы уже после того, как новый запуск
// выставил настройку. Поэтому любая запись Local State идёт через writeLocalState.
describe("writeLocalState - единственный писатель Local State", () => {
  const dirs: string[] = [];
  const makeProfile = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sda-local-state-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });
  const read = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, LOCAL_STATE_FILE), "utf8"));

  it("стартовый шаблон нового профиля ложится на диск уже с выключенным DoH", async () => {
    const dir = makeProfile();
    await writeLocalState(dir, JSON.stringify({ profile: { info_cache: { Default: { name: "acc" } } } }));
    expect(read(dir)).toEqual({ profile: { info_cache: { Default: { name: "acc" } } }, dns_over_https: { mode: "off" } });
  });

  it("запоздавшая запись шаблона отменённым запуском не включает DoH обратно", async () => {
    const dir = makeProfile();
    // Новый запуск уже выставил настройку…
    await ensureSecureDnsOff(dir);
    // …и тут отменённый старый дописывает свой шаблон (без dns_over_https).
    await writeLocalState(dir, JSON.stringify({ browser: { shortcut_migration_version: "109.0.5412.0" } }));
    expect(read(dir).dns_over_https).toEqual({ mode: "off" });
  });

  it("две записи разом не портят файл друг другу: итог — целый JSON с выключенным DoH", async () => {
    const dir = makeProfile();
    const big = JSON.stringify({ filler: "x".repeat(200000), dns_over_https: { mode: "automatic" } });
    await Promise.all([
      writeLocalState(dir, big),
      writeLocalState(dir, JSON.stringify({ small: true })),
      ensureSecureDnsOff(dir),
      writeLocalState(dir, big),
    ]);
    expect(read(dir).dns_over_https).toEqual({ mode: "off" });
    expect(fs.readdirSync(dir)).toEqual([LOCAL_STATE_FILE]); // временных файлов не осталось
  });

  it("при ошибке записи временный файл убирается, ошибка пробрасывается", async () => {
    const dir = makeProfile();
    fs.mkdirSync(path.join(dir, LOCAL_STATE_FILE)); // rename файла поверх папки не пройдёт
    await expect(writeLocalState(dir, "{}")).rejects.toBeTruthy();
    expect(fs.readdirSync(dir)).toEqual([LOCAL_STATE_FILE]);
  });

  it("никакой другой код приложения не пишет Local State в обход writeLocalState", () => {
    const root = path.resolve(__dirname, "..", "..", "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__" && entry.name !== "node_modules") walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !full.endsWith(path.join("Chrome", "secureDnsPref.ts"))) {
          // Имя файла профиля в коде есть только у того, кто его пишет или читает напрямую.
          if (/["'`/]Local State["'`]/.test(fs.readFileSync(full, "utf8"))) offenders.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
