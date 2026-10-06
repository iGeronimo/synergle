import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA_DIR = path.join(ROOT, "data");
export const SETS_DIR = path.join(DATA_DIR, "sets");
export const PUZZLES_DIR = path.join(DATA_DIR, "puzzles");
export const PUBLIC_DIR = path.join(ROOT, "src", "public");
export const CACHE_DIR = path.join(ROOT, ".cache");
export const SITE_CONFIG = path.join(ROOT, "site.config.json");

export function setDir(set: number): string {
  return path.join(SETS_DIR, String(set));
}

/** Highest set number that has data in data/sets/<n>/set.json. */
export function latestSetNumber(): number {
  if (!fs.existsSync(SETS_DIR)) throw new Error("No set data yet. Run `npm run data:update` first.");
  const sets = fs
    .readdirSync(SETS_DIR)
    .filter((d) => /^\d+$/.test(d) && fs.existsSync(path.join(SETS_DIR, d, "set.json")))
    .map(Number);
  if (!sets.length) throw new Error("No set data yet. Run `npm run data:update` first.");
  return Math.max(...sets);
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/** Tiny `--flag value` / `--flag` argument parser. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) out[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}
