/** Archive page: list every past daily puzzle with the player's result. */
import { dateForPuzzleNumber, formatShortDate } from "../../../shared/dates";
import { siteConfig, todayNumber } from "./config";
import { el } from "./dom";
import type { SavedProgress } from "./game/state";
import { load } from "./storage";

function statusOf(n: number): { label: string; cls: string } {
  const p = load<SavedProgress>(`progress:daily-${n}`);
  if (!p) return { label: "Not played", cls: "none" };
  if (p.status === "won") return { label: p.mistakes ? `Solved · ${p.mistakes} mistake${p.mistakes > 1 ? "s" : ""}` : "Perfect", cls: p.mistakes ? "won" : "perfect" };
  if (p.status === "lost") return { label: "Missed", cls: "lost" };
  return p.guesses?.length ? { label: "In progress", cls: "progress" } : { label: "Not played", cls: "none" };
}

export function initArchive(root: HTMLElement): void {
  const cfg = siteConfig();
  const today = todayNumber(cfg);
  const list = root.querySelector<HTMLOListElement>("ol")!;
  const items: HTMLElement[] = [];
  let solved = 0;
  for (let n = today; n >= 1; n--) {
    const status = statusOf(n);
    if (status.cls === "won" || status.cls === "perfect") solved++;
    const date = dateForPuzzleNumber(cfg.launchDate, n);
    items.push(
      el(
        "li",
        {},
        el(
          "a",
          { class: "archive-item", href: n === today ? "/" : `/play/?n=${n}` },
          el("span", { class: "archive-num" }, `#${n}`),
          el("span", { class: "archive-date" }, n === today ? `Today · ${formatShortDate(date)}` : formatShortDate(date)),
          el("span", { class: `archive-status archive-status--${status.cls}` }, status.label)
        )
      )
    );
  }
  list.replaceChildren(...items);

  const summary = root.querySelector<HTMLElement>("[data-archive-summary]");
  if (summary) summary.textContent = `${today} puzzle${today === 1 ? "" : "s"} so far · you've solved ${solved}.`;

  const random = root.querySelector<HTMLButtonElement>("[data-archive-random]");
  if (random) {
    random.disabled = today <= 1;
    random.addEventListener("click", () => {
      const n = 1 + Math.floor(Math.random() * (today - 1));
      window.location.href = `/play/?n=${n}`;
    });
  }
}
