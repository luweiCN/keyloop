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
