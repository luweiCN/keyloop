import { describe, expect, test } from "bun:test";

import { cursorVisualPosition, visualizeText } from "../src/ui/opentui/visualText";
import { moveCursorDownVisual, moveCursorUpVisual } from "../src/ui/opentui/textEdit";

describe("visualizeText", () => {
  test("wraps at word boundaries and tracks offsets", () => {
    const lines = visualizeText("the quick brown fox jumps over", 12);
    expect(lines.map((line) => line.content)).toEqual(["the quick", "brown fox", "jumps over"]);
    expect(lines[0]).toMatchObject({ start: 0, end: 9 });
    expect(lines[1]).toMatchObject({ start: 10, end: 19 });
    expect(lines[2]).toMatchObject({ start: 20, end: 30 });
  });

  test("hard-splits cjk runs with correct offsets", () => {
    const lines = visualizeText("中文段落测试", 8);
    expect(lines.map((line) => line.content)).toEqual(["中文段落", "测试"]);
    expect(lines[0]).toMatchObject({ start: 0, end: 4 });
    expect(lines[1]).toMatchObject({ start: 4, end: 6 });
  });

  test("keeps logical line boundaries and flags last visual line", () => {
    const lines = visualizeText("ab\ncdef", 10);
    expect(lines).toEqual([
      { content: "ab", start: 0, end: 2, logicalLine: 0, isLogicalEnd: true },
      { content: "cdef", start: 3, end: 7, logicalLine: 1, isLogicalEnd: true },
    ]);
  });

  test("empty text yields one empty line", () => {
    expect(visualizeText("", 10)).toEqual([
      { content: "", start: 0, end: 0, logicalLine: 0, isLogicalEnd: true },
    ]);
  });
});

describe("cursorVisualPosition", () => {
  test("locates cursor on the wrapped visual line", () => {
    const text = "the quick brown fox";
    expect(cursorVisualPosition(text, 12, 0)).toMatchObject({ line: 0, column: 0 });
    expect(cursorVisualPosition(text, 12, 9)).toMatchObject({ line: 0, column: 9 });
    expect(cursorVisualPosition(text, 12, 12)).toMatchObject({ line: 1, column: 2 });
    expect(cursorVisualPosition(text, 12, 19)).toMatchObject({ line: 1, column: 9 });
  });
});

describe("visual cursor movement", () => {
  test("up and down move between wrapped visual lines of one paragraph", () => {
    const text = "the quick brown fox jumps over";
    // 光标在 "brown" 的 b（offset 10，第二视觉行行首）
    const up = moveCursorUpVisual({ text, cursor: 10 }, 12);
    expect(up.cursor).toBe(0);
    const down = moveCursorDownVisual({ text, cursor: 10 }, 12);
    expect(down.cursor).toBe(20);
  });

  test("column is preserved by display width across cjk", () => {
    const text = "中文段落测试段落更多文字";
    // 宽 8 → 每行 4 个汉字；光标在第 2 行第 2 字（offset 6）
    const up = moveCursorUpVisual({ text, cursor: 6 }, 8);
    expect(up.cursor).toBe(2);
    const down = moveCursorDownVisual({ text, cursor: 6 }, 8);
    expect(down.cursor).toBe(10);
  });

  test("clamps at first and last visual lines", () => {
    const text = "short";
    expect(moveCursorUpVisual({ text, cursor: 3 }, 10).cursor).toBe(3);
    expect(moveCursorDownVisual({ text, cursor: 3 }, 10).cursor).toBe(3);
  });
});
