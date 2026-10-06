/** Renders the 4x4 board and runs its animations. */
import type { Puzzle } from "../../../../shared/types";
import { withBase } from "../config";
import type { GameState } from "./state";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : ms));
}

function animate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  if (reducedMotion() || typeof el.animate !== "function") return Promise.resolve();
  return el
    .animate(keyframes, options)
    .finished.then(() => undefined)
    .catch(() => undefined);
}

export class Board {
  private readonly tiles = new Map<string, HTMLButtonElement>();
  private readonly rows = new Map<number, HTMLElement>();

  constructor(
    private readonly el: HTMLElement,
    private readonly puzzle: Puzzle,
    onToggle: (id: string) => void
  ) {
    for (const id of puzzle.order) this.tiles.set(id, this.createTile(id));
    el.addEventListener("click", (event) => {
      const tile = (event.target as Element).closest<HTMLButtonElement>(".tile");
      if (tile?.dataset.id) onToggle(tile.dataset.id);
    });
    el.classList.remove("board--loading");
    el.removeAttribute("aria-busy");
  }

  private createTile(id: string): HTMLButtonElement {
    const champ = this.puzzle.champions[id];
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.dataset.id = id;
    tile.setAttribute("aria-pressed", "false");
    const img = document.createElement("img");
    img.src = withBase(champ.img);
    img.alt = "";
    img.width = 192;
    img.height = 192;
    img.decoding = "async";
    img.draggable = false;
    const name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = champ.name;
    if (champ.name.length > 10) name.classList.add("tile-name--long");
    tile.append(img, name);
    return tile;
  }

  private row(groupIndex: number, revealed = false): HTMLElement {
    let row = this.rows.get(groupIndex);
    if (!row) {
      const group = this.puzzle.groups[groupIndex];
      row = document.createElement("div");
      row.className = `group group--l${group.level}`;
      row.setAttribute("role", "group");
      const portraits = document.createElement("div");
      portraits.className = "group-portraits";
      portraits.setAttribute("aria-hidden", "true");
      for (const id of group.members) {
        const img = document.createElement("img");
        img.src = withBase(this.puzzle.champions[id].img);
        img.alt = "";
        img.width = 64;
        img.height = 64;
        img.decoding = "async";
        portraits.append(img);
      }
      const text = document.createElement("div");
      text.className = "group-text";
      const title = document.createElement("h3");
      title.className = "group-title";
      title.textContent = group.title;
      const members = document.createElement("p");
      members.className = "group-members";
      members.textContent = group.members.map((id) => this.puzzle.champions[id].name).join(", ");
      text.append(title, members);
      row.append(portraits, text);
      row.setAttribute("aria-label", `${group.title}: ${members.textContent}`);
      this.rows.set(groupIndex, row);
    }
    row.classList.toggle("group--revealed", revealed);
    return row;
  }

  /** Puts the DOM in sync with the state (no animation). */
  render(state: GameState, revealed: number[] = []): void {
    const hidden = new Set(revealed.flatMap((gi) => this.puzzle.groups[gi].members));
    this.el.replaceChildren(
      ...state.solved.map((gi) => this.row(gi)),
      ...revealed.map((gi) => this.row(gi, true)),
      ...state.order.filter((id) => !hidden.has(id)).map((id) => this.tiles.get(id)!)
    );
    this.syncSelection(state);
  }

  syncSelection(state: GameState): void {
    for (const [id, tile] of this.tiles) {
      const selected = state.selected.includes(id);
      tile.classList.toggle("is-selected", selected);
      tile.setAttribute("aria-pressed", String(selected));
    }
  }

  setInteractive(enabled: boolean): void {
    this.el.classList.toggle("board--busy", !enabled);
  }

  /** FLIP: run a DOM mutation, then animate tiles from where they were. */
  private async flip(mutate: () => void, duration = 380): Promise<void> {
    const before = new Map<HTMLElement, DOMRect>();
    for (const tile of this.tiles.values()) if (tile.isConnected) before.set(tile, tile.getBoundingClientRect());
    mutate();
    if (reducedMotion()) return;
    const anims: Promise<void>[] = [];
    for (const [tile, from] of before) {
      if (!tile.isConnected) continue;
      const to = tile.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      anims.push(
        animate(tile, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
          duration,
          easing: "cubic-bezier(.2,.75,.25,1)",
        })
      );
    }
    await Promise.all(anims);
  }

  async shuffle(state: GameState): Promise<void> {
    await this.flip(() => this.render(state), 320);
  }

  /** Selected tiles hop one after another, like a submit "check". */
  async jump(ids: string[]): Promise<void> {
    const ordered = [...this.tiles.entries()].filter(([id, t]) => ids.includes(id) && t.isConnected);
    ordered.sort(([, a], [, b]) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    await Promise.all(
      ordered.map(([, tile], i) =>
        animate(
          tile,
          [{ transform: "translateY(0)" }, { transform: "translateY(-10px)" }, { transform: "translateY(0)" }],
          { duration: 260, delay: i * 90, easing: "ease-in-out" }
        )
      )
    );
    await wait(120);
  }

  async shake(ids: string[]): Promise<void> {
    const targets = ids.map((id) => this.tiles.get(id)).filter((t): t is HTMLButtonElement => !!t);
    await Promise.all(
      targets.map((tile) =>
        animate(
          tile,
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-7px)" },
            { transform: "translateX(7px)" },
            { transform: "translateX(-5px)" },
            { transform: "translateX(5px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 380, easing: "ease-in-out" }
        )
      )
    );
  }

  /**
   * Moves a found (or revealed) group's tiles to the next free row, then
   * merges them into a colored category bar.
   * `state` is the state *after* the group was removed from the board.
   */
  async collapseGroup(state: GameState, groupIndex: number, shownBefore: number[], revealed = false): Promise<void> {
    const members = this.puzzle.groups[groupIndex].members;
    const ordered = [...members].sort((a, b) => {
      const ra = this.tiles.get(a)!.getBoundingClientRect();
      const rb = this.tiles.get(b)!.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    const rowsBefore = shownBefore.map((gi) => this.rows.get(gi)!).filter(Boolean);
    for (const id of members) {
      const tile = this.tiles.get(id)!;
      tile.classList.add("is-selected");
      tile.setAttribute("aria-pressed", "true");
    }
    await this.flip(() => {
      this.el.replaceChildren(
        ...rowsBefore,
        ...ordered.map((id) => this.tiles.get(id)!),
        ...state.order.map((id) => this.tiles.get(id)!)
      );
    });
    const row = this.row(groupIndex, revealed);
    this.tiles.get(ordered[0])!.before(row);
    for (const id of members) {
      const tile = this.tiles.get(id)!;
      tile.classList.remove("is-selected");
      tile.setAttribute("aria-pressed", "false");
      tile.remove();
    }
    await animate(row, [{ transform: "scale(0.94)", opacity: 0.4 }, { transform: "scale(1.02)", opacity: 1 }, { transform: "scale(1)" }], {
      duration: 320,
      easing: "ease-out",
    });
  }

  focusFirstTile(): void {
    this.el.querySelector<HTMLButtonElement>(".tile")?.focus();
  }
}

export { wait };
