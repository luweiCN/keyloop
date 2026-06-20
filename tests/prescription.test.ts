import { describe, expect, test } from "bun:test";

import { defaultSessionRecord } from "../src/domain/model";
import {
  buildDailyPrescription,
  cyclePreset,
  estimatedMinutesFromChars,
  FORM_FALLBACK_WPM,
  recommendedDailyMinutes,
  reviseStages,
  SESSION_LENGTH_PRESETS,
  snapToPreset,
  type CompletedStage,
  type PrescriptionInput,
} from "../src/training/prescription";
import { buildSkillProfile } from "../src/training/diagnosis";
import type { FormSpeed, SkillDiagnosis, SkillProfile } from "../src/training/diagnosis";

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
    focus: { words: [], code: [], chars: [] },
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

describe("reviseStages", () => {
  function prescriptionFixture() {
    return buildDailyPrescription(
      baseInput({ profile: profileWith([["digits", "normal"]], 30) }),
    );
  }

  test("slower-than-expected stage shrinks remaining budgets", () => {
    const prescription = prescriptionFixture();
    const first = prescription.stages[1]!; // stages[0] 是 keys 热身
    const completed: CompletedStage[] = [
      { form: prescription.stages[0]!.form, actual_minutes: 2, actual_wpm: 18 },
      // 实际花了预估的 2 倍时间，实测 WPM 只有预算假设的一半
      {
        form: first.form,
        actual_minutes: first.minutes * 2,
        actual_wpm: FORM_FALLBACK_WPM[first.form] * 0.8 * 0.5,
      },
    ];
    const revised = reviseStages(prescription, completed);
    // 已完成阶段被移除
    expect(revised.stages.find((stage) => stage.form === first.form)).toBeUndefined();
    // 总时长向今日目标对齐
    const remainingMinutes = revised.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    const spentMinutes = completed.reduce((sum, stage) => sum + stage.actual_minutes, 0);
    expect(remainingMinutes + spentMinutes).toBeLessThanOrEqual(
      prescription.target_minutes + 1,
    );
  });

  test("weak stages survive trimming before regular ones", () => {
    const prescription = buildDailyPrescription(
      baseInput({ profile: profileWith([["symbols", "weak"]], 30) }),
    );
    // 耗尽几乎全部时间，只剩 3 分钟
    const completed: CompletedStage[] = [
      {
        form: "keys",
        actual_minutes: prescription.target_minutes - 3,
        actual_wpm: 18,
      },
    ];
    const revised = reviseStages(prescription, completed);
    const forms = revised.stages.map((stage) => stage.form);
    // 弱项 symbols 阶段必须保留
    expect(forms).toContain("symbols");
  });

  test("all stages done returns empty remaining", () => {
    const prescription = prescriptionFixture();
    const completed: CompletedStage[] = prescription.stages.map((stage) => ({
      form: stage.form,
      actual_minutes: stage.minutes,
      actual_wpm: 25,
    }));
    const revised = reviseStages(prescription, completed);
    expect(revised.stages).toHaveLength(0);
  });
});

describe("end-to-end: spec acceptance scenarios", () => {
  const emptyPlan = {
    focus_words: [],
    focus_symbols: [],
    focus_code: [],
    focus_keys: [],
    advice: [],
    recommended_mode: "mixed" as const,
    has_recent_history: false,
  };
  const now = new Date("2026-06-13T08:00:00Z");

  test("no history yields 15-minute default plan with cold-start budgets", () => {
    const profile = buildSkillProfile([], emptyPlan, now);
    expect(profile.dimensions.every((item) => item.status === "unrated")).toBe(true);
    const prescription = buildDailyPrescription({
      profile,
      enabledModules: [...ALL_MODULES],
      records: [],
      now,
      random: () => 0.99,
    });
    expect(prescription.target_minutes).toBe(15);
    for (const stage of prescription.stages) {
      const fallback = FORM_FALLBACK_WPM[stage.form];
      expect(stage.char_budget).toBe(Math.round(stage.minutes * fallback * 0.8 * 5));
    }
  });

  test("symbol-heavy errors from code-only history force symbols stage", () => {
    // 用户只练代码，但符号键错误率高 → 跨模块诊断出 symbols 弱项
    const events: Array<[string, boolean]> = [
      [";", false],
      ["{", false],
      ["}", false],
      ["(", true],
      [")", false],
      ...[..."constreturn".repeat(3)].map((c): [string, boolean] => [c, true]),
    ];
    const records = [8, 9, 10, 11].map((day) =>
      defaultSessionRecord({
        started_at: `2026-06-${String(day).padStart(2, "0")}T08:00:00Z`,
        category: "code_snippet",
        module: "code_practice",
        typed_len: events.length,
        correct_chars: events.length - 4,
        active_ms: 60_000,
        key_events: events.map(([expected, correct], index) => ({
          at_ms: index * 200,
          action: "insert" as const,
          position: index,
          expected,
          input: correct ? expected : "x",
          correct,
        })),
      }),
    );
    const profile = buildSkillProfile(records, emptyPlan, now);
    const symbols = profile.dimensions.find((item) => item.id === "symbols");
    expect(symbols?.status).toBe("weak");
    const prescription = buildDailyPrescription({
      profile,
      enabledModules: [...ALL_MODULES],
      records,
      now,
      random: () => 0.99,
    });
    const symbolsStage = prescription.stages.find((stage) => stage.form === "symbols");
    expect(symbolsStage?.weak).toBe(true);
  });

  test("词错误不再回流(focus_words 废弃 ADR-0002)，也不泄漏到代码池", () => {
    const record = defaultSessionRecord({
      started_at: "2026-06-12T08:00:00Z",
      category: "everyday_words",
      module: "everyday_english",
      typed_len: 100,
      correct_chars: 95,
      active_ms: 60_000,
      error_tokens: { algorithm: 3 },
    });
    const profile = buildSkillProfile([record], emptyPlan, now);
    // 单词层已废弃具体错词回流（focus_words ③, ADR-0002）：词错误不再进任何回流池
    expect(profile.focus.words).toEqual([]);
    expect(profile.focus.code).not.toContain("algorithm");
  });
});

describe("reviseStages protects weak stage dose", () => {
  test("weak stage keeps its planned minutes while regular stages compress", () => {
    // 弱项 symbols → symbols 阶段标记 weak；构造时间紧张场景
    const prescription = buildDailyPrescription(
      baseInput({ profile: profileWith([["symbols", "weak"]], 30) }),
    );
    const symbols = prescription.stages.find((s) => s.form === "symbols");
    expect(symbols?.weak).toBe(true);
    const symbolsPlanned = symbols!.minutes;

    // 第一阶段（keys 热身）花了远超预估的时间，剩余时间被压缩
    const completed: CompletedStage[] = [
      {
        form: prescription.stages[0]!.form,
        actual_minutes: prescription.target_minutes - symbolsPlanned - 2,
        actual_wpm: 18,
      },
    ];
    const revised = reviseStages(prescription, completed);
    const revisedSymbols = revised.stages.find((s) => s.form === "symbols");
    // 弱项阶段分钟数不被压到原计划以下
    expect(revisedSymbols).toBeDefined();
    expect(revisedSymbols!.minutes).toBeGreaterThanOrEqual(symbolsPlanned);
  });
});

describe("buildDailyPrescription targetMinutesOverride clamping", () => {
  test("override clamps to [10, 60]", () => {
    const tiny = buildDailyPrescription(baseInput({ targetMinutesOverride: 3 }));
    expect(tiny.target_minutes).toBe(10);
    const huge = buildDailyPrescription(baseInput({ targetMinutesOverride: 200 }));
    expect(huge.target_minutes).toBe(60);
    const mid = buildDailyPrescription(baseInput({ targetMinutesOverride: 35 }));
    expect(mid.target_minutes).toBe(35);
  });
});

describe("estimatedMinutesFromChars", () => {
  test("inverts charBudget at the measured speed", () => {
    const speeds: FormSpeed[] = [{ form: "code", samples: 10, ewma_wpm: 40 }];
    // 40 wpm × 5 = 200 字符/分；600 字符 ≈ 3 分
    expect(estimatedMinutesFromChars(600, "code", speeds)).toBe(3);
  });

  test("falls back to cold-start wpm when the form has no samples", () => {
    // code 冷启动 14 × 0.8 = 11.2 wpm × 5 = 56 字符/分；560 字符 ≈ 10 分
    expect(estimatedMinutesFromChars(560, "code", [])).toBe(10);
  });

  test("never returns below 1 minute", () => {
    expect(estimatedMinutesFromChars(0, "words", [])).toBe(1);
    expect(estimatedMinutesFromChars(5, "words", [])).toBe(1);
  });
});

describe("session length presets", () => {
  test("presets are 10/20/30/45", () => {
    expect(SESSION_LENGTH_PRESETS).toEqual([10, 20, 30, 45]);
  });

  test("snapToPreset picks the nearest preset", () => {
    expect(snapToPreset(12)).toBe(10);
    expect(snapToPreset(16)).toBe(20);
    expect(snapToPreset(23)).toBe(20);
    expect(snapToPreset(38)).toBe(45);
    expect(snapToPreset(100)).toBe(45);
    expect(snapToPreset(3)).toBe(10);
  });

  test("cyclePreset moves to the adjacent preset and clamps at ends", () => {
    expect(cyclePreset(20, 1)).toBe(30);
    expect(cyclePreset(20, -1)).toBe(10);
    expect(cyclePreset(10, -1)).toBe(10);
    expect(cyclePreset(45, 1)).toBe(45);
    expect(cyclePreset(23, 1)).toBe(30);
    expect(cyclePreset(23, -1)).toBe(10);
  });
});

test("mainGoalForm gives the goal form a dominant share of distributable minutes", () => {
  const profile = profileWith([], 0); // 无弱项，基线均衡
  const base = {
    profile,
    enabledModules: [...ALL_MODULES],
    records: [],
    now: new Date("2026-06-14T00:00:00Z"),
    random: () => 0.99,
  };
  const withoutGoal = buildDailyPrescription(base);
  const withGoal = buildDailyPrescription({ ...base, mainGoalForm: "code" });
  const codeMinutes = (plan: ReturnType<typeof buildDailyPrescription>) =>
    plan.stages.find((stage) => stage.form === "code")?.minutes ?? 0;
  expect(codeMinutes(withGoal)).toBeGreaterThan(codeMinutes(withoutGoal));
});
