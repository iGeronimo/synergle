/** Behaviour shared by every page: dialogs, the stats button, privacy settings. */
import { todayNumber, withBase } from "./config";
import { openDialog } from "./dom";
import { renderResults } from "./game/results";
import { loadStats } from "./stats";

function openStats(): void {
  // A finished game on this page shows its full results instead.
  const event = new CustomEvent("synergle:open-stats", { cancelable: true });
  if (!document.dispatchEvent(event)) return;
  const body = document.getElementById("results-body");
  if (!body) return;
  renderResults(body, {
    stats: loadStats(),
    todayNumber: todayNumber(),
    showCountdown: false,
    links: [
      { href: "/", label: "Today's puzzle", primary: true },
      { href: "/practice/", label: "Practice" },
    ],
  });
  openDialog("dlg-results");
}

export function initCommon(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const opener = target?.closest<HTMLElement>("[data-open-dialog]");
    if (opener) {
      event.preventDefault();
      if (opener.dataset.openDialog === "stats") openStats();
      else openDialog(`dlg-${opener.dataset.openDialog}`);
      return;
    }
    const closer = target?.closest<HTMLElement>("[data-close-dialog]");
    if (closer) {
      closer.closest("dialog")?.close();
      return;
    }
    // Clicking the backdrop (outside the dialog box) closes it.
    if (target instanceof HTMLDialogElement && target.open) {
      const r = target.getBoundingClientRect();
      const e = event as MouseEvent;
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) target.close();
    }
    const privacy = target?.closest<HTMLElement>("[data-privacy-settings]");
    if (privacy) {
      event.preventDefault();
      const fc = window.googlefc;
      if (fc?.showRevocationMessage) fc.showRevocationMessage();
      else if (fc?.callbackQueue) fc.callbackQueue.push(() => window.googlefc?.showRevocationMessage?.());
      else window.location.href = withBase("/privacy/#cookies");
    }
  });
}
