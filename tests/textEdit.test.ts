import { describe, expect, test } from "bun:test";

import {
  deleteBeforeCursor,
  insertAtCursor,
  moveCursorDown,
  moveCursorLeft,
  moveCursorLineEnd,
  moveCursorLineStart,
  moveCursorRight,
  moveCursorUp,
  type TextEditState,
} from "../src/ui/opentui/textEdit";

const at = (text: string, cursor: number): TextEditState => ({ text, cursor });

describe("text edit core", () => {
  test("insert in the middle moves cursor past inserted text", () => {
    expect(insertAtCursor(at("ab", 1), "XY")).toEqual({ text: "aXYb", cursor: 3 });
    expect(insertAtCursor(at("", 0), "好")).toEqual({ text: "好", cursor: 1 });
  });

  test("backspace removes the char before the cursor only", () => {
    expect(deleteBeforeCursor(at("abc", 2))).toEqual({ text: "ac", cursor: 1 });
    expect(deleteBeforeCursor(at("abc", 0))).toEqual({ text: "abc", cursor: 0 });
  });

  test("left and right clamp at the ends and cross newlines", () => {
    expect(moveCursorLeft(at("ab", 0)).cursor).toBe(0);
    expect(moveCursorRight(at("ab", 2)).cursor).toBe(2);
    expect(moveCursorRight(at("a\nb", 1)).cursor).toBe(2);
    expect(moveCursorLeft(at("a\nb", 2)).cursor).toBe(1);
  });

  test("up and down keep the column when possible", () => {
    const text = "alpha\nbeta\ngamma";
    expect(moveCursorDown(at(text, 3)).cursor).toBe(9); // alpha col3 -> beta col3
    expect(moveCursorUp(at(text, 9)).cursor).toBe(3);
    expect(moveCursorDown(at(text, 5)).cursor).toBe(10); // 行尾列超出短行时落在下一行末尾
    expect(moveCursorUp(at(text, 0)).cursor).toBe(0);
    expect(moveCursorDown(at(text, 12)).cursor).toBe(12); // 最后一行不动
  });

  test("line start and end", () => {
    const text = "alpha\nbeta";
    expect(moveCursorLineStart(at(text, 8)).cursor).toBe(6);
    expect(moveCursorLineEnd(at(text, 7)).cursor).toBe(10);
  });

  test("surrogate pairs and cjk move as single characters", () => {
    const text = "a😀b";
    const right = moveCursorRight(at(text, 1));
    expect(right.cursor).toBe(3); // 😀 占两个 code unit
    expect(moveCursorLeft(at(text, 3)).cursor).toBe(1);
    expect(deleteBeforeCursor(at(text, 3))).toEqual({ text: "ab", cursor: 1 });
  });
});
