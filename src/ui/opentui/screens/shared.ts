import type { OpenTuiAppState, OpenTuiMenuItem, OpenTuiSettingsMenuItem } from "../appModel";
import type { KeyEventRecord } from "../../../domain/model";
import { heatLevelFromRatio } from "../../heatScale";
import { TEXT_BOLD, theme, toneColor, type OpenTuiColorInput, type Tone } from "../theme";
import { meterBar, panel } from "../components";
import type { OpenTuiBoxProps, OpenTuiRendererKit } from "../kit";

export type MenuCardItem = OpenTuiMenuItem | OpenTuiSettingsMenuItem;

export type RunningRoute = Extract<OpenTuiAppState["route"], { screen: "running" }>;

export type CompleteRoute = Extract<OpenTuiAppState["route"], { screen: "complete" }>;

export type PracticeOptionsRoute = Extract<OpenTuiAppState["route"], { screen: "practice_options" }>;

export type LiveMetrics = NonNullable<RunningRoute["live"]>["metrics"];

export function progressDetailLine(data: GroupProgressData, language: OpenTuiAppState["language"]): string {
  return language === "zh"
    ? `正确 ${data.correct}/${data.total} · 退格 ${data.backspaces}`
    : `correct ${data.correct}/${data.total} · backspace ${data.backspaces}`;
}

export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += charDisplayWidth(char);
  }
  return width;
}

export function charDisplayWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

export function truncateToDisplayWidth(text: string, maxWidth: number): string {
  let width = 0;
  let result = "";
  for (const char of text) {
    const charWidth = charDisplayWidth(char);
    if (width + charWidth > maxWidth) {
      break;
    }
    result += char;
    width += charWidth;
  }
  return result;
}

export function wrapToDisplayWidth(text: string, maxWidth: number): string[] {
  const safeWidth = Math.max(1, Math.trunc(maxWidth));
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const char of text) {
    const charWidth = charDisplayWidth(char);
    if (width + charWidth > safeWidth) {
      lines.push(line);
      line = "";
      width = 0;
    }
    line += char;
    width += charWidth;
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines;
}

export interface GroupProgressData {
  correct: number;
  total: number;
  typed: number;
  backspaces: number;
  progress: number;
}

export function groupProgressForTarget(
  targetText: string,
  inputText: string,
  backspaces: number,
): GroupProgressData {
  const correct = countCorrectPrefix(targetText, inputText);
  const total = Array.from(targetText).length;
  const progress = progressPercent(correct, total);
  const typed = Array.from(inputText).length;
  return { correct, total, typed, backspaces, progress };
}

export function renderGroupProgressPanel(
  data: GroupProgressData,
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
  options: { framed?: boolean } = {},
): unknown {
  const framed = options.framed ?? true;
  if (!framed) {
    return meterBar("keyloop-group-progress-bar", data.progress, 72, kit);
  }
  return panel(
    "keyloop-group-progress",
    {
      title: language === "zh" ? "本组进度" : "Group progress",
      bottomTitle: progressDetailLine(data, language),
      height: 4,
      width: "100%",
    },
    kit,
    meterBar("keyloop-group-progress-bar", data.progress, 72, kit),
  );
}

export function renderPanel(
  id: string,
  title: string,
  lines: string[],
  kit: OpenTuiRendererKit,
  options: {
    bottomTitle?: string;
    height?: number;
    width?: number | string;
    flexGrow?: number;
    gap?: number;
  } = {},
): unknown {
  const props: OpenTuiBoxProps = {
    id,
    border: true,
    borderStyle: "rounded",
    borderColor: theme.border,
    title: ` ${title} `,
    paddingX: 1,
    flexDirection: "column",
    gap: options.gap ?? 1,
  };
  if (options.height !== undefined) {
    props.height = options.height;
  }
  if (options.width !== undefined) {
    props.width = options.width;
  }
  if (options.flexGrow !== undefined) {
    props.flexGrow = options.flexGrow;
  }
  if (options.bottomTitle !== undefined) {
    props.bottomTitle = options.bottomTitle;
    props.bottomTitleAlignment = "right";
  }
  return kit.Box(
    props,
    ...lines.map((line, index) =>
      kit.Text({
        content: line,
        fg: index === 0 ? theme.foreground : theme.muted,
        id: `${id}-line-${index}`,
        height: 1,
        truncate: true,
      }),
    ),
  );
}

export function countCorrectPrefix(targetText: string, inputText: string): number {
  const target = Array.from(targetText);
  const input = Array.from(inputText);
  return input.reduce((count, actual, index) => count + (actual === target[index] ? 1 : 0), 0);
}

export function progressPercent(correct: number, total: number): number {
  if (total === 0) {
    return 100;
  }
  return Math.round((correct / total) * 100);
}

export function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface KeyDiagnostics {
  baseline_wpm?: number;
  keys: KeyDiagnosticItem[];
  fast_keys: KeyDiagnosticItem[];
  slow_keys: KeyDiagnosticItem[];
  error_keys: KeyDiagnosticItem[];
}

export interface KeyDiagnosticItem {
  label: string;
  median_ms: number | undefined;
  wpm: number | undefined;
  sample_count: number;
  error_count: number;
  speed_level: number;
  error_level: number;
}

export const keySpeedWpmCeiling = 120;

export function buildKeyDiagnostics(targetText: string, events: readonly KeyEventRecord[]): KeyDiagnostics {
  const labels = targetKeyLabels(targetText);
  const stats = new Map<string, { samples: number[]; errors: number }>();
  for (const label of labels) {
    stats.set(label, { samples: [], errors: 0 });
  }

  let previousTypingEvent: KeyEventRecord | undefined;
  for (const event of events) {
    if (event.action === "backspace") {
      previousTypingEvent = event;
      continue;
    }
    if (event.action !== "insert") {
      continue;
    }
    const label = keyDiagnosticLabel(event.expected ?? event.input);
    if (label === undefined) {
      previousTypingEvent = event;
      continue;
    }
    const entry = stats.get(label) ?? { samples: [], errors: 0 };
    stats.set(label, entry);
    if (!event.correct) {
      entry.errors += 1;
    } else if (previousTypingEvent !== undefined) {
      const delay = event.at_ms - previousTypingEvent.at_ms;
      if (isValidKeyDelay(delay)) {
        entry.samples.push(delay);
      }
    }
    previousTypingEvent = event;
  }

  const baseKeys = labels.map((label) => {
    const entry = stats.get(label);
    const medianMs = median(entry?.samples ?? []);
    const wpm = medianMs === undefined ? undefined : delayMsToKeyWpm(medianMs);
    return {
      label,
      median_ms: medianMs,
      wpm,
      sample_count: entry?.samples.length ?? 0,
      error_count: entry?.errors ?? 0,
      speed_level: wpm === undefined ? 0 : heatLevelFromRatio(wpm / keySpeedWpmCeiling),
      error_level: 0,
    };
  });
  const maxErrorCount = Math.max(0, ...baseKeys.map((item) => item.error_count));
  const keys = baseKeys.map((item) => ({
    ...item,
    error_level:
      item.error_count > 0 && maxErrorCount > 0
        ? Math.max(1, heatLevelFromRatio(item.error_count / maxErrorCount))
        : 0,
  }));
  const sampleWpms = keys
    .map((item) => item.wpm)
    .filter((value): value is number => value !== undefined);
  const baselineWpm = medianFloat(sampleWpms);
  const slowKeys =
    baselineWpm === undefined
      ? []
      : keys
          .filter(
            (item) =>
              item.wpm !== undefined &&
              item.sample_count > 0 &&
              item.wpm <= baselineWpm * 0.75,
          )
          .sort(compareSlowKeyItems)
          .slice(0, 4);
  const fastKeys =
    baselineWpm === undefined
      ? []
      : keys
          .filter(
            (item) =>
              item.wpm !== undefined &&
              item.sample_count > 0 &&
              item.wpm >= baselineWpm * 1.25,
          )
          .sort(compareFastKeyItems)
          .slice(0, 4);
  const errorKeys = keys
    .filter((item) => item.error_count > 0)
    .sort(
      (left, right) =>
        right.error_count - left.error_count || compareKeyLabels(left.label, right.label),
    )
    .slice(0, 4);
  return {
    ...(baselineWpm === undefined ? {} : { baseline_wpm: baselineWpm }),
    keys,
    fast_keys: fastKeys,
    slow_keys: slowKeys,
    error_keys: errorKeys,
  };
}

export function targetKeyLabels(text: string): string[] {
  const labels = new Set<string>();
  for (const char of Array.from(text)) {
    const label = keyDiagnosticLabel(char);
    if (label !== undefined) {
      labels.add(label);
    }
  }
  return [...labels].sort(compareKeyLabels);
}

export function keyDiagnosticLabel(value: string | null): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value === " " || value === "\n" || value === "\t" || value.trim().length === 0) {
    return undefined;
  }
  if (/^[a-z]$/u.test(value)) {
    return value.toUpperCase();
  }
  return value;
}

export function compareKeyLabels(left: string, right: string): number {
  return keyLabelRank(left) - keyLabelRank(right) || left.localeCompare(right);
}

export function keyLabelRank(label: string): number {
  const upper = label.toUpperCase();
  if (/^[A-Z]$/u.test(upper)) {
    return upper.codePointAt(0) ?? 0;
  }
  if (/^[0-9]$/u.test(label)) {
    return 1_000 + (label.codePointAt(0) ?? 0);
  }
  const symbolOrder = "{}[]()<>=+-*/%&|!?:;.,_'\"`~@#$^\\";
  const symbolIndex = symbolOrder.indexOf(label);
  if (symbolIndex >= 0) {
    return 2_000 + symbolIndex;
  }
  return 3_000 + (label.codePointAt(0) ?? 0);
}

export function isValidKeyDelay(delay: number): boolean {
  return Number.isFinite(delay) && delay >= 40 && delay <= 12_000;
}

export function delayMsToKeyWpm(delayMs: number): number {
  return Math.round((12_000 / delayMs) * 10) / 10;
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value === undefined) {
    return undefined;
  }
  if (sorted.length % 2 === 1) {
    return Math.round(value);
  }
  const previous = sorted[middle - 1];
  return previous === undefined ? Math.round(value) : Math.round((previous + value) / 2);
}

export function medianFloat(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value === undefined) {
    return undefined;
  }
  const medianValue =
    sorted.length % 2 === 1 ? value : ((sorted[middle - 1] ?? value) + value) / 2;
  return Math.round(medianValue * 10) / 10;
}

export function compareSlowKeyItems(left: KeyDiagnosticItem, right: KeyDiagnosticItem): number {
  return (
    (left.wpm ?? Number.POSITIVE_INFINITY) - (right.wpm ?? Number.POSITIVE_INFINITY) ||
    right.error_count - left.error_count ||
    compareKeyLabels(left.label, right.label)
  );
}

export function compareFastKeyItems(left: KeyDiagnosticItem, right: KeyDiagnosticItem): number {
  return (
    (right.wpm ?? 0) - (left.wpm ?? 0) ||
    left.error_count - right.error_count ||
    compareKeyLabels(left.label, right.label)
  );
}

export function diagnosticKeyRows(items: readonly KeyDiagnosticItem[], perRow: number): KeyDiagnosticItem[][] {
  const rows: KeyDiagnosticItem[][] = [];
  for (let index = 0; index < items.length; index += perRow) {
    rows.push(items.slice(index, index + perRow));
  }
  return rows;
}

export function diagnosticKeyId(label: string): string {
  if (/^[A-Za-z0-9]$/u.test(label)) {
    return label.toUpperCase();
  }
  return `u${Array.from(label)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "0")
    .join("-")}`;
}

/**
 * 按词边界折行：英文在空格处断行，整词放不下才硬切；CJK 按显示宽度逐字断。
 */
export function wrapWordsToDisplayWidth(text: string, maxWidth: number): string[] {
  const safeWidth = Math.max(1, Math.trunc(maxWidth));
  const lines: string[] = [];
  let line = "";
  let lineWidth = 0;
  const flush = (): void => {
    if (line.length > 0) {
      lines.push(line);
      line = "";
      lineWidth = 0;
    }
  };
  for (const word of text.split(" ")) {
    const wordWidth = displayWidth(word);
    const separatorWidth = line.length > 0 ? 1 : 0;
    if (lineWidth + separatorWidth + wordWidth <= safeWidth) {
      line += `${line.length > 0 ? " " : ""}${word}`;
      lineWidth += separatorWidth + wordWidth;
      continue;
    }
    flush();
    if (wordWidth <= safeWidth) {
      line = word;
      lineWidth = wordWidth;
      continue;
    }
    // 单词/无空格长串（如 CJK 段落）超宽：按显示宽度硬切
    for (const piece of wrapToDisplayWidth(word, safeWidth)) {
      if (displayWidth(piece) === safeWidth || piece !== word) {
        lines.push(piece);
      }
    }
    const last = lines.pop() ?? "";
    line = last;
    lineWidth = displayWidth(last);
  }
  flush();
  return lines.length === 0 ? [] : lines;
}
