import { describe, expect, test } from "bun:test";

import { defaultSessionRecord, parseUserPreferences, type MainGoal } from "../src/domain/model";
import { goalProgress } from "../src/training/goalProgress";
import { recommendGoalPlan } from "../src/training/goalPlan";
import type { SkillProfile } from "../src/training/diagnosis";

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

function profileWithCodeWpm(wpm: number | null): SkillProfile {
  return {
    dimensions: [],
    form_speeds: [{ form: "code", samples: 10, ewma_wpm: wpm }],
    focus: { words: [], code: [], chars: [] },
    daily_active_minutes_7d: 0,
    generated_at: "2026-06-21T00:00:00Z",
  };
}

function sevenDayCodeRecords(startWpm: number, endWpm: number) {
  const days = ["14", "15", "16", "17", "18", "19", "20"];
  return days.map((day, index) => {
    const wpm =
      index === 0 ? startWpm : index === days.length - 1 ? endWpm : (startWpm + endWpm) / 2;
    const correct = Math.round(wpm * 5 * 30); // active 30min → WPM = correct/5/30
    return defaultSessionRecord({
      started_at: `2026-06-${day}T08:00:00Z`,
      category: "code_mix",
      active_ms: 30 * 60_000,
      char_stats: { correct, incorrect: 0, extra: 0, missed: 0 },
    });
  });
}

const GOAL: MainGoal = {
  form: "code",
  target_wpm: 50,
  deadline: "2026-09-14",
  created_at: "2026-06-14T00:00:00Z",
};
const NOW = new Date("2026-06-21T00:00:00Z");

describe("recommendGoalPlan", () => {
  test("cold start when fewer than 7 active days", () => {
    const records = sevenDayCodeRecords(15, 19).slice(0, 3);
    const rec = recommendGoalPlan(GOAL, records, profileWithCodeWpm(17), NOW, 20);
    expect(rec.phase).toBe("cold_start");
    expect(rec.daily_minutes).toBe(20);
  });

  test("achieved when current >= target", () => {
    const records = sevenDayCodeRecords(48, 52);
    const rec = recommendGoalPlan(GOAL, records, profileWithCodeWpm(52), NOW, 20);
    expect(rec.phase).toBe("achieved");
  });

  test("on_track returns a clamped daily recommendation and projected date", () => {
    const records = sevenDayCodeRecords(15, 19);
    const rec = recommendGoalPlan(GOAL, records, profileWithCodeWpm(19), NOW, 20);
    expect(rec.phase).toBe("on_track");
    expect(rec.daily_minutes).toBeGreaterThanOrEqual(10);
    expect(rec.daily_minutes).toBeLessThanOrEqual(60);
    expect(rec.projected_date).toBeDefined();
  });

  test("unreachable when even max daily cannot close the gap", () => {
    const records = sevenDayCodeRecords(15, 16);
    const soon: MainGoal = { ...GOAL, deadline: "2026-06-28" };
    const rec = recommendGoalPlan(soon, records, profileWithCodeWpm(16), NOW, 20);
    expect(rec.phase).toBe("unreachable");
    expect(rec.projected_wpm_at_deadline).toBeDefined();
    expect(rec.alternatives?.lower_target_wpm).toBeDefined();
  });
});
