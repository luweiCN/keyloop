import { randomUUID } from "node:crypto";

import type {
  KeyEventRecord,
  PracticeTarget,
  SessionRecord,
  TokenKind,
  TokenStat,
} from "../domain/model";

export interface TokenSpan {
  token: string;
  kind: TokenKind;
  start: number;
  end: number;
}

interface TimingBreakdown {
  active_ms: number;
  idle_ms: number;
  idle_pause_count: number;
  start_to_first_key_ms: number;
  last_key_to_end_ms: number;
}

const SYMBOL_PATTERNS = [
  "!==",
  "===",
  "=>",
  "&&",
  "||",
  ">=",
  "<=",
  "?.",
  "??",
  "${}",
  "()",
  "[]",
  "{}",
  "<>",
  "''",
  '""',
  "``",
  "::",
  "->",
  "+=",
  "-=",
  "*=",
  "/=",
  "_",
  "-",
  "=",
  "+",
  "*",
  "/",
  "\\",
  "?",
  "!",
  ":",
  ";",
  ",",
  ".",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "<",
  ">",
  "'",
  '"',
  "`",
] as const;

// 按首字符索引，避免每个字符位置都线性扫描全部 48 个 pattern。
// 组内保持 SYMBOL_PATTERNS 的原始顺序（长度降序），从而维持"最长优先"匹配语义。
const SYMBOL_PATTERNS_BY_FIRST_CHAR: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const pattern of SYMBOL_PATTERNS) {
    const first = Array.from(pattern)[0];
    if (first === undefined) {
      continue;
    }
    const group = map.get(first) ?? [];
    group.push(pattern);
    map.set(first, group);
  }
  return map;
})();

const IDLE_THRESHOLD_MS = 10_000;

export function buildSessionRecord(
  target: PracticeTarget,
  started_at: string,
  duration_ms: number,
  manual_pause_ms: number,
  user_input: string,
  key_events: KeyEventRecord[],
): SessionRecord {
  const targetChars = Array.from(target.text);
  const inputChars = Array.from(user_input);
  const targetLen = targetChars.length;
  const insertEvents = key_events.filter((event) => event.action === "insert");
  const insertCount = insertEvents.length;
  const correctInsertCount = insertEvents.filter((event) => event.correct).length;
  const hasAutoIndent = key_events.some((event) => event.action === "auto_indent");
  const backspaceCount = key_events.filter((event) => event.action === "backspace").length;
  const finalCorrectChars = targetChars.filter(
    (expected, index) => inputChars[index] === expected,
  ).length;
  const correctChars = hasAutoIndent ? correctInsertCount : finalCorrectChars;

  const errorChars: Record<string, number> = {};
  let errorCount = 0;
  for (const event of insertEvents) {
    if (event.correct) {
      continue;
    }
    errorCount += 1;
    const key = event.expected ?? event.input;
    const label = key === null ? "<extra>" : printableChar(key);
    errorChars[label] = (errorChars[label] ?? 0) + 1;
  }

  const timing = timingBreakdown(duration_ms, key_events);
  const normalizedKeyEvents = adjustedKeyEvents(
    key_events,
    timing.start_to_first_key_ms,
  );
  const minutes = Math.max(timing.active_ms, 1) / 60_000;
  const rawWpm = insertCount / 5 / minutes;
  const wpm = correctChars / 5 / minutes;
  const accuracy = insertCount === 0 ? 0 : (correctInsertCount / insertCount) * 100;
  const tokenStats = collectTokenStats(target.text, normalizedKeyEvents);
  const errorTokens: Record<string, number> = {};

  for (const stat of tokenStats) {
    if (stat.errors > 0) {
      errorTokens[stat.token] = (errorTokens[stat.token] ?? 0) + stat.errors;
    }
  }

  const slowTokens = [...tokenStats]
    .sort(
      (left, right) =>
        tokenScore(right) - tokenScore(left),
    )
    .slice(0, 12);

  return {
    id: randomUUID(),
    started_at,
    mode: target.mode,
    source: target.source,
    daily_run_id: "",
    lesson_id: "",
    lesson_index: null,
    completion_state: "completed",
    module: "unknown",
    category: "unknown",
    active_ms: timing.active_ms,
    idle_ms: timing.idle_ms,
    manual_pause_ms,
    idle_pause_count: timing.idle_pause_count,
    start_to_first_key_ms: timing.start_to_first_key_ms,
    last_key_to_end_ms: timing.last_key_to_end_ms,
    char_stats: {
      correct: correctChars,
      incorrect: errorCount,
      extra: saturatingSub(inputChars.length, targetChars.length),
      missed: saturatingSub(targetLen, inputChars.length),
    },
    duration_ms,
    target_text: target.text,
    user_input,
    target_len: targetLen,
    typed_len: insertCount,
    correct_chars: correctChars,
    wpm,
    raw_wpm: rawWpm,
    accuracy,
    error_count: errorCount,
    backspace_count: backspaceCount,
    error_chars: errorChars,
    error_tokens: errorTokens,
    slow_tokens: slowTokens,
    token_stats: tokenStats,
    key_events,
  };
}

export function tokenSpans(text: string): TokenSpan[] {
  const chars = Array.from(text);
  const spans: TokenSpan[] = [];
  let index = 0;

  while (index < chars.length) {
    const current = chars[index];
    if (current === undefined) {
      break;
    }

    if (isWhitespace(current)) {
      index += 1;
      continue;
    }

    if (isWordStart(current)) {
      const start = index;
      index += 1;
      while (index < chars.length) {
        const next = chars[index];
        if (next === undefined || !isWordContinue(next)) {
          break;
        }
        index += 1;
      }
      const token = chars.slice(start, index).join("");
      spans.push({
        token,
        kind: token === "_" ? "symbol" : "word",
        start,
        end: index,
      });
      continue;
    }

    const pattern = matchSymbolAt(chars, index);
    if (pattern !== null) {
      const length = Array.from(pattern).length;
      spans.push({
        token: pattern,
        kind: "symbol",
        start: index,
        end: index + length,
      });
      index += length;
      continue;
    }

    spans.push({
      token: current,
      kind: "code",
      start: index,
      end: index + 1,
    });
    index += 1;
  }

  return spans;
}

function collectTokenStats(
  text: string,
  keyEvents: KeyEventRecord[],
): TokenStat[] {
  const spans = tokenSpans(text);
  const inserts = keyEvents.filter((event) => event.action === "insert");
  let visibleAtMs = 0;
  const stats: TokenStat[] = [];

  for (const span of spans) {
    const events = inserts.filter(
      (event) =>
        event.at_ms >= visibleAtMs &&
        event.position >= span.start &&
        event.position < span.end,
    );
    const first = events[0];
    const last = events.at(-1);
    if (first === undefined || last === undefined) {
      continue;
    }

    stats.push({
      token: span.token,
      kind: span.kind,
      start_delay_ms: saturatingSub(first.at_ms, visibleAtMs),
      duration_ms: saturatingSub(last.at_ms, first.at_ms),
      errors: events.filter((event) => !event.correct).length,
    });
    visibleAtMs = last.at_ms;
  }

  return stats;
}

function timingBreakdown(
  durationMs: number,
  keyEvents: KeyEventRecord[],
): TimingBreakdown {
  const first = keyEvents[0];
  if (first === undefined) {
    return {
      active_ms: 0,
      idle_ms: 0,
      idle_pause_count: 0,
      start_to_first_key_ms: 0,
      last_key_to_end_ms: 0,
    };
  }

  const last = keyEvents.at(-1);
  if (last === undefined) {
    throw new Error("unreachable: first key event exists");
  }

  const startToFirstKeyMs = Math.min(first.at_ms, durationMs);
  const lastKeyToEndMs = saturatingSub(durationMs, Math.min(last.at_ms, durationMs));
  let idleMs = 0;
  let idlePauseCount = 0;

  for (let index = 1; index < keyEvents.length; index += 1) {
    const previous = keyEvents[index - 1];
    const current = keyEvents[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const gap = saturatingSub(current.at_ms, previous.at_ms);
    if (gap > IDLE_THRESHOLD_MS) {
      idlePauseCount += 1;
      idleMs += gap - IDLE_THRESHOLD_MS;
    }
  }

  return {
    active_ms: saturatingSub(
      saturatingSub(
        saturatingSub(durationMs, startToFirstKeyMs),
        lastKeyToEndMs,
      ),
      idleMs,
    ),
    idle_ms: idleMs,
    idle_pause_count: idlePauseCount,
    start_to_first_key_ms: startToFirstKeyMs,
    last_key_to_end_ms: lastKeyToEndMs,
  };
}

function adjustedKeyEvents(
  keyEvents: KeyEventRecord[],
  startToFirstKeyMs: number,
): KeyEventRecord[] {
  const adjusted: KeyEventRecord[] = [];
  let idleExcessBefore = 0;
  let previousAt: number | null = null;

  for (const event of keyEvents) {
    if (previousAt !== null) {
      const gap = saturatingSub(event.at_ms, previousAt);
      if (gap > IDLE_THRESHOLD_MS) {
        idleExcessBefore += gap - IDLE_THRESHOLD_MS;
      }
    }

    const atMs = saturatingSub(
      saturatingSub(event.at_ms, startToFirstKeyMs),
      idleExcessBefore,
    );
    previousAt = atMs + startToFirstKeyMs + idleExcessBefore;
    adjusted.push({ ...event, at_ms: atMs });
  }

  return adjusted;
}

function matchSymbolAt(chars: string[], index: number): string | null {
  const current = chars[index];
  if (current === undefined) {
    return null;
  }
  const candidates = SYMBOL_PATTERNS_BY_FIRST_CHAR.get(current);
  if (candidates === undefined) {
    return null;
  }
  for (const pattern of candidates) {
    const patternChars = Array.from(pattern);
    const end = index + patternChars.length;
    if (end <= chars.length && chars.slice(index, end).join("") === pattern) {
      return pattern;
    }
  }
  return null;
}

function tokenScore(stat: TokenStat): number {
  return stat.start_delay_ms + stat.duration_ms / 2 + stat.errors * 250;
}

function isWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function isWordStart(value: string): boolean {
  return /^[A-Za-z_]$/u.test(value);
}

function isWordContinue(value: string): boolean {
  return /^[A-Za-z0-9_]$/u.test(value);
}

function printableChar(value: string): string {
  switch (value) {
    case "\n":
      return "\\n";
    case "\t":
      return "\\t";
    case " ":
      return "<space>";
    default:
      return value;
  }
}

function saturatingSub(left: number, right: number): number {
  return Math.max(0, left - right);
}
