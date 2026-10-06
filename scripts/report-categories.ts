/**
 * Prints the category pool for review: members, ambiguous champions,
 * conflicts, and champions whose ability text matches a category's
 * abilityPattern but who aren't listed (possible omissions).
 *
 *   npm run categories:report [-- --set 18]
 */
import path from "node:path";
import { buildCategoryPool, categoriesConflict } from "./lib/categories.ts";
import { latestSetNumber, parseArgs, readJson, setDir } from "./lib/paths.ts";
import type { SetData } from "./lib/set-types.ts";

const args = parseArgs(process.argv.slice(2));
const setNumber = typeof args.set === "string" ? Number(args.set) : latestSetNumber();
const set = readJson<SetData>(path.join(setDir(setNumber), "set.json"));
const { pool, issues } = buildCategoryPool(set);
const name = new Map(set.champions.map((c) => [c.id, c.name]));
const names = (ids: string[]) => ids.map((id) => name.get(id) ?? `?${id}`).join(", ");

console.log(`Set ${set.set} (${set.name}) - ${pool.length} categories\n`);
for (const issue of issues) console.log(`${issue.level.toUpperCase()}: ${issue.message}`);

for (const cat of [...pool].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))) {
  console.log(`\n[${cat.kind}] ${cat.id}  levels ${cat.levels.join("/")}  (${cat.members.length})  "${cat.title}"`);
  console.log(`   members:   ${names(cat.members)}`);
  if (cat.ambiguous.length) console.log(`   ambiguous: ${names(cat.ambiguous)}`);
  if (cat.abilityPattern) {
    const re = new RegExp(cat.abilityPattern, "i");
    const unlisted = set.champions.filter(
      (c) => re.test(c.ability.text) && !cat.members.includes(c.id) && !cat.ambiguous.includes(c.id)
    );
    if (unlisted.length) console.log(`   ⚠ ability text also matches: ${unlisted.map((c) => c.name).join(", ")}`);
    const missing = cat.members.filter((id) => !cat.notes[id]);
    if (missing.length) console.log(`   (no matching sentence for: ${names(missing)})`);
  }
  const clashes = pool.filter((o) => o.id !== cat.id && categoriesConflict(cat, o)).map((o) => o.id);
  if (clashes.length) console.log(`   conflicts: ${clashes.join(", ")}`);
}

const coverage = new Map(set.champions.map((c) => [c.id, 0]));
for (const cat of pool) for (const m of cat.members) coverage.set(m, (coverage.get(m) ?? 0) + 1);
const thin = [...coverage].filter(([, n]) => n <= 2).map(([id, n]) => `${name.get(id)} (${n})`);
console.log(`\nChampions in 2 or fewer categories: ${thin.join(", ") || "none"}`);
