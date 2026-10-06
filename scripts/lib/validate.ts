/**
 * Fairness checks. A puzzle is fair when the 16 champions can be split into
 * four groups of four - each group fully explained by some category in the
 * pool - in exactly one way.
 */
import type { Puzzle } from "../../shared/types.ts";
import type { Category } from "./categories.ts";

/** Every 4-champion subset of the grid that some category fully explains, as bitmasks. */
export function validGroupMasks(grid: readonly string[], pool: readonly Category[]): Map<number, string[]> {
  const index = new Map(grid.map((id, i) => [id, i] as const));
  const masks = new Map<number, string[]>();
  for (const cat of pool) {
    const idx: number[] = [];
    for (const m of cat.members) {
      const i = index.get(m);
      if (i !== undefined) idx.push(i);
    }
    if (idx.length < 4) continue;
    for (let a = 0; a < idx.length; a++)
      for (let b = a + 1; b < idx.length; b++)
        for (let c = b + 1; c < idx.length; c++)
          for (let d = c + 1; d < idx.length; d++) {
            const mask = (1 << idx[a]) | (1 << idx[b]) | (1 << idx[c]) | (1 << idx[d]);
            const list = masks.get(mask);
            if (list) list.push(cat.id);
            else masks.set(mask, [cat.id]);
          }
  }
  return masks;
}

/** Counts exact covers of `size` tiles using the given group masks (stops at `limit`). */
export function countPartitions(masks: Iterable<number>, size = 16, limit = 2): number {
  const full = size === 32 ? 0xffffffff : (1 << size) - 1;
  const byBit: number[][] = Array.from({ length: size }, () => []);
  for (const m of masks) for (let b = 0; b < size; b++) if (m & (1 << b)) byBit[b].push(m);
  let count = 0;
  const rec = (covered: number): void => {
    if (covered === full) {
      count++;
      return;
    }
    let b = 0;
    while (covered & (1 << b)) b++;
    for (const m of byBit[b]) {
      if ((m & covered) === 0) {
        rec(covered | m);
        if (count >= limit) return;
      }
    }
  };
  rec(0);
  return count;
}

export function groupMask(grid: readonly string[], members: readonly string[]): number {
  let mask = 0;
  for (const m of members) {
    const i = grid.indexOf(m);
    if (i === -1) return -1;
    mask |= 1 << i;
  }
  return mask;
}

export interface PuzzleCheck {
  problems: string[];
  warnings: string[];
  partitions?: number;
  decoys?: number;
}

/** Structural checks, plus the uniqueness check when a category pool is given. */
export function checkPuzzle(puzzle: Puzzle, pool?: readonly Category[]): PuzzleCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (puzzle.groups.length !== 4) problems.push(`expected 4 groups, got ${puzzle.groups.length}`);
  const levels = puzzle.groups.map((g) => g.level).join(",");
  if (levels !== "1,2,3,4") problems.push(`groups must be levels 1,2,3,4 in order (got ${levels})`);
  const all = puzzle.groups.flatMap((g) => g.members);
  for (const g of puzzle.groups) {
    if (g.members.length !== 4) problems.push(`group "${g.title}" has ${g.members.length} members`);
    if (!g.title.trim()) problems.push(`group ${g.category} has no title`);
  }
  if (new Set(all).size !== 16) problems.push("champions are not 16 distinct ids");
  const order = [...puzzle.order].sort().join(",");
  if (order !== [...all].sort().join(",")) problems.push("order is not a permutation of the group members");
  for (const id of all) {
    const c = puzzle.champions[id];
    if (!c) problems.push(`missing champion entry for ${id}`);
    else if (!c.img || !c.name) problems.push(`champion ${id} lacks name or image`);
  }

  if (pool && !problems.length) {
    const masks = validGroupMasks(all, pool);
    for (const g of puzzle.groups) {
      const mask = groupMask(all, g.members);
      if (!masks.has(mask)) warnings.push(`group "${g.title}" is no longer explained by the category pool`);
    }
    const partitions = countPartitions(masks.keys());
    if (partitions !== 1) problems.push(`${partitions === 0 ? "no" : "more than one"} valid solution`);
    return { problems, warnings, partitions, decoys: masks.size - 4 };
  }
  return { problems, warnings };
}
