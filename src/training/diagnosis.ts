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

export type TrainingForm =
  | "keys"
  | "words"
  | "symbols"
  | "sentences"
  | "articles"
  | "code";

export const TRAINING_FORMS: TrainingForm[] = [
  "keys",
  "words",
  "symbols",
  "sentences",
  "articles",
  "code",
];

export interface FormSpeed {
  form: TrainingForm;
  samples: number;
  ewma_wpm: number | null;
}

export interface FocusPools {
  /** 仅供单词形态回流 */
  words: string[];
  /** 仅供句子形态回流（整句） */
  sentences: string[];
  /** 仅供代码形态回流 */
  code: string[];
  /** 键位/符号技能特征，全形态可用于调整语料特征含量 */
  chars: string[];
}

export interface SkillProfile {
  dimensions: SkillDiagnosis[];
  form_speeds: FormSpeed[];
  focus: FocusPools;
  /** 近 7 天有练习的日子的日均活跃分钟（中位数），无数据为 0 */
  daily_active_minutes_7d: number;
  generated_at: string;
}

export function formForCategory(category: TrainingCategory): TrainingForm | null {
  switch (category) {
    case "foundation_mix":
    case "home_row":
    case "top_row":
    case "bottom_row":
    case "finger_transitions":
    case "punctuation_edges":
    case "letter_combinations":
      return "keys";
    case "basic_words":
    case "everyday_words":
    case "everyday_phrases":
    case "everyday_word_decomposition":
    case "everyday_mix":
    case "programming_terms":
    case "naming_styles":
    case "builtin_api":
    case "word_breakdown":
    case "personal_vocabulary":
    case "custom_library":
      return "words";
    case "numbers_symbols":
    case "symbols_numbers":
    case "programming_basics_mix":
      return "symbols";
    case "everyday_sentences":
      return "sentences";
    case "everyday_articles":
      return "articles";
    case "code_snippet":
    case "code_function":
    case "code_file_fragment":
    case "code_mix":
      return "code";
    case "review":
    case "unknown":
      return null;
  }
}

const FOCUS_WORDS_LIMIT = 12;
const FOCUS_SENTENCES_LIMIT = 5;
const FOCUS_CODE_LIMIT = 8;

function formSpeeds(records: SessionRecord[]): FormSpeed[] {
  const ordered = [...records].sort(
    (left, right) => Date.parse(left.started_at) - Date.parse(right.started_at),
  );
  const perForm = new Map<TrainingForm, number[]>();
  for (const record of ordered) {
    const form = formForCategory(record.category);
    if (form === null || record.active_ms <= 0 || record.correct_chars <= 0) {
      continue;
    }
    const wpm = record.correct_chars / 5 / (record.active_ms / 60_000);
    const list = perForm.get(form) ?? [];
    list.push(wpm);
    perForm.set(form, list);
  }
  return TRAINING_FORMS.map((form) => {
    const window = (perForm.get(form) ?? []).slice(-DIAGNOSIS_WINDOW_SESSIONS);
    return {
      form,
      samples: window.length,
      ewma_wpm: ewmaAverage(window),
    };
  });
}

function focusPools(records: SessionRecord[], plan: PracticePlan): FocusPools {
  const wordErrors = new Map<string, number>();
  const sentenceErrors = new Map<string, number>();
  const codeErrors = new Map<string, number>();
  const window = [...records]
    .sort((left, right) => Date.parse(left.started_at) - Date.parse(right.started_at))
    .slice(-DIAGNOSIS_WINDOW_SESSIONS * 3);
  for (const record of window) {
    const form = formForCategory(record.category);
    if (form === null) {
      continue;
    }
    for (const [token, count] of Object.entries(record.error_tokens)) {
      if (form === "words") {
        wordErrors.set(token, (wordErrors.get(token) ?? 0) + count);
      } else if (form === "code") {
        codeErrors.set(token, (codeErrors.get(token) ?? 0) + count);
      } else if (form === "sentences" || form === "articles") {
        const line = record.target_text
          .split("\n")
          .find((candidate) => candidate.includes(token));
        if (line !== undefined && line.trim().length > 0) {
          sentenceErrors.set(line, (sentenceErrors.get(line) ?? 0) + count);
        }
      }
    }
  }
  return {
    words: topEntries(wordErrors, FOCUS_WORDS_LIMIT),
    sentences: topEntries(sentenceErrors, FOCUS_SENTENCES_LIMIT),
    code: topEntries(codeErrors, FOCUS_CODE_LIMIT),
    chars: [...new Set([...plan.focus_keys, ...plan.focus_symbols])],
  };
}

function topEntries(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort(([leftKey, left], [rightKey, right]) =>
      right === left ? leftKey.localeCompare(rightKey) : right - left,
    )
    .slice(0, limit)
    .map(([key]) => key);
}

function dailyActiveMinutesMedian7d(records: SessionRecord[], now: Date): number {
  const cutoffMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const perDay = new Map<string, number>();
  for (const record of records) {
    const startedMs = Date.parse(record.started_at);
    if (!Number.isFinite(startedMs) || startedMs < cutoffMs) {
      continue;
    }
    const day = record.started_at.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + record.active_ms);
  }
  const minutes = [...perDay.values()]
    .map((ms) => ms / 60_000)
    .sort((left, right) => left - right);
  if (minutes.length === 0) {
    return 0;
  }
  const middle = Math.floor(minutes.length / 2);
  return minutes.length % 2 === 1
    ? minutes[middle]!
    : (minutes[middle - 1]! + minutes[middle]!) / 2;
}

export function buildSkillProfile(
  records: SessionRecord[],
  plan: PracticePlan,
  now: Date = new Date(),
): SkillProfile {
  return {
    dimensions: [...diagnoseCharSkills(records), ...diagnoseTokenSkills(records)],
    form_speeds: formSpeeds(records),
    focus: focusPools(records, plan),
    daily_active_minutes_7d: dailyActiveMinutesMedian7d(records, now),
    generated_at: now.toISOString(),
  };
}

/** 词级维度：word_fluency（普通词）与 long_words（长度 ≥8 的词） */
const LONG_WORD_MIN_LENGTH = 8;

function diagnoseTokenSkills(records: SessionRecord[]): SkillDiagnosis[] {
  const ordered = [...records].sort(
    (left, right) => Date.parse(left.started_at) - Date.parse(right.started_at),
  );
  const fluencySessions: Array<{ wpm: number; errorRate: number; events: number }> = [];
  const longWordSessions: Array<{ wpm: number; errorRate: number; events: number }> = [];
  for (const record of ordered) {
    const wordStats = record.token_stats.filter((stat) => stat.kind === "word");
    collectTokenSample(
      wordStats.filter((stat) => [...stat.token].length < LONG_WORD_MIN_LENGTH),
      fluencySessions,
    );
    collectTokenSample(
      wordStats.filter((stat) => [...stat.token].length >= LONG_WORD_MIN_LENGTH),
      longWordSessions,
    );
  }
  return [
    tokenDiagnosis("word_fluency", fluencySessions),
    tokenDiagnosis("long_words", longWordSessions),
  ];
}

function collectTokenSample(
  stats: Array<{ token: string; duration_ms: number; errors: number }>,
  sessions: Array<{ wpm: number; errorRate: number; events: number }>,
): void {
  if (stats.length < MIN_DIMENSION_EVENTS) {
    return;
  }
  const chars = stats.reduce((sum, stat) => sum + [...stat.token].length, 0);
  const durationMs = stats.reduce((sum, stat) => sum + stat.duration_ms, 0);
  const errors = stats.reduce((sum, stat) => sum + stat.errors, 0);
  if (durationMs <= 0 || chars === 0) {
    return;
  }
  sessions.push({
    wpm: chars / 5 / (durationMs / 60_000),
    errorRate: (errors / chars) * 100,
    events: stats.length,
  });
}

function tokenDiagnosis(
  id: SkillDimensionId,
  sessions: Array<{ wpm: number; errorRate: number; events: number }>,
): SkillDiagnosis {
  const window = sessions.slice(-DIAGNOSIS_WINDOW_SESSIONS);
  const events = window.reduce((sum, session) => sum + session.events, 0);
  if (window.length === 0 || events < MIN_RATED_EVENTS) {
    return {
      id,
      samples: window.length,
      events,
      ewma_error_rate: null,
      ewma_speed: null,
      trend: "insufficient",
      status: "unrated",
    };
  }
  const ewmaErrorRate = ewmaAverage(window.map((session) => session.errorRate));
  const wpmSeries = window.map((session) => session.wpm);
  const trend = seriesTrend(wpmSeries, "higher_is_better");
  return {
    id,
    samples: window.length,
    events,
    ewma_error_rate: ewmaErrorRate,
    ewma_speed: ewmaAverage(wpmSeries),
    trend,
    status: dimensionStatus(window.length, ewmaErrorRate, trend),
  };
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
