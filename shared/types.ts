/**
 * Types shared by the build scripts (puzzle generator) and the browser game.
 * A puzzle file is fully self-contained so old puzzles keep working after a
 * new TFT set replaces the champion pool.
 */

/** 1 = easiest (green) ... 4 = hardest (gold), mirroring TFT shop rarity colors. */
export type Level = 1 | 2 | 3 | 4;

export type PuzzleKind = "daily" | "practice";

export interface PuzzleChampion {
  id: string;
  name: string;
  /** Site-relative image URL, e.g. /img/champions/18/ahri.webp */
  img: string;
  cost: number;
  traits: string[];
}

export interface PuzzleGroup {
  level: Level;
  /** Category id the group was generated from (e.g. "trait-elderwood"). */
  category: string;
  title: string;
  description: string;
  /** Exactly four champion ids. */
  members: string[];
  /** Optional per-champion explanation shown in the post-game breakdown. */
  notes?: Record<string, string>;
}

export interface Puzzle {
  id: number;
  kind: PuzzleKind;
  set: number;
  setName: string;
  /** Sorted by level, easiest first. */
  groups: PuzzleGroup[];
  /** Initial tile order (16 champion ids). */
  order: string[];
  champions: Record<string, PuzzleChampion>;
}

export interface PuzzleFile {
  version: 1;
  kind: PuzzleKind;
  generatedAt: string;
  puzzles: Puzzle[];
}
