import type {
  PracticePlan,
  SessionRecord,
  TrainingCategory,
} from "../domain/model";

export type SkillDimensionId =
  | "home_row"
  | "top_row"
  | "bottom_row"
  | "left_hand"
  | "right_hand"
  | "digits"
  | "symbols"
  | "capitalization"
  | "word_fluency"
  | "long_words";

export type SkillTrend = "improving" | "stable" | "declining" | "insufficient";
export type SkillStatus = "weak" | "normal" | "stable" | "unrated";

export interface SkillDiagnosis {
  id: SkillDimensionId;
  /** 参与统计的会话数（最近窗口内） */
  samples: number;
  /** 字符/词级事件总数 */
  events: number;
  /** EWMA 错误率（0-100），无数据为 null */
  ewma_error_rate: number | null;
  /** EWMA 速度：键维度为平均键间隔 ms（低好），词维度为 WPM（高好），无数据为 null */
  ewma_speed: number | null;
  trend: SkillTrend;
  status: SkillStatus;
}

const HOME_ROW = new Set([..."asdfghjkl"]);
const TOP_ROW = new Set([..."qwertyuiop"]);
const BOTTOM_ROW = new Set([..."zxcvbnm"]);
const LEFT_HAND = new Set([..."qwertasdfgzxcvb"]);
const RIGHT_HAND = new Set([..."yuiophjklnm"]);

export function charSkillDimensions(char: string): SkillDimensionId[] {
  if (/^[0-9]$/u.test(char)) {
    return ["digits"];
  }
  if (/^[A-Za-z]$/u.test(char)) {
    const lower = char.toLowerCase();
    const dimensions: SkillDimensionId[] = [];
    if (HOME_ROW.has(lower)) dimensions.push("home_row");
    if (TOP_ROW.has(lower)) dimensions.push("top_row");
    if (BOTTOM_ROW.has(lower)) dimensions.push("bottom_row");
    if (LEFT_HAND.has(lower)) dimensions.push("left_hand");
    if (RIGHT_HAND.has(lower)) dimensions.push("right_hand");
    if (/^[A-Z]$/u.test(char)) dimensions.push("capitalization");
    return dimensions;
  }
  if (char === " " || char === "\n" || char === "\t") {
    return [];
  }
  if (/^[!-/:-@[-`{-~]$/u.test(char)) {
    return ["symbols"];
  }
  return [];
}

/** EWMA 半衰期：4 个样本 */
const EWMA_HALF_LIFE = 4;
/** 每维度/形态取最近多少次会话 */
export const DIAGNOSIS_WINDOW_SESSIONS = 10;

/** values 按时间正序（旧→新），返回指数加权平均；空数组返回 null */
export function ewmaAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (let index = 0; index < values.length; index += 1) {
    const age = values.length - 1 - index; // 最新样本 age=0
    const weight = Math.pow(0.5, age / EWMA_HALF_LIFE);
    weightedSum += values[index]! * weight;
    weightTotal += weight;
  }
  return weightedSum / weightTotal;
}

export type TrendDirection = "higher_is_better" | "lower_is_better";

/** 窗口前半 vs 后半均值对比，变化超过 ±8% 判趋势；样本 <4 为 insufficient */
export function seriesTrend(values: number[], direction: TrendDirection): SkillTrend {
  if (values.length < 4) {
    return "insufficient";
  }
  const half = Math.floor(values.length / 2);
  const first = average(values.slice(0, half));
  const second = average(values.slice(values.length - half));
  if (first === 0) {
    return "stable";
  }
  const change = (second - first) / first;
  if (Math.abs(change) <= 0.08) {
    return "stable";
  }
  const better = direction === "higher_is_better" ? change > 0 : change < 0;
  return better ? "improving" : "declining";
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const CHAR_DIMENSIONS: SkillDimensionId[] = [
  "home_row",
  "top_row",
  "bottom_row",
  "left_hand",
  "right_hand",
  "digits",
  "symbols",
  "capitalization",
];

/** 单维度在单次会话内的样本 */
interface DimensionSessionSample {
  events: number;
  errors: number;
  /** 平均键间隔 ms（仅统计 ≤2000ms 的相邻 insert 间隔） */
  avgIntervalMs: number | null;
}

/** 键间隔超过该值视为停顿，不计入速度 */
const MAX_INTERVAL_MS = 2000;
/** 维度事件数低于此值的会话不计入该维度样本 */
const MIN_DIMENSION_EVENTS = 3;
/** 总事件量低于此值视为 unrated */
const MIN_RATED_EVENTS = 20;

function dimensionSamplesForRecord(
  record: SessionRecord,
): Map<SkillDimensionId, DimensionSessionSample> {
  const stats = new Map<
    SkillDimensionId,
    { events: number; errors: number; intervalSum: number; intervalCount: number }
  >();
  let previousAtMs: number | null = null;
  for (const event of record.key_events) {
    if (event.action !== "insert") {
      previousAtMs = null;
      continue;
    }
    const char = event.expected ?? event.input;
    const interval = previousAtMs === null ? null : event.at_ms - previousAtMs;
    previousAtMs = event.at_ms;
    if (char === null) {
      continue;
    }
    for (const dimension of charSkillDimensions(char)) {
      const entry = stats.get(dimension) ?? {
        events: 0,
        errors: 0,
        intervalSum: 0,
        intervalCount: 0,
      };
      entry.events += 1;
      if (!event.correct) {
        entry.errors += 1;
      }
      if (interval !== null && interval > 0 && interval <= MAX_INTERVAL_MS) {
        entry.intervalSum += interval;
        entry.intervalCount += 1;
      }
      stats.set(dimension, entry);
    }
  }
  const samples = new Map<SkillDimensionId, DimensionSessionSample>();
  for (const [dimension, entry] of stats) {
    if (entry.events < MIN_DIMENSION_EVENTS) {
      continue;
    }
    samples.set(dimension, {
      events: entry.events,
      errors: entry.errors,
      avgIntervalMs:
        entry.intervalCount === 0 ? null : entry.intervalSum / entry.intervalCount,
    });
  }
  return samples;
}

export function diagnoseCharSkills(records: SessionRecord[]): SkillDiagnosis[] {
  // 按时间正序处理（旧→新），EWMA 假定数组尾部最新
  const ordered = [...records].sort(
    (left, right) => Date.parse(left.started_at) - Date.parse(right.started_at),
  );
  const perDimension = new Map<SkillDimensionId, DimensionSessionSample[]>();
  for (const record of ordered) {
    for (const [dimension, sample] of dimensionSamplesForRecord(record)) {
      const list = perDimension.get(dimension) ?? [];
      list.push(sample);
      perDimension.set(dimension, list);
    }
  }

  return CHAR_DIMENSIONS.map((dimension) => {
    const all = perDimension.get(dimension) ?? [];
    const window = all.slice(-DIAGNOSIS_WINDOW_SESSIONS);
    const events = window.reduce((sum, sample) => sum + sample.events, 0);
    if (window.length === 0 || events < MIN_RATED_EVENTS) {
      return {
        id: dimension,
        samples: window.length,
        events,
        ewma_error_rate: null,
        ewma_speed: null,
        trend: "insufficient" as const,
        status: "unrated" as const,
      };
    }
    const errorRates = window.map((sample) => (sample.errors / sample.events) * 100);
    const intervals = window
      .map((sample) => sample.avgIntervalMs)
      .filter((value): value is number => value !== null);
    const ewmaErrorRate = ewmaAverage(errorRates);
    const ewmaInterval = ewmaAverage(intervals);
    const trend = seriesTrend(intervals, "lower_is_better");
    return {
      id: dimension,
      samples: window.length,
      events,
      ewma_error_rate: ewmaErrorRate,
      ewma_speed: ewmaInterval,
      trend,
      status: dimensionStatus(window.length, ewmaErrorRate, trend),
    };
  });
}

function dimensionStatus(
  samples: number,
  ewmaErrorRate: number | null,
  trend: SkillTrend,
): SkillStatus {
  if (ewmaErrorRate === null) {
    return "unrated";
  }
  if (ewmaErrorRate >= 8 || trend === "declining") {
    return "weak";
  }
  // 到这里 trend 必非 declining，无需再判
  if (samples >= 3 && ewmaErrorRate <= 2.5) {
    return "stable";
  }
  return "normal";
}
