import type { SessionRecord, TrainingModule } from "../domain/model";
import {
  diagnoseSkills,
  formForCategory,
  TRAINING_FORMS,
  type SkillDiagnosis,
  type TrainingForm,
} from "../training/diagnosis";
import { keySignals, type KeySignal } from "../training/keySignal";
import {
  classifyPerformanceRecord,
  type PerformanceTrendPoint,
} from "./performanceTrend";
import {
  effectiveActiveMs,
  effectiveTypedLen,
  localDateKey,
} from "./stats";

export const STATS_TREND_METRICS = ["speed", "accuracy"] as const;
export type StatsTrendMetric = (typeof STATS_TREND_METRICS)[number];

export const STATS_TREND_RANGES = ["sessions_30", "days_90", "all"] as const;
export type StatsTrendRange = (typeof STATS_TREND_RANGES)[number];

export interface DashboardTrendPoint {
  readonly id: string;
  readonly label: string;
  readonly startedAt: string;
  readonly value: number;
  readonly wpm: number;
  readonly accuracy: number;
  readonly activeMs: number;
  readonly sessionCount: number;
}

export interface DashboardTrend {
  readonly form: TrainingForm;
  readonly metric: StatsTrendMetric;
  readonly range: StatsTrendRange;
  readonly points: readonly DashboardTrendPoint[];
  readonly latestValue: number;
  readonly recentValue: number;
  readonly previousValue: number | null;
  readonly delta: number | null;
  readonly eligibleCount: number;
  readonly formEligibleCount: number;
  readonly totalCount: number;
  readonly bucketUnit: "session" | "day" | "week" | "month";
}

export interface DashboardActivityDay {
  readonly date: string;
  readonly activeMs: number;
  readonly sessionCount: number;
}

export interface DashboardModuleSummary {
  readonly module: TrainingModule;
  readonly activeMs: number;
  readonly sessionCount: number;
}

export interface DashboardComprehensiveRun {
  readonly id: string;
  readonly date: string;
  readonly startedAt: string;
  readonly activeMs: number;
  readonly records: readonly SessionRecord[];
}

export interface DashboardSkillData {
  readonly keys: readonly KeySignal[];
  readonly dimensions: readonly SkillDiagnosis[];
}

interface EligibleRecord {
  readonly record: SessionRecord;
  readonly point: PerformanceTrendPoint;
}

interface TrendBucket {
  key: string;
  label: string;
  startedAt: string;
  records: EligibleRecord[];
}

export interface BuildDashboardTrendOptions {
  readonly form?: TrainingForm;
  readonly metric?: StatsTrendMetric;
  readonly range?: StatsTrendRange;
  readonly now?: Date;
}

export function availablePerformanceForms(
  records: readonly SessionRecord[],
): TrainingForm[] {
  const available = new Set(
    eligibleRecords(records).map(({ point }) => point.form),
  );
  return TRAINING_FORMS.filter((form) => available.has(form));
}

export function latestPerformanceForm(
  records: readonly SessionRecord[],
): TrainingForm | null {
  return eligibleRecords(records).at(-1)?.point.form ?? null;
}

export function buildDashboardTrend(
  records: readonly SessionRecord[],
  options: BuildDashboardTrendOptions = {},
): DashboardTrend | null {
  const eligible = eligibleRecords(records);
  const form = options.form ?? eligible.at(-1)?.point.form;
  if (form === undefined) {
    return null;
  }
  const metric = options.metric ?? "speed";
  const range = options.range ?? "sessions_30";
  const formRecords = eligible.filter(({ point }) => point.form === form);
  if (formRecords.length === 0) {
    return null;
  }

  const buckets = trendBuckets(formRecords, range, options.now ?? new Date());
  const points = buckets.map((bucket) => dashboardPoint(bucket, metric));
  const recent = formRecords.slice(-10);
  const previous = formRecords.slice(-20, -10);
  const recentValue = aggregateMetric(recent, metric);
  const previousValue =
    previous.length === 0 ? null : aggregateMetric(previous, metric);

  return {
    form,
    metric,
    range,
    points,
    latestValue: points.at(-1)?.value ?? recentValue,
    recentValue,
    previousValue,
    delta: previousValue === null ? null : recentValue - previousValue,
    eligibleCount: eligible.length,
    formEligibleCount: formRecords.length,
    totalCount: records.length,
    bucketUnit: bucketUnit(range, formRecords),
  };
}

export function buildActivityDays(
  records: readonly SessionRecord[],
  now: Date,
  dayCount: number,
): DashboardActivityDay[] {
  const count = Math.max(1, Math.trunc(dayCount));
  const byDate = new Map<string, { activeMs: number; sessionCount: number }>();
  for (const record of records) {
    const date = localDateKey(new Date(record.started_at));
    if (date === "") {
      continue;
    }
    const entry = byDate.get(date) ?? { activeMs: 0, sessionCount: 0 };
    entry.activeMs += effectiveActiveMs(record);
    entry.sessionCount += 1;
    byDate.set(date, entry);
  }

  const end = startOfLocalDay(now);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (count - 1 - index));
    const key = localDateKey(date);
    const entry = byDate.get(key);
    return {
      date: key,
      activeMs: entry?.activeMs ?? 0,
      sessionCount: entry?.sessionCount ?? 0,
    };
  });
}

export function buildActivityCalendarDays(
  records: readonly SessionRecord[],
  anchor: Date,
  weekCount = 52,
): DashboardActivityDay[] {
  const weeks = Math.max(1, Math.trunc(weekCount));
  const end = startOfLocalDay(anchor);
  const daysUntilSunday = (7 - end.getDay()) % 7;
  end.setDate(end.getDate() + daysUntilSunday);
  return buildActivityDays(records, end, weeks * 7);
}

export function activeRecordDates(
  records: readonly SessionRecord[],
): string[] {
  return [
    ...new Set(
      records
        .map((record) => localDateKey(new Date(record.started_at)))
        .filter((date) => date !== ""),
    ),
  ].sort().reverse();
}

export function recordsForDate(
  records: readonly SessionRecord[],
  date: string,
): SessionRecord[] {
  return records
    .filter((record) => localDateKey(new Date(record.started_at)) === date)
    .sort(
      (left, right) =>
        Date.parse(right.started_at) - Date.parse(left.started_at) ||
        left.id.localeCompare(right.id),
    );
}

export function buildModuleSummaries(
  records: readonly SessionRecord[],
): DashboardModuleSummary[] {
  const byModule = new Map<TrainingModule, DashboardModuleSummary>();
  for (const record of records) {
    const current = byModule.get(record.module) ?? {
      module: record.module,
      activeMs: 0,
      sessionCount: 0,
    };
    byModule.set(record.module, {
      module: record.module,
      activeMs: current.activeMs + effectiveActiveMs(record),
      sessionCount: current.sessionCount + 1,
    });
  }
  return [...byModule.values()].sort(
    (left, right) =>
      right.activeMs - left.activeMs || left.module.localeCompare(right.module),
  );
}

export function buildComprehensiveRuns(
  records: readonly SessionRecord[],
): DashboardComprehensiveRun[] {
  const byRun = new Map<string, SessionRecord[]>();
  for (const record of records) {
    const id = record.daily_run_id.trim();
    if (id === "") {
      continue;
    }
    byRun.set(id, [...(byRun.get(id) ?? []), record]);
  }
  return [...byRun.entries()]
    .map(([id, runRecords]) => {
      const ordered = [...runRecords].sort(
        (left, right) =>
          (left.lesson_index ?? Number.MAX_SAFE_INTEGER) -
            (right.lesson_index ?? Number.MAX_SAFE_INTEGER) ||
          Date.parse(left.started_at) - Date.parse(right.started_at),
      );
      const startedAt = ordered[0]?.started_at ?? "";
      return {
        id,
        date: localDateKey(new Date(startedAt)),
        startedAt,
        activeMs: ordered.reduce(
          (sum, record) => sum + effectiveActiveMs(record),
          0,
        ),
        records: ordered,
      };
    })
    .sort(
      (left, right) =>
        Date.parse(right.startedAt) - Date.parse(left.startedAt) ||
        left.id.localeCompare(right.id),
    );
}

export function buildDashboardSkillData(
  records: readonly SessionRecord[],
): DashboardSkillData {
  return {
    keys: keySignals(records),
    dimensions: diagnoseSkills([...records]),
  };
}

export function sessionForm(record: SessionRecord): TrainingForm | null {
  return formForCategory(record.category);
}

function eligibleRecords(records: readonly SessionRecord[]): EligibleRecord[] {
  return records
    .map((record): EligibleRecord | null => {
      const eligibility = classifyPerformanceRecord(record);
      return eligibility.status === "eligible"
        ? { record, point: eligibility.point }
        : null;
    })
    .filter((entry): entry is EligibleRecord => entry !== null)
    .sort(
      (left, right) =>
        Date.parse(left.point.startedAt) - Date.parse(right.point.startedAt) ||
        left.point.id.localeCompare(right.point.id),
    );
}

function trendBuckets(
  records: readonly EligibleRecord[],
  range: StatsTrendRange,
  now: Date,
): TrendBucket[] {
  if (range === "sessions_30") {
    return records.slice(-30).map((entry, index) => ({
      key: entry.point.id,
      label: shortDate(entry.point.startedAt),
      startedAt: entry.point.startedAt,
      records: [entry],
    }));
  }

  const included =
    range === "days_90"
      ? records.filter(
          ({ point }) =>
            Date.parse(point.startedAt) >= ninetyDayCutoff(now).getTime(),
        )
      : records;
  const unit = range === "days_90" ? "day" : allHistoryBucketUnit(included);
  const buckets = new Map<string, TrendBucket>();
  for (const entry of included) {
    const { key, label } = timeBucket(entry.point.startedAt, unit);
    const bucket = buckets.get(key) ?? {
      key,
      label,
      startedAt: entry.point.startedAt,
      records: [],
    };
    bucket.records.push(entry);
    if (Date.parse(entry.point.startedAt) > Date.parse(bucket.startedAt)) {
      bucket.startedAt = entry.point.startedAt;
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort(
    (left, right) =>
      Date.parse(left.startedAt) - Date.parse(right.startedAt) ||
      left.key.localeCompare(right.key),
  );
}

function bucketUnit(
  range: StatsTrendRange,
  records: readonly EligibleRecord[],
): DashboardTrend["bucketUnit"] {
  if (range === "sessions_30") {
    return "session";
  }
  if (range === "days_90") {
    return "day";
  }
  return allHistoryBucketUnit(records);
}

function allHistoryBucketUnit(
  records: readonly EligibleRecord[],
): "day" | "week" | "month" {
  const first = records[0]?.point.startedAt;
  const last = records.at(-1)?.point.startedAt;
  if (first === undefined || last === undefined) {
    return "day";
  }
  const spanDays = Math.max(
    1,
    (Date.parse(last) - Date.parse(first)) / (24 * 60 * 60 * 1_000),
  );
  if (spanDays <= 120) {
    return "day";
  }
  return spanDays <= 1_095 ? "week" : "month";
}

function timeBucket(
  startedAt: string,
  unit: Exclude<DashboardTrend["bucketUnit"], "session">,
): { key: string; label: string } {
  const date = new Date(startedAt);
  if (unit === "day") {
    const key = localDateKey(date);
    return { key, label: key.slice(5) };
  }
  if (unit === "month") {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: key.slice(2) };
  }
  const monday = startOfLocalDay(date);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  const key = localDateKey(monday);
  return { key, label: key.slice(5) };
}

function dashboardPoint(
  bucket: TrendBucket,
  metric: StatsTrendMetric,
): DashboardTrendPoint {
  const wpm = aggregateMetric(bucket.records, "speed");
  const accuracy = aggregateMetric(bucket.records, "accuracy");
  return {
    id: bucket.key,
    label: bucket.label,
    startedAt: bucket.startedAt,
    value: metric === "speed" ? wpm : accuracy,
    wpm,
    accuracy,
    activeMs: bucket.records.reduce(
      (sum, { point }) => sum + point.activeMs,
      0,
    ),
    sessionCount: bucket.records.length,
  };
}

function aggregateMetric(
  records: readonly EligibleRecord[],
  metric: StatsTrendMetric,
): number {
  if (metric === "speed") {
    const correctChars = records.reduce(
      (sum, { point }) => sum + point.correctChars,
      0,
    );
    const activeMs = records.reduce(
      (sum, { point }) => sum + point.activeMs,
      0,
    );
    return activeMs === 0 ? 0 : correctChars / 5 / (activeMs / 60_000);
  }
  const typed = records.reduce(
    (sum, { record }) => sum + effectiveTypedLen(record),
    0,
  );
  if (typed === 0) {
    return 0;
  }
  const correct = records.reduce(
    (sum, { record }) =>
      sum + effectiveTypedLen(record) * (Math.max(0, Math.min(100, record.accuracy)) / 100),
    0,
  );
  return (correct / typed) * 100;
}

function ninetyDayCutoff(now: Date): Date {
  const cutoff = startOfLocalDay(now);
  cutoff.setDate(cutoff.getDate() - 89);
  return cutoff;
}

function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function shortDate(startedAt: string): string {
  const key = localDateKey(new Date(startedAt));
  return key === "" ? "--" : key.slice(5);
}
