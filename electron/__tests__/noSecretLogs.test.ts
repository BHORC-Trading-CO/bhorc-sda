import fs from "fs";
import path from "path";

// Секреты (maFile, пароли, сессии, ключ шифрования, PIN) не должны попадать в консоль:
// её видно в терминале, в DevTools и в любом сборщике логов. Ловим прямой лог таких
// переменных. Осознанное исключение помечается строкой "secret-log-ok" прямо над вызовом.
const SECRET_ARG = /console\.(log|info|warn|error|debug)\(\s*(key|secretKey|pin|password|session|newSession|maFile|rawMaFile|sMaFile|smaFile|confirmations|params\.steamAccount|this\.params(\.maFile)?|steamAccountParams)\s*\)/;

describe("секреты не логируются", () => {
    it("в electron/ нет console.* с секретами", () => {
        const root = path.join(__dirname, "..");
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== "__tests__") walk(full);
                    continue;
                }
                if (!/\.tsx?$/.test(entry.name)) continue;
                const lines = fs.readFileSync(full, "utf8").split("\n");
                lines.forEach((line, i) => {
                    if (line.trim().startsWith("//")) return;
                    if (!SECRET_ARG.test(line)) return;
                    if (i > 0 && lines[i - 1].includes("secret-log-ok")) return;
                    offenders.push(`${path.relative(root, full)}:${i + 1}: ${line.trim()}`);
                });
            }
        };
        walk(root);
        expect(offenders).toEqual([]);
    });
});
