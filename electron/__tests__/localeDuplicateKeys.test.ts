import fs from "fs";
import path from "path";

// Слияние двух веток молча оставляет в JSON один и тот же ключ дважды: действует последний,
// и текст другой ветки пропадает без ошибки.
const files = ["electron/locales", "src/locales"].flatMap((dir) =>
    fs.readdirSync(path.join(process.cwd(), dir)).flatMap((lng) =>
        fs.readdirSync(path.join(process.cwd(), dir, lng)).map((name) => `${dir}/${lng}/${name}`)))
    .filter((file) => file.endsWith(".json"));

const countKeys = (value: unknown): number =>
    value && typeof value === "object" ? Object.values(value).reduce<number>((sum, item) => sum + 1 + countKeys(item), 0) : 0;

it.each(files)("%s: нет повторяющихся ключей", (file) => {
    const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const lines = text.match(/^\s*"(?:[^"\\]|\\.)+"\s*:/gm) || [];
    expect(lines.length).toBe(countKeys(JSON.parse(text)));
});
