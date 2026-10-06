import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateForPuzzleNumber,
  isISODate,
  localISODate,
  msUntilLocalMidnight,
  puzzleNumberForDate,
} from "../shared/dates.ts";

describe("puzzle dates", () => {
  it("numbers the launch day as puzzle 1", () => {
    assert.equal(puzzleNumberForDate("2026-10-05", "2026-10-05"), 1);
    assert.equal(puzzleNumberForDate("2026-10-05", "2026-10-06"), 2);
    assert.equal(puzzleNumberForDate("2026-10-05", "2026-10-04"), 0);
  });

  it("is unaffected by daylight saving changes", () => {
    // Europe and the US change clocks in late October / early November.
    assert.equal(puzzleNumberForDate("2026-10-05", "2026-11-05"), 32);
    assert.equal(puzzleNumberForDate("2026-03-01", "2026-04-01"), 32);
  });

  it("round-trips numbers and dates across years", () => {
    for (const n of [1, 30, 88, 366, 1000]) {
      assert.equal(puzzleNumberForDate("2026-10-05", dateForPuzzleNumber("2026-10-05", n)), n);
    }
    assert.equal(dateForPuzzleNumber("2026-10-05", 89), "2027-01-01");
  });

  it("validates ISO dates", () => {
    assert.ok(isISODate("2026-02-28"));
    assert.ok(!isISODate("2026-2-28"));
    assert.ok(!isISODate("not a date"));
    assert.throws(() => puzzleNumberForDate("2026-10-05", "10/06/2026"));
  });

  it("formats the local date and counts down to midnight", () => {
    assert.equal(localISODate(new Date(2026, 0, 9, 23, 59)), "2026-01-09");
    const ms = msUntilLocalMidnight(new Date(2026, 0, 9, 23, 0, 0));
    assert.equal(ms, 60 * 60 * 1000);
  });
});
