import type { SessionRecord } from "../domain/model";
import { formForCategory, type TrainingForm } from "../training/diagnosis";
import { effectiveTypedLen } from "./stats";

export const PERFORMANCE_MIN_ACTIVE_MS = 15_000;
export const PERFORMANCE_MIN_TYPED_LEN = 25;
export const PERFORMANCE_MAX_WPM = 300;
export const PERFORMANCE_TREND_WINDOW_SIZE = 10;

export type PerformanceExclusionReason =
  | "active_time"
  | "typed_length"
  | "correct_chars"
  | "invalid_speed"
  | "unclassified_form"
  | "invalid_started_at";

export interface PerformanceTrendPoint {
  readonly id: string;
  readonly startedAt: string;
  readonly form: TrainingForm;
  readonly wpm: number;
  readonly activeMs: number;
  readonly correctChars: number;
}

export type PerformanceEligibility =
  | { readonly status: "eligible"; readonly point: PerformanceTrendPoint }
  | {
      readonly status: "excluded";
      readonly reason: PerformanceExclusionReason;
    };

export interface OverviewPerformanceTrend {
  readonly form: TrainingForm;
  readonly points: readonly PerformanceTrendPoint[];
  readonly recentWpm: number;
  readonly previousWpm: number | null;
  readonly deltaWpm: number | null;
  readonly previousCount: number;
  readonly eligibleCount: number;
  readonly totalCount: number;
}

export function classifyPerformanceRecord(
  record: SessionRecord,
): PerformanceEligibility {
  if (record.active_ms < PERFORMANCE_MIN_ACTIVE_MS) {
    return { status: "excluded", reason: "active_time" };
  }
  if (effectiveTypedLen(record) < PERFORMANCE_MIN_TYPED_LEN) {
    return { status: "excluded", reason: "typed_length" };
  }
  if (record.correct_chars <= 0) {
    return { status: "excluded", reason: "correct_chars" };
  }

  const wpm = record.correct_chars / 5 / (record.active_ms / 60_000);
  if (!Number.isFinite(wpm) || wpm > PERFORMANCE_MAX_WPM) {
    return { status: "excluded", reason: "invalid_speed" };
  }

  const form = formForCategory(record.category);
  if (form === null) {
    return { status: "excluded", reason: "unclassified_form" };
  }
  if (!Number.isFinite(Date.parse(record.started_at))) {
    return { status: "excluded", reason: "invalid_started_at" };
  }

  return {
    status: "eligible",
    point: {
      id: record.id,
      startedAt: record.started_at,
      form,
      wpm,
      activeMs: record.active_ms,
      correctChars: record.correct_chars,
    },
  };
}

export function buildOverviewPerformanceTrend(
  records: readonly SessionRecord[],
  windowSize = 10,
): OverviewPerformanceTrend | null {
  const eligiblePoints = records
    .map(classifyPerformanceRecord)
    .filter(
      (
        result,
      ): result is Extract<PerformanceEligibility, { status: "eligible" }> =>
        result.status === "eligible",
    )
    .map((result) => result.point)
    .sort(
      (left, right) =>
        Date.parse(left.startedAt) - Date.parse(right.startedAt) ||
        left.id.localeCompare(right.id),
    );
  const latest = eligiblePoints.at(-1);
  if (latest === undefined) {
    return null;
  }

  const safeWindowSize = Math.max(1, Math.trunc(windowSize));
  const formPoints = eligiblePoints.filter(
    (point) => point.form === latest.form,
  );
  const points = formPoints.slice(-safeWindowSize);
  const previousPoints = formPoints.slice(-safeWindowSize * 2, -safeWindowSize);
  const recentWpm = aggregatePointWpm(points);
  const previousWpm =
    previousPoints.length > 0 ? aggregatePointWpm(previousPoints) : null;

  return {
    form: latest.form,
    points,
    recentWpm,
    previousWpm,
    deltaWpm: previousWpm === null ? null : recentWpm - previousWpm,
    previousCount: previousPoints.length,
    eligibleCount: eligiblePoints.length,
    totalCount: records.length,
  };
}

function aggregatePointWpm(points: readonly PerformanceTrendPoint[]): number {
  const correctChars = points.reduce(
    (total, point) => total + point.correctChars,
    0,
  );
  const activeMs = points.reduce((total, point) => total + point.activeMs, 0);
  return correctChars / 5 / (activeMs / 60_000);
}
