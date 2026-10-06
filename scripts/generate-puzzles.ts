/**
 * Generates daily and practice puzzles from the newest set in data/sets.
 * Daily puzzles are append-only: existing puzzles are never changed unless
 * you ask for it, so the archive stays stable.
 *
 *   npm run puzzles:generate                       # top up daily puzzles, create practice pool if missing
 *   npm run puzzles:generate -- --from 2026-12-10  # new set launched: regenerate daily puzzles from that date (or a puzzle number)
 *   npm run puzzles:generate -- --practice         # rebuild the practice pool
 *   npm run puzzles:generate -- --reset            # regenerate every daily puzzle (only before launch!)
 *   npm run puzzles:generate -- --days 120         # how far ahead of today to generate
 */
import fs from "node:fs";
import path from "node:path";
import type { Puzzle, PuzzleFile, PuzzleKind } from "../shared/types.ts";
import { isISODate, localISODate, puzzleNumberForDate } from "../shared/dates.ts";
import { buildCategoryPool } from "./lib/categories.ts";
import { createContext, generatePuzzle } from "./lib/generator.ts";
import { PUZZLES_DIR, SITE_CONFIG, latestSetNumber, parseArgs, readJson, setDir, writeJson } from "./lib/paths.ts";
import type { SetData } from "./lib/set-types.ts";

interface SiteConfig {
  launchDate: string;
  puzzles: { dailyDaysAhead: number; practiceCount: number };
}

const args = parseArgs(process.argv.slice(2));
const config = readJson<SiteConfig>(SITE_CONFIG);
const setNumber = typeof args.set === "string" ? Number(args.set) : latestSetNumber();
const set = readJson<SetData>(path.join(setDir(setNumber), "set.json"));

const { pool, issues } = buildCategoryPool(set);
for (const issue of issues) console[issue.level === "error" ? "error" : "warn"](`${issue.level}: ${issue.message}`);
if (issues.some((i) => i.level === "error")) process.exit(1);
const ctx = createContext(set, pool);
console.log(`Set ${set.set} (${set.name}): ${pool.length} categories, ${set.champions.length} champions.`);

function readPuzzles(kind: PuzzleKind): Puzzle[] {
  const file = path.join(PUZZLES_DIR, `${kind}.json`);
  if (!fs.existsSync(file)) return [];
  return readJson<PuzzleFile>(file).puzzles;
}

function save(kind: PuzzleKind, puzzles: Puzzle[]): void {
  const file: PuzzleFile = { version: 1, kind, generatedAt: new Date().toISOString(), puzzles };
  writeJson(path.join(PUZZLES_DIR, `${kind}.json`), file);
}

function extend(kind: PuzzleKind, existing: Puzzle[], targetCount: number): Puzzle[] {
  const puzzles = [...existing];
  const started = Date.now();
  for (let id = puzzles.length + 1; id <= targetCount; id++) {
    puzzles.push(
      generatePuzzle(ctx, { id, kind, seed: `${kind}-${id}-set${set.set}`, recent: puzzles.slice(-30) })
    );
    if (id % 50 === 0) console.log(`  ${kind} #${id} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  return puzzles;
}

// ---- Daily ----
let daily = readPuzzles("daily");
daily.forEach((p, i) => {
  if (p.id !== i + 1) throw new Error(`daily.json is not contiguous at index ${i} (id ${p.id}).`);
});
if (args.reset) {
  console.log("Resetting all daily puzzles.");
  daily = [];
}
if (typeof args.from === "string") {
  const fromId = isISODate(args.from) ? puzzleNumberForDate(config.launchDate, args.from) : Number(args.from);
  if (!Number.isInteger(fromId) || fromId < 1) throw new Error(`Invalid --from value "${args.from}".`);
  console.log(`Regenerating daily puzzles from #${fromId}.`);
  daily = daily.filter((p) => p.id < fromId);
}
const todayNumber = Math.max(1, puzzleNumberForDate(config.launchDate, localISODate()));
const daysAhead = typeof args.days === "string" ? Number(args.days) : config.puzzles.dailyDaysAhead;
const dailyTarget = todayNumber + daysAhead;
if (daily.length < dailyTarget) {
  const before = daily.length;
  daily = extend("daily", daily, dailyTarget);
  save("daily", daily);
  console.log(`Daily: generated #${before + 1}-#${dailyTarget} (today is #${todayNumber}).`);
} else {
  console.log(`Daily: ${daily.length} puzzles already cover today (#${todayNumber}) + ${daysAhead} days.`);
}

// ---- Practice ----
const practice = readPuzzles("practice");
const practiceStale = practice.length > 0 && practice.some((p) => p.set !== set.set);
if (args.practice || !practice.length || practiceStale || practice.length < config.puzzles.practiceCount) {
  const keep = args.practice || practiceStale ? [] : practice;
  const next = extend("practice", keep, config.puzzles.practiceCount);
  save("practice", next);
  console.log(`Practice: ${next.length} puzzles${practiceStale ? " (rebuilt for the new set)" : ""}.`);
} else {
  console.log(`Practice: ${practice.length} puzzles, nothing to do.`);
}

// ---- Usage summary ----
const usage = new Map<string, number>();
for (const p of daily.slice(Math.max(0, todayNumber - 1))) {
  for (const g of p.groups) usage.set(g.category, (usage.get(g.category) ?? 0) + 1);
}
const unused = pool.filter((c) => !usage.has(c.id)).map((c) => c.id);
console.log(
  `Upcoming daily puzzles use ${usage.size}/${pool.length} categories.` +
    (unused.length ? ` Never used: ${unused.join(", ")}` : "")
);
