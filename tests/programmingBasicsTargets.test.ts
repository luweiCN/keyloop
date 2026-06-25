import { describe, expect, test } from "bun:test";
import { defaultSessionRecord, type KeyEventRecord, type SessionRecord } from "../src/domain/model";
import type { ProgrammingBasicsCard } from "../src/content/programmingBasics";
import { symbolsNumbersText, symbolWeakKeyWeights } from "../src/training/programmingBasicsTargets";

/** 一段同键事件，段内固定间隔（段间用大跳分隔以过滤跨段间隔）。 */
function keysAt(
  key: string,
  count: number,
  startMs: number,
  intervalMs: number,
  correct = true,
): KeyEventRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    at_ms: startMs + i * intervalMs,
    action: "insert" as const,
    position: i,
    expected: key,
    input: correct ? key : "?",
    correct,
  }));
}

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

describe("symbolWeakKeyWeights", () => {
  test("只保留数字/符号弱键，滤掉字母弱键", () => {
    // 6 快键做基线（把中位数分位拉到快键区），a 字母 / = 符号 / 2 数字 又慢又错 → confidence<1
    const fast = ["t", "e", "o", "i", "n", "r"].flatMap((k, idx) =>
      keysAt(k, 6, idx * 20_000, 100),
    );
    const record = defaultSessionRecord({
      key_events: [
        ...fast,
        ...keysAt("a", 6, 200_000, 600, false),
        ...keysAt("=", 6, 400_000, 600, false),
        ...keysAt("2", 6, 600_000, 600, false),
      ],
    });
    const weights = symbolWeakKeyWeights([record]);
    expect(weights.has("a")).toBe(false); // 字母键被滤掉
    expect(weights.has("=")).toBe(true); // 符号键保留
    expect(weights.has("2")).toBe(true); // 数字键保留
  });
});
