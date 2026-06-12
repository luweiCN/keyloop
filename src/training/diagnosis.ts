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
