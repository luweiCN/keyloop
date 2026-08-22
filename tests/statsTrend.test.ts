import { describe, expect, test } from "bun:test";

import { defaultSessionRecord, type SessionRecord } from "../src/domain/model";
import {
  buildOverviewPerformanceTrend,
  classifyPerformanceRecord,
} from "../src/report/performanceTrend";
import {
  buildActivityDays,
  buildComprehensiveRuns,
  buildDashboardSkillData,
  buildDashboardTrend,
  buildModuleSummaries,
} from "../src/report/statsDashboard";
import { buildBrailleTrendChart } from "../src/ui/opentui/brailleChart";
import {
  DISPLAY_KEYBOARD_ROWS,
  activityGlyph,
  activityLevel,
  movePhysicalKey,
  proportionalWidths,
  sparkline,
  summarizeActivity,
} from "../src/ui/opentui/statsVisuals";

function performanceRecord(
  wpm: number,
  startedAt: string,
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  const activeMs = overrides.active_ms ?? 60_000;
  const correctChars = Math.round((wpm * 5 * activeMs) / 60_000);
  return defaultSessionRecord({
    id: startedAt,
    started_at: startedAt,
    category: "code_mix",
    active_ms: activeMs,
    duration_ms: activeMs,
    typed_len: correctChars,
    correct_chars: correctChars,
    accuracy: 95,
    wpm: 999,
    ...overrides,
  });
}

describe("performance trend model", () => {
  test("qualifies records from active time and recomputed speed", () => {
    const eligible = classifyPerformanceRecord(
      performanceRecord(20, "2026-08-20T10:00:00.000Z", {
        completion_state: "partial",
        active_ms: 15_000,
        duration_ms: 90_000,
        typed_len: 0,
        user_input: "abcdefghijklmnopqrstuvwxyz",
        correct_chars: 25,
      }),
    );

    expect(eligible).toEqual({
      status: "eligible",
      point: expect.objectContaining({
        form: "code",
        wpm: 20,
        activeMs: 15_000,
      }),
    });
    expect(
      classifyPerformanceRecord(
        performanceRecord(20, "2026-08-20T10:01:00.000Z", {
          active_ms: 0,
          duration_ms: 60_000,
        }),
      ),
    ).toEqual({ status: "excluded", reason: "active_time" });
    expect(
      classifyPerformanceRecord(
        performanceRecord(20, "2026-08-20T10:02:00.000Z", {
          typed_len: 24,
          correct_chars: 24,
        }),
      ),
    ).toEqual({ status: "excluded", reason: "typed_length" });
    expect(
      classifyPerformanceRecord(
        performanceRecord(301, "2026-08-20T10:03:00.000Z"),
      ),
    ).toEqual({ status: "excluded", reason: "invalid_speed" });
    expect(
      classifyPerformanceRecord(
        performanceRecord(20, "2026-08-20T10:04:00.000Z", {
          category: "unknown",
        }),
      ),
    ).toEqual({ status: "excluded", reason: "unclassified_form" });
  });

  test("selects the latest form and compares weighted windows without trusting stored wpm", () => {
    const records = [
      performanceRecord(40, "2026-08-04T10:00:00.000Z", {
        category: "everyday_words",
      }),
      performanceRecord(30, "2026-08-03T10:00:00.000Z", {
        category: "everyday_words",
      }),
      performanceRecord(35, "2026-08-03T12:00:00.000Z"),
      performanceRecord(20, "2026-08-02T10:00:00.000Z", {
        category: "everyday_words",
      }),
      performanceRecord(25, "2026-08-02T12:00:00.000Z"),
      performanceRecord(10, "2026-08-01T10:00:00.000Z", {
        category: "everyday_words",
      }),
      performanceRecord(15, "2026-08-01T12:00:00.000Z"),
      performanceRecord(20, "2026-08-05T10:00:00.000Z", {
        category: "unknown",
      }),
    ];

    const trend = buildOverviewPerformanceTrend(records, 2);

    expect(trend).not.toBeNull();
    expect(trend?.form).toBe("words");
    expect(trend?.points.map((point) => point.wpm)).toEqual([30, 40]);
    expect(trend?.recentWpm).toBe(35);
    expect(trend?.previousWpm).toBe(15);
    expect(trend?.deltaWpm).toBe(20);
    expect(trend?.previousCount).toBe(2);
    expect(trend?.eligibleCount).toBe(7);
    expect(trend?.totalCount).toBe(8);
  });

  test("returns null when no record can participate in a same-form trend", () => {
    expect(
      buildOverviewPerformanceTrend([
        performanceRecord(20, "2026-08-20T10:00:00.000Z", {
          category: "unknown",
        }),
      ]),
    ).toBeNull();
  });
});

describe("terminal Braille trend chart", () => {
  test("renders connected Braille cells while keeping every session point visible", () => {
    const chart = buildBrailleTrendChart(
      [
        { value: 20, label: "08-01" },
        { value: 30, label: "08-10" },
        { value: 25, label: "08-20" },
      ],
      { width: 17, height: 5, selectedIndex: 2, mode: "braille" },
    );

    expect(chart.rows).toHaveLength(5);
    expect(
      chart.rows.every((row) => Array.from(rowText(row)).length === 17),
    ).toBe(true);
    expect(chart.rows[0]?.label).not.toBe("");
    expect(chart.rows[2]?.label).not.toBe("");
    expect(chart.rows[4]?.label).not.toBe("");
    const plot = chart.rows.map(rowText).join("");
    expect(plot).toMatch(/[\u2801-\u28ff]/u);
    expect(plot).toContain("●");
    expect(plot).toContain("◆");
    expect(plot).not.toMatch(/[╱╲]/u);
    expect(chart.selectedIndex).toBe(2);
    expect(chart.axis).toBe(`└${"─".repeat(17)}`);
    expect(Array.from(chart.labels).length).toBe(17);
    expect(chart.labels).toContain("08-01");
    expect(chart.labels).toContain("08-20");
    expect(chart.min).toBeLessThanOrEqual(20);
    expect(chart.max).toBeGreaterThanOrEqual(30);
  });

  test("supports a non-Braille dot fallback and clamps selection", () => {
    const chart = buildBrailleTrendChart(
      [
        { value: 20, label: "08-01" },
        { value: 30, label: "08-10" },
        { value: 25, label: "08-20" },
      ],
      { width: 17, height: 5, selectedIndex: 99, mode: "dots" },
    );

    const plot = chart.rows.map(rowText).join("");
    expect(plot).not.toMatch(/[\u2800-\u28ff]/u);
    expect(plot).toContain("●");
    expect(plot).toContain("◆");
    expect(chart.selectedIndex).toBe(2);
  });

  test("expands a flat single-point range instead of emitting NaN", () => {
    const chart = buildBrailleTrendChart([{ value: 42, label: "08-20" }], {
      width: 11,
      height: 5,
      selectedIndex: 0,
      mode: "braille",
    });

    expect(chart.min).toBeLessThan(42);
    expect(chart.max).toBeGreaterThan(42);
    expect(chart.rows.map(rowText).join("")).toContain("◆");
    expect(chart.rows.map(rowText).join("")).not.toContain("NaN");
    expect(chart.labels).toContain("08-20");
  });
});

describe("stats dashboard model", () => {
  test("shows 30 sessions while keeping recent 10 comparison independent", () => {
    const records = Array.from({ length: 40 }, (_, index) => {
      const startedAt = new Date("2026-07-01T10:00:00.000Z");
      startedAt.setUTCDate(startedAt.getUTCDate() + index);
      return performanceRecord(index + 20, startedAt.toISOString());
    });

    const trend = buildDashboardTrend(records, {
      form: "code",
      range: "sessions_30",
      metric: "speed",
    });

    expect(trend?.points).toHaveLength(30);
    expect(trend?.points[0]?.value).toBe(30);
    expect(trend?.latestValue).toBe(59);
    expect(trend?.recentValue).toBe(54.5);
    expect(trend?.previousValue).toBe(44.5);
    expect(trend?.delta).toBe(10);
    expect(trend?.formEligibleCount).toBe(40);
    expect(trend?.bucketUnit).toBe("session");
  });

  test("aggregates 90-day points by local day and all-time points adaptively", () => {
    const records = [
      performanceRecord(20, "2023-01-02T10:00:00.000Z"),
      performanceRecord(30, "2026-08-20T09:00:00.000Z"),
      performanceRecord(50, "2026-08-20T11:00:00.000Z"),
      performanceRecord(40, "2026-08-21T10:00:00.000Z"),
    ];

    const recent = buildDashboardTrend(records, {
      form: "code",
      range: "days_90",
      now: new Date(2026, 7, 22, 12),
    });
    expect(recent?.points).toHaveLength(2);
    expect(recent?.points[0]).toMatchObject({ value: 40, sessionCount: 2 });
    expect(recent?.bucketUnit).toBe("day");

    const all = buildDashboardTrend(records, {
      form: "code",
      range: "all",
      now: new Date(2026, 7, 22, 12),
    });
    expect(all?.bucketUnit).toBe("month");
    expect(all?.points).toHaveLength(2);
  });

  test("builds activity, module composition, and comprehensive runs", () => {
    const records = [
      performanceRecord(30, "2026-08-21T10:00:00.000Z", {
        module: "code_practice",
        daily_run_id: "run-1",
        lesson_index: 1,
      }),
      performanceRecord(40, "2026-08-21T11:00:00.000Z", {
        module: "everyday_english",
        category: "everyday_words",
        daily_run_id: "run-1",
        lesson_index: 0,
      }),
    ];

    const activity = buildActivityDays(records, new Date(2026, 7, 22, 12), 3);
    expect(activity.map((day) => day.sessionCount)).toEqual([0, 2, 0]);
    expect(buildModuleSummaries(records)).toEqual([
      { module: "code_practice", activeMs: 60_000, sessionCount: 1 },
      { module: "everyday_english", activeMs: 60_000, sessionCount: 1 },
    ]);
    const runs = buildComprehensiveRuns(records);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.records.map((record) => record.lesson_index)).toEqual([0, 1]);
    expect(runs[0]?.activeMs).toBe(120_000);
    expect(buildDashboardSkillData(records).dimensions.map((item) => item.id)).toContain(
      "word_fluency",
    );
  });
});

describe("stats terminal visual primitives", () => {
  test("renders compact distributions and deterministic keyboard movement", () => {
    expect(Array.from(sparkline([1, 2, 3, 2], 4))).toHaveLength(4);
    expect(sparkline([], 5)).toBe("·····");
    expect(activityGlyph(activityLevel(0))).toBe("·");
    expect(activityGlyph(activityLevel(31 * 60_000))).toBe("█");
    expect(movePhysicalKey("a", "up")).toBe("q");
    expect(movePhysicalKey("a", "right")).toBe("s");
    expect(proportionalWidths([1, 2, 3], 17).reduce((sum, value) => sum + value, 0)).toBe(17);
  });

  test("summarizes activity streaks and exposes a recognizable keyboard shell", () => {
    expect(
      summarizeActivity([
        { date: "2026-08-19", activeMs: 60_000, sessionCount: 1 },
        { date: "2026-08-20", activeMs: 0, sessionCount: 0 },
        { date: "2026-08-21", activeMs: 60_000, sessionCount: 2 },
        { date: "2026-08-22", activeMs: 120_000, sessionCount: 1 },
        { date: "2026-08-23", activeMs: 180_000, sessionCount: 3 },
      ]),
    ).toEqual({
      activeDays: 4,
      totalActiveMs: 420_000,
      totalSessions: 7,
      currentStreak: 3,
      longestStreak: 3,
    });

    expect(DISPLAY_KEYBOARD_ROWS).toHaveLength(5);
    expect(DISPLAY_KEYBOARD_ROWS[0]?.at(-1)).toMatchObject({ label: "⌫", width: 7 });
    expect(DISPLAY_KEYBOARD_ROWS[2]?.at(-1)).toMatchObject({ label: "Enter", width: 8 });
    expect(DISPLAY_KEYBOARD_ROWS[4]?.find((key) => key.label === "Space")?.width).toBe(30);
    expect(
      DISPLAY_KEYBOARD_ROWS.flat().find((key) => key.physicalKeyId === "q")?.label,
    ).toBe("Q");
  });
});

function rowText(row: {
  readonly runs: readonly { readonly content: string }[];
}): string {
  return row.runs.map((run) => run.content).join("");
}
