import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import type { Puzzle } from "../shared/types.ts";
import { buildCategoryPool, categoriesConflict, type Category } from "../scripts/lib/categories.ts";
import { createContext, generatePuzzle } from "../scripts/lib/generator.ts";
import { latestSetNumber, readJson, setDir } from "../scripts/lib/paths.ts";
import type { SetData } from "../scripts/lib/set-types.ts";
import { checkPuzzle, countPartitions, validGroupMasks } from "../scripts/lib/validate.ts";

const set = readJson<SetData>(path.join(setDir(latestSetNumber()), "set.json"));
const { pool, issues } = buildCategoryPool(set);

const cat = (id: string, members: string[]): Category => ({
  id,
  kind: "trait",
  title: id,
  description: "",
  levels: [1],
  members,
  ambiguous: [],
  notes: {},
  conflicts: [],
  weight: 1,
  source: "auto",
});

describe("uniqueness check", () => {
  const grid = Array.from({ length: 16 }, (_, i) => `c${i}`);
  const g = (from: number) => grid.slice(from, from + 4);

  it("finds exactly one partition for disjoint groups", () => {
    const masks = validGroupMasks(grid, [cat("a", g(0)), cat("b", g(4)), cat("c", g(8)), cat("d", g(12))]);
    assert.equal(masks.size, 4);
    assert.equal(countPartitions(masks.keys()), 1);
  });

  it("detects a second valid solution", () => {
    // A category spanning c0-c7 lets the first 8 tiles split two different ways.
    const pool2 = [cat("a", g(0)), cat("b", g(4)), cat("c", g(8)), cat("d", g(12)), cat("x", ["c0", "c1", "c4", "c5"]), cat("y", ["c2", "c3", "c6", "c7"])];
    assert.equal(countPartitions(validGroupMasks(grid, pool2).keys()), 2);
  });

  it("reports zero partitions when a group is impossible", () => {
    const masks = validGroupMasks(grid, [cat("a", g(0)), cat("b", g(4)), cat("c", g(8))]);
    assert.equal(countPartitions(masks.keys()), 0);
  });
});

describe("category pool", () => {
  it("builds without errors", () => {
    assert.deepEqual(issues.filter((i) => i.level === "error"), []);
    assert.ok(pool.length >= 30, `only ${pool.length} categories`);
  });

  it("only uses real champions with enough members", () => {
    const ids = new Set(set.champions.map((c) => c.id));
    for (const c of pool) {
      assert.ok(c.members.length >= 4, `${c.id} has ${c.members.length} members`);
      for (const m of [...c.members, ...c.ambiguous]) assert.ok(ids.has(m), `${c.id}: unknown ${m}`);
    }
  });

  it("keeps near-duplicate categories apart", () => {
    const byId = new Map(pool.map((c) => [c.id, c]));
    const summoner = byId.get("trait-summoner");
    const spawns = byId.get("ability-spawns");
    if (summoner && spawns) assert.ok(categoriesConflict(summoner, spawns));
  });
});

describe("generator", () => {
  const ctx = createContext(set, pool);
  const puzzles: Puzzle[] = [];
  for (let id = 1; id <= 25; id++) {
    puzzles.push(generatePuzzle(ctx, { id, kind: "practice", seed: `test-${id}`, recent: puzzles.slice(-30) }));
  }

  it("produces fair puzzles with exactly one solution", () => {
    for (const p of puzzles) {
      const result = checkPuzzle(p, pool);
      assert.deepEqual(result.problems, [], `puzzle ${p.id}: ${result.problems.join("; ")}`);
      assert.equal(result.partitions, 1);
    }
  });

  it("never puts an ambiguous champion on the board of its category", () => {
    const byId = new Map(pool.map((c) => [c.id, c]));
    for (const p of puzzles) {
      const board = new Set(p.order);
      for (const g of p.groups) {
        for (const a of byId.get(g.category)!.ambiguous) assert.ok(!board.has(a), `puzzle ${p.id}: ${a} vs ${g.category}`);
      }
    }
  });

  it("is deterministic for a seed", () => {
    const again = generatePuzzle(ctx, { id: 1, kind: "practice", seed: "test-1", recent: [] });
    assert.deepEqual(again, puzzles[0]);
  });

  it("does not repeat a category on consecutive puzzles", () => {
    for (let i = 1; i < puzzles.length; i++) {
      const prev = new Set(puzzles[i - 1].groups.map((g) => g.category));
      for (const g of puzzles[i].groups) assert.ok(!prev.has(g.category), `${g.category} repeated at #${puzzles[i].id}`);
    }
  });
});
