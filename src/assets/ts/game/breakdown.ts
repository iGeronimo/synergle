/** Post-game "how the groups connect" section. */
import type { Puzzle } from "../../../../shared/types";
import { el } from "../dom";
import type { GameState } from "./state";

const LEVEL_LABEL: Record<number, string> = { 1: "Green", 2: "Blue", 3: "Purple", 4: "Gold" };

export function renderBreakdown(section: HTMLElement, puzzle: Puzzle, state: GameState): void {
  const foundOn = new Map<number, number>();
  state.guesses.forEach((guess, i) => {
    const gi = puzzle.groups.findIndex((g) => g.members.every((m) => guess.includes(m)));
    if (gi !== -1 && !foundOn.has(gi)) foundOn.set(gi, i + 1);
  });

  const cards = puzzle.groups.map((group, gi) => {
    const status = foundOn.has(gi) ? `Found on guess ${foundOn.get(gi)}` : "Revealed";
    return el(
      "article",
      { class: `bd-group bd-group--l${group.level}` },
      el(
        "header",
        { class: "bd-head" },
        el("span", { class: "bd-chip" }, LEVEL_LABEL[group.level]),
        el("h3", { class: "bd-title" }, group.title),
        el("span", { class: "bd-status" }, status)
      ),
      group.description ? el("p", { class: "bd-desc" }, group.description) : null,
      el(
        "ul",
        { class: "bd-members" },
        ...group.members.map((id) => {
          const champ = puzzle.champions[id];
          const note = group.notes?.[id];
          return el(
            "li",
            { class: "bd-member" },
            el("img", { src: champ.img, alt: "", width: 64, height: 64, loading: "lazy", decoding: "async" }),
            el(
              "div",
              { class: "bd-member-text" },
              el(
                "p",
                { class: "bd-member-name" },
                el("strong", {}, champ.name),
                el("span", { class: `cost-badge cost-badge--${champ.cost}` }, `${champ.cost}-cost`)
              ),
              el("p", { class: "bd-traits" }, champ.traits.join(" · ")),
              note ? el("p", { class: "bd-note" }, note) : null
            )
          );
        })
      )
    );
  });

  section.replaceChildren(
    el("h2", { class: "section-title" }, "How the groups connect"),
    el("p", { class: "section-lede" }, `Every champion is from TFT Set ${puzzle.set}: ${puzzle.setName}.`),
    el("div", { class: "bd-grid" }, ...cards)
  );
  section.hidden = false;
}
