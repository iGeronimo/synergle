import fs from "node:fs";

const root = new URL("../../", import.meta.url);
const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, root), "utf8"));
const exists = (rel) => fs.existsSync(new URL(rel, root));

/** Current set data plus the generated puzzles (emitted as /data/<kind>/<n>.json). */
export default function () {
  const sets = fs
    .readdirSync(new URL("data/sets/", root))
    .filter((d) => /^\d+$/.test(d) && exists(`data/sets/${d}/set.json`))
    .map(Number)
    .sort((a, b) => b - a);
  if (!sets.length) throw new Error("No set data. Run `npm run data:update`.");
  const set = readJson(`data/sets/${sets[0]}/set.json`);
  const daily = exists("data/puzzles/daily.json") ? readJson("data/puzzles/daily.json").puzzles : [];
  const practice = exists("data/puzzles/practice.json") ? readJson("data/puzzles/practice.json").puzzles : [];

  const champById = Object.fromEntries(set.champions.map((c) => [c.id, c]));
  const traitByName = Object.fromEntries(set.traits.map((t) => [t.name, t]));
  const byCost = [1, 2, 3, 4, 5]
    .map((cost) => ({ cost, champions: set.champions.filter((c) => c.cost === cost) }))
    .filter((g) => g.champions.length);
  const sharedTraits = set.traits.filter((t) => t.members.length > 1).sort((a, b) => a.name.localeCompare(b.name));
  const uniqueTraits = set.traits.filter((t) => t.members.length === 1).sort((a, b) => a.name.localeCompare(b.name));
  const featuredTrait = [...sharedTraits].sort((a, b) => b.members.length - a.members.length)[0];

  return {
    set,
    champById,
    traitByName,
    byCost,
    sharedTraits,
    uniqueTraits,
    featuredTrait,
    daily,
    practice,
    dailyCount: daily.length,
    practiceCount: practice.length,
  };
}
