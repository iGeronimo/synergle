/**
 * Calendar helpers. Puzzle #1 is played on the launch date; every following
 * local calendar day gets the next number. Dates are "YYYY-MM-DD" strings and
 * all arithmetic happens on UTC midnights so DST changes can't shift days.
 */

const DAY_MS = 86_400_000;

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}

function utcDay(iso: string): number {
  if (!isISODate(iso)) throw new Error(`Invalid date "${iso}" (expected YYYY-MM-DD)`);
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** The user's local calendar date as YYYY-MM-DD. */
export function localISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function puzzleNumberForDate(launchISO: string, dateISO: string): number {
  return utcDay(dateISO) - utcDay(launchISO) + 1;
}

export function dateForPuzzleNumber(launchISO: string, n: number): string {
  const t = (utcDay(launchISO) + n - 1) * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** e.g. "Monday, October 5, 2026" */
export function formatLongDate(iso: string, locale = "en-US"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** e.g. "Oct 5, 2026" */
export function formatShortDate(iso: string, locale = "en-US"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Milliseconds until the next local midnight. */
export function msUntilLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}
