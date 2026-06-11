/**
 * 纯函数文本编辑核心：cursor 为 UTF-16 code unit 偏移，
 * 移动/删除以完整字符（含代理对）为单位，供录入屏与详情弹窗编辑复用。
 */
export interface TextEditState {
  text: string;
  cursor: number;
}

function clampCursor(state: TextEditState): number {
  return Math.min(Math.max(state.cursor, 0), state.text.length);
}

/** 光标前一个完整字符的起始偏移 */
function previousBoundary(text: string, cursor: number): number {
  if (cursor <= 0) {
    return 0;
  }
  const low = text.charCodeAt(cursor - 1);
  if (low >= 0xdc00 && low <= 0xdfff && cursor >= 2) {
    const high = text.charCodeAt(cursor - 2);
    if (high >= 0xd800 && high <= 0xdbff) {
      return cursor - 2;
    }
  }
  return cursor - 1;
}

/** 光标后一个完整字符的结束偏移 */
function nextBoundary(text: string, cursor: number): number {
  if (cursor >= text.length) {
    return text.length;
  }
  const high = text.charCodeAt(cursor);
  if (high >= 0xd800 && high <= 0xdbff && cursor + 1 < text.length) {
    const low = text.charCodeAt(cursor + 1);
    if (low >= 0xdc00 && low <= 0xdfff) {
      return cursor + 2;
    }
  }
  return cursor + 1;
}

export function insertAtCursor(state: TextEditState, input: string): TextEditState {
  const cursor = clampCursor(state);
  return {
    text: state.text.slice(0, cursor) + input + state.text.slice(cursor),
    cursor: cursor + input.length,
  };
}

export function deleteBeforeCursor(state: TextEditState): TextEditState {
  const cursor = clampCursor(state);
  if (cursor === 0) {
    return { text: state.text, cursor };
  }
  const start = previousBoundary(state.text, cursor);
  return {
    text: state.text.slice(0, start) + state.text.slice(cursor),
    cursor: start,
  };
}

export function moveCursorLeft(state: TextEditState): TextEditState {
  return { text: state.text, cursor: previousBoundary(state.text, clampCursor(state)) };
}

export function moveCursorRight(state: TextEditState): TextEditState {
  return { text: state.text, cursor: nextBoundary(state.text, clampCursor(state)) };
}

interface CursorPosition {
  line: number;
  column: number;
  lineStarts: number[];
  lines: string[];
}

function cursorPosition(state: TextEditState): CursorPosition {
  const cursor = clampCursor(state);
  const lines = state.text.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  let line = 0;
  for (let index = lineStarts.length - 1; index >= 0; index -= 1) {
    if (cursor >= (lineStarts[index] ?? 0)) {
      line = index;
      break;
    }
  }
  return { line, column: cursor - (lineStarts[line] ?? 0), lineStarts, lines };
}

function cursorAtLineColumn(position: CursorPosition, line: number, column: number): number {
  const lineText = position.lines[line] ?? "";
  return (position.lineStarts[line] ?? 0) + Math.min(column, lineText.length);
}

export function moveCursorUp(state: TextEditState): TextEditState {
  const position = cursorPosition(state);
  if (position.line === 0) {
    return { text: state.text, cursor: clampCursor(state) };
  }
  return {
    text: state.text,
    cursor: cursorAtLineColumn(position, position.line - 1, position.column),
  };
}

export function moveCursorDown(state: TextEditState): TextEditState {
  const position = cursorPosition(state);
  if (position.line >= position.lines.length - 1) {
    return { text: state.text, cursor: clampCursor(state) };
  }
  return {
    text: state.text,
    cursor: cursorAtLineColumn(position, position.line + 1, position.column),
  };
}

export function moveCursorLineStart(state: TextEditState): TextEditState {
  const position = cursorPosition(state);
  return { text: state.text, cursor: position.lineStarts[position.line] ?? 0 };
}

export function moveCursorLineEnd(state: TextEditState): TextEditState {
  const position = cursorPosition(state);
  return {
    text: state.text,
    cursor: (position.lineStarts[position.line] ?? 0) + (position.lines[position.line] ?? "").length,
  };
}

/** 光标所在逻辑行号（用于编辑视图自动滚动） */
export function cursorLine(state: TextEditState): number {
  return cursorPosition(state).line;
}

import { cursorVisualPosition, offsetAtDisplayColumn, visualizeText } from "./visualText";

/** 在视觉行（软换行后的行）间上移，按显示列对齐 */
export function moveCursorUpVisual(state: TextEditState, maxWidth: number): TextEditState {
  const position = cursorVisualPosition(state.text, maxWidth, state.cursor);
  if (position.line === 0) {
    return { text: state.text, cursor: clampCursor(state) };
  }
  const lines = visualizeText(state.text, maxWidth);
  const target = lines[position.line - 1]!;
  return { text: state.text, cursor: offsetAtDisplayColumn(target, position.displayColumn) };
}

/** 在视觉行间下移，按显示列对齐 */
export function moveCursorDownVisual(state: TextEditState, maxWidth: number): TextEditState {
  const lines = visualizeText(state.text, maxWidth);
  const position = cursorVisualPosition(state.text, maxWidth, state.cursor);
  if (position.line >= lines.length - 1) {
    return { text: state.text, cursor: clampCursor(state) };
  }
  const target = lines[position.line + 1]!;
  return { text: state.text, cursor: offsetAtDisplayColumn(target, position.displayColumn) };
}
