import type {
  CompletionState,
  KeyEventRecord,
  PracticeTarget,
  SessionRecord,
  TrainingCategory,
  TrainingModule,
} from "../domain/model";
import { buildSessionRecord } from "./metrics";

export interface LiveSessionState {
  target: PracticeTarget;
  target_chars: string[];
  input: string;
  events: KeyEventRecord[];
  ignored_non_ascii: number;
}

export type LiveKey =
  | { kind: "char"; value: string; ctrl?: boolean; alt?: boolean }
  | { kind: "enter" }
  | { kind: "tab" }
  | { kind: "backspace" };

export interface LiveMetrics {
  wpm: number;
  raw_wpm: number;
  accuracy: number;
  errors: number;
  backspaces: number;
  fastest_wpm?: number;
  slowest_wpm?: number;
}

export interface LiveSessionRecordOptions {
  started_at: string;
  duration_ms: number;
  manual_pause_ms?: number;
  completion_state?: CompletionState;
  daily_run_id?: string;
  lesson_id?: string;
  lesson_index?: number | null;
  module?: TrainingModule;
  category?: TrainingCategory;
}

export function createLiveSession(target: PracticeTarget): LiveSessionState {
  return {
    target,
    target_chars: Array.from(target.text),
    input: "",
    events: [],
    ignored_non_ascii: 0,
  };
}

export function applyLiveKey(
  state: LiveSessionState,
  key: LiveKey,
  atMs: number,
): void {
  switch (key.kind) {
    case "backspace":
      applyBackspace(state, atMs);
      return;
    case "enter":
      pushChar(state, "\n", atMs);
      return;
    case "tab":
      pushChar(state, "\t", atMs);
      return;
    case "char":
      if (key.ctrl === true || key.alt === true) {
        return;
      }
      applyChar(state, key.value, atMs);
      return;
  }
}

export function liveMetrics(
  targetText: string,
  inputText: string,
  events: KeyEventRecord[],
  elapsedMs: number,
): LiveMetrics {
  const targetChars = Array.from(targetText);
  const inputChars = Array.from(inputText);
  const finalCorrect = targetChars.reduce((count, expected, index) => {
    const actual = inputChars[index];
    return actual === expected ? count + 1 : count;
  }, 0);
  const insertEvents = events.filter((event) => event.action === "insert");
  const correctInsertCount = insertEvents.filter((event) => event.correct).length;
  const hasAutoIndent = events.some((event) => event.action === "auto_indent");
  const correct = hasAutoIndent ? correctInsertCount : finalCorrect;
  const accuracy =
    insertEvents.length === 0 ? 100 : (correctInsertCount / insertEvents.length) * 100;
  const errors = insertEvents.filter((event) => !event.correct).length;
  const backspaces = events.filter((event) => event.action === "backspace").length;
  if (elapsedMs <= 0) {
    return {
      wpm: 0,
      raw_wpm: 0,
      accuracy,
      errors,
      backspaces,
    };
  }
  const minutes = Math.max(elapsedMs, 1) / 60_000;
  const extremes = wordWpmExtremes(targetText, events);

  return {
    wpm: correct / 5 / minutes,
    raw_wpm: insertEvents.length / 5 / minutes,
    accuracy,
    errors,
    backspaces,
    ...(extremes === undefined
      ? {}
      : { fastest_wpm: extremes.fastest, slowest_wpm: extremes.slowest }),
  };
}

const MAX_WORD_KEY_DELAY_MS = 5_000;

/**
 * 本组逐词打字速度的最快/最慢（WPM）。按 target 空白切词，累加每个正确字符
 * 相对上一次敲击的 delay 得到每词平均速度。逐键瞬时速度太抖、逐词更稳。
 * 无 2+ 字符的有效词时返回 undefined。
 */
export function wordWpmExtremes(
  targetText: string,
  events: KeyEventRecord[],
): { fastest: number; slowest: number } | undefined {
  const chars = Array.from(targetText);
  const wordOfPosition: Array<number | undefined> = [];
  let wordIndex = -1;
  let inWord = false;
  for (let i = 0; i < chars.length; i += 1) {
    if (/\s/u.test(chars[i] ?? " ")) {
      inWord = false;
      wordOfPosition[i] = undefined;
    } else {
      if (!inWord) {
        wordIndex += 1;
        inWord = true;
      }
      wordOfPosition[i] = wordIndex;
    }
  }
  const words = new Map<number, { chars: number; ms: number }>();
  let previous: KeyEventRecord | undefined;
  for (const event of events) {
    if (event.action === "backspace") {
      previous = event;
      continue;
    }
    if (event.action !== "insert" && event.action !== "auto_indent") {
      continue;
    }
    if (event.correct && previous !== undefined) {
      const word = wordOfPosition[event.position];
      const delay = event.at_ms - previous.at_ms;
      if (word !== undefined && delay > 0 && delay <= MAX_WORD_KEY_DELAY_MS) {
        const entry = words.get(word) ?? { chars: 0, ms: 0 };
        entry.chars += 1;
        entry.ms += delay;
        words.set(word, entry);
      }
    }
    previous = event;
  }
  const wpms = [...words.values()]
    .filter((word) => word.chars >= 2 && word.ms > 0)
    .map((word) => word.chars / 5 / (word.ms / 60_000));
  if (wpms.length === 0) {
    return undefined;
  }
  return {
    fastest: Math.max(...wpms),
    slowest: Math.min(...wpms),
  };
}

export function sessionRecordFromLiveSession(
  state: LiveSessionState,
  options: LiveSessionRecordOptions,
): SessionRecord {
  const record = buildSessionRecord(
    state.target,
    options.started_at,
    options.duration_ms,
    options.manual_pause_ms ?? 0,
    state.input,
    [...state.events],
  );
  record.completion_state = options.completion_state ?? "completed";

  if (options.daily_run_id !== undefined) {
    record.daily_run_id = options.daily_run_id;
  }
  if (options.lesson_id !== undefined) {
    record.lesson_id = options.lesson_id;
  }
  if (options.lesson_index !== undefined) {
    record.lesson_index = options.lesson_index;
  }
  if (options.module !== undefined) {
    record.module = options.module;
  }
  if (options.category !== undefined) {
    record.category = options.category;
  }

  return record;
}

function applyChar(state: LiveSessionState, value: string, atMs: number): void {
  const char = Array.from(value)[0];
  if (char === undefined) {
    return;
  }
  if (!isAscii(char)) {
    state.ignored_non_ascii += 1;
    return;
  }
  pushChar(state, char, atMs);
}

function applyBackspace(state: LiveSessionState, atMs: number): void {
  const inputChars = Array.from(state.input);
  if (inputChars.length === 0) {
    return;
  }

  inputChars.pop();
  const position = inputChars.length;
  state.input = inputChars.join("");
  state.events.push({
    at_ms: atMs,
    action: "backspace",
    position,
    expected: state.target_chars[position] ?? null,
    input: null,
    correct: false,
  });
}

function pushChar(state: LiveSessionState, char: string, atMs: number): void {
  const inputChars = Array.from(state.input);
  if (inputChars.length >= state.target_chars.length) {
    return;
  }

  const position = inputChars.length;
  const expected = state.target_chars[position] ?? null;
  const correct = expected === char;
  inputChars.push(char);
  state.input = inputChars.join("");
  state.events.push({
    at_ms: atMs,
    action: "insert",
    position,
    expected,
    input: char,
    correct,
  });

  if (correct && char === "\n" && state.target.mode === "code") {
    autoInsertCodeIndent(state, atMs);
  }
}

function autoInsertCodeIndent(state: LiveSessionState, atMs: number): void {
  const inputChars = Array.from(state.input);
  while (
    inputChars.length < state.target_chars.length &&
    state.target_chars[inputChars.length] === " "
  ) {
    const position = inputChars.length;
    inputChars.push(" ");
    state.input = inputChars.join("");
    state.events.push({
      at_ms: atMs,
      action: "auto_indent",
      position,
      expected: " ",
      input: " ",
      correct: true,
    });
  }
}

function isAscii(value: string): boolean {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && codePoint <= 0x7f;
}
