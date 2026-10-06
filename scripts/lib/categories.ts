/**
 * Builds the pool of puzzle categories for a set.
 *
 * Auto categories come straight from the data (costs, traits, trait-count
 * trivia, champion-granting augments, attack range, name patterns), so they
 * work for any future set. Curated categories (ability effects, lore,
 * wordplay) live in data/sets/<n>/curated.json and are written by hand.
 */
import fs from "node:fs";
import path from "node:path";
import type { Level } from "../../shared/types.ts";
import type { ChampionData, SetData } from "./set-types.ts";
import { readJson, setDir } from "./paths.ts";
import { sentenceMatching, slugify } from "./text.ts";

export type CategoryKind = "cost" | "trait" | "meta" | "augment" | "stat" | "ability" | "lore" | "name";

export interface Category {
  id: string;
  kind: CategoryKind;
  title: string;
  description: string;
  /** Difficulty slots this category may fill. */
  levels: Level[];
  /** Champion ids that belong to the category. */
  members: string[];
  /** Champions that arguably fit; kept off the board when this category is used. */
  ambiguous: string[];
  /** Per-champion explanations for the post-game breakdown. */
  notes: Record<string, string>;
  /** Category ids that must never share a puzzle with this one. */
  conflicts: string[];
  /** Relative selection weight (default 1). */
  weight: number;
  /** Case-insensitive regex used to auto-fill notes and to audit membership. */
  abilityPattern?: string;
  source: "auto" | "curated";
}

/** Maximum categories of one kind in a single puzzle. */
export const KIND_LIMITS: Record<CategoryKind, number> = {
  cost: 1,
  trait: 2,
  meta: 1,
  augment: 1,
  stat: 1,
  ability: 2,
  lore: 1,
  name: 1,
};

type CuratedCategory = Partial<Omit<Category, "levels" | "source">> & {
  id: string;
  kind: CategoryKind;
  title: string;
  members: string[];
  levels: number[];
};

interface CuratedFile {
  set: number;
  /** Auto category ids to drop. */
  disabled?: string[];
  /** Field overrides for auto categories, keyed by id. */
  overrides?: Record<string, Partial<Omit<Category, "id" | "source">>>;
  categories: CuratedCategory[];
}

const MIN_MEMBERS = 4;

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

function firstSentence(text: string): string {
  const s = text.split("\n")[0];
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
}

function make(partial: Omit<Category, "ambiguous" | "notes" | "conflicts" | "weight" | "source"> & Partial<Category>): Category {
  return {
    ambiguous: [],
    notes: {},
    conflicts: [],
    weight: 1,
    source: "auto",
    ...partial,
  };
}

export function buildAutoCategories(set: SetData): Category[] {
  const out: Category[] = [];
  const champs = set.champions;
  const byId = new Map(champs.map((c) => [c.id, c]));

  // Shop cost.
  for (let cost = 1; cost <= 5; cost++) {
    const members = champs.filter((c) => c.cost === cost).map((c) => c.id);
    if (members.length < MIN_MEMBERS) continue;
    out.push(
      make({
        id: `cost-${cost}`,
        kind: "cost",
        title: `${cost}-Cost Champions`,
        description: `Champions that cost ${cost} gold in the shop.`,
        levels: [1],
        members,
      })
    );
  }

  // Traits.
  for (const trait of set.traits) {
    if (trait.members.length < MIN_MEMBERS) continue;
    out.push(
      make({
        id: `trait-${trait.id}`,
        kind: "trait",
        title: trait.name,
        description: `Champions with the ${trait.name} trait. ${firstSentence(trait.text)}`.trim(),
        levels: [1, 2],
        members: trait.members,
      })
    );
  }

  // Trait-count trivia.
  const uniqueTraits = set.traits.filter((t) => t.members.length === 1);
  const uniqueTraitOf = new Map(uniqueTraits.map((t) => [t.members[0], t.name]));
  if (uniqueTraitOf.size >= MIN_MEMBERS) {
    out.push(
      make({
        id: "meta-unique-trait",
        kind: "meta",
        title: "Has a One-Champion Trait",
        description: "Each of these champions has a trait that no other champion shares.",
        levels: [2, 3],
        members: [...uniqueTraitOf.keys()],
        notes: Object.fromEntries(uniqueTraitOf),
      })
    );
  }
  const single = champs.filter((c) => c.traits.length === 1);
  if (single.length >= MIN_MEMBERS) {
    out.push(
      make({
        id: "meta-one-trait",
        kind: "meta",
        title: "Only One Trait",
        description: "These champions have just a single trait.",
        levels: [2, 3],
        members: single.map((c) => c.id),
        notes: Object.fromEntries(single.map((c) => [c.id, c.traits[0]])),
      })
    );
  }
  const triple = champs.filter((c) => c.traits.length >= 3);
  if (triple.length >= MIN_MEMBERS) {
    out.push(
      make({
        id: "meta-three-traits",
        kind: "meta",
        title: "Three Traits",
        description: "These champions each have three traits.",
        levels: [2, 3],
        members: triple.map((c) => c.id),
        notes: Object.fromEntries(triple.map((c) => [c.id, c.traits.join(", ")])),
      })
    );
  }
  const duoTraits = set.traits.filter((t) => t.members.length === 2);
  const duoMembers = new Map<string, string>();
  for (const t of duoTraits) for (const m of t.members) duoMembers.set(m, t.name);
  if (duoMembers.size >= MIN_MEMBERS) {
    out.push(
      make({
        id: "meta-duo-trait",
        kind: "meta",
        title: "In a Two-Champion Trait",
        description: `Members of traits that only two champions share (${joinNames(duoTraits.map((t) => t.name))}).`,
        levels: [3, 4],
        members: [...duoMembers.keys()],
        notes: Object.fromEntries(duoMembers),
      })
    );
  }

  // Augments that hand out specific champions, merged by base name ("Sun and Moon" + "Sun and Moon+").
  const byAugment = new Map<string, Map<string, string>>();
  for (const grant of set.augmentGrants) {
    const base = grant.name.replace(/\s*\+*\s*$/, "").replace(/\s+(I{1,3}|IV)$/, "").trim();
    const entry = byAugment.get(base) ?? new Map<string, string>();
    for (const id of grant.champions) {
      const existing = entry.get(id);
      const names = new Set((existing ? existing.split(" / ") : []).concat(grant.name));
      entry.set(id, [...names].join(" / "));
    }
    byAugment.set(base, entry);
  }
  for (const [name, members] of byAugment) {
    if (members.size < MIN_MEMBERS) continue;
    const names = [...members.keys()].map((id) => byId.get(id)?.name ?? id);
    out.push(
      make({
        id: `augment-${slugify(name)}`,
        kind: "augment",
        title: `Granted by the “${name}” Augment`,
        description: `The ${name} augments hand out ${joinNames(names)}.`,
        levels: [3, 4],
        members: [...members.keys()],
        notes: Object.fromEntries(members),
      })
    );
  }

  // Attack range (only small, surprising buckets).
  const ranges = new Map<number, ChampionData[]>();
  for (const c of champs) ranges.set(c.stats.range, [...(ranges.get(c.stats.range) ?? []), c]);
  for (const [range, list] of ranges) {
    if (list.length < MIN_MEMBERS || list.length > 8) continue;
    out.push(
      make({
        id: `stat-range-${range}`,
        kind: "stat",
        title: `Attack Range of ${range} Hexes`,
        description: `These champions attack from exactly ${range} hexes away.`,
        levels: [4],
        members: list.map((c) => c.id),
      })
    );
  }

  // Name patterns.
  const letters = (name: string) => name.replace(/[^A-Za-z]/g, "");
  const byLength = new Map<number, ChampionData[]>();
  for (const c of champs) {
    const n = letters(c.name).length;
    byLength.set(n, [...(byLength.get(n) ?? []), c]);
  }
  for (const [n, list] of byLength) {
    if (list.length < MIN_MEMBERS || list.length > 10 || n > 6) continue;
    out.push(
      make({
        id: `name-length-${n}`,
        kind: "name",
        title: `${["", "One", "Two", "Three", "Four", "Five", "Six"][n]}-Letter Names`,
        description: `Each name is exactly ${n} letters long.`,
        levels: [3, 4],
        members: list.map((c) => c.id),
      })
    );
  }
  const doubled = champs.filter((c) => /([a-z])\1/i.test(c.name));
  if (doubled.length >= MIN_MEMBERS) {
    out.push(
      make({
        id: "name-double-letter",
        kind: "name",
        title: "Names With a Double Letter",
        description: "Each name has the same letter twice in a row.",
        levels: [4],
        members: doubled.map((c) => c.id),
        notes: Object.fromEntries(
          doubled.map((c) => [c.id, c.name.replace(/([a-z])\1/i, (m) => m.toUpperCase())])
        ),
      })
    );
  }
  const twoPart = champs.filter((c) => /[\s']/.test(c.name.trim()));
  if (twoPart.length >= MIN_MEMBERS) {
    out.push(
      make({
        id: "name-two-part",
        kind: "name",
        title: "Two-Part Names",
        description: "Each name is split by a space or an apostrophe.",
        levels: [3, 4],
        members: twoPart.map((c) => c.id),
      })
    );
  }

  // Words shared by several ability names ("Spirit Bomb", "Spirit Rift"...).
  const STOP = new Set(["of", "the", "a", "an", "and", "to", "in", "on", "it", "you", "is", "n"]);
  const wordMap = new Map<string, ChampionData[]>();
  for (const c of champs) {
    const words = new Set(c.ability.name.toLowerCase().match(/[a-z]+/g) ?? []);
    for (const w of words) if (!STOP.has(w) && w.length > 2) wordMap.set(w, [...(wordMap.get(w) ?? []), c]);
  }
  for (const [word, list] of wordMap) {
    if (list.length < MIN_MEMBERS || list.length > 8) continue;
    const Word = word[0].toUpperCase() + word.slice(1);
    out.push(
      make({
        id: `abilityname-${word}`,
        kind: "name",
        title: `Ability Names With “${Word}”`,
        description: `Each champion's ability name contains the word “${Word}”.`,
        levels: [4],
        members: list.map((c) => c.id),
        notes: Object.fromEntries(list.map((c) => [c.id, c.ability.name])),
      })
    );
  }

  return out;
}

function loadCurated(set: SetData): CuratedFile | null {
  const file = path.join(setDir(set.set), "curated.json");
  if (!fs.existsSync(file)) return null;
  return readJson<CuratedFile>(file);
}

export interface PoolIssue {
  level: "error" | "warning";
  message: string;
}

/** Full category pool for a set, with notes filled in and ids validated. */
export function buildCategoryPool(set: SetData): { pool: Category[]; issues: PoolIssue[] } {
  const issues: PoolIssue[] = [];
  const champIds = new Set(set.champions.map((c) => c.id));
  const champById = new Map(set.champions.map((c) => [c.id, c]));
  const curated = loadCurated(set);
  if (!curated) {
    issues.push({ level: "warning", message: `No data/sets/${set.set}/curated.json; using auto categories only.` });
  }

  let pool = buildAutoCategories(set);
  const disabled = new Set(curated?.disabled ?? []);
  pool = pool.filter((c) => !disabled.has(c.id));
  for (const [id, patch] of Object.entries(curated?.overrides ?? {})) {
    const target = pool.find((c) => c.id === id);
    if (!target) issues.push({ level: "warning", message: `Override for unknown auto category "${id}".` });
    else Object.assign(target, patch);
  }

  for (const raw of curated?.categories ?? []) {
    if (pool.some((c) => c.id === raw.id)) {
      issues.push({ level: "error", message: `Duplicate category id "${raw.id}".` });
      continue;
    }
    pool.push({
      ambiguous: [],
      notes: {},
      conflicts: [],
      weight: 1,
      description: "",
      ...raw,
      levels: raw.levels.filter((l): l is Level => l >= 1 && l <= 4),
      source: "curated",
    } as Category);
  }

  for (const cat of pool) {
    for (const list of [cat.members, cat.ambiguous]) {
      for (const id of list) {
        if (!champIds.has(id)) issues.push({ level: "error", message: `${cat.id}: unknown champion id "${id}".` });
      }
    }
    const overlap = cat.members.filter((m) => cat.ambiguous.includes(m));
    if (overlap.length) issues.push({ level: "error", message: `${cat.id}: ${overlap.join(", ")} listed as member and ambiguous.` });
    if (new Set(cat.members).size < MIN_MEMBERS) {
      issues.push({ level: "error", message: `${cat.id}: needs at least ${MIN_MEMBERS} members.` });
    }
    if (!cat.levels.length) issues.push({ level: "error", message: `${cat.id}: no valid levels.` });
    for (const other of cat.conflicts) {
      if (!pool.some((c) => c.id === other)) {
        issues.push({ level: "warning", message: `${cat.id}: conflict with unknown category "${other}".` });
      }
    }
    if (cat.abilityPattern) {
      const re = new RegExp(cat.abilityPattern, "i");
      for (const id of cat.members) {
        if (cat.notes[id]) continue;
        const champ = champById.get(id);
        const sentence = champ ? sentenceMatching(champ.ability.text, re) : null;
        if (sentence) cat.notes[id] = sentence;
      }
    }
    cat.members = [...new Set(cat.members)].filter((id) => champIds.has(id));
  }
  return { pool, issues };
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const inter = b.filter((x) => setA.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

/** Categories too similar to share a puzzle (would confuse players). */
export const CONFLICT_JACCARD = 0.34;

export function categoriesConflict(a: Category, b: Category): boolean {
  if (a.id === b.id) return true;
  if (a.conflicts.includes(b.id) || b.conflicts.includes(a.id)) return true;
  return jaccard(a.members, b.members) >= CONFLICT_JACCARD;
}
