/** Results / statistics dialog and sharing. */
import { msUntilLocalMidnight } from "../../../../shared/dates";
import type { Puzzle } from "../../../../shared/types";
import { siteConfig, track } from "../config";
import { el, toast } from "../dom";
import { type Stats, displayStreak, winPercent } from "../stats";
import { type GameState, resultTitle, shareRows } from "./state";

export interface ResultsOptions {
  /** Omit state/puzzle to show statistics only. */
  state?: GameState;
  puzzle?: Puzzle;
  /** e.g. "#12" or "Practice #37" */
  label?: string;
  stats: Stats;
  todayNumber: number;
  /** Daily statistics are hidden for archive/practice games, with this note instead. */
  statsNote?: string;
  showCountdown: boolean;
  links: { href: string; label: string; primary?: boolean }[];
}

let stopCountdown: (() => void) | null = null;

function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function startCountdown(target: HTMLElement): () => void {
  const tick = () => {
    const ms = msUntilLocalMidnight();
    target.textContent = ms < 1000 ? "now! Refresh the page" : formatCountdown(ms);
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  return () => window.clearInterval(timer);
}

export function buildShareText(label: string, rows: string[], setNumber: number): string {
  const cfg = siteConfig();
  const host = cfg.url.replace(/^https?:\/\//, "");
  return `${cfg.name} ${label} (TFT Set ${setNumber})\n${rows.join("\n")}\n${host}`;
}

export async function shareText(text: string): Promise<"shared" | "copied" | "failed"> {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    const ta = el("textarea", { readonly: true, "aria-hidden": "true", class: "visually-hidden" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok ? "copied" : "failed";
  }
}

function statBlock(value: string | number, label: string): HTMLElement {
  return el("div", { class: "stat" }, el("span", { class: "stat-value" }, String(value)), el("span", { class: "stat-label" }, label));
}

function distribution(stats: Stats, highlight: number | null): HTMLElement {
  const rows: [string, number, number][] = [
    ["Perfect", stats.winsByMistakes[0], 0],
    ["1 mistake", stats.winsByMistakes[1], 1],
    ["2 mistakes", stats.winsByMistakes[2], 2],
    ["3 mistakes", stats.winsByMistakes[3], 3],
    ["Missed", stats.losses, 4],
  ];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return el(
    "div",
    { class: "dist", role: "list" },
    ...rows.map(([label, count, key]) =>
      el(
        "div",
        { class: `dist-row${highlight === key ? " is-current" : ""}`, role: "listitem" },
        el("span", { class: "dist-label" }, label),
        el(
          "span",
          { class: "dist-track" },
          el("span", { class: "dist-bar", style: `width:${Math.max(8, (count / max) * 100)}%` }, String(count))
        )
      )
    )
  );
}

/** Fills the results dialog body. */
export function renderResults(container: HTMLElement, opts: ResultsOptions): void {
  stopCountdown?.();
  stopCountdown = null;
  const { state, puzzle, stats } = opts;
  const parts: (HTMLElement | null)[] = [];

  if (state && puzzle && state.status !== "playing") {
    const rows = shareRows(state, puzzle);
    parts.push(el("h2", { class: "results-title", id: "results-title" }, resultTitle(state)));
    parts.push(el("p", { class: "results-sub" }, `${siteConfig().name} ${opts.label ?? ""} · Set ${puzzle.set}`));
    parts.push(
      el(
        "div",
        { class: "results-grid", role: "img", "aria-label": `Your ${rows.length} guesses` },
        ...state.guesses.map((guess) =>
          el(
            "div",
            { class: "results-grid-row" },
            ...guess.map((id) => {
              const level = puzzle.groups.find((g) => g.members.includes(id))?.level ?? 1;
              return el("span", { class: `sq sq--l${level}` });
            })
          )
        )
      )
    );
    const shareBtn = el("button", { class: "btn btn--primary btn--wide", type: "button" }, "Share results");
    shareBtn.addEventListener("click", async () => {
      const text = buildShareText(opts.label ?? "", rows, puzzle.set);
      const outcome = await shareText(text);
      if (outcome === "copied") toast("Copied results to clipboard");
      else if (outcome === "failed") toast("Couldn't copy. Try again?");
      track("share", { method: outcome, puzzle: opts.label });
    });
    parts.push(el("div", { class: "results-actions" }, shareBtn));
  } else {
    parts.push(el("h2", { class: "results-title", id: "results-title" }, "Your statistics"));
    parts.push(el("p", { class: "results-sub" }, "Daily puzzles only. Archive and practice games don't count."));
  }

  if (opts.statsNote) {
    parts.push(el("p", { class: "results-note" }, opts.statsNote));
  } else {
    parts.push(el("h3", { class: "results-heading" }, "Daily statistics"));
    parts.push(
      el(
        "div",
        { class: "stat-row" },
        statBlock(stats.played, "Played"),
        statBlock(winPercent(stats), "Win %"),
        statBlock(displayStreak(stats, opts.todayNumber), "Current streak"),
        statBlock(stats.maxStreak, "Max streak")
      )
    );
    parts.push(el("h3", { class: "results-heading" }, "Mistake distribution"));
    const highlight = state && state.status !== "playing" && opts.showCountdown ? (state.status === "lost" ? 4 : Math.min(3, state.mistakes)) : null;
    parts.push(distribution(stats, highlight));
  }

  if (opts.showCountdown) {
    const clock = el("strong", { class: "countdown-clock" }, "--:--:--");
    parts.push(el("p", { class: "countdown" }, "Next puzzle in ", clock));
    stopCountdown = startCountdown(clock);
  }
  if (opts.links.length) {
    parts.push(
      el(
        "div",
        { class: "results-links" },
        ...opts.links.map((l) => el("a", { class: `btn ${l.primary ? "btn--gold" : "btn--ghost"}`, href: l.href }, l.label))
      )
    );
  }
  container.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
  const dialog = container.closest("dialog");
  dialog?.addEventListener(
    "close",
    () => {
      stopCountdown?.();
      stopCountdown = null;
    },
    { once: true }
  );
}
