import type { DashboardActivityDay } from "../../report/statsDashboard";
import type { KeySignal } from "../../training/keySignal";

export const SPARK_GLYPHS = "▁▂▃▄▅▆▇█";

export type ActivityLevel = "empty" | "low" | "medium" | "high" | "peak";
export type KeyboardHeatLevel =
  | "unrated"
  | "mastered"
  | "watch"
  | "weak"
  | "critical";

export interface PhysicalKey {
  readonly id: string;
  readonly label: string;
  readonly shift?: string;
}

export interface DisplayKeycap {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly compactWidth: number;
  readonly physicalKeyId?: string;
}

export interface ActivitySummary {
  readonly activeDays: number;
  readonly totalActiveMs: number;
  readonly totalSessions: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
}

export const PHYSICAL_KEYBOARD_ROWS: readonly (readonly PhysicalKey[])[] = [
  [
    { id: "`", label: "`", shift: "~" },
    { id: "1", label: "1", shift: "!" },
    { id: "2", label: "2", shift: "@" },
    { id: "3", label: "3", shift: "#" },
    { id: "4", label: "4", shift: "$" },
    { id: "5", label: "5", shift: "%" },
    { id: "6", label: "6", shift: "^" },
    { id: "7", label: "7", shift: "&" },
    { id: "8", label: "8", shift: "*" },
    { id: "9", label: "9", shift: "(" },
    { id: "0", label: "0", shift: ")" },
    { id: "-", label: "-", shift: "_" },
    { id: "=", label: "=", shift: "+" },
  ],
  [
    { id: "q", label: "q", shift: "Q" },
    { id: "w", label: "w", shift: "W" },
    { id: "e", label: "e", shift: "E" },
    { id: "r", label: "r", shift: "R" },
    { id: "t", label: "t", shift: "T" },
    { id: "y", label: "y", shift: "Y" },
    { id: "u", label: "u", shift: "U" },
    { id: "i", label: "i", shift: "I" },
    { id: "o", label: "o", shift: "O" },
    { id: "p", label: "p", shift: "P" },
    { id: "[", label: "[", shift: "{" },
    { id: "]", label: "]", shift: "}" },
    { id: "\\", label: "\\", shift: "|" },
  ],
  [
    { id: "a", label: "a", shift: "A" },
    { id: "s", label: "s", shift: "S" },
    { id: "d", label: "d", shift: "D" },
    { id: "f", label: "f", shift: "F" },
    { id: "g", label: "g", shift: "G" },
    { id: "h", label: "h", shift: "H" },
    { id: "j", label: "j", shift: "J" },
    { id: "k", label: "k", shift: "K" },
    { id: "l", label: "l", shift: "L" },
    { id: ";", label: ";", shift: ":" },
    { id: "'", label: "'", shift: "\"" },
  ],
  [
    { id: "z", label: "z", shift: "Z" },
    { id: "x", label: "x", shift: "X" },
    { id: "c", label: "c", shift: "C" },
    { id: "v", label: "v", shift: "V" },
    { id: "b", label: "b", shift: "B" },
    { id: "n", label: "n", shift: "N" },
    { id: "m", label: "m", shift: "M" },
    { id: ",", label: ",", shift: "<" },
    { id: ".", label: ".", shift: ">" },
    { id: "/", label: "/", shift: "?" },
  ],
] as const;

export const DISPLAY_KEYBOARD_ROWS: readonly (readonly DisplayKeycap[])[] = [
  [
    ...(PHYSICAL_KEYBOARD_ROWS[0] ?? []).map(displayPhysicalKeycap),
    specialKeycap("backspace", "⌫", 7, 5),
  ],
  [
    specialKeycap("tab", "Tab", 6, 4),
    ...(PHYSICAL_KEYBOARD_ROWS[1] ?? []).map(displayPhysicalKeycap),
  ],
  [
    specialKeycap("caps", "Caps", 7, 5),
    ...(PHYSICAL_KEYBOARD_ROWS[2] ?? []).map(displayPhysicalKeycap),
    specialKeycap("enter", "Enter", 8, 5),
  ],
  [
    specialKeycap("shift-left", "Shift", 9, 6),
    ...(PHYSICAL_KEYBOARD_ROWS[3] ?? []).map(displayPhysicalKeycap),
    specialKeycap("shift-right", "Shift", 9, 6),
  ],
  [
    specialKeycap("ctrl-left", "Ctrl", 7, 5),
    specialKeycap("alt-left", "Alt", 7, 5),
    specialKeycap("space", "Space", 30, 20),
    specialKeycap("alt-right", "Alt", 7, 5),
    specialKeycap("ctrl-right", "Ctrl", 7, 5),
  ],
] as const;

export function sparkline(values: readonly number[], width: number): string {
  const safeWidth = Math.max(1, Math.trunc(width));
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return "·".repeat(safeWidth);
  }
  const sampled = sampleValues(finite, safeWidth);
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  return sampled
    .map((value) => {
      const normalized = max === min ? 0.5 : (value - min) / (max - min);
      const index = Math.max(
        0,
        Math.min(
          Array.from(SPARK_GLYPHS).length - 1,
          Math.round(normalized * (Array.from(SPARK_GLYPHS).length - 1)),
        ),
      );
      return Array.from(SPARK_GLYPHS)[index] ?? "▄";
    })
    .join("")
    .padStart(safeWidth, "·");
}

export function activityLevel(activeMs: number): ActivityLevel {
  const minutes = Math.max(0, activeMs) / 60_000;
  if (minutes === 0) return "empty";
  if (minutes < 5) return "low";
  if (minutes < 15) return "medium";
  if (minutes < 30) return "high";
  return "peak";
}

export function activityGlyph(level: ActivityLevel): string {
  switch (level) {
    case "empty":
      return "·";
    case "low":
      return "░";
    case "medium":
      return "▒";
    case "high":
      return "▓";
    case "peak":
      return "█";
  }
}

export function activityCalendarRows(
  days: readonly DashboardActivityDay[],
): readonly (readonly DashboardActivityDay[])[] {
  const rows = Array.from({ length: 7 }, () => [] as DashboardActivityDay[]);
  for (const day of days) {
    const date = new Date(`${day.date}T12:00:00`);
    const mondayIndex = (date.getDay() + 6) % 7;
    rows[mondayIndex]?.push(day);
  }
  return rows;
}

export function summarizeActivity(
  days: readonly DashboardActivityDay[],
): ActivitySummary {
  let currentStreak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if ((days[index]?.activeMs ?? 0) <= 0) break;
    currentStreak += 1;
  }

  let longestStreak = 0;
  let runningStreak = 0;
  for (const day of days) {
    if (day.activeMs > 0) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  return {
    activeDays: days.filter((day) => day.activeMs > 0).length,
    totalActiveMs: days.reduce((sum, day) => sum + day.activeMs, 0),
    totalSessions: days.reduce((sum, day) => sum + day.sessionCount, 0),
    currentStreak,
    longestStreak,
  };
}

export function keyboardHeatLevel(
  signal: KeySignal | null,
): KeyboardHeatLevel {
  const confidence = signal?.confidence;
  if (confidence === null || confidence === undefined) return "unrated";
  if (confidence >= 1) return "mastered";
  if (confidence >= 0.8) return "watch";
  if (confidence >= 0.55) return "weak";
  return "critical";
}

export function keyboardHeatGlyph(level: KeyboardHeatLevel): string {
  switch (level) {
    case "unrated":
      return "·";
    case "mastered":
      return "░";
    case "watch":
      return "▒";
    case "weak":
      return "▓";
    case "critical":
      return "█";
  }
}

export function signalsForPhysicalKey(
  key: PhysicalKey,
  signals: readonly KeySignal[],
): KeySignal[] {
  const labels = new Set([key.id, key.shift].filter((value): value is string => value !== undefined));
  return signals
    .filter((signal) => labels.has(signal.key))
    .sort((left, right) => signalRank(left) - signalRank(right));
}

export function weakestSignalForPhysicalKey(
  key: PhysicalKey,
  signals: readonly KeySignal[],
): KeySignal | null {
  return signalsForPhysicalKey(key, signals)[0] ?? null;
}

export function defaultPhysicalKeyId(signals: readonly KeySignal[]): string {
  const candidates = PHYSICAL_KEYBOARD_ROWS.flatMap((row) =>
    row.map((key) => ({ key, signal: weakestSignalForPhysicalKey(key, signals) })),
  ).filter(
    (entry): entry is { key: PhysicalKey; signal: KeySignal } =>
      entry.signal !== null && entry.signal.confidence !== null,
  );
  candidates.sort((left, right) => signalRank(left.signal) - signalRank(right.signal));
  return candidates[0]?.key.id ?? "a";
}

export function physicalKeyById(id: string): PhysicalKey {
  return (
    PHYSICAL_KEYBOARD_ROWS.flat().find((key) => key.id === id) ??
    PHYSICAL_KEYBOARD_ROWS[2]?.[0] ??
    { id: "a", label: "a", shift: "A" }
  );
}

export function movePhysicalKey(
  currentId: string,
  direction: "left" | "right" | "up" | "down",
): string {
  const current = keyboardPosition(currentId) ?? { row: 2, column: 0 };
  if (direction === "left" || direction === "right") {
    const row = PHYSICAL_KEYBOARD_ROWS[current.row] ?? [];
    const delta = direction === "left" ? -1 : 1;
    const column = Math.max(0, Math.min(row.length - 1, current.column + delta));
    return row[column]?.id ?? currentId;
  }
  const delta = direction === "up" ? -1 : 1;
  const rowIndex = Math.max(
    0,
    Math.min(PHYSICAL_KEYBOARD_ROWS.length - 1, current.row + delta),
  );
  const target = PHYSICAL_KEYBOARD_ROWS[rowIndex] ?? [];
  const source = PHYSICAL_KEYBOARD_ROWS[current.row] ?? [];
  const normalized = source.length <= 1 ? 0 : current.column / (source.length - 1);
  const column = Math.round(normalized * Math.max(0, target.length - 1));
  return target[column]?.id ?? currentId;
}

export function proportionalWidths(
  values: readonly number[],
  width: number,
): number[] {
  const safeWidth = Math.max(0, Math.trunc(width));
  const nonNegative = values.map((value) => Math.max(0, value));
  const total = nonNegative.reduce((sum, value) => sum + value, 0);
  if (safeWidth === 0 || total === 0) {
    return values.map(() => 0);
  }
  const raw = nonNegative.map((value) => (value / total) * safeWidth);
  const result = raw.map(Math.floor);
  let remaining = safeWidth - result.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const entry of order) {
    if (remaining <= 0) break;
    result[entry.index] = (result[entry.index] ?? 0) + 1;
    remaining -= 1;
  }
  return result;
}

function keyboardPosition(
  id: string,
): { row: number; column: number } | null {
  for (let row = 0; row < PHYSICAL_KEYBOARD_ROWS.length; row += 1) {
    const column = PHYSICAL_KEYBOARD_ROWS[row]?.findIndex((key) => key.id === id) ?? -1;
    if (column >= 0) {
      return { row, column };
    }
  }
  return null;
}

function displayPhysicalKeycap(key: PhysicalKey): DisplayKeycap {
  const label = /^[a-z]$/u.test(key.label)
    ? key.label.toUpperCase()
    : `${key.label}${key.shift ?? ""}`;
  return {
    id: `physical-${key.id}`,
    label,
    width: 4,
    compactWidth: 3,
    physicalKeyId: key.id,
  };
}

function specialKeycap(
  id: string,
  label: string,
  width: number,
  compactWidth: number,
): DisplayKeycap {
  return { id: `special-${id}`, label, width, compactWidth };
}

function signalRank(signal: KeySignal): number {
  return signal.confidence ?? Number.POSITIVE_INFINITY;
}

function sampleValues(values: readonly number[], width: number): number[] {
  if (values.length <= width) {
    return [...values];
  }
  return Array.from({ length: width }, (_, index) => {
    const start = Math.floor((index / width) * values.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / width) * values.length));
    const bucket = values.slice(start, end);
    return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
  });
}
