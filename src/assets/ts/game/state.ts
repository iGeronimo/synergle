/** Pure game rules. No DOM access, so it can be unit tested. */
import type { Level, Puzzle } from "../../../../shared/types";

export const MAX_MISTAKES = 4;

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  /** Unsolved tiles in display order. */
  order: string[];
  selected: string[];
  /** Group indices in the order the player found them. */
  solved: number[];
  /** Every submitted guess (4 ids each), right or wrong. */
  guesses: string[][];
  mistakes: number;
  status: GameStatus;
}

/** What gets written to localStorage. */
export interface SavedProgress {
  v: 1;
  order: string[];
  solved: number[];
  guesses: string[][];
  mistakes: number;
  status: GameStatus;
  finishedAt?: number;
}

export type GuessResult =
  | { kind: "correct"; group: number }
  | { kind: "wrong"; oneAway: boolean }
  | { kind: "duplicate" }
  | { kind: "invalid" };

export const LEVEL_EMOJI: Record<Level, string> = { 1: "🟩", 2: "🟦", 3: "🟪", 4: "🟨" };

export function allIds(puzzle: Puzzle): string[] {
  return puzzle.groups.flatMap((g) => g.members);
}

export function groupIndexOf(puzzle: Puzzle, id: string): number {
  return puzzle.groups.findIndex((g) => g.members.includes(id));
}

function isValidSave(saved: SavedProgress, puzzle: Puzzle): boolean {
  if (!saved || saved.v !== 1 || !Array.isArray(saved.order) || !Array.isArray(saved.solved)) return false;
  const ids = new Set(allIds(puzzle));
  const solvedIds = saved.solved.flatMap((gi) => puzzle.groups[gi]?.members ?? ["?"]);
  const covered = [...saved.order, ...solvedIds];
  if (covered.length !== ids.size || new Set(covered).size !== ids.size) return false;
  if (!covered.every((id) => ids.has(id))) return false;
  if (!Array.isArray(saved.guesses) || !saved.guesses.every((g) => Array.isArray(g) && g.length === 4)) return false;
  return Number.isInteger(saved.mistakes) && ["playing", "won", "lost"].includes(saved.status);
}

export function createState(puzzle: Puzzle, saved?: SavedProgress | null): GameState {
  if (saved && isValidSave(saved, puzzle)) {
    return {
      order: [...saved.order],
      selected: [],
      solved: [...saved.solved],
      guesses: saved.guesses.map((g) => [...g]),
      mistakes: saved.mistakes,
      status: saved.status,
    };
  }
  return { order: [...puzzle.order], selected: [], solved: [], guesses: [], mistakes: 0, status: "playing" };
}

export function toSaved(state: GameState): SavedProgress {
  const saved: SavedProgress = {
    v: 1,
    order: state.order,
    solved: state.solved,
    guesses: state.guesses,
    mistakes: state.mistakes,
    status: state.status,
  };
  if (state.status !== "playing") saved.finishedAt = Date.now();
  return saved;
}

export function toggleSelect(state: GameState, id: string): GameState {
  if (state.status !== "playing" || !state.order.includes(id)) return state;
  if (state.selected.includes(id)) return { ...state, selected: state.selected.filter((s) => s !== id) };
  if (state.selected.length >= 4) return state;
  return { ...state, selected: [...state.selected, id] };
}

export function deselectAll(state: GameState): GameState {
  return state.selected.length ? { ...state, selected: [] } : state;
}

export function shuffleOrder(state: GameState, random: () => number = Math.random): GameState {
  const order = [...state.order];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...state, order };
}

const guessKey = (ids: readonly string[]) => [...ids].sort().join("|");

export function submitGuess(state: GameState, puzzle: Puzzle): { state: GameState; result: GuessResult } {
  if (state.status !== "playing" || state.selected.length !== 4) return { state, result: { kind: "invalid" } };
  const key = guessKey(state.selected);
  if (state.guesses.some((g) => guessKey(g) === key)) return { state, result: { kind: "duplicate" } };

  const guesses = [...state.guesses, [...state.selected]];
  const counts = puzzle.groups.map((g) => g.members.filter((m) => state.selected.includes(m)).length);
  const group = counts.indexOf(4);
  if (group !== -1) {
    const solved = [...state.solved, group];
    const members = new Set(puzzle.groups[group].members);
    return {
      state: {
        ...state,
        order: state.order.filter((id) => !members.has(id)),
        selected: [],
        solved,
        guesses,
        status: solved.length === puzzle.groups.length ? "won" : "playing",
      },
      result: { kind: "correct", group },
    };
  }

  const mistakes = state.mistakes + 1;
  const lost = mistakes >= MAX_MISTAKES;
  return {
    state: { ...state, guesses, mistakes, status: lost ? "lost" : "playing", selected: lost ? [] : state.selected },
    result: { kind: "wrong", oneAway: Math.max(...counts) === 3 },
  };
}

/** Groups the player didn't find, easiest first (revealed after a loss). */
export function unsolvedGroups(state: GameState, puzzle: Puzzle): number[] {
  return puzzle.groups
    .map((g, i) => ({ i, level: g.level }))
    .filter(({ i }) => !state.solved.includes(i))
    .sort((a, b) => a.level - b.level)
    .map(({ i }) => i);
}

/** One emoji row per guess, colored by each champion's real group. */
export function shareRows(state: GameState, puzzle: Puzzle): string[] {
  return state.guesses.map((guess) =>
    guess.map((id) => LEVEL_EMOJI[puzzle.groups[groupIndexOf(puzzle, id)]?.level ?? 1]).join("")
  );
}

export function resultTitle(state: GameState): string {
  if (state.status === "lost") return "Next time!";
  return ["Perfect!", "Great!", "Solid!", "Phew!"][Math.min(state.mistakes, 3)];
}
