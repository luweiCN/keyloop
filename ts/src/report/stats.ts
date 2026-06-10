import type {
  KeyAggregate,
  KeyEventRecord,
  Language,
  SessionRecord,
  SpeedUnit,
  TrainingModule,
} from "../domain/model";
import { PLAN_HISTORY_DAYS } from "../training/plan";
import { isNumberedTemplateIdentifier } from "../training/generatedIdentifier";

export type KeyStatsSort =
  | "slowest_average"
  | "fastest"
  | "slowest_single"
  | "highest_error_rate"
  | "lowest_confidence";

export interface ProblemToken {
  token: string;
  errors: number;
  count: number;
  score: number;
}

interface ProblemTokenAggregate {
  errors: number;
  count: number;
  score: number;
}

interface KeyProblem {
  label: string;
  count: number;
}

export interface SpeedDisplayOptions {
  speedUnit?: SpeedUnit;
}

interface StatsOverviewOptions extends SpeedDisplayOptions {
  now?: Date;
}

export function effectiveTypedLen(record: SessionRecord): number {
  if (record.typed_len > 0) {
    return record.typed_len;
  }
  return Math.max(Array.from(record.user_input).length, record.correct_chars);
}

export function effectiveActiveMs(record: SessionRecord): number {
  if (record.active_ms > 0) {
    return record.active_ms;
  }
  return record.duration_ms;
}

export function weightedAccuracy(records: SessionRecord[]): number {
  const typedLen = records.reduce((sum, record) => sum + effectiveTypedLen(record), 0);
  if (typedLen === 0) {
    return average(records.map((record) => record.accuracy));
  }

  const weightedCorrect = records.reduce(
    (sum, record) =>
      sum + (clamp(record.accuracy, 0, 100) / 100) * effectiveTypedLen(record),
    0,
  );
  return (weightedCorrect / typedLen) * 100;
}

export function aggregateWpm(records: SessionRecord[]): number {
  const activeMs = records.reduce((sum, record) => sum + effectiveActiveMs(record), 0);
  if (activeMs === 0) {
    return average(records.map((record) => record.wpm));
  }

  const correctChars = records.reduce((sum, record) => sum + record.correct_chars, 0);
  const minutes = activeMs / 60_000;
  return correctChars / 5 / minutes;
}

export function aggregateSpeed(records: SessionRecord[], speedUnit: SpeedUnit): number {
  return speedFromWpm(aggregateWpm(records), speedUnit);
}

export function recordSpeed(record: SessionRecord, speedUnit: SpeedUnit): number {
  return speedFromWpm(record.wpm, speedUnit);
}

export function speedFromWpm(wpm: number, speedUnit: SpeedUnit): number {
  return speedUnit === "cpm" ? wpm * 5 : wpm;
}

export function speedUnitLabel(speedUnit: SpeedUnit): string {
  return speedUnit.toUpperCase();
}

export function recordErrorRate(record: SessionRecord): number | null {
  if (record.target_len === 0) {
    return null;
  }
  return (record.error_count / record.target_len) * 100;
}

export function topProblemTokens(
  records: SessionRecord[],
  words: boolean,
  limit: number,
): ProblemToken[] {
  const aggregate = new Map<string, ProblemTokenAggregate>();

  for (const record of records) {
    if (record.token_stats.length === 0) {
      for (const [token, errors] of sortedRecordEntries(record.error_tokens)) {
        if (
          errors === 0 ||
          isNumberedTemplateIdentifier(token) ||
          isWordLikeToken(token) !== words
        ) {
          continue;
        }
        const key = normalizeProblemToken(token, words);
        const entry = getProblemAggregate(aggregate, key);
        entry.errors += errors;
        entry.count += 1;
        entry.score += errors * 1_000;
      }
      continue;
    }

    for (const stat of record.token_stats) {
      if (
        stat.errors === 0 ||
        isNumberedTemplateIdentifier(stat.token) ||
        isWordLikeToken(stat.token) !== words
      ) {
        continue;
      }
      const key = normalizeProblemToken(stat.token, words);
      const entry = getProblemAggregate(aggregate, key);
      entry.errors += stat.errors;
      entry.count += 1;
      entry.score += stat.errors * 1_000 + stat.start_delay_ms + Math.floor(stat.duration_ms / 2);
    }
  }

  return sortedProblemTokens(aggregate, limit);
}

export function topSlowTokens(records: SessionRecord[], limit: number): ProblemToken[] {
  const aggregate = new Map<string, ProblemTokenAggregate>();

  for (const record of records) {
    if (record.token_stats.length === 0) {
      for (const [token, errors] of sortedRecordEntries(record.error_tokens)) {
        if (errors === 0 || isNumberedTemplateIdentifier(token)) {
          continue;
        }
        const key = normalizeProblemToken(token, isWordLikeToken(token));
        const entry = getProblemAggregate(aggregate, key);
        entry.errors += errors;
        entry.count += 1;
        entry.score += errors * 1_000;
      }
      continue;
    }

    for (const stat of record.token_stats) {
      if (isNumberedTemplateIdentifier(stat.token)) {
        continue;
      }
      const key = normalizeProblemToken(stat.token, isWordLikeToken(stat.token));
      const entry = getProblemAggregate(aggregate, key);
      entry.errors += stat.errors;
      entry.count += 1;
      entry.score +=
        stat.start_delay_ms + Math.floor(stat.duration_ms / 2) + stat.errors * 750;
    }
  }

  return sortedProblemTokens(aggregate, limit);
}

export function aggregateKeyErrors(records: SessionRecord[]): Record<string, number> {
  const counts = new Map<string, number>();

  for (const record of records) {
    for (const event of record.key_events) {
      if (event.action === "insert" && !event.correct) {
        const label = keyLabelForEvent(event);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
  }

  for (const record of records) {
    if (record.key_events.length > 0) {
      continue;
    }
    for (const [label, count] of sortedRecordEntries(record.error_chars)) {
      const bucket = keyBucketForLabel(label);
      counts.set(bucket, (counts.get(bucket) ?? 0) + count);
    }
  }

  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function statsOverviewLines(
  records: SessionRecord[],
  maxLines: number,
  language: Language,
  options: StatsOverviewOptions = {},
): string[] {
  if (records.length === 0) {
    return [copy(language, "stats_empty")];
  }

  const [totalMs, activeMs, idleMs] = timingTotals(records);
  const dates = statsDatesFromRecords(records);
  const speedUnit = options.speedUnit ?? "wpm";
  const speedLabel = speedUnitLabel(speedUnit);
  const bestSpeed = records.reduce(
    (best, record) => Math.max(best, recordSpeed(record, speedUnit)),
    0,
  );
  const avgSpeed = aggregateSpeed(records, speedUnit);
  const avgAccuracy = weightedAccuracy(records);
  const lowestErrorRate =
    records
      .map(recordErrorRate)
      .filter((value): value is number => value !== null)
      .reduce((best, value) => Math.min(best, value), Number.POSITIVE_INFINITY);
  const safeLowestErrorRate = Number.isFinite(lowestErrorRate) ? lowestErrorRate : 0;
  const totalErrors = records.reduce((sum, record) => sum + record.error_count, 0);
  const totalBackspaces = records.reduce((sum, record) => sum + record.backspace_count, 0);
  const worstWord = compactProblemText(topProblemTokens(records, true, 1), language);
  const worstKey = compactKeyText(topKeyErrors(records, 1), language);
  const recommendation = trainingRecommendationText(
    recentPlanRecords(records, options.now ?? new Date()),
    language,
  );

  const lines =
    language === "zh"
      ? [
          `总览  ${records.length} 次 | ${dates.length} 天 | 总时长 ${formatDurationShort(totalMs, language)} | active ${formatDurationShort(activeMs, language)} | idle ${formatDurationShort(idleMs, language)}`,
          `速度  历史最高 ${speedLabel} ${bestSpeed.toFixed(1)} | 平均 ${speedLabel} ${avgSpeed.toFixed(1)}`,
          `质量  平均正确率 ${avgAccuracy.toFixed(1)}% | 最低错误率 ${safeLowestErrorRate.toFixed(1)}%`,
          `错误  总错误 ${totalErrors} | 总退格 ${totalBackspaces} | ${recentActivityText(records, language)}`,
          `弱项  高错词 ${worstWord} | 高错键 ${worstKey}`,
          `综合计划  ${recommendation}`,
        ]
      : [
          `Overview  ${records.length} sessions | ${dates.length} days | total ${formatDurationShort(totalMs, language)} | active ${formatDurationShort(activeMs, language)} | idle ${formatDurationShort(idleMs, language)}`,
          `Speed  best ${speedLabel} ${bestSpeed.toFixed(1)} | average ${speedLabel} ${avgSpeed.toFixed(1)}`,
          `Quality  average accuracy ${avgAccuracy.toFixed(1)}% | lowest error rate ${safeLowestErrorRate.toFixed(1)}%`,
          `Errors  total ${totalErrors} | backspace ${totalBackspaces} | ${recentActivityText(records, language)}`,
          `Focus  word ${worstWord} | key ${worstKey}`,
          `Full plan  ${recommendation}`,
        ];

  return limitLines(lines, maxLines);
}

export function statsTodayLines(
  records: SessionRecord[],
  maxLines: number,
  language: Language,
  options: { now?: Date } & SpeedDisplayOptions = {},
): string[] {
  const today = localDateKey(options.now ?? new Date());
  const todaysRecords = records.filter((record) => localDateKey(new Date(record.started_at)) === today);
  if (todaysRecords.length === 0) {
    return [copy(language, "stats_empty_day")];
  }

  const comprehensive = todaysRecords.filter(isComprehensiveRecord);
  const standalone = todaysRecords.filter((record) => !isComprehensiveRecord(record));
  const lines = [
    language === "zh"
      ? `今日 ${todaysRecords.length} 次练习`
      : `Today ${todaysRecords.length} sessions`,
    scopeSummaryLine(language === "zh" ? "综合练习" : "Full practice", comprehensive, language, options),
    scopeSummaryLine(language === "zh" ? "专项练习" : "Standalone", standalone, language, options),
    "",
    `${language === "zh" ? "错词" : "Words"}  ${compactProblemText(topProblemTokens(todaysRecords, true, 3), language)}`,
    `${language === "zh" ? "键位" : "Keys"}  ${compactKeyText(topKeyErrors(todaysRecords, 4), language)}`,
  ];
  return limitLines(lines, maxLines);
}

export function statsComprehensiveLines(
  records: SessionRecord[],
  maxLines: number,
  language: Language,
  options: SpeedDisplayOptions = {},
): string[] {
  const runs = new Map<string, SessionRecord[]>();
  for (const record of records.filter(isComprehensiveRecord)) {
    runs.set(record.daily_run_id, [...(runs.get(record.daily_run_id) ?? []), record]);
  }

  if (runs.size === 0) {
    return [
      language === "zh" ? "还没有综合练习记录。" : "No full practice runs yet.",
    ];
  }

  const entries = [...runs.entries()].sort(
    ([leftRunId, leftRecords], [rightRunId, rightRecords]) =>
      latestStartedAtMs(rightRecords) - latestStartedAtMs(leftRecords) ||
      leftRunId.localeCompare(rightRunId),
  );
  const speedUnit = options.speedUnit ?? "wpm";
  const speedLabel = speedUnitLabel(speedUnit);
  const lines = [
    language === "zh" ? "综合练习运行" : "Full practice runs",
    ...entries.map(([runId, runRecords]) => {
      const modules = new Set(runRecords.map((record) => record.module)).size;
      const activeMs = runRecords.reduce((sum, record) => sum + effectiveActiveMs(record), 0);
      const speed = aggregateSpeed(runRecords, speedUnit);
      return language === "zh"
        ? `${truncate(runId, 18)}  ${runRecords.length} 组 | ${modules} 模块 | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)}`
        : `${truncate(runId, 18)}  ${runRecords.length} groups | ${modules} modules | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)}`;
    }),
  ];
  return limitLines(lines, maxLines);
}

export function statsModuleLines(
  records: SessionRecord[],
  maxLines: number,
  language: Language,
  options: SpeedDisplayOptions = {},
): string[] {
  if (records.length === 0) {
    return [copy(language, "stats_empty")];
  }

  const speedUnit = options.speedUnit ?? "wpm";
  const speedLabel = speedUnitLabel(speedUnit);
  const byModule = new Map<TrainingModule, SessionRecord[]>();
  for (const record of records) {
    byModule.set(record.module, [...(byModule.get(record.module) ?? []), record]);
  }

  const summaries = [...byModule.entries()]
    .map(([module, moduleRecords]) => moduleSummary(module, moduleRecords, speedUnit))
    .sort((left, right) => right.errorRate - left.errorRate || left.module.localeCompare(right.module));
  const driver = summaries[0];
  const lines: string[] = [];

  if (driver !== undefined) {
    lines.push(
      language === "zh"
        ? `下一轮驱动  ${moduleLabel(driver.module, language)} | 错误率 ${driver.errorRate.toFixed(1)}% | 正确率 ${driver.accuracy.toFixed(1)}%`
        : `Next driver  ${moduleLabel(driver.module, language)} | error ${driver.errorRate.toFixed(1)}% | accuracy ${driver.accuracy.toFixed(1)}%`,
    );
  }
  lines.push("");

  for (const summary of summaries) {
    lines.push(
      language === "zh"
        ? `${moduleLabel(summary.module, language)}  ${summary.count} 次 | active ${formatDurationShort(summary.activeMs, language)} | ${speedLabel} ${summary.speed.toFixed(1)} | 错误率 ${summary.errorRate.toFixed(1)}%`
        : `${moduleLabel(summary.module, language)}  ${summary.count} sessions | active ${formatDurationShort(summary.activeMs, language)} | ${speedLabel} ${summary.speed.toFixed(1)} | error ${summary.errorRate.toFixed(1)}%`,
    );
  }

  return limitLines(lines, maxLines);
}

export function statsDayLines(
  date: string,
  index: number,
  totalDates: number,
  records: SessionRecord[],
  maxSessions: number,
  language: Language,
  options: SpeedDisplayOptions = {},
): string[] {
  if (records.length === 0) {
    return [copy(language, "stats_empty_day")];
  }

  const [totalMs, activeMs, idleMs] = timingTotals(records);
  const speedUnit = options.speedUnit ?? "wpm";
  const speedLabel = speedUnitLabel(speedUnit);
  const bestSpeed = records.reduce(
    (best, record) => Math.max(best, recordSpeed(record, speedUnit)),
    0,
  );
  const avgSpeed = aggregateSpeed(records, speedUnit);
  const avgAccuracy = weightedAccuracy(records);
  const errorCount = records.reduce((sum, record) => sum + record.error_count, 0);
  const backspaceCount = records.reduce((sum, record) => sum + record.backspace_count, 0);
  const minutes = activeMs / 60_000;
  const bar = minuteBar(minutes, 20, 18);
  const dayWords = compactProblemText(topProblemTokens(records, true, 2), language);
  const dayKeys = compactKeyText(topKeyErrors(records, 4), language);
  const lines =
    language === "zh"
      ? [
          `日期 ${date}  (${index + 1}/${totalDates})  ←/→ 切换日期`,
          `当天 ${records.length} 次 | ${formatDurationShort(totalMs, language)} | active ${formatDurationShort(activeMs, language)} | idle ${formatDurationShort(idleMs, language)} | 最高 ${speedLabel} ${bestSpeed.toFixed(1)} | 平均 ${speedLabel} ${avgSpeed.toFixed(1)} | 正确率 ${avgAccuracy.toFixed(1)}%`,
          `进度 [${bar}] ${minutes.toFixed(1)} / 20 min | 错误 ${errorCount} | 退格 ${backspaceCount}`,
          `当天错词  ${dayWords}`,
          `当天键位  ${dayKeys}`,
          "",
          ...sessionLines(records, maxSessions, language, speedUnit),
        ]
      : [
          `Date ${date}  (${index + 1}/${totalDates})  Left/Right switches date`,
          `Day ${records.length} sessions | ${formatDurationShort(totalMs, language)} | active ${formatDurationShort(activeMs, language)} | idle ${formatDurationShort(idleMs, language)} | best ${speedLabel} ${bestSpeed.toFixed(1)} | avg ${speedLabel} ${avgSpeed.toFixed(1)} | accuracy ${avgAccuracy.toFixed(1)}%`,
          `Target [${bar}] ${minutes.toFixed(1)} / 20 min | errors ${errorCount} | backspace ${backspaceCount}`,
          `Day words  ${dayWords}`,
          `Day keys  ${dayKeys}`,
          "",
          ...sessionLines(records, maxSessions, language, speedUnit),
        ];
  return limitLines(lines, maxSessions === 0 ? 6 : Math.max(6 + maxSessions + 1, 0));
}

export function statsCodeLines(
  records: SessionRecord[],
  maxLines: number,
  language: Language,
  options: SpeedDisplayOptions = {},
): string[] {
  const codeRecords = records.filter(
    (record) => record.mode === "code" || record.module === "code_practice",
  );
  if (codeRecords.length === 0) {
    return [
      language === "zh" ? "还没有代码实战记录。" : "No code practice records yet.",
    ];
  }

  const lines = [
    scopeSummaryLine(language === "zh" ? "代码实战" : "Code practice", codeRecords, language, options),
    `${language === "zh" ? "符号" : "Symbols"}  ${compactProblemText(topProblemTokens(codeRecords, false, 5), language)}`,
    `${language === "zh" ? "慢项" : "Slow"}  ${compactSlowText(topSlowTokens(codeRecords, 4), language)}`,
  ];
  return limitLines(lines, maxLines);
}

export function statsTokenLines(
  records: SessionRecord[],
  maxLines: number,
  language: Language,
): string[] {
  const lines = [
    language === "zh" ? "Token 统计" : "Token stats",
    `${language === "zh" ? "高错词 / 词块" : "High-error words/chunks"}  ${compactProblemText(topProblemTokens(records, true, 4), language)}`,
    `${language === "zh" ? "高错符号" : "High-error symbols"}  ${compactProblemText(topProblemTokens(records, false, 4), language)}`,
    `${language === "zh" ? "慢词块" : "Slow tokens"}  ${compactSlowText(topSlowTokens(records, 4), language)}`,
  ];
  return limitLines(lines, maxLines);
}

export function keyStatsLines(
  aggregates: KeyAggregate[],
  sort: KeyStatsSort,
  maxLines: number,
  language: Language,
): string[] {
  if (aggregates.length === 0) {
    return [
      language === "zh"
        ? "还没有键位统计。完成练习后这里会显示每个按键的速度和错误率。"
        : "No key stats yet. Complete practice to collect per-key timing.",
    ];
  }

  const entries = [...aggregates].sort((left, right) => compareKeyAggregate(left, right, sort));
  const lines = [
    language === "zh"
      ? `键位统计  排序: ${keyStatsSortLabel(sort, language)}`
      : `Key stats  sort: ${keyStatsSortLabel(sort, language)}`,
    "key        samples  avg   fast  slow  err   conf",
    ...entries.map(
      (aggregate) =>
        `${truncate(aggregate.key, 10).padEnd(10, " ")} ${String(aggregate.sample_count).padStart(7, " ")} ${aggregate.avg_ms.toFixed(0).padStart(4, " ")} ${String(aggregate.fastest_ms).padStart(5, " ")} ${String(aggregate.slowest_ms).padStart(5, " ")} ${aggregate.error_rate.toFixed(0).padStart(4, " ")}% ${aggregate.confidence.toFixed(2).padStart(5, " ")}`,
    ),
  ];
  return limitLines(lines, maxLines);
}

export function statsDatesFromRecords(records: SessionRecord[]): string[] {
  return [...new Set(records.map((record) => localDateKey(new Date(record.started_at))))]
    .filter((date) => date !== "")
    .sort()
    .reverse();
}

export function formatDurationShort(ms: number, language: Language): string {
  if (ms < 60_000) {
    const seconds = ms === 0 ? 0 : clamp(Math.floor((ms + 500) / 1000), 1, 59);
    return language === "zh" ? `${seconds} 秒` : `${seconds}s`;
  }

  const totalMinutes = Math.floor((ms + 30_000) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (language === "zh") {
    if (hours === 0) {
      return `${minutes} 分钟`;
    }
    if (minutes === 0) {
      return `${hours} 小时`;
    }
    return `${hours} 小时 ${minutes} 分钟`;
  }
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function localDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getProblemAggregate(
  aggregate: Map<string, ProblemTokenAggregate>,
  token: string,
): ProblemTokenAggregate {
  const existing = aggregate.get(token);
  if (existing !== undefined) {
    return existing;
  }
  const created = { errors: 0, count: 0, score: 0 };
  aggregate.set(token, created);
  return created;
}

function sortedProblemTokens(
  aggregate: Map<string, ProblemTokenAggregate>,
  limit: number,
): ProblemToken[] {
  return [...aggregate.entries()]
    .map(([token, entry]) => ({
      token,
      errors: entry.errors,
      count: entry.count,
      score: entry.score,
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.errors - left.errors ||
        left.token.localeCompare(right.token),
    )
    .slice(0, limit);
}

function sortedRecordEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function isWordLikeToken(token: string): boolean {
  return /[A-Za-z]/u.test(token) && /^[A-Za-z0-9_]+$/u.test(token);
}

function normalizeProblemToken(token: string, words: boolean): string {
  if (words && /^[A-Za-z]+$/u.test(token)) {
    return token.toLowerCase();
  }
  return token;
}

function keyLabelForEvent(event: KeyEventRecord): string {
  const key = event.expected ?? event.input;
  if (key === null) {
    return "extra";
  }
  const first = Array.from(key)[0];
  return first === undefined ? "" : keyBucketForChar(first);
}

function keyBucketForLabel(label: string): string {
  switch (label) {
    case "<space>":
      return "space";
    case "\\n":
      return "enter";
    case "\\t":
      return "tab";
    default: {
      const first = Array.from(label)[0];
      return first === undefined ? "" : keyBucketForChar(first);
    }
  }
}

function keyBucketForChar(ch: string): string {
  switch (ch) {
    case "!":
    case "1":
      return "1";
    case "@":
    case "2":
      return "2";
    case "#":
    case "3":
      return "3";
    case "$":
    case "4":
      return "4";
    case "%":
    case "5":
      return "5";
    case "^":
    case "6":
      return "6";
    case "&":
    case "7":
      return "7";
    case "*":
    case "8":
      return "8";
    case "(":
    case "9":
      return "9";
    case ")":
    case "0":
      return "0";
    case "_":
    case "-":
      return "-";
    case "+":
    case "=":
      return "=";
    case "~":
    case "`":
      return "`";
    case "{":
    case "[":
      return "[";
    case "}":
    case "]":
      return "]";
    case "|":
    case "\\":
      return "\\";
    case ":":
    case ";":
      return ";";
    case "\"":
    case "'":
      return "'";
    case "<":
    case ",":
      return ",";
    case ">":
    case ".":
      return ".";
    case "?":
    case "/":
      return "/";
    case " ":
      return "space";
    case "\n":
      return "enter";
    case "\t":
      return "tab";
    default:
      return /^[A-Za-z]$/u.test(ch) ? ch.toLowerCase() : ch;
  }
}

function topKeyErrors(records: SessionRecord[], limit: number): KeyProblem[] {
  return Object.entries(aggregateKeyErrors(records))
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function scopeSummaryLine(
  title: string,
  records: SessionRecord[],
  language: Language,
  options: SpeedDisplayOptions = {},
): string {
  const activeMs = records.reduce((sum, record) => sum + effectiveActiveMs(record), 0);
  const speedUnit = options.speedUnit ?? "wpm";
  const speedLabel = speedUnitLabel(speedUnit);
  const speed = aggregateSpeed(records, speedUnit);
  const accuracy = weightedAccuracy(records);
  return language === "zh"
    ? `${title}  ${records.length} 次 | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)} | 正确率 ${accuracy.toFixed(1)}%`
    : `${title}  ${records.length} sessions | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)} | accuracy ${accuracy.toFixed(1)}%`;
}

function sessionLines(
  records: SessionRecord[],
  maxSessions: number,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const sorted = [...records].sort(
    (left, right) => Date.parse(left.started_at) - Date.parse(right.started_at),
  );
  const lines = sorted.slice(0, maxSessions).map((record, index) =>
    sessionLine(index, record, language, speedUnit),
  );
  if (sorted.length > maxSessions) {
    const remaining = sorted.length - maxSessions;
    lines.push(
      language === "zh"
        ? `还有 ${remaining} 次练习未显示，放大终端可查看更多。`
        : `${remaining} more sessions hidden. Enlarge the terminal.`,
    );
  }
  return lines;
}

function sessionLine(
  index: number,
  record: SessionRecord,
  language: Language,
  speedUnit: SpeedUnit,
): string {
  const started = formatLocalTime(record.started_at);
  const duration = formatDurationShort(record.duration_ms, language);
  const source = truncate(record.source, 22);
  const speedLabel = speedUnitLabel(speedUnit);
  const speed = recordSpeed(record, speedUnit);
  return language === "zh"
    ? `${index + 1}. ${started}  ${duration}  ${speedLabel} ${speed.toFixed(1)} | 正确率 ${record.accuracy.toFixed(1)}% | 错误 ${record.error_count} | 退格 ${record.backspace_count} | ${source}`
    : `${index + 1}. ${started}  ${duration}  ${speedLabel} ${speed.toFixed(1)} | acc ${record.accuracy.toFixed(1)}% | err ${record.error_count} | back ${record.backspace_count} | ${source}`;
}

function formatLocalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function moduleSummary(module: TrainingModule, records: SessionRecord[], speedUnit: SpeedUnit) {
  const activeMs = records.reduce((sum, record) => sum + effectiveActiveMs(record), 0);
  const targetLen = records.reduce((sum, record) => sum + record.target_len, 0);
  const errors = records.reduce((sum, record) => sum + record.error_count, 0);
  const errorRate = targetLen === 0 ? 0 : (errors / targetLen) * 100;
  return {
    module,
    count: records.length,
    activeMs,
    speed: aggregateSpeed(records, speedUnit),
    accuracy: weightedAccuracy(records),
    errorRate,
  };
}

function isComprehensiveRecord(record: SessionRecord): boolean {
  return record.daily_run_id.trim().length > 0;
}

function latestStartedAtMs(records: SessionRecord[]): number {
  return records.reduce((latest, record) => Math.max(latest, Date.parse(record.started_at)), 0);
}

function moduleLabel(module: TrainingModule, language: Language): string {
  const zh: Record<TrainingModule, string> = {
    unknown: "未知模块",
    comprehensive: "综合练习",
    foundation_input: "基础输入",
    everyday_english: "日常英语",
    programming_basics: "编程基础",
    custom_corpus: "自建语料库",
    code_practice: "代码实战",
  };
  const en: Record<TrainingModule, string> = {
    unknown: "Unknown",
    comprehensive: "Full practice",
    foundation_input: "Foundation input",
    everyday_english: "Everyday English",
    programming_basics: "Programming basics",
    custom_corpus: "My corpus",
    code_practice: "Code practice",
  };
  return language === "zh" ? zh[module] : en[module];
}

function timingTotals(records: SessionRecord[]): [number, number, number] {
  return [
    records.reduce((sum, record) => sum + record.duration_ms, 0),
    records.reduce((sum, record) => sum + effectiveActiveMs(record), 0),
    records.reduce((sum, record) => sum + record.idle_ms, 0),
  ];
}

function recentActivityText(records: SessionRecord[], language: Language): string {
  const dates = statsDatesFromRecords(records);
  const parts: string[] = [];
  for (const date of dates.slice(0, 2)) {
    const dayRecords = records.filter((record) => localDateKey(new Date(record.started_at)) === date);
    const minutes =
      dayRecords.reduce((sum, record) => sum + record.duration_ms, 0) / 60_000;
    parts.push(`${date.slice(5)} ${minuteBar(minutes, 20, 6)} ${minutes.toFixed(1)}m`);
  }
  if (parts.length === 0) {
    return copy(language, "stats_no_recent");
  }
  return language === "zh" ? `最近 ${parts.join("  ")}` : `recent ${parts.join("  ")}`;
}

function trainingRecommendationText(records: SessionRecord[], language: Language): string {
  const key = topKeyErrors(records, 1)[0];
  const symbol = topProblemTokens(records, false, 1)[0];
  const word = topProblemTokens(records, true, 1)[0];

  if (language === "zh") {
    if (key !== undefined && key.count >= 2) {
      return `下一次综合会优先加入键位专项：${key.label}`;
    }
    if (symbol !== undefined && symbol.errors >= 2) {
      return `下一次综合会增加符号练习：${truncate(symbol.token, 12)}`;
    }
    if (word !== undefined && word.errors >= 2) {
      return `下一次综合会增加词块/单词练习：${truncate(word.token, 12)}`;
    }
    return "下一次综合会保持均衡计划。";
  }
  if (key !== undefined && key.count >= 2) {
    return `Next full practice will prioritize key drill: ${key.label}`;
  }
  if (symbol !== undefined && symbol.errors >= 2) {
    return `Next full practice will add symbol work: ${truncate(symbol.token, 12)}`;
  }
  if (word !== undefined && word.errors >= 2) {
    return `Next full practice will add word/chunk work: ${truncate(word.token, 12)}`;
  }
  return "Next full practice will stay balanced.";
}

function recentPlanRecords(records: SessionRecord[], now: Date): SessionRecord[] {
  const cutoffMs = now.getTime() - PLAN_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return records.filter((record) => {
    const startedAtMs = Date.parse(record.started_at);
    return Number.isFinite(startedAtMs) && startedAtMs >= cutoffMs;
  });
}

function compactProblemText(entries: ProblemToken[], language: Language): string {
  if (entries.length === 0) {
    return copy(language, "stats_none");
  }
  return entries
    .map((entry) => `${truncate(entry.token, 10)}(${entry.errors})`)
    .join("  ");
}

function compactKeyText(entries: KeyProblem[], language: Language): string {
  if (entries.length === 0) {
    return copy(language, "stats_none");
  }
  return entries.map((entry) => `${entry.label}(${entry.count})`).join("  ");
}

function compactSlowText(entries: ProblemToken[], language: Language): string {
  if (entries.length === 0) {
    return copy(language, "stats_none");
  }
  return entries
    .map((entry) => {
      const avgScore = entry.count === 0 ? 0 : Math.floor(entry.score / entry.count);
      return `${truncate(entry.token, 10)}(${avgScore}ms)`;
    })
    .join("  ");
}

function compareKeyAggregate(left: KeyAggregate, right: KeyAggregate, sort: KeyStatsSort): number {
  const metric =
    sort === "slowest_average"
      ? right.avg_ms - left.avg_ms
      : sort === "fastest"
        ? left.fastest_ms - right.fastest_ms || right.sample_count - left.sample_count
        : sort === "slowest_single"
          ? right.slowest_ms - left.slowest_ms
          : sort === "highest_error_rate"
            ? right.error_rate - left.error_rate
            : left.confidence - right.confidence;
  return metric || right.sample_count - left.sample_count || left.key.localeCompare(right.key);
}

function keyStatsSortLabel(sort: KeyStatsSort, language: Language): string {
  const zh: Record<KeyStatsSort, string> = {
    slowest_average: "平均最慢",
    fastest: "最快单次",
    slowest_single: "最慢单次",
    highest_error_rate: "错误率最高",
    lowest_confidence: "信心最低",
  };
  const en: Record<KeyStatsSort, string> = {
    slowest_average: "slowest avg",
    fastest: "fastest",
    slowest_single: "slowest single",
    highest_error_rate: "highest error",
    lowest_confidence: "lowest confidence",
  };
  return language === "zh" ? zh[sort] : en[sort];
}

function minuteBar(value: number, target: number, width: number): string {
  const ratio = target <= 0 ? 1 : clamp(value / target, 0, 1);
  const filled = Math.round(ratio * width);
  return Array.from({ length: width }, (_, index) => (index < filled ? "█" : "░")).join("");
}

function truncate(value: string, maxChars: number): string {
  const chars = Array.from(value);
  if (chars.length <= maxChars) {
    return value;
  }
  if (maxChars <= 1) {
    return "…";
  }
  return `${chars.slice(0, maxChars - 1).join("")}…`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function limitLines(lines: string[], maxLines: number): string[] {
  return lines.slice(0, Math.max(0, maxLines));
}

function copy(language: Language, key: "stats_empty" | "stats_empty_day" | "stats_no_recent" | "stats_none"): string {
  const zh: Record<typeof key, string> = {
    stats_empty: "还没有练习记录。完成一次练习后这里会显示统计数据。",
    stats_empty_day: "这一天没有练习记录。",
    stats_no_recent: "暂无最近记录",
    stats_none: "暂无",
  };
  const en: Record<typeof key, string> = {
    stats_empty: "No practice records yet. Complete a session to see statistics.",
    stats_empty_day: "No practice records on this day.",
    stats_no_recent: "no recent records",
    stats_none: "none yet",
  };
  return language === "zh" ? zh[key] : en[key];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
