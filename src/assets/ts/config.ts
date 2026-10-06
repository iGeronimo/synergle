/** Site settings injected by the base layout as <script id="site-config" type="application/json">. */
import { localISODate, puzzleNumberForDate } from "../../../shared/dates";

export interface SiteConfig {
  name: string;
  url: string;
  /** "" at the domain root, "/synergle" when hosted in a subfolder. */
  basePath: string;
  launchDate: string;
  dailyCount: number;
  practiceCount: number;
  set: number;
  setName: string;
}

let cached: SiteConfig | null = null;

export function siteConfig(): SiteConfig {
  if (cached) return cached;
  const el = document.getElementById("site-config");
  cached = JSON.parse(el?.textContent || "{}") as SiteConfig;
  return cached;
}

/** Prefixes a root-relative URL ("/archive/") with the site's base path. */
export function withBase(url: string): string {
  return url.startsWith("/") && !url.startsWith("//") ? (siteConfig().basePath || "") + url : url;
}

/** Today's daily puzzle number, clamped to the puzzles that exist. */
export function todayNumber(cfg: SiteConfig = siteConfig()): number {
  const n = puzzleNumberForDate(cfg.launchDate, localISODate());
  return Math.min(Math.max(1, n), Math.max(1, cfg.dailyCount));
}

/** True when the calendar has run past the last generated daily puzzle. */
export function outOfPuzzles(cfg: SiteConfig = siteConfig()): boolean {
  return puzzleNumberForDate(cfg.launchDate, localISODate()) > cfg.dailyCount;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    googlefc?: { callbackQueue?: unknown[]; showRevocationMessage?: () => void };
  }
}

/** Sends a GA4 event if analytics is configured. */
export function track(event: string, params: Record<string, unknown> = {}): void {
  try {
    window.gtag?.("event", event, params);
  } catch {
    /* ignore */
  }
}
