/** Wires a game page together: loads the puzzle, handles input, persists progress. */
import { dateForPuzzleNumber, formatLongDate, formatShortDate } from "../../../../shared/dates";
import type { Puzzle, PuzzleKind } from "../../../../shared/types";
import { outOfPuzzles, siteConfig, todayNumber, track } from "../config";
import { el, openDialog, toast } from "../dom";
import { load, save } from "../storage";
import { loadStats, recordDaily, saveStats } from "../stats";
import { Board, wait } from "./board";
import { renderBreakdown } from "./breakdown";
import { renderResults } from "./results";
import {
  MAX_MISTAKES,
  type GameState,
  type SavedProgress,
  createState,
  deselectAll,
  shuffleOrder,
  submitGuess,
  toSaved,
  toggleSelect,
  unsolvedGroups,
} from "./state";

type Mode = "daily" | "archive" | "practice";

interface Session {
  mode: Mode;
  kind: PuzzleKind;
  number: number;
  key: string;
  /** Text used in the share header, e.g. "#12" */
  label: string;
}

function intParam(name: string): number | null {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function randomPractice(count: number, exclude?: number): number {
  if (count <= 1) return 1;
  let n = exclude ?? 0;
  while (n === exclude) n = 1 + Math.floor(Math.random() * count);
  return n;
}

function resolveSession(mode: Mode): Session | { error: string } {
  const cfg = siteConfig();
  const today = todayNumber(cfg);
  if (mode === "daily") {
    return { mode, kind: "daily", number: today, key: `daily-${today}`, label: `#${today}` };
  }
  if (mode === "archive") {
    const n = intParam("n");
    if (n === null || n < 1 || n > Math.min(today, cfg.dailyCount)) {
      return { error: "That puzzle isn't available. Pick one from the archive." };
    }
    if (n === today) {
      window.location.replace("/");
      return { error: "Opening today's puzzle..." };
    }
    return { mode, kind: "daily", number: n, key: `daily-${n}`, label: `#${n}` };
  }
  let p = intParam("p");
  if (p === null || p < 1 || p > cfg.practiceCount) {
    p = randomPractice(cfg.practiceCount);
    const url = new URL(window.location.href);
    url.searchParams.set("p", String(p));
    window.history.replaceState(null, "", url);
  }
  return { mode, kind: "practice", number: p, key: `practice-${p}`, label: `Practice #${p}` };
}

async function fetchPuzzle(kind: PuzzleKind, n: number): Promise<Puzzle> {
  const res = await fetch(`/data/${kind}/${n}.json`, { cache: "default" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Puzzle;
}

function showBoardMessage(root: HTMLElement, message: string, link?: { href: string; label: string }): void {
  const board = root.querySelector<HTMLElement>("#board");
  board?.replaceChildren(
    el("div", { class: "board-message" }, el("p", {}, message), link ? el("a", { class: "btn btn--gold", href: link.href }, link.label) : null)
  );
  board?.classList.remove("board--loading");
  root.querySelector<HTMLElement>(".game-controls")?.setAttribute("hidden", "");
  root.querySelector<HTMLElement>(".mistakes")?.setAttribute("hidden", "");
}

export async function initGame(root: HTMLElement): Promise<void> {
  const cfg = siteConfig();
  const mode = (root.dataset.mode as Mode) || "daily";

  if (mode === "daily" && outOfPuzzles(cfg)) {
    showBoardMessage(root, "Today's puzzle is still being prepared. Try a practice puzzle in the meantime!", {
      href: "/practice/",
      label: "Play practice",
    });
    return;
  }
  const resolved = resolveSession(mode);
  if ("error" in resolved) {
    showBoardMessage(root, resolved.error, { href: "/archive/", label: "Open the archive" });
    return;
  }
  const session: Session = resolved;

  let puzzle: Puzzle;
  try {
    puzzle = await fetchPuzzle(session.kind, session.number);
  } catch {
    showBoardMessage(root, "Couldn't load the puzzle. Check your connection and refresh the page.");
    return;
  }

  const boardEl = root.querySelector<HTMLElement>("#board")!;
  const metaEl = root.querySelector<HTMLElement>("#game-meta");
  const mistakesEl = root.querySelector<HTMLElement>("#mistakes-dots")!;
  const controls = root.querySelector<HTMLElement>(".game-controls")!;
  const after = root.querySelector<HTMLElement>("#game-after")!;
  const btnShuffle = root.querySelector<HTMLButtonElement>("#btn-shuffle")!;
  const btnDeselect = root.querySelector<HTMLButtonElement>("#btn-deselect")!;
  const btnSubmit = root.querySelector<HTMLButtonElement>("#btn-submit")!;
  const breakdownEl = document.getElementById("breakdown");
  const resultsBody = document.getElementById("results-body");
  const progressKey = `progress:${session.key}`;

  if (metaEl) {
    if (session.kind === "daily") {
      const date = dateForPuzzleNumber(cfg.launchDate, session.number);
      const when = mode === "daily" ? formatLongDate(date) : formatShortDate(date);
      metaEl.textContent = `${mode === "archive" ? "Archive · " : ""}Puzzle #${session.number} · ${when}`;
    } else {
      metaEl.textContent = `Practice puzzle #${session.number} · Set ${puzzle.set}: ${puzzle.setName}`;
    }
  }

  let state: GameState = createState(puzzle, load<SavedProgress>(progressKey));
  let busy = false;
  const board = new Board(boardEl, puzzle, (id) => {
    if (busy || state.status !== "playing") return;
    const next = toggleSelect(state, id);
    if (next === state && state.selected.length >= 4) toast("You can only pick four");
    state = next;
    board.syncSelection(state);
    updateControls();
  });

  const revealedGroups = () => (state.status === "lost" ? unsolvedGroups(state, puzzle) : []);

  function updateControls(): void {
    const playing = state.status === "playing";
    btnShuffle.disabled = busy || !playing;
    btnDeselect.disabled = busy || !playing || state.selected.length === 0;
    btnSubmit.disabled = busy || !playing || state.selected.length !== 4;
    board.setInteractive(!busy && playing);
  }

  function updateMistakes(): void {
    const remaining = MAX_MISTAKES - state.mistakes;
    const dots = mistakesEl.children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("is-used", i >= remaining);
    mistakesEl.setAttribute("aria-label", `${remaining} of ${MAX_MISTAKES} mistakes remaining`);
  }

  function persist(): void {
    save(progressKey, toSaved(state));
  }

  function nextLinks(): { href: string; label: string; primary?: boolean }[] {
    if (session.mode === "practice") {
      return [
        { href: `/practice/?p=${randomPractice(cfg.practiceCount, session.number)}`, label: "Next practice puzzle", primary: true },
        { href: "/", label: "Today's puzzle" },
      ];
    }
    if (session.mode === "archive") {
      const links: { href: string; label: string; primary?: boolean }[] = [];
      if (session.number > 1) links.push({ href: `/play/?n=${session.number - 1}`, label: `Play #${session.number - 1}`, primary: true });
      links.push({ href: "/", label: "Today's puzzle" }, { href: "/archive/", label: "Archive" });
      return links;
    }
    return [
      { href: `/practice/?p=${randomPractice(cfg.practiceCount)}`, label: "Play a practice puzzle", primary: true },
      { href: "/archive/", label: "Browse the archive" },
    ];
  }

  function showResults(): void {
    if (!resultsBody) return;
    renderResults(resultsBody, {
      state,
      puzzle,
      label: session.label,
      stats: loadStats(),
      todayNumber: todayNumber(cfg),
      statsNote:
        session.mode === "daily"
          ? undefined
          : `${session.mode === "practice" ? "Practice" : "Archive"} games don't count toward your daily statistics or streak.`,
      showCountdown: session.mode === "daily",
      links: nextLinks(),
    });
    openDialog("dlg-results");
  }

  function showFinished(): void {
    controls.hidden = true;
    const links = nextLinks();
    const resultsBtn = el("button", { class: "btn btn--primary", type: "button" }, "View results");
    resultsBtn.addEventListener("click", showResults);
    after.replaceChildren(
      el("p", { class: "game-after-title" }, state.status === "won" ? "Solved!" : "Better luck next time"),
      el(
        "div",
        { class: "game-after-actions" },
        resultsBtn,
        ...links.slice(0, 2).map((l) => el("a", { class: `btn ${l.primary ? "btn--gold" : "btn--ghost"}`, href: l.href }, l.label))
      )
    );
    after.hidden = false;
    if (breakdownEl) renderBreakdown(breakdownEl, puzzle, state);
  }

  function finish(): void {
    if (session.mode === "daily") {
      saveStats(recordDaily(loadStats(), session.number, state.status === "won", state.mistakes));
    }
    track("puzzle_complete", {
      mode: session.mode,
      puzzle: session.number,
      won: state.status === "won",
      mistakes: state.mistakes,
    });
    showFinished();
    window.setTimeout(showResults, 650);
  }

  async function revealRemaining(): Promise<void> {
    const remaining = unsolvedGroups(state, puzzle);
    const shown = [...state.solved];
    let order = [...state.order];
    for (const gi of remaining) {
      const members = new Set(puzzle.groups[gi].members);
      order = order.filter((id) => !members.has(id));
      await board.collapseGroup({ ...state, order, selected: [] }, gi, shown, true);
      shown.push(gi);
      await wait(350);
    }
  }

  async function onSubmit(): Promise<void> {
    if (busy || state.status !== "playing" || state.selected.length !== 4) return;
    const guess = [...state.selected];
    const { state: next, result } = submitGuess(state, puzzle);
    if (result.kind === "invalid") return;
    if (result.kind === "duplicate") {
      toast("Already guessed!");
      return;
    }
    busy = true;
    updateControls();
    await board.jump(guess);
    const solvedBefore = [...state.solved];
    state = next;
    if (result.kind === "correct") {
      await board.collapseGroup(state, result.group, solvedBefore);
    } else {
      await board.shake(guess);
      updateMistakes();
      if (state.status === "lost") toast("Next time!", 2200);
      else if (result.oneAway) toast("One away...");
      board.syncSelection(state);
    }
    persist();
    if (state.status === "lost") {
      await wait(500);
      await revealRemaining();
      persist();
    }
    busy = false;
    updateControls();
    if (state.status !== "playing") finish();
  }

  btnShuffle.addEventListener("click", async () => {
    if (busy || state.status !== "playing") return;
    busy = true;
    updateControls();
    state = shuffleOrder(state);
    await board.shuffle(state);
    persist();
    busy = false;
    updateControls();
  });
  btnDeselect.addEventListener("click", () => {
    state = deselectAll(state);
    board.syncSelection(state);
    updateControls();
  });
  btnSubmit.addEventListener("click", () => void onSubmit());
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.repeat || document.querySelector("dialog[open]")) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select") && !target.closest(".board")) return;
    if (state.selected.length === 4) {
      event.preventDefault();
      void onSubmit();
    }
  });

  board.render(state, revealedGroups());
  updateMistakes();
  updateControls();
  root.classList.add("is-ready");

  if (state.status !== "playing") {
    showFinished();
    if (session.mode === "daily") window.setTimeout(showResults, 400);
  } else {
    if (state.guesses.length === 0) track("puzzle_start", { mode: session.mode, puzzle: session.number });
    if (!load<boolean>("seenHelp")) {
      save("seenHelp", true);
      openDialog("dlg-help");
    }
  }

  // Refresh the results dialog when stats are requested from the header.
  document.addEventListener("synergle:open-stats", (event) => {
    if (state.status !== "playing") {
      event.preventDefault();
      showResults();
    }
  });
}
