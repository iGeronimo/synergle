/** Daily-puzzle statistics (archive and practice plays don't count). */
import { load, save } from "./storage";

export interface Stats {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  /** Puzzle number of the last completed daily puzzle. */
  lastPlayed: number | null;
  lastWon: number | null;
  /** Wins by number of mistakes (index 0-3). */
  winsByMistakes: [number, number, number, number];
  losses: number;
}

export const EMPTY_STATS: Stats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayed: null,
  lastWon: null,
  winsByMistakes: [0, 0, 0, 0],
  losses: 0,
};

const KEY = "stats";

export function loadStats(): Stats {
  const raw = load<Partial<Stats>>(KEY);
  if (!raw) return { ...EMPTY_STATS, winsByMistakes: [0, 0, 0, 0] };
  const wins = Array.isArray(raw.winsByMistakes) && raw.winsByMistakes.length === 4 ? raw.winsByMistakes : [0, 0, 0, 0];
  return { ...EMPTY_STATS, ...raw, winsByMistakes: wins.map((n) => Number(n) || 0) as Stats["winsByMistakes"] };
}

export function saveStats(stats: Stats): void {
  save(KEY, stats);
}

/** Records a finished daily puzzle. Recording the same puzzle twice is a no-op. */
export function recordDaily(stats: Stats, puzzleNumber: number, won: boolean, mistakes: number): Stats {
  if (stats.lastPlayed !== null && puzzleNumber <= stats.lastPlayed) return stats;
  const next: Stats = { ...stats, winsByMistakes: [...stats.winsByMistakes] as Stats["winsByMistakes"] };
  next.played++;
  next.lastPlayed = puzzleNumber;
  if (won) {
    next.won++;
    next.winsByMistakes[Math.min(3, Math.max(0, mistakes))]++;
    next.currentStreak = stats.lastWon === puzzleNumber - 1 ? stats.currentStreak + 1 : 1;
    next.maxStreak = Math.max(next.maxStreak, next.currentStreak);
    next.lastWon = puzzleNumber;
  } else {
    next.losses++;
    next.currentStreak = 0;
  }
  return next;
}

/** A streak only survives if yesterday's or today's puzzle was won. */
export function displayStreak(stats: Stats, todayNumber: number): number {
  if (stats.lastWon === null) return 0;
  return stats.lastWon >= todayNumber - 1 ? stats.currentStreak : 0;
}

export function winPercent(stats: Stats): number {
  return stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
}
