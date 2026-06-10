import { describe, expect, test } from "bun:test";

import {
  aggregateSpeed,
  aggregateKeyErrors,
  aggregateWpm,
  defaultKeyAggregate,
  defaultSessionRecord,
  effectiveActiveMs,
  effectiveTypedLen,
  keyStatsLines,
  recordErrorRate,
  statsCodeLines,
  statsComprehensiveLines,
  statsDayLines,
  statsModuleLines,
  statsOverviewLines,
  statsTodayLines,
  statsTokenLines,
  topProblemTokens,
  topSlowTokens,
  weightedAccuracy,
} from "../src/index";

const NOW = new Date("2026-06-05T04:00:00.000Z");

function session(overrides = {}) {
  return defaultSessionRecord({
    started_at: "2026-06-05T03:00:00.000Z",
    duration_ms: 60_000,
    target_len: 100,
    typed_len: 100,
    correct_chars: 90,
    accuracy: 90,
    wpm: 18,
    raw_wpm: 20,
    ...overrides,
  });
}

describe("stats aggregation parity", () => {
  test("effective lengths and weighted accuracy match Rust fallbacks", () => {
    const legacy = session({
      typed_len: 0,
      correct_chars: 3,
      user_input: "abc",
      accuracy: 50,
    });
    const modern = session({
      typed_len: 1,
      accuracy: 100,
    });

    expect(effectiveTypedLen(legacy)).toBe(3);
    expect(effectiveActiveMs(legacy)).toBe(60_000);
    expect(weightedAccuracy([legacy, modern])).toBe(62.5);
  });

  test("aggregate wpm uses total correct chars and total active time", () => {
    const short = session({
      duration_ms: 60_000,
      active_ms: 0,
      correct_chars: 50,
      wpm: 10,
    });
    const long = session({
      duration_ms: 540_000,
      active_ms: 0,
      correct_chars: 450,
      wpm: 50,
    });
    const active = session({
      duration_ms: 60_000,
      active_ms: 30_000,
      correct_chars: 150,
      wpm: 30,
    });

    expect(aggregateWpm([short, long])).toBe(10);
    expect(aggregateWpm([active])).toBe(60);
    expect(aggregateSpeed([active], "cpm")).toBe(300);
  });

  test("problem and slow token scoring matches Rust", () => {
    const record = session({
      token_stats: [
        {
          token: "Selected",
          kind: "word",
          start_delay_ms: 200,
          duration_ms: 800,
          errors: 2,
        },
        {
          token: "pending_release",
          kind: "word",
          start_delay_ms: 1_000,
          duration_ms: 300,
          errors: 1,
        },
        {
          token: "=>",
          kind: "symbol",
          start_delay_ms: 50,
          duration_ms: 200,
          errors: 1,
        },
        {
          token: "transaction5Open",
          kind: "word",
          start_delay_ms: 9_999,
          duration_ms: 9_999,
          errors: 9,
        },
      ],
    });

    const words = topProblemTokens([record], true, 3);
    const symbols = topProblemTokens([record], false, 3);
    const slow = topSlowTokens([record], 3);

    expect(words[0]).toEqual({
      token: "selected",
      errors: 2,
      count: 1,
      score: 2_600,
    });
    expect(words.map((entry) => entry.token)).not.toContain("transaction5Open");
    expect(symbols[0]?.token).toBe("=>");
    expect(slow[0]?.token).toBe("selected");
    expect(slow[0]?.score).toBe(2_100);
  });

  test("key errors use key events and legacy error char fallback", () => {
    const modern = session({
      key_events: [
        {
          at_ms: 10,
          action: "insert",
          position: 0,
          expected: "{",
          input: "[",
          correct: false,
        },
        {
          at_ms: 20,
          action: "insert",
          position: 1,
          expected: null,
          input: "x",
          correct: false,
        },
      ],
    });
    const legacy = session({
      key_events: [],
      error_chars: {
        J: 3,
        "\\n": 2,
      },
    });

    expect(aggregateKeyErrors([modern, legacy])).toEqual({
      "[": 1,
      enter: 2,
      j: 3,
      x: 1,
    });
  });

  test("stats line builders expose overview today module and code numbers", () => {
    const comprehensive = session({
      daily_run_id: "20260605-1",
      module: "programming_basics",
      error_count: 20,
      backspace_count: 5,
      token_stats: [
        {
          token: "pending",
          kind: "word",
          start_delay_ms: 100,
          duration_ms: 400,
          errors: 2,
        },
      ],
    });
    const code = session({
      mode: "code",
      module: "code_practice",
      active_ms: 30_000,
      correct_chars: 150,
      accuracy: 100,
      error_count: 1,
      token_stats: [
        {
          token: "=>",
          kind: "symbol",
          start_delay_ms: 100,
          duration_ms: 500,
          errors: 2,
        },
      ],
    });

    expect(recordErrorRate(comprehensive)).toBe(20);
    expect(statsOverviewLines([comprehensive, code], 20, "zh")[0]).toContain(
      "总览  2 次 | 1 天",
    );
    expect(statsTodayLines([comprehensive, code], 20, "zh", { now: NOW })).toEqual(
      expect.arrayContaining([
        "今日 2 次练习",
        expect.stringContaining("综合练习  1 次 | active 1 分钟"),
        expect.stringContaining("专项练习  1 次 | active 30 秒"),
      ]),
    );
    expect(statsModuleLines([comprehensive, code], 20, "en")).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Next driver  Programming basics | error 20.0%"),
        expect.stringContaining("Code practice  1 sessions | active 30s | WPM 60.0"),
      ]),
    );
    expect(statsCodeLines([comprehensive, code], 20, "zh")).toEqual(
      expect.arrayContaining([
        expect.stringContaining("代码实战  1 次 | active 30 秒 | WPM 60.0"),
        expect.stringContaining("符号  =>(2)"),
      ]),
    );
    expect(statsCodeLines([comprehensive, code], 20, "zh", { speedUnit: "cpm" })).toEqual(
      expect.arrayContaining([
        expect.stringContaining("代码实战  1 次 | active 30 秒 | CPM 300.0"),
      ]),
    );
    expect(statsTokenLines([comprehensive, code], 20, "en")).toEqual(
      expect.arrayContaining([
        "Token stats",
        "High-error words/chunks  pending(2)",
        "High-error symbols  =>(2)",
        expect.stringContaining("Slow tokens  =>("),
      ]),
    );
    expect(statsComprehensiveLines([comprehensive, code], 20, "en")).toEqual(
      expect.arrayContaining([
        "Full practice runs",
        expect.stringContaining(
          "20260605-1  1 groups | 1 modules | active 1m | WPM 18.0",
        ),
      ]),
    );
    expect(statsDayLines("2026-06-05", 0, 1, [comprehensive, code], 3, "en")).toEqual(
      expect.arrayContaining([
        "Date 2026-06-05  (1/1)  Left/Right switches date",
        expect.stringContaining("Day 2 sessions | 2m | active 2m | idle 0s"),
        expect.stringContaining("Target ["),
      ]),
    );
  });

  test("overview recommendation ignores stale problem records", () => {
    const staleProblem = session({
      started_at: "2026-05-01T03:00:00.000Z",
      key_events: [
        {
          at_ms: 10,
          action: "insert",
          position: 0,
          expected: "j",
          input: "f",
          correct: false,
        },
        {
          at_ms: 20,
          action: "insert",
          position: 1,
          expected: "j",
          input: "f",
          correct: false,
        },
      ],
    });
    const recentClean = session({
      started_at: "2026-06-05T03:00:00.000Z",
    });

    expect(statsOverviewLines([staleProblem, recentClean], 20, "en", { now: NOW })).toContain(
      "Full plan  Next full practice will stay balanced.",
    );
  });

  test("key stats lines sort by selected metric", () => {
    const lines = keyStatsLines(
      [
        defaultKeyAggregate({
          key: "j",
          sample_count: 2,
          avg_ms: 200,
          fastest_ms: 120,
          slowest_ms: 260,
          error_rate: 10,
          confidence: 0.8,
        }),
        defaultKeyAggregate({
          key: "[",
          sample_count: 5,
          avg_ms: 400,
          fastest_ms: 80,
          slowest_ms: 900,
          error_rate: 20,
          confidence: 0.4,
        }),
      ],
      "slowest_average",
      10,
      "en",
    );

    expect(lines[0]).toBe("Key stats  sort: slowest avg");
    expect(lines[2]).toContain("[");
    expect(lines[3]).toContain("j");
  });
});
