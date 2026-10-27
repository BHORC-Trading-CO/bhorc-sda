import fs from "fs";
import path from "path";

// Секреты (пароли, maFile, сессии, PIN, коды, прокси с паролями) не должны попадать в консоль:
// её видно в терминале main-процесса и в DevTools любого окна (в сборке тоже).
// Два уровня защиты:
// 1. console во всех процессах обёрнут redactSecrets — проверяем, что обёртка подключена
//    первым импортом во всех точках входа;
// 2. прямой лог переменных, в которых обычно лежат секреты, запрещён в electron/ и src/.
//    Осознанное исключение помечается строкой "secret-log-ok" прямо над вызовом.
const ROOT = path.join(__dirname, "../..");
const SECRET_NAMES = [
    "key", "secretKey", "pin", "code", "password", "session", "newSession", "cookies",
    "maFile", "rawMaFile", "sMaFile", "smaFile", "steamAccount", "steamAccounts", "steamAccountParams",
    "thisAccount", "confirmations", "proxy", "proxies", "proxyData", "newProxy", "activeProxy",
    "compiledObjects", "proxiesByPage", "steamAccountsByPage",
];
const CONSOLE_CALL = /console\.(log|info|warn|error|debug|trace)\(([^;]*)\)/;
const BARE_SECRET = new RegExp(`(^|[\\s,(])(?:[\\w$]+\\.)*(${SECRET_NAMES.join("|")})(?=\\s*(,|\\)|$))`);

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== "__tests__" && entry.name !== "node_modules") walk(full, out);
        } else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

describe("секреты не логируются", () => {
    it("обёртка console подключена первым импортом во всех точках входа", () => {
        const entries = [
            "electron/main.ts",
            "electron/bridges/mainBridge.ts",
            "electron/bridges/askFamilyPinBridge.ts",
            "electron/bridges/confirmationsBridge.ts",
            "electron/bridges/errorWindowBridge.ts",
            "src/index.tsx",
        ];
        for (const entry of entries) {
            const imports = fs.readFileSync(path.join(ROOT, entry), "utf8").split("\n").filter((l) => /^import\s/.test(l));
            const idx = imports.findIndex((l) => l.includes("installConsoleRedaction"));
            // В main.ts первым идёт закрепление папки данных (dataDir), обёртка — сразу за ним.
            const allowed = entry === "electron/main.ts" ? imports.slice(0, 2) : imports.slice(0, 1);
            expect({ entry, ok: idx >= 0 && allowed.some((l) => l.includes("installConsoleRedaction")) }).toEqual({ entry, ok: true });
        }
    });

    it("в electron/ и src/ нет console.* с переменными, где лежат секреты", () => {
        const offenders: string[] = [];
        for (const file of [...walk(path.join(ROOT, "electron")), ...walk(path.join(ROOT, "src"))]) {
            const lines = fs.readFileSync(file, "utf8").split("\n");
            lines.forEach((line, i) => {
                if (line.trim().startsWith("//")) return;
                const call = line.match(CONSOLE_CALL);
                if (!call) return;
                const args = call[2].replace(/`[^`]*`|"[^"]*"|'[^']*'/g, "\"\"");
                if (!BARE_SECRET.test(args)) return;
                if (i > 0 && lines[i - 1].includes("secret-log-ok")) return;
                offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});
