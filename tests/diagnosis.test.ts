import { describe, expect, test } from "bun:test";

import { defaultSessionRecord } from "../src/domain/model";
import type { KeyEventRecord } from "../src/domain/model";
import {
  buildSkillProfile,
  charSkillDimensions,
  diagnoseCharSkills,
  ewmaAverage,
  formForCategory,
  seriesTrend,
  type SkillDimensionId,
} from "../src/training/diagnosis";

/** 构造 insert 事件序列：每个条目 [expected, correct]，间隔 intervalMs */
function keyEvents(
  entries: Array<[string, boolean]>,
  intervalMs = 200,
): KeyEventRecord[] {
  return entries.map(([expected, correct], index) => ({
    at_ms: index * intervalMs,
    action: "insert" as const,
    position: index,
    expected,
    input: correct ? expected : "x",
    correct,
  }));
}

function sessionWithKeys(
  entries: Array<[string, boolean]>,
  startedAt: string,
  intervalMs = 200,
) {
  return defaultSessionRecord({
    started_at: startedAt,
    typed_len: entries.length,
    key_events: keyEvents(entries, intervalMs),
  });
}

describe("charSkillDimensions", () => {
  test("home row letter maps to row and hand", () => {
    expect(charSkillDimensions("a")).toEqual(["home_row", "left_hand"]);
    expect(charSkillDimensions("j")).toEqual(["home_row", "right_hand"]);
  });

  test("uppercase letter adds capitalization", () => {
    expect(charSkillDimensions("A")).toEqual([
      "home_row",
      "left_hand",
      "capitalization",
    ]);
  });

  test("digit maps to digits only", () => {
    expect(charSkillDimensions("7")).toEqual(["digits"]);
  });

  test("symbol maps to symbols only", () => {
    expect(charSkillDimensions(";")).toEqual(["symbols"]);
    expect(charSkillDimensions("{")).toEqual(["symbols"]);
  });

  test("space and newline map to nothing", () => {
    expect(charSkillDimensions(" ")).toEqual([]);
    expect(charSkillDimensions("\n")).toEqual([]);
  });
});

describe("ewmaAverage", () => {
  test("empty series returns null", () => {
    expect(ewmaAverage([])).toBeNull();
  });

  test("single value returns itself", () => {
    expect(ewmaAverage([42])).toBe(42);
  });

  test("recent values weigh more (half-life 4)", () => {
    // values 按时间正序：旧 → 新。全 10 加一个最新 20，EWMA 必须明显偏向 20
    const result = ewmaAverage([10, 10, 10, 10, 20]);
    expect(result).toBeGreaterThan(12);
    expect(result).toBeLessThan(20);
  });
});

describe("seriesTrend", () => {
  test("fewer than 4 samples is insufficient", () => {
    expect(seriesTrend([10, 12, 11], "higher_is_better")).toBe("insufficient");
  });

  test("rising wpm is improving", () => {
    expect(seriesTrend([20, 20, 30, 30], "higher_is_better")).toBe("improving");
  });

  test("rising key delay is declining", () => {
    expect(seriesTrend([200, 200, 300, 300], "lower_is_better")).toBe("declining");
  });

  test("change within 8% is stable", () => {
    expect(seriesTrend([100, 100, 104, 104], "higher_is_better")).toBe("stable");
  });
});

describe("diagnoseCharSkills", () => {
  test("no records yields all unrated", () => {
    const result = diagnoseCharSkills([]);
    const digits = result.find((item) => item.id === "digits");
    expect(digits?.status).toBe("unrated");
    expect(digits?.ewma_error_rate).toBeNull();
  });

  test("high digit error rate marks digits weak", () => {
    // 5 个数字 4 错 1 对：错误率 80%，远超 weak 阈值 8%
    const events: Array<[string, boolean]> = [
      ["1", false],
      ["2", false],
      ["3", false],
      ["4", false],
      ["5", true],
      // 凑够维度事件量的字母（全对）
      ...[..."asdfghjkl".repeat(3)].map((c): [string, boolean] => [c, true]),
    ];
    // 4 个会话 × 每会话 5 个数字事件 = 20，正好达到 MIN_RATED_EVENTS 门槛
    const records = [1, 2, 3, 4].map((day) =>
      sessionWithKeys(events, `2026-06-${String(day).padStart(2, "0")}T08:00:00Z`),
    );
    const result = diagnoseCharSkills(records);
    const digits = result.find((item) => item.id === "digits");
    expect(digits?.status).toBe("weak");
    const homeRow = result.find((item) => item.id === "home_row");
    expect(homeRow?.status).not.toBe("weak");
  });

  test("clean accurate history marks dimension stable", () => {
    const events: Array<[string, boolean]> = [..."asdfghjkl".repeat(4)].map(
      (c): [string, boolean] => [c, true],
    );
    const records = [1, 2, 3, 4].map((day) =>
      sessionWithKeys(events, `2026-06-0${day}T08:00:00Z`),
    );
    const result = diagnoseCharSkills(records);
    const homeRow = result.find((item) => item.id === "home_row");
    expect(homeRow?.status).toBe("stable");
  });

  test("uppercase events feed capitalization dimension", () => {
    const events: Array<[string, boolean]> = [
      ["A", false],
      ["B", false],
      ["C", false],
      ["D", true],
      ...[..."asdf".repeat(5)].map((c): [string, boolean] => [c, true]),
    ];
    // 5 个会话 × 每会话 4 个大写事件 = 20，达到 MIN_RATED_EVENTS 门槛
    const records = [1, 2, 3, 4, 5].map((day) =>
      sessionWithKeys(events, `2026-06-0${day}T08:00:00Z`),
    );
    const result = diagnoseCharSkills(records);
    const cap = result.find((item) => item.id === "capitalization");
    expect(cap?.status).toBe("weak");
  });
});

describe("formForCategory", () => {
  test("maps categories to training forms", () => {
    expect(formForCategory("home_row")).toBe("keys");
    expect(formForCategory("foundation_mix")).toBe("keys");
    expect(formForCategory("everyday_words")).toBe("words");
    expect(formForCategory("programming_terms")).toBe("words");
    expect(formForCategory("word_breakdown")).toBe("words");
    expect(formForCategory("naming_styles")).toBe("words");
    expect(formForCategory("symbols_numbers")).toBe("symbols");
    expect(formForCategory("everyday_sentences")).toBe("sentences");
    expect(formForCategory("everyday_articles")).toBe("articles");
    expect(formForCategory("code_snippet")).toBe("code");
    expect(formForCategory("code_mix")).toBe("code");
    expect(formForCategory("unknown")).toBeNull();
  });
});

describe("buildSkillProfile", () => {
  const emptyPlan = {
    focus_words: [],
    focus_symbols: [";"],
    focus_code: [],
    focus_keys: ["b"],
    advice: [],
    recommended_mode: "mixed" as const,
    has_recent_history: true,
  };

  test("form speeds use per-form wpm from active_ms", () => {
    // words 形态：300 正确字符 / 2 分钟活跃 = 30 WPM
    const wordSession = defaultSessionRecord({
      started_at: "2026-06-10T08:00:00Z",
      category: "everyday_words",
      module: "everyday_english",
      typed_len: 300,
      correct_chars: 300,
      active_ms: 120_000,
      wpm: 30,
      accuracy: 100,
    });
    const profile = buildSkillProfile([wordSession], emptyPlan, new Date("2026-06-13T08:00:00Z"));
    const words = profile.form_speeds.find((item) => item.form === "words");
    expect(words?.ewma_wpm).toBeCloseTo(30, 0);
    const code = profile.form_speeds.find((item) => item.form === "code");
    expect(code?.ewma_wpm).toBeNull();
  });

  test("focus pools bucket by form - words stay out of other pools", () => {
    const wordSession = defaultSessionRecord({
      started_at: "2026-06-10T08:00:00Z",
      category: "everyday_words",
      module: "everyday_english",
      typed_len: 100,
      correct_chars: 90,
      active_ms: 60_000,
      error_tokens: { algorithm: 3 },
    });
    const codeSession = defaultSessionRecord({
      started_at: "2026-06-11T08:00:00Z",
      category: "code_snippet",
      module: "code_practice",
      typed_len: 100,
      correct_chars: 90,
      active_ms: 60_000,
      error_tokens: { useEffect: 2 },
    });
    const profile = buildSkillProfile(
      [wordSession, codeSession],
      emptyPlan,
      new Date("2026-06-13T08:00:00Z"),
    );
    expect(profile.focus.words).toContain("algorithm");
    expect(profile.focus.words).not.toContain("useEffect");
    expect(profile.focus.code).toContain("useEffect");
    expect(profile.focus.code).not.toContain("algorithm");
    // chars 池来自 PracticePlan 的 focus_keys + focus_symbols
    expect(profile.focus.chars).toEqual(expect.arrayContaining(["b", ";"]));
  });

  test("sentence errors flow into sentence pool as full lines", () => {
    const sentenceSession = defaultSessionRecord({
      started_at: "2026-06-10T08:00:00Z",
      category: "everyday_sentences",
      module: "everyday_english",
      typed_len: 80,
      correct_chars: 70,
      active_ms: 60_000,
      target_text: "The weather is nice today.\nShe finished the report.",
      error_tokens: { weather: 2 },
    });
    const profile = buildSkillProfile(
      [sentenceSession],
      emptyPlan,
      new Date("2026-06-13T08:00:00Z"),
    );
    expect(profile.focus.sentences).toContain("The weather is nice today.");
  });

  test("daily active minutes uses 7-day median", () => {
    // 三天，每天一条 10 分钟会话
    const records = [10, 11, 12].map((day) =>
      defaultSessionRecord({
        started_at: `2026-06-${day}T08:00:00Z`,
        category: "everyday_words",
        module: "everyday_english",
        typed_len: 50,
        correct_chars: 50,
        active_ms: 600_000,
      }),
    );
    const profile = buildSkillProfile(records, emptyPlan, new Date("2026-06-13T08:00:00Z"));
    expect(profile.daily_active_minutes_7d).toBe(10);
  });
});
