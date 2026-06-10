import type {
  KeyEventRecord,
  Language,
  Mode,
  PracticePlan,
  SessionRecord,
  TokenKind,
} from "../domain/model";
import { isNumberedTemplateIdentifier } from "./generatedIdentifier";

export const PLAN_HISTORY_DAYS = 21;

interface Aggregate {
  occurrences: number;
  errors: number;
  delaySum: number;
  durationSum: number;
}

export function buildPlan(
  records: SessionRecord[],
  language: Language,
  now: Date = new Date(),
): PracticePlan {
  const recentCutoffMs = now.getTime() - PLAN_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const recent = records.filter((record) => {
    const startedAtMs = Date.parse(record.started_at);
    return Number.isFinite(startedAtMs) && startedAtMs >= recentCutoffMs;
  });

  if (recent.length === 0) {
    return {
      focus_words: ["return", "function", "current", "response", "useEffect"],
      focus_symbols: ["=>", "!==", "&&", "_", "{}"],
      focus_code: ["useState", "items.map", "!== null"],
      focus_keys: [],
      advice: noHistoryAdvice(language),
      recommended_mode: "chars",
      has_recent_history: false,
    };
  }

  const words = new Map<string, Aggregate>();
  const symbols = new Map<string, Aggregate>();
  const codeTerms = new Map<string, Aggregate>();
  const keys = new Map<string, Aggregate>();
  let totalTyped = 0;
  let totalKeyCorrect = 0;
  let totalBackspaces = 0;

  for (const record of recent) {
    const typedLen = effectiveTypedLen(record);
    totalTyped += typedLen;
    totalKeyCorrect += Math.round((clamp(record.accuracy, 0, 100) / 100) * typedLen);
    totalBackspaces += record.backspace_count;

    if (record.token_stats.length === 0) {
      for (const [token, errors] of sortedRecordEntries(record.error_tokens)) {
        if (isNumberedTemplateIdentifier(token)) {
          continue;
        }
        addAggregate(isWordLikeToken(token) ? words : symbols, token, 0, 0, errors);
      }
    } else {
      for (const stat of record.token_stats) {
        if (isNumberedTemplateIdentifier(stat.token)) {
          continue;
        }
        addAggregate(
          aggregateMapForTokenKind(stat.kind, words, symbols, codeTerms),
          stat.token,
          stat.start_delay_ms,
          stat.duration_ms,
          stat.errors,
        );
      }
    }

    for (const [key, count] of recordKeyErrors(record)) {
      addAggregate(keys, key, 0, 0, count);
    }
  }

  const focusWords = topKeys(words, 16).filter(isFocusWord).slice(0, 6);
  const focusSymbols = topKeys(symbols, 6);
  const focusCode = topKeys(codeTerms, 8)
    .filter((term) => Array.from(term).length >= 2)
    .slice(0, 4);
  for (const word of focusWords.slice(0, 3)) {
    if (!focusCode.includes(word)) {
      focusCode.push(word);
    }
  }
  const focusKeys = topKeys(keys, 8);

  const accuracy = totalTyped === 0 ? 0 : (totalKeyCorrect / totalTyped) * 100;
  const advice: string[] = [];

  if (accuracy < 95) {
    advice.push(
      language === "zh"
        ? "正确率低于 95%。下一轮缩短一点，慢一点打准。"
        : "Accuracy is below 95%. Keep the next session shorter and type deliberately.",
    );
  }
  if (totalBackspaces > recent.length * 12) {
    advice.push(
      language === "zh"
        ? "退格偏多。放慢一点，避免反复修正。"
        : "Backspace count is high. Slow down slightly and avoid correction loops.",
    );
  }
  if (focusWords.length > 0) {
    advice.push(
      language === "zh"
        ? `复盘单词和标识符：${focusWords.join(", ")}。`
        : `Review words and identifiers: ${focusWords.join(", ")}.`,
    );
  }
  if (focusSymbols.length > 0) {
    advice.push(
      language === "zh"
        ? `复盘代码符号：${focusSymbols.join(", ")}。`
        : `Review code symbols: ${focusSymbols.join(", ")}.`,
    );
  }
  if (focusKeys.length > 0) {
    advice.push(
      language === "zh"
        ? `补强键位热区：${focusKeys.join(", ")}。`
        : `Reinforce key hot spots: ${focusKeys.join(", ")}.`,
    );
  }
  if (advice.length === 0) {
    advice.push(
      language === "zh"
        ? "表现比较稳定。可以用混合模式，并加入更多真实代码片段。"
        : "Performance looks stable. Use mixed mode and include more real code snippets.",
    );
  }

  const symbolPressure = sumScores(symbols);
  const wordPressure = sumScores(words);
  const recommendedMode: Mode =
    symbolPressure > wordPressure * 1.15
      ? "symbols"
      : wordPressure > symbolPressure * 1.15
        ? "words"
        : "mixed";

  return {
    focus_words: focusWords,
    focus_symbols: focusSymbols,
    focus_code: focusCode,
    focus_keys: focusKeys,
    advice,
    recommended_mode: recommendedMode,
    has_recent_history: true,
  };
}

function aggregateMapForTokenKind(
  kind: TokenKind,
  words: Map<string, Aggregate>,
  symbols: Map<string, Aggregate>,
  codeTerms: Map<string, Aggregate>,
): Map<string, Aggregate> {
  switch (kind) {
    case "word":
      return words;
    case "symbol":
      return symbols;
    case "code":
      return codeTerms;
  }
}

function addAggregate(
  map: Map<string, Aggregate>,
  key: string,
  delay: number,
  duration: number,
  errors: number,
): void {
  const aggregate = map.get(key) ?? {
    occurrences: 0,
    errors: 0,
    delaySum: 0,
    durationSum: 0,
  };
  aggregate.occurrences += 1;
  aggregate.errors += errors;
  aggregate.delaySum += delay;
  aggregate.durationSum += duration;
  map.set(key, aggregate);
}

function recordKeyErrors(record: SessionRecord): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const event of record.key_events) {
    if (event.action === "insert" && !event.correct) {
      const key = event.expected ?? event.input;
      const label = key === null ? "extra" : keyBucketForChar(key);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  if (record.key_events.length === 0) {
    for (const [label, count] of sortedRecordEntries(record.error_chars)) {
      const bucket = keyBucketForLabel(label);
      counts.set(bucket, (counts.get(bucket) ?? 0) + count);
    }
  }

  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function noHistoryAdvice(language: Language): string[] {
  if (language === "zh") {
    return [
      "还没有练习记录。先从基础字符开始，建立一条基准数据。",
      "先把正确率打稳，再追速度，这样后续分析才有用。",
    ];
  }
  return [
    "No history yet. Start with a mixed baseline session.",
    "Focus on accuracy before speed so the data is useful.",
  ];
}

function topKeys(map: Map<string, Aggregate>, limit: number): string[] {
  return [...map.entries()]
    .sort(([leftKey, left], [rightKey, right]) => {
      const scoreDelta = aggregateScore(right) - aggregateScore(left);
      return scoreDelta === 0 ? leftKey.localeCompare(rightKey) : scoreDelta;
    })
    .filter(([, aggregate]) => aggregate.occurrences > 0)
    .slice(0, limit)
    .map(([key]) => key);
}

function isFocusWord(word: string): boolean {
  const length = Array.from(word).length;
  if (length < 3) {
    return false;
  }
  return /[A-Z]/u.test(word) || length >= 5;
}

function isWordLikeToken(token: string): boolean {
  return /[A-Za-z]/u.test(token) && /^[A-Za-z0-9_]+$/u.test(token);
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

function keyBucketForChar(value: string): string {
  switch (value) {
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
    case '"':
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
      return /^[A-Za-z]$/u.test(value) ? value.toLowerCase() : value;
  }
}

function effectiveTypedLen(record: SessionRecord): number {
  if (record.typed_len > 0) {
    return record.typed_len;
  }
  return Math.max(Array.from(record.user_input).length, record.correct_chars);
}

function sortedRecordEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function sumScores(map: Map<string, Aggregate>): number {
  return [...map.values()].reduce((sum, aggregate) => sum + aggregateScore(aggregate), 0);
}

function aggregateScore(aggregate: Aggregate): number {
  return (
    average(aggregate.delaySum, aggregate.occurrences) +
    average(aggregate.durationSum, aggregate.occurrences) * 0.25 +
    aggregate.errors * 300
  );
}

function average(sum: number, count: number): number {
  return count === 0 ? 0 : sum / count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNever(value: never): never {
  throw new Error(`Unexpected token kind: ${value}`);
}
