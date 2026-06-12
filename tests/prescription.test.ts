import { describe, expect, test } from "bun:test";

import { defaultSessionRecord } from "../src/domain/model";
import {
  buildDailyPrescription,
  FORM_FALLBACK_WPM,
  recommendedDailyMinutes,
  type PrescriptionInput,
} from "../src/training/prescription";
import type { SkillDiagnosis, SkillProfile } from "../src/training/diagnosis";

const ALL_MODULES = [
  "foundation_input",
  "everyday_english",
  "programming_basics",
  "code_practice",
] as const;

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

function baseInput(overrides: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return {
    profile: profileWith([["digits", "normal"]], 20),
    enabledModules: [...ALL_MODULES],
    records: [],
    now: new Date("2026-06-13T08:00:00Z"),
    random: () => 0.99, // 默认让概率型轮换不触发
    ...overrides,
  };
}

describe("buildDailyPrescription", () => {
  test("always includes keys warmup and words stages", () => {
    const prescription = buildDailyPrescription(baseInput());
    const forms = prescription.stages.map((stage) => stage.form);
    expect(forms[0]).toBe("keys");
    expect(forms).toContain("words");
  });

  test("weak symbols dimension forces symbols stage with weak flag", () => {
    const prescription = buildDailyPrescription(
      baseInput({ profile: profileWith([["symbols", "weak"]], 20) }),
    );
    const symbols = prescription.stages.find((stage) => stage.form === "symbols");
    expect(symbols).toBeDefined();
    expect(symbols?.weak).toBe(true);
  });

  test("disabling code module removes code stage", () => {
    const prescription = buildDailyPrescription(
      baseInput({
        enabledModules: ["foundation_input", "everyday_english"],
      }),
    );
    expect(prescription.stages.find((stage) => stage.form === "code")).toBeUndefined();
  });

  test("article stage appears only after 3-day gap", () => {
    const recentArticle = defaultSessionRecord({
      started_at: "2026-06-12T08:00:00Z",
      category: "everyday_articles",
      module: "everyday_english",
      typed_len: 200,
      correct_chars: 200,
      active_ms: 120_000,
    });
    const withRecent = buildDailyPrescription(baseInput({ records: [recentArticle] }));
    expect(withRecent.stages.find((stage) => stage.form === "articles")).toBeUndefined();

    const oldArticle = defaultSessionRecord({
      ...recentArticle,
      started_at: "2026-06-09T08:00:00Z",
    });
    const withOld = buildDailyPrescription(baseInput({ records: [oldArticle] }));
    expect(withOld.stages.find((stage) => stage.form === "articles")).toBeDefined();
  });

  test("char budget uses form ewma wpm when available", () => {
    const profile = profileWith([["digits", "normal"]], 20);
    profile.form_speeds = [{ form: "words", samples: 5, ewma_wpm: 40 }];
    const prescription = buildDailyPrescription(baseInput({ profile }));
    const words = prescription.stages.find((stage) => stage.form === "words");
    expect(words).toBeDefined();
    // 预算 = 分钟 × 40 × 5
    expect(words!.char_budget).toBe(Math.round(words!.minutes * 40 * 5));
  });

  test("cold start budget applies 0.8 discount on fallback wpm", () => {
    const prescription = buildDailyPrescription(baseInput());
    const words = prescription.stages.find((stage) => stage.form === "words");
    expect(words!.char_budget).toBe(
      Math.round(words!.minutes * FORM_FALLBACK_WPM.words * 0.8 * 5),
    );
  });

  test("stage minutes sum approximately to target", () => {
    const prescription = buildDailyPrescription(baseInput());
    const total = prescription.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    expect(Math.abs(total - prescription.target_minutes)).toBeLessThanOrEqual(1);
  });

  test("every stage carries non-empty bilingual reasons", () => {
    const prescription = buildDailyPrescription(baseInput());
    for (const stage of prescription.stages) {
      expect(stage.reason_zh.length).toBeGreaterThan(0);
      expect(stage.reason_en.length).toBeGreaterThan(0);
    }
  });
});
