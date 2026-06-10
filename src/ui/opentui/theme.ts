export type AnsiColorName = keyof typeof ansiColorSlots;
export type OpenTuiColorInput =
  | string
  | AnsiThemeColor
  | DefaultForegroundColor
  | DefaultBackgroundColor;

export interface AnsiThemeColor {
  readonly kind: "ansi";
  readonly name: AnsiColorName;
  readonly slot: number;
}

export interface DefaultBackgroundColor {
  readonly kind: "defaultBackground";
}

export interface DefaultForegroundColor {
  readonly kind: "defaultForeground";
}

export const ansiColorSlots = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  brightBlack: 8,
  brightRed: 9,
  brightGreen: 10,
  brightYellow: 11,
  brightBlue: 12,
  brightMagenta: 13,
  brightCyan: 14,
  brightWhite: 15,
} as const;

export const ansiTheme = {
  black: ansiColor("black"),
  red: ansiColor("red"),
  green: ansiColor("green"),
  yellow: ansiColor("yellow"),
  blue: ansiColor("blue"),
  magenta: ansiColor("magenta"),
  cyan: ansiColor("cyan"),
  white: ansiColor("white"),
  brightBlack: ansiColor("brightBlack"),
  brightRed: ansiColor("brightRed"),
  brightGreen: ansiColor("brightGreen"),
  brightYellow: ansiColor("brightYellow"),
  brightBlue: ansiColor("brightBlue"),
  brightMagenta: ansiColor("brightMagenta"),
  brightCyan: ansiColor("brightCyan"),
  brightWhite: ansiColor("brightWhite"),
} as const;

export const theme = {
  ...ansiTheme,
  foreground: defaultForegroundColor(),
  white: defaultForegroundColor(),
  muted: ansiTheme.brightBlack,
  border: ansiTheme.brightBlack,
  accent: ansiTheme.green,
  cursor: ansiTheme.yellow,
  danger: ansiTheme.red,
  warning: ansiTheme.yellow,
  info: ansiTheme.cyan,
  background: defaultBackgroundColor(),
  transparent: "transparent",
} as const;

export type Tone = "good" | "neutral" | "warn" | "bad" | "info";

export function toneColor(tone: Tone): OpenTuiColorInput {
  switch (tone) {
    case "good":
      return theme.accent;
    case "neutral":
      return theme.foreground;
    case "warn":
      return theme.warning;
    case "bad":
      return theme.danger;
    case "info":
      return theme.info;
  }
}

export const TEXT_BOLD = 1;

export function ansiColor(name: AnsiColorName): AnsiThemeColor {
  return { kind: "ansi", name, slot: ansiColorSlots[name] };
}

export function defaultBackgroundColor(): DefaultBackgroundColor {
  return { kind: "defaultBackground" };
}

export function defaultForegroundColor(): DefaultForegroundColor {
  return { kind: "defaultForeground" };
}

export function isAnsiColorName(value: string): value is AnsiColorName {
  return Object.hasOwn(ansiColorSlots, value);
}

export function isAnsiThemeColor(value: unknown): value is AnsiThemeColor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "ansi" &&
    typeof (value as { slot?: unknown }).slot === "number"
  );
}

export function isDefaultBackgroundColor(value: unknown): value is DefaultBackgroundColor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "defaultBackground"
  );
}

export function isDefaultForegroundColor(value: unknown): value is DefaultForegroundColor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "defaultForeground"
  );
}
