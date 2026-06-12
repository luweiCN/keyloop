import { describe, expect, test } from "bun:test";

import { recommendedDailyMinutes } from "../src/training/prescription";
import type { SkillDiagnosis, SkillProfile } from "../src/training/diagnosis";

function diagnosis(
  id: SkillDiagnosis["id"],
  status: SkillDiagnosis["status"],
): SkillDiagnosis {
  return {
    id,
    samples: 5,
    events: 100,
    ewma_error_rate: status === "weak" ? 10 : 1,
    ewma_speed: 200,
    trend: "stable",
    status,
  };
}

function profileWith(
  statuses: Array<[SkillDiagnosis["id"], SkillDiagnosis["status"]]>,
  habitMinutes: number,
): SkillProfile {
  return {
    dimensions: statuses.map(([id, status]) => diagnosis(id, status)),
    form_speeds: [],
    focus: { words: [], sentences: [], code: [], chars: [] },
    daily_active_minutes_7d: habitMinutes,
    generated_at: "2026-06-13T08:00:00Z",
  };
}

describe("recommendedDailyMinutes", () => {
  test("new user with no data gets 15 minutes", () => {
    const profile = profileWith(
      [
        ["digits", "unrated"],
        ["symbols", "unrated"],
      ],
      0,
    );
    expect(recommendedDailyMinutes(profile)).toBe(15);
  });

  test("all-stable expert gets 10 minute maintenance", () => {
    const profile = profileWith(
      [
        ["home_row", "stable"],
        ["digits", "stable"],
        ["symbols", "stable"],
        ["word_fluency", "stable"],
      ],
      40,
    );
    expect(recommendedDailyMinutes(profile)).toBe(10);
  });

  test("each weak dimension adds 5 minutes", () => {
    const profile = profileWith(
      [
        ["digits", "weak"],
        ["symbols", "weak"],
        ["word_fluency", "normal"],
      ],
      30,
    );
    // 15 + 2*5 = 25，习惯上限 max(15, 30*1.5)=45 不约束
    expect(recommendedDailyMinutes(profile)).toBe(25);
  });

  test("habit ceiling caps the recommendation", () => {
    const profile = profileWith(
      [
        ["digits", "weak"],
        ["symbols", "weak"],
        ["word_fluency", "weak"],
        ["long_words", "weak"],
      ],
      8,
    );
    // 15 + 4*5 = 35，习惯上限 max(15, 8*1.5)=15
    expect(recommendedDailyMinutes(profile)).toBe(15);
  });

  test("result clamps to [10, 45]", () => {
    const manyWeak = profileWith(
      [
        ["home_row", "weak"],
        ["top_row", "weak"],
        ["bottom_row", "weak"],
        ["digits", "weak"],
        ["symbols", "weak"],
        ["capitalization", "weak"],
        ["word_fluency", "weak"],
        ["long_words", "weak"],
      ],
      60,
    );
    // 15 + 8*5 = 55 → clamp 45（习惯上限 90 不约束）
    expect(recommendedDailyMinutes(manyWeak)).toBe(45);
  });
});
