/**
 * Checks every generated puzzle: structure, images on disk and (for puzzles
 * of a set we still have data for) that there is exactly one solution and no
 * champion fits two groups. Exits with code 1 if an upcoming puzzle is broken.
 */
import fs from "node:fs";
import path from "node:path";
import type { PuzzleFile, PuzzleKind } from "../shared/types.ts";
import { localISODate, puzzleNumberForDate } from "../shared/dates.ts";
import { type Category, buildCategoryPool } from "./lib/categories.ts";
import { checkPuzzle } from "./lib/validate.ts";
import { PUBLIC_DIR, PUZZLES_DIR, SITE_CONFIG, readJson, setDir } from "./lib/paths.ts";
import type { SetData } from "./lib/set-types.ts";

const config = readJson<{ launchDate: string }>(SITE_CONFIG);
const todayNumber = puzzleNumberForDate(config.launchDate, localISODate());
const pools = new Map<number, Category[] | null>();

function poolFor(set: number): Category[] | null {
  if (!pools.has(set)) {
    const file = path.join(setDir(set), "set.json");
    pools.set(set, fs.existsSync(file) ? buildCategoryPool(readJson<SetData>(file)).pool : null);
  }
  return pools.get(set)!;
}

let failures = 0;
let warnings = 0;
for (const kind of ["daily", "practice"] as PuzzleKind[]) {
  const file = path.join(PUZZLES_DIR, `${kind}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`${kind}.json not found - run \`npm run puzzles:generate\`.`);
    failures++;
    continue;
  }
  const { puzzles } = readJson<PuzzleFile>(file);
  let checked = 0;
  for (const p of puzzles) {
    const isPast = kind === "daily" && p.id < todayNumber;
    const result = checkPuzzle(p, poolFor(p.set) ?? undefined);
    for (const c of Object.values(p.champions)) {
      if (!fs.existsSync(path.join(PUBLIC_DIR, c.img))) result.problems.push(`image missing: ${c.img}`);
    }
    for (const w of result.warnings) {
      warnings++;
      console.warn(`  ${kind} #${p.id}: ${w}`);
    }
    if (result.problems.length) {
      const label = isPast ? "warning (already played)" : "ERROR";
      console[isPast ? "warn" : "error"](`  ${kind} #${p.id} ${label}: ${result.problems.join("; ")}`);
      if (isPast) warnings++;
      else failures++;
    }
    if (result.crossFits?.length) {
      // Fixing this means swapping the puzzle, so released dailies (today's included) only warn.
      const released = kind === "daily" && p.id <= todayNumber;
      const label = released ? "warning (already released)" : "ERROR";
      console[released ? "warn" : "error"](`  ${kind} #${p.id} ${label}: ${result.crossFits.join("; ")}`);
      if (released) warnings++;
      else failures++;
    }
    checked++;
  }
  console.log(`${kind}: checked ${checked} puzzles.`);
}

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log(`\nAll upcoming puzzles are valid${warnings ? ` (${warnings} warning(s))` : ""}.`);
