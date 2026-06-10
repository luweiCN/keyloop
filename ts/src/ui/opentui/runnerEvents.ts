import type { LiveKey } from "../../training/liveSession";
import type { OpenTuiKeyEvent } from "./kit";
import type { LiveCodeControl } from "./practiceOptions";

export function isEscapeEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "escape" || name === "esc" || event.sequence === "\x1b";
}

export function isEnterEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    name === "enter" ||
    name === "return" ||
    event.sequence === "\r" ||
    event.sequence === "\n"
  );
}

export function isSpaceEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "space" || event.sequence === " ";
}

export function isQuitEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return !event.ctrl && !event.meta && (event.sequence === "q" || name === "q");
}

export function isCtrlCEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    !event.meta &&
    (event.sequence === "\x03" ||
      (event.ctrl && (event.sequence.toLowerCase() === "c" || name === "c")))
  );
}

export function isPauseToggleEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    !event.meta &&
    (event.sequence === "\x10" ||
      (event.ctrl && (event.sequence.toLowerCase() === "p" || name === "p")))
  );
}

export function isPracticeOptionsEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    !event.meta &&
    (event.sequence === "\x0f" ||
      (event.ctrl && (event.sequence.toLowerCase() === "o" || name === "o")))
  );
}

export function isRepeatEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return !event.ctrl && !event.meta && (event.sequence.toLowerCase() === "r" || name === "r");
}

export function isRestartGroupEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    !event.meta &&
    (event.sequence === "\x0e" ||
      (event.ctrl && (event.sequence.toLowerCase() === "n" || name === "n")))
  );
}

export function codeControlFromEvent(event: OpenTuiKeyEvent): LiveCodeControl | undefined {
  if (event.meta) {
    return undefined;
  }
  const controlSequence = codeControlFromSequence(event.sequence);
  if (controlSequence !== undefined) {
    return controlSequence;
  }
  if (!event.ctrl) {
    return undefined;
  }
  const values = [event.sequence, event.name].map(normalizedControlValue);
  if (values.includes("r")) {
    return "refresh";
  }
  return undefined;
}

export function normalizedControlValue(value: string): string {
  const normalized = value.toLowerCase();
  const kittyControl = /^\x1b\[(\d+);5u$/u.exec(normalized);
  if (kittyControl !== null) {
    const codePoint = Number(kittyControl[1]);
    if (Number.isInteger(codePoint)) {
      return String.fromCodePoint(codePoint).toLowerCase();
    }
  }
  for (const prefix of ["ctrl+", "ctrl-", "c-", "^"]) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length);
    }
  }
  return normalized;
}

export function codeControlFromSequence(sequence: string): LiveCodeControl | undefined {
  switch (sequence) {
    case "\x12":
      return "refresh";
    default:
      return undefined;
  }
}

export function isArrowUpEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "up" || name === "arrowup" || event.sequence === "\x1b[A";
}

export function isArrowDownEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "down" || name === "arrowdown" || event.sequence === "\x1b[B";
}

export function isArrowRightEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "right" || name === "arrowright" || event.sequence === "\x1b[C";
}

export function isArrowLeftEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "left" || name === "arrowleft" || event.sequence === "\x1b[D";
}

export function liveKeyFromOpenTuiEvent(event: OpenTuiKeyEvent): LiveKey | undefined {
  const name = event.name.toLowerCase();
  if (name === "backspace" || event.sequence === "\b" || event.sequence === "\x7f") {
    return { kind: "backspace" };
  }
  if (
    name === "enter" ||
    name === "return" ||
    event.sequence === "\r" ||
    event.sequence === "\n"
  ) {
    return { kind: "enter" };
  }
  if (name === "tab" || event.sequence === "\t") {
    return { kind: "tab" };
  }

  const value = singlePrintableCharacter(event.sequence) ?? singlePrintableCharacter(event.name);
  if (value === undefined) {
    return undefined;
  }
  return {
    kind: "char",
    value,
    ctrl: event.ctrl,
    alt: event.meta,
  };
}

export function singlePrintableCharacter(value: string): string | undefined {
  const chars = Array.from(value);
  const char = chars[0];
  if (chars.length !== 1 || char === undefined) {
    return undefined;
  }
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined || codePoint < 0x20 || codePoint === 0x7f) {
    return undefined;
  }
  return char;
}

export function isAsciiLiveCharacter(value: string): boolean {
  const char = Array.from(value)[0];
  const codePoint = char?.codePointAt(0);
  return codePoint !== undefined && codePoint <= 0x7f;
}

export function isCaptureWordsEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  return event.sequence.toLowerCase() === "a" || event.name.toLowerCase() === "a";
}
