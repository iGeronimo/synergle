/**
 * Puzzle generator. For every puzzle it:
 *   1. picks one category per difficulty level (hardest first), respecting
 *      per-kind limits, similarity conflicts and recent-use cooldowns;
 *   2. picks four champions per category, favouring "red herrings" that also
 *      fit another category on the board;
 *   3. keeps only boards with exactly one valid solution (exact-cover check);
 *   4. scores the survivors and returns the best one.
 */
import type { Level, Puzzle, PuzzleGroup, PuzzleKind } from "../../shared/types.ts";
import type { ChampionData, SetData } from "./set-types.ts";
import { type Category, type CategoryKind, KIND_LIMITS, categoriesConflict } from "./categories.ts";
import { Rng } from "./rng.ts";
import { countPartitions, validGroupMasks } from "./validate.ts";

/** Selection weight of each kind per level (index 0 = level 1). */
export const KIND_LEVEL_WEIGHTS: Record<CategoryKind, [number, number, number, number]> = {
  cost: [1.0, 0, 0, 0],
  trait: [0.3, 0.4, 0, 0],
  meta: [0, 1.0, 0.6, 0.5],
  augment: [0, 0, 0.8, 0.6],
  stat: [0, 0, 0.3, 0.5],
  ability: [0, 0.9, 1.0, 0.7],
  lore: [0, 0.3, 0.45, 0.7],
  name: [0, 0, 0.4, 1.0],
};

/** A category can't be reused until this many puzzles have passed. */
const COOLDOWN: Partial<Record<CategoryKind, number>> = { cost: 2, trait: 5 };
const DEFAULT_COOLDOWN = 6;
const HERRING_WEIGHT = 2.5;
const CATEGORY_ATTEMPTS = 400;
const MEMBER_ATTEMPTS = 25;
const TARGET_CANDIDATES = 40;
const LEVELS_HARDEST_FIRST: Level[] = [4, 3, 2, 1];

export interface GeneratorContext {
  set: SetData;
  pool: Category[];
  champById: Map<string, ChampionData>;
  conflictPairs: Set<string>;
}

export function createContext(set: SetData, pool: Category[]): GeneratorContext {
  const conflictPairs = new Set<string>();
  for (const a of pool)
    for (const b of pool) if (a.id !== b.id && categoriesConflict(a, b)) conflictPairs.add(`${a.id}|${b.id}`);
  return { set, pool, champById: new Map(set.champions.map((c) => [c.id, c])), conflictPairs };
}

interface History {
  /** puzzles since the category was last used (1 = previous puzzle) */
  catAge: Map<string, number>;
  champAge: Map<string, number>;
  /** appearances within the last 30 puzzles */
  champCount: Map<string, number>;
  expectedCount: number;
}

function buildHistory(recent: readonly Puzzle[]): History {
  const catAge = new Map<string, number>();
  const champAge = new Map<string, number>();
  const champCount = new Map<string, number>();
  let window = 0;
  for (let i = recent.length - 1, age = 1; i >= 0 && age <= 30; i--, age++, window++) {
    for (const g of recent[i].groups) {
      if (!catAge.has(g.category)) catAge.set(g.category, age);
      for (const m of g.members) {
        if (!champAge.has(m)) champAge.set(m, age);
        champCount.set(m, (champCount.get(m) ?? 0) + 1);
      }
    }
  }
  const poolSize = new Set(recent.flatMap((p) => Object.keys(p.champions))).size || 1;
  return { catAge, champAge, champCount, expectedCount: (window * 16) / Math.max(poolSize, 16) };
}

type Chosen = Map<Level, Category>;

function categoryWeight(cat: Category, level: Level, history: History, relaxed: boolean): number {
  const base = cat.weight * KIND_LEVEL_WEIGHTS[cat.kind][level - 1];
  if (base <= 0) return 0;
  const age = history.catAge.get(cat.id);
  if (age === undefined) return base;
  const cooldown = COOLDOWN[cat.kind] ?? DEFAULT_COOLDOWN;
  if (age <= cooldown) return relaxed ? base * 0.05 : 0;
  if (age <= cooldown * 2) return base * 0.5;
  return base;
}

function pickCategories(rng: Rng, ctx: GeneratorContext, history: History, relaxed: boolean): Chosen | null {
  const chosen: Chosen = new Map();
  const kindCount = new Map<CategoryKind, number>();
  for (const level of LEVELS_HARDEST_FIRST) {
    const picked = [...chosen.values()];
    const candidates = ctx.pool.filter(
      (c) =>
        c.levels.includes(level) &&
        !picked.includes(c) &&
        (kindCount.get(c.kind) ?? 0) < KIND_LIMITS[c.kind] &&
        !picked.some((p) => ctx.conflictPairs.has(`${c.id}|${p.id}`))
    );
    const cat = rng.weightedPick(candidates, (c) => categoryWeight(c, level, history, relaxed));
    if (!cat) return null;
    chosen.set(level, cat);
    kindCount.set(cat.kind, (kindCount.get(cat.kind) ?? 0) + 1);
  }
  return chosen;
}

/** Down-weights champions seen in the last couple of puzzles or overused lately. */
function champFreshness(id: string, history: History): number {
  const age = history.champAge.get(id);
  const recency = age === 1 ? 0.3 : age === 2 ? 0.6 : 1;
  const excess = (history.champCount.get(id) ?? 0) - history.expectedCount;
  return recency * Math.pow(0.8, Math.max(0, excess));
}

function pickMembers(rng: Rng, chosen: Chosen, history: History): Map<Level, string[]> | null {
  const entries = [...chosen.entries()];
  const excluded = new Set(entries.flatMap(([, c]) => c.ambiguous));
  const used = new Set<string>();
  const available = (cat: Category) => cat.members.filter((m) => !used.has(m) && !excluded.has(m));
  entries.sort((a, b) => available(a[1]).length - available(b[1]).length);

  const groups = new Map<Level, string[]>();
  for (const [level, cat] of entries) {
    const avail = available(cat);
    if (avail.length < 4) return null;
    const isHerring = (m: string) => entries.some(([l, other]) => l !== level && other.members.includes(m));
    const picked = rng.weightedSample(avail, 4, (m) => (isHerring(m) ? HERRING_WEIGHT : 1) * champFreshness(m, history));
    if (!picked) return null;
    for (const m of picked) used.add(m);
    groups.set(level, picked);
  }
  return groups;
}

interface Candidate {
  chosen: Chosen;
  groups: Map<Level, string[]>;
  score: number;
}

function scoreBoard(rng: Rng, chosen: Chosen, grid: string[], decoys: number, history: History): number {
  const cats = [...chosen.values()];
  const herrings = grid.filter((id) => cats.filter((c) => c.members.includes(id)).length >= 2).length;
  let score = [0, 3, 4, 3.5, 2, 1][Math.min(herrings, 5)];
  score += decoys === 0 ? 0 : decoys <= 3 ? 1.5 : decoys <= 10 ? 2 : decoys <= 20 ? 1 : -1;
  for (const id of grid) {
    const age = history.champAge.get(id);
    if (age === 1) score -= 0.6;
    else if (age === 2) score -= 0.3;
  }
  return score + rng.next() * 1.5;
}

/** Shuffles tiles so no row starts out holding 3+ members of one group. */
function orderTiles(rng: Rng, groups: PuzzleGroup[]): string[] {
  const groupOf = new Map(groups.flatMap((g, i) => g.members.map((m) => [m, i] as const)));
  const all = groups.flatMap((g) => g.members);
  let best = rng.shuffle(all);
  for (let attempt = 0; attempt < 200; attempt++) {
    const order = attempt === 0 ? best : rng.shuffle(all);
    let ok = true;
    for (let row = 0; row < 4 && ok; row++) {
      const counts = [0, 0, 0, 0];
      for (const id of order.slice(row * 4, row * 4 + 4)) counts[groupOf.get(id)!]++;
      if (Math.max(...counts) >= 3) ok = false;
    }
    if (ok) return order;
    best = order;
  }
  return best;
}

export interface GenerateOptions {
  id: number;
  kind: PuzzleKind;
  seed: string;
  /** Previously generated puzzles of the same kind, oldest first. */
  recent: readonly Puzzle[];
}

export function generatePuzzle(ctx: GeneratorContext, opts: GenerateOptions): Puzzle {
  const rng = new Rng(opts.seed);
  const history = buildHistory(opts.recent);
  const candidates: Candidate[] = [];

  for (const relaxed of [false, true]) {
    for (let attempt = 0; attempt < CATEGORY_ATTEMPTS && candidates.length < TARGET_CANDIDATES; attempt++) {
      const chosen = pickCategories(rng, ctx, history, relaxed);
      if (!chosen) continue;
      for (let m = 0; m < MEMBER_ATTEMPTS; m++) {
        const groups = pickMembers(rng, chosen, history);
        if (!groups) continue;
        const grid = [...groups.values()].flat();
        const masks = validGroupMasks(grid, ctx.pool);
        if (countPartitions(masks.keys()) !== 1) continue;
        candidates.push({ chosen, groups, score: scoreBoard(rng, chosen, grid, masks.size - 4, history) });
        break;
      }
    }
    if (candidates.length) break;
  }
  if (!candidates.length) {
    throw new Error(`Could not generate ${opts.kind} puzzle #${opts.id}; the category pool may be too small.`);
  }

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  const groups: PuzzleGroup[] = ([1, 2, 3, 4] as Level[]).map((level) => {
    const cat = best.chosen.get(level)!;
    const members = [...best.groups.get(level)!].sort((a, b) =>
      ctx.champById.get(a)!.name.localeCompare(ctx.champById.get(b)!.name)
    );
    const notes = Object.fromEntries(members.filter((m) => cat.notes[m]).map((m) => [m, cat.notes[m]]));
    const group: PuzzleGroup = {
      level,
      category: cat.id,
      title: cat.title,
      description: cat.description,
      members,
    };
    if (Object.keys(notes).length) group.notes = notes;
    return group;
  });

  const champions: Puzzle["champions"] = {};
  for (const id of groups.flatMap((g) => g.members)) {
    const c = ctx.champById.get(id)!;
    champions[id] = { id, name: c.name, img: c.img, cost: c.cost, traits: c.traits };
  }

  return {
    id: opts.id,
    kind: opts.kind,
    set: ctx.set.set,
    setName: ctx.set.name,
    groups,
    order: orderTiles(rng, groups),
    champions,
  };
}
