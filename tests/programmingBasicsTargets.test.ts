import { describe, expect, test } from "bun:test";
import type { ProgrammingBasicsCard } from "../src/content/programmingBasics";
import { symbolsNumbersText } from "../src/training/programmingBasicsTargets";

describe("symbolsNumbersText（问题3：裸值不计入代码高亮范围）", () => {
  test("value 行排在最前且不计入 highlightFromLine，statement/block 才计入", () => {
    const cards: ProgrammingBasicsCard[] = [
      { text: "192.168.1.1", topic: "string", form: "value", source_id: "x" },
      { text: "user@example.com", topic: "string", form: "value", source_id: "x" },
      { text: "first = items[0]", topic: "index", form: "statement", source_id: "x" },
      { text: "if ok:\n    return None", topic: "control", form: "block", source_id: "x" },
    ];
    const { text, highlightFromLine } = symbolsNumbersText(cards);
    const lines = text.split("\n");
    // 2 个 value(<4) 聚成 1 行
    expect(highlightFromLine).toBe(1);
    expect(lines[0]).toContain("192.168.1.1");
    expect(lines[0]).toContain("user@example.com");
    // 高亮从 statement 行开始
    expect(lines[highlightFromLine]).toBe("first = items[0]");
  });

  test("无 value 卡时 highlightFromLine 为 0（整体高亮）", () => {
    const cards: ProgrammingBasicsCard[] = [
      { text: "first = items[0]", topic: "index", form: "statement", source_id: "x" },
    ];
    expect(symbolsNumbersText(cards).highlightFromLine).toBe(0);
  });

  test("全是 value 时 highlightFromLine 等于总行数（无高亮行）", () => {
    const cards: ProgrammingBasicsCard[] = [
      { text: "192.168.1.1", topic: "string", form: "value", source_id: "x" },
      { text: "user@example.com", topic: "string", form: "value", source_id: "x" },
    ];
    const { text, highlightFromLine } = symbolsNumbersText(cards);
    expect(highlightFromLine).toBe(text.split("\n").length);
  });
});
