import { describe, expect, test } from "bun:test";

import { defaultSessionRecord, parseUserPreferences } from "../src/domain/model";
import { goalProgress } from "../src/training/goalProgress";

describe("parseMainGoal (via parseUserPreferences)", () => {
  test("parses a valid main_goal", () => {
    const prefs = parseUserPreferences({
      main_goal: {
        form: "code",
        target_wpm: 50,
        deadline: "2026-09-14",
        created_at: "2026-06-14T00:00:00Z",
      },
    });
    expect(prefs.main_goal).toEqual({
      form: "code",
      target_wpm: 50,
      deadline: "2026-09-14",
      created_at: "2026-06-14T00:00:00Z",
    });
  });

  test("returns undefined for missing or invalid goal", () => {
    expect(parseUserPreferences({}).main_goal).toBeUndefined();
    expect(
      parseUserPreferences({ main_goal: { form: "nope", target_wpm: 50 } }).main_goal,
    ).toBeUndefined();
    expect(
      parseUserPreferences({
        main_goal: { form: "code", target_wpm: 0, deadline: "x", created_at: "y" },
      }).main_goal,
    ).toBeUndefined();
  });
});

function codeRecord(day: string, correct: number, activeMs: number) {
  return defaultSessionRecord({
    started_at: `${day}T08:00:00Z`,
    category: "code_mix",
    active_ms: activeMs,
    char_stats: { correct, incorrect: 0, extra: 0, missed: 0 },
  });
}

describe("goalProgress", () => {
  test("computes start/current wpm, cumulative hours, active days for the goal form", () => {
    const records = [
      codeRecord("2026-06-14", 300, 60_000), // 60 wpm
      codeRecord("2026-06-15", 360, 60_000), // 72 wpm
      codeRecord("2026-06-16", 420, 120_000), // 42 wpm
    ];
    const p = goalProgress(records, "code", "2026-06-14T00:00:00Z");
    expect(p.active_days).toBe(3);
    expect(p.cum_hours).toBeCloseTo((60_000 + 60_000 + 120_000) / 3_600_000, 5);
    expect(p.start_wpm).toBeCloseTo(60, 1);
    expect(p.current_wpm).toBeCloseTo(42, 1);
  });

  test("filters out other forms and sessions before 'since'", () => {
    const records = [
      codeRecord("2026-06-10", 300, 60_000), // before since → 过滤
      defaultSessionRecord({
        started_at: "2026-06-15T08:00:00Z",
        category: "everyday_words",
        active_ms: 60_000,
        char_stats: { correct: 500, incorrect: 0, extra: 0, missed: 0 },
      }), // 非 code → 过滤
    ];
    const p = goalProgress(records, "code", "2026-06-14T00:00:00Z");
    expect(p.active_days).toBe(0);
    expect(p.cum_hours).toBe(0);
  });
});
