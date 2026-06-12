import type { Language, Mode, PracticePlan, SessionRecord, SpeedUnit } from "../domain/model";
import type { SourceCatalogEntry } from "../content/library";
import type { CodeSnippet } from "../content/snippets";
import { isNumberedTemplateIdentifier } from "../training/generatedIdentifier";
import { effectiveActiveMs, effectiveTypedLen, localDateKey, speedFromWpm, speedUnitLabel } from "./stats";

interface TodayReportOptions {
  now?: Date;
  speedUnit?: SpeedUnit;
}

interface SessionSummaryOptions {
  speedUnit?: SpeedUnit;
}

interface TokenAggregate {
  occurrences: number;
  errors: number;
  delaySum: number;
  durationSum: number;
}

export function todayReport(
  records: SessionRecord[],
  plan: PracticePlan,
  language: Language,
  options: TodayReportOptions = {},
): string {
  const today = localDateKey(options.now ?? new Date());
  const todaysRecords = records.filter((record) => localDateKey(new Date(record.started_at)) === today);

  if (todaysRecords.length === 0) {
    return language === "zh"
      ? `今天还没有 KeyLoop 练习记录。\n\n推荐练习：${modeLabel(plan.recommended_mode, language)}\n运行：keyloop start`
      : `No KeyLoop sessions today.\n\nNext recommendation: ${plan.recommended_mode}\nRun: keyloop start`;
  }

  const durationMs = sum(todaysRecords, (record) => record.duration_ms);
  const activeMs = sum(todaysRecords, effectiveActiveMs);
  const idleMs = sum(todaysRecords, (record) => record.idle_ms);
  const manualPauseMs = sum(todaysRecords, (record) => record.manual_pause_ms);
  const targetLen = sum(todaysRecords, (record) => record.target_len);
  const typedLen = sum(todaysRecords, effectiveTypedLen);
  const correctChars = sum(todaysRecords, (record) => record.correct_chars);
  const errors = sum(todaysRecords, (record) => record.error_count);
  const backspaces = sum(todaysRecords, (record) => record.backspace_count);

  const minutes = Math.max(activeMs, 1) / 60_000;
  const speedUnit = options.speedUnit ?? "wpm";
  const speedLabel = speedUnitLabel(speedUnit);
  const rawSpeed = speedFromCharsPerMinute(typedLen, minutes, speedUnit);
  const speed = speedFromCharsPerMinute(correctChars, minutes, speedUnit);
  const weightedCorrect = todaysRecords.reduce(
    (total, record) =>
      total + (clamp(record.accuracy, 0, 100) / 100) * effectiveTypedLen(record),
    0,
  );
  const accuracy =
    typedLen > 0
      ? (weightedCorrect / typedLen) * 100
      : targetLen === 0
        ? 0
        : (correctChars / targetLen) * 100;

  const wordAggregates = new Map<string, TokenAggregate>();
  const symbolAggregates = new Map<string, TokenAggregate>();
  const errorChars = new Map<string, number>();

  for (const record of todaysRecords) {
    for (const [ch, count] of sortedRecordEntries(record.error_chars)) {
      errorChars.set(ch, (errorChars.get(ch) ?? 0) + count);
    }

    if (record.token_stats.length === 0) {
      for (const [token, tokenErrors] of sortedRecordEntries(record.error_tokens)) {
        if (isNumberedTemplateIdentifier(token)) {
          continue;
        }
        const map = isWordLikeToken(token) ? wordAggregates : symbolAggregates;
        addLegacyErrors(map, token, tokenErrors);
      }
      continue;
    }

    for (const stat of record.token_stats) {
      if (isNumberedTemplateIdentifier(stat.token)) {
        continue;
      }
      const map = stat.kind === "symbol" ? symbolAggregates : wordAggregates;
      addTokenStat(map, stat.token, stat.start_delay_ms, stat.duration_ms, stat.errors);
    }
  }

  const [comprehensive, standalone] = scopedRecordCounts(todaysRecords);
  const lines = [
    `${language === "zh" ? "今日练习" : "Today"}: ${formatDuration(durationMs, language)}`,
    "",
    `${language === "zh" ? "总体" : "Overall"}:`,
    `  ${speedLabel}: ${speed.toFixed(1)}`,
    `  ${rawSpeedLabel(language, speedUnit)}: ${rawSpeed.toFixed(1)}`,
    `  ${language === "zh" ? "正确率" : "Accuracy"}: ${accuracy.toFixed(1)}%`,
    `  ${language === "zh" ? "错误" : "Errors"}: ${errors}`,
    `  ${language === "zh" ? "退格" : "Backspace"}: ${backspaces}`,
    `  ${language === "zh" ? "计时" : "Timing"}: active ${formatDuration(activeMs, language)} | idle ${formatDuration(idleMs, language)} | pause ${formatDuration(manualPauseMs, language)}`,
    `  ${language === "zh" ? "综合练习" : "Full practice"}: ${comprehensive.count} ${sessionUnit(comprehensive.count, language)} / active ${formatDuration(comprehensive.activeMs, language)}`,
    `  ${language === "zh" ? "专项练习" : "Standalone"}: ${standalone.count} ${sessionUnit(standalone.count, language)} / active ${formatDuration(standalone.activeMs, language)}`,
  ];

  appendTokenSection(
    lines,
    language === "zh" ? "单词 / 标识符 - 最慢：" : "Words / identifiers - slowest:",
    wordAggregates,
    5,
    language,
  );
  appendTokenSection(
    lines,
    language === "zh" ? "符号 - 需要复盘：" : "Symbols - needs review:",
    symbolAggregates,
    5,
    language,
  );
  appendErrorChars(lines, errorChars, language);

  lines.push("");
  lines.push(`${language === "zh" ? "下一步" : "Next"}:`);
  plan.advice.slice(0, 4).forEach((advice, index) => {
    lines.push(`  ${index + 1}. ${advice}`);
  });
  lines.push(`  ${language === "zh" ? "运行" : "Run"}: keyloop start`);

  return `${lines.join("\n")}\n`;
}

export function planReport(plan: PracticePlan, language: Language): string {
  const lines = [language === "zh" ? "下一轮 KeyLoop 计划" : "Next KeyLoop plan", ""];

  if (language === "zh") {
    lines.push("每日目标: 按你的水平动态推荐（10-45 分钟，进入综合训练可见并可调整）");
    lines.push("训练路径: 按技能诊断组合阶段（键位热身 -> 单词 -> 符号 -> 句子 -> 文章/代码）");
    lines.push(`当前偏重: ${modeLabel(plan.recommended_mode, language)}`);
  } else {
    lines.push("Daily target: adaptive (10-45 min, shown and adjustable on the plan screen)");
    lines.push(
      "Training path: diagnosis-driven stages (warmup -> words -> symbols -> sentences -> articles/code)",
    );
    lines.push(`Current emphasis: ${modeLabel(plan.recommended_mode, language)}`);
  }

  writeList(lines, language === "zh" ? "键位热区" : "Key hot spots", plan.focus_keys);
  writeList(lines, language === "zh" ? "单词 / 标识符重点" : "Words / identifiers", plan.focus_words);
  writeList(lines, language === "zh" ? "符号" : "Symbols", plan.focus_symbols);
  writeList(lines, language === "zh" ? "代码重点" : "Code practice", plan.focus_code);
  lines.push("");
  lines.push(`${language === "zh" ? "建议" : "Advice"}:`);
  plan.advice.forEach((advice, index) => {
    lines.push(`  ${index + 1}. ${advice}`);
  });
  lines.push("");

  if (language === "zh") {
    lines.push("课程形态：");
    lines.push("  1. 综合训练按技能诊断生成阶段计划，弱项加权、稳定项降频。");
    lines.push("  2. 可以零碎练，每次完成都会累计到今日进度。");
    lines.push("  3. 每组完成后的错项和慢项会影响后续模块内容。");
    lines.push("  4. 代码块覆盖 TS/JS/Vue/Solidity/Rust/HTML/CSS/Less/Sass。");
  } else {
    lines.push("Lesson model:");
    lines.push(
      "  1. Full practice runs foundation input, everyday English, programming basics, and code practice.",
    );
    lines.push("  2. Short sessions accumulate into daily progress.");
    lines.push("  3. Errors and slow items from each group influence later module content.");
    lines.push("  4. Code blocks cover TS/JS/Vue/Solidity/Rust/HTML/CSS/Less/Sass.");
  }

  return `${lines.join("\n")}\n`;
}

export function sessionSummary(
  record: SessionRecord,
  savedTo: string,
  language: Language,
  options: SessionSummaryOptions = {},
): string {
  const speedUnit = options.speedUnit ?? "wpm";
  const speedLabel = speedUnitLabel(speedUnit);
  const speed = speedFromWpm(record.wpm, speedUnit);
  const rawSpeed = speedFromWpm(record.raw_wpm, speedUnit);
  const slowFocus = record.slow_tokens
    .slice(0, 5)
    .map((stat) => stat.token)
    .join(", ");

  if (language === "zh") {
    return `已保存练习记录到 ${savedTo}\n\n模式: ${modeLabel(record.mode, language)}\n${speedLabel}: ${speed.toFixed(1)} | ${rawSpeedLabel(language, speedUnit)}: ${rawSpeed.toFixed(1)} | 正确率: ${record.accuracy.toFixed(1)}% | 错误: ${record.error_count} | 退格: ${record.backspace_count}\n慢项: ${slowFocus}`;
  }
  return `Saved session to ${savedTo}\n\nMode: ${record.mode}\n${speedLabel}: ${speed.toFixed(1)} | ${rawSpeedLabel(language, speedUnit)}: ${rawSpeed.toFixed(1)} | Accuracy: ${record.accuracy.toFixed(1)}% | Errors: ${record.error_count} | Backspace: ${record.backspace_count}\nSlow focus: ${slowFocus}`;
}

function speedFromCharsPerMinute(chars: number, minutes: number, speedUnit: SpeedUnit): number {
  return speedUnit === "cpm" ? chars / minutes : chars / 5 / minutes;
}

function rawSpeedLabel(language: Language, speedUnit: SpeedUnit): string {
  const unitLabel = speedUnitLabel(speedUnit);
  return language === "zh" ? `原始 ${unitLabel}` : `Raw ${unitLabel}`;
}

export function importPreview(
  path: string,
  snippets: CodeSnippet[],
  language: Language,
): string {
  const lines = [
    language === "zh"
      ? `在 ${path} 中找到 ${snippets.length} 个候选片段`
      : `Found ${snippets.length} candidate snippets in ${path}`,
  ];

  snippets.slice(0, 12).forEach((snippet, index) => {
    const oneLine = snippet.text.replace(/\n/gu, " / ");
    lines.push(
      `${index + 1}. [${difficultyLabel(snippet.difficulty, language)} ${snippet.level} / ${snippet.language} / ${snippet.framework} / ${snippet.project}] ${oneLine} (${snippet.source})`,
    );
  });

  if (snippets.length > 12) {
    lines.push(
      language === "zh"
        ? `... 还有 ${snippets.length - 12} 个`
        : `... ${snippets.length - 12} more`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function sourceCatalogReport(
  sources: SourceCatalogEntry[],
  language: Language,
): string {
  const lines =
    language === "zh"
      ? [
          `推荐语料来源（含代码语料来源，${sources.length} 个）`,
          "这些来源用于内置语料选型和后续精确抽取；外部内容进入仓库前必须保留 license 和来源。",
        ]
      : [
          `Recommended corpus sources, including code corpus sources (${sources.length})`,
          "These entries guide built-in corpora and future exact extraction; external content must keep license and provenance metadata.",
        ];

  for (const source of sources) {
    const label = source.source_name.trim().length === 0 ? source.repo : source.source_name;
    const url = source.source_url.trim().length === 0 ? source.repo_url : source.source_url;
    const corpus = source.corpus.trim().length === 0 ? "code" : source.corpus;
    const generation =
      source.generation_script.trim().length === 0 ? "direct" : source.generation_script;
    const fields =
      source.included_fields.length === 0 ? "-" : source.included_fields.join(",");
    lines.push(
      `- ${label} [${source.license_spdx}] ${url} | ${source.source_id} | ${source.retrieved_at} | ${corpus} | ${generation} | ${source.languages.join(", ")} | ${source.frameworks.join(", ")} | ${fields} | ${source.notes}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function appendTokenSection(
  lines: string[],
  title: string,
  map: Map<string, TokenAggregate>,
  limit: number,
  language: Language,
): void {
  if (map.size === 0) {
    return;
  }

  const items = [...map.entries()].sort(
    ([leftToken, left], [rightToken, right]) =>
      tokenAggregateScore(right) - tokenAggregateScore(left) ||
      leftToken.localeCompare(rightToken),
  );

  lines.push("");
  lines.push(title);
  for (const [token, aggregate] of items.slice(0, limit)) {
    lines.push(
      language === "zh"
        ? `  ${token.padEnd(18, " ")} 平均启动 ${avgDelay(aggregate)}ms，输入 ${avgDuration(aggregate)}ms，错误 ${aggregate.errors}`
        : `  ${token.padEnd(18, " ")} avg start ${avgDelay(aggregate)}ms, type ${avgDuration(aggregate)}ms, errors ${aggregate.errors}`,
    );
  }
}

function appendErrorChars(
  lines: string[],
  errorChars: Map<string, number>,
  language: Language,
): void {
  if (errorChars.size === 0) {
    return;
  }

  const items = [...errorChars.entries()].sort(
    ([leftChar, left], [rightChar, right]) => right - left || leftChar.localeCompare(rightChar),
  );

  lines.push("");
  lines.push(`${language === "zh" ? "错误字符" : "Error chars"}:`);
  for (const [ch, count] of items.slice(0, 8)) {
    lines.push(`  ${ch.padEnd(8, " ")} ${count}`);
  }
}

function addTokenStat(
  map: Map<string, TokenAggregate>,
  token: string,
  delay: number,
  duration: number,
  errors: number,
): void {
  const aggregate = getTokenAggregate(map, token);
  aggregate.occurrences += 1;
  aggregate.errors += errors;
  aggregate.delaySum += delay;
  aggregate.durationSum += duration;
}

function addLegacyErrors(map: Map<string, TokenAggregate>, token: string, errors: number): void {
  const aggregate = getTokenAggregate(map, token);
  aggregate.occurrences += 1;
  aggregate.errors += errors;
}

function getTokenAggregate(
  map: Map<string, TokenAggregate>,
  token: string,
): TokenAggregate {
  const existing = map.get(token);
  if (existing !== undefined) {
    return existing;
  }
  const created = { occurrences: 0, errors: 0, delaySum: 0, durationSum: 0 };
  map.set(token, created);
  return created;
}

function tokenAggregateScore(aggregate: TokenAggregate): number {
  return avgDelay(aggregate) + Math.floor(avgDuration(aggregate) / 2) + aggregate.errors * 250;
}

function avgDelay(aggregate: TokenAggregate): number {
  if (aggregate.occurrences === 0) {
    return 0;
  }
  return Math.floor(aggregate.delaySum / aggregate.occurrences);
}

function avgDuration(aggregate: TokenAggregate): number {
  if (aggregate.occurrences === 0) {
    return 0;
  }
  return Math.floor(aggregate.durationSum / aggregate.occurrences);
}

function scopedRecordCounts(records: SessionRecord[]): [
  { count: number; activeMs: number },
  { count: number; activeMs: number },
] {
  const comprehensive = { count: 0, activeMs: 0 };
  const standalone = { count: 0, activeMs: 0 };
  for (const record of records) {
    const bucket = record.daily_run_id.trim().length > 0 ? comprehensive : standalone;
    bucket.count += 1;
    bucket.activeMs += effectiveActiveMs(record);
  }
  return [comprehensive, standalone];
}

function writeList(lines: string[], title: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }
  lines.push("");
  lines.push(`${title}:`);
  lines.push(`  ${items.join(", ")}`);
}

function formatDuration(durationMs: number, language: Language): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return language === "zh" ? `${minutes} 分 ${seconds} 秒` : `${minutes}m ${seconds}s`;
  }
  return language === "zh" ? `${seconds} 秒` : `${seconds}s`;
}

function modeLabel(mode: Mode, language: Language): string {
  if (language === "en") {
    return mode;
  }
  const labels: Record<Mode, string> = {
    chars: "基础字符",
    numbers: "数字",
    case: "大小写",
    words: "单词 / 标识符",
    symbols: "符号",
    code: "代码",
    mixed: "混合",
  };
  return labels[mode];
}

function difficultyLabel(value: string, language: Language): string {
  if (language === "en") {
    return value;
  }
  switch (value) {
    case "easy":
      return "简单";
    case "medium":
      return "中等";
    case "hard":
      return "困难";
    default:
      return value;
  }
}

function isWordLikeToken(token: string): boolean {
  return /[A-Za-z]/u.test(token) && /^[A-Za-z0-9_]+$/u.test(token);
}

function sessionUnit(count: number, language: Language): string {
  if (language === "zh") {
    return "次";
  }
  return count === 1 ? "session" : "sessions";
}

function sortedRecordEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function sum(records: SessionRecord[], value: (record: SessionRecord) => number): number {
  return records.reduce((total, record) => total + value(record), 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
