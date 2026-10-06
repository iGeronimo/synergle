import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Puzzle } from "../shared/types.ts";
import {
  MAX_MISTAKES,
  createState,
  deselectAll,
  resultTitle,
  shareRows,
  shuffleOrder,
  submitGuess,
  toSaved,
  toggleSelect,
  unsolvedGroups,
  type GameState,
} from "../src/assets/ts/game/state.ts";
import { EMPTY_STATS, displayStreak, recordDaily, winPercent } from "../src/assets/ts/stats.ts";

const ids = (prefix: string) => [1, 2, 3, 4].map((n) => `${prefix}${n}`);

function makePuzzle(): Puzzle {
  const groups = (["a", "b", "c", "d"] as const).map((p, i) => ({
    level: (i + 1) as 1 | 2 | 3 | 4,
    category: `cat-${p}`,
    title: `Group ${p.toUpperCase()}`,
    description: "",
    members: ids(p),
  }));
  const all = groups.flatMap((g) => g.members);
  return {
    id: 1,
    kind: "daily",
    set: 18,
    setName: "Test Set",
    groups,
    order: [...all].reverse(),
    champions: Object.fromEntries(all.map((id) => [id, { id, name: id, img: `/img/${id}.webp`, cost: 1, traits: [] }])),
  };
}

function select(state: GameState, picks: string[]): GameState {
  return picks.reduce((s, id) => toggleSelect(s, id), deselectAll(state));
}

describe("game rules", () => {
  it("toggles selection and caps it at four", () => {
    const p = makePuzzle();
    let s = createState(p);
    s = select(s, ["a1", "a2", "a3", "a4", "b1"]);
    assert.deepEqual(s.selected, ["a1", "a2", "a3", "a4"]);
    s = toggleSelect(s, "a2");
    assert.deepEqual(s.selected, ["a1", "a3", "a4"]);
  });

  it("solves a group and removes its tiles", () => {
    const p = makePuzzle();
    const { state, result } = submitGuess(select(createState(p), ids("b")), p);
    assert.deepEqual(result, { kind: "correct", group: 1 });
    assert.deepEqual(state.solved, [1]);
    assert.equal(state.order.length, 12);
    assert.ok(!state.order.some((id) => id.startsWith("b")));
    assert.deepEqual(state.selected, []);
    assert.equal(state.mistakes, 0);
  });

  it("reports one away and keeps the selection", () => {
    const p = makePuzzle();
    const { state, result } = submitGuess(select(createState(p), ["a1", "a2", "a3", "b1"]), p);
    assert.deepEqual(result, { kind: "wrong", oneAway: true });
    assert.equal(state.mistakes, 1);
    assert.equal(state.selected.length, 4);
  });

  it("does not punish repeating a guess", () => {
    const p = makePuzzle();
    const first = submitGuess(select(createState(p), ["a1", "b1", "c1", "d1"]), p);
    assert.equal(first.result.kind, "wrong");
    const again = submitGuess(select(first.state, ["d1", "c1", "b1", "a1"]), p);
    assert.deepEqual(again.result, { kind: "duplicate" });
    assert.equal(again.state.mistakes, 1);
  });

  it("ignores submits without exactly four picks", () => {
    const p = makePuzzle();
    assert.equal(submitGuess(select(createState(p), ["a1", "a2"]), p).result.kind, "invalid");
  });

  it("loses after four mistakes and reveals the rest easiest first", () => {
    const p = makePuzzle();
    let s = createState(p);
    s = submitGuess(select(s, ids("d")), p).state; // solve the gold group first
    const wrongs = [
      ["a1", "b1", "c1", "a2"],
      ["a1", "b1", "c1", "a3"],
      ["a1", "b1", "c1", "a4"],
      ["a1", "b1", "c2", "a2"],
    ];
    for (const w of wrongs) s = submitGuess(select(s, w), p).state;
    assert.equal(s.mistakes, MAX_MISTAKES);
    assert.equal(s.status, "lost");
    assert.deepEqual(unsolvedGroups(s, p), [0, 1, 2]);
    assert.equal(resultTitle(s), "Next time!");
  });

  it("wins after the fourth group and titles by mistakes", () => {
    const p = makePuzzle();
    let s = createState(p);
    s = submitGuess(select(s, ["a1", "a2", "a3", "b1"]), p).state;
    for (const g of ["a", "b", "c", "d"]) s = submitGuess(select(s, ids(g)), p).state;
    assert.equal(s.status, "won");
    assert.equal(resultTitle(s), "Great!");
    assert.deepEqual(shareRows(s, p), ["🟩🟩🟩🟦", "🟩🟩🟩🟩", "🟦🟦🟦🟦", "🟪🟪🟪🟪", "🟨🟨🟨🟨"]);
  });

  it("restores valid saved progress and rejects corrupt saves", () => {
    const p = makePuzzle();
    const played = submitGuess(select(createState(p), ids("c")), p).state;
    const restored = createState(p, toSaved(played));
    assert.deepEqual(restored.solved, [2]);
    assert.deepEqual(restored.order, played.order);

    const corrupt = { ...toSaved(played), order: played.order.slice(1) };
    assert.deepEqual(createState(p, corrupt).solved, []);
    assert.deepEqual(createState(p, { ...toSaved(played), v: 2 } as never).order, p.order);
  });

  it("shuffle keeps the same tiles", () => {
    const p = makePuzzle();
    const s = shuffleOrder(createState(p), () => 0.3);
    assert.deepEqual([...s.order].sort(), [...p.order].sort());
  });
});

describe("daily statistics", () => {
  it("builds and breaks streaks", () => {
    let st = recordDaily(EMPTY_STATS, 1, true, 0);
    st = recordDaily(st, 2, true, 2);
    assert.equal(st.currentStreak, 2);
    assert.equal(st.maxStreak, 2);
    st = recordDaily(st, 3, false, 4);
    assert.equal(st.currentStreak, 0);
    st = recordDaily(st, 5, true, 1); // skipped day 4
    assert.equal(st.currentStreak, 1);
    assert.equal(st.maxStreak, 2);
    assert.deepEqual(st.winsByMistakes, [1, 1, 1, 0]);
    assert.equal(st.losses, 1);
    assert.equal(winPercent(st), 75);
  });

  it("records each puzzle only once", () => {
    const st = recordDaily(EMPTY_STATS, 7, true, 0);
    assert.equal(recordDaily(st, 7, true, 0), st);
    assert.equal(recordDaily(st, 6, true, 0), st);
  });

  it("shows a streak only while it's still alive", () => {
    const st = recordDaily(recordDaily(EMPTY_STATS, 1, true, 0), 2, true, 0);
    assert.equal(displayStreak(st, 2), 2);
    assert.equal(displayStreak(st, 3), 2);
    assert.equal(displayStreak(st, 4), 0);
  });
});
