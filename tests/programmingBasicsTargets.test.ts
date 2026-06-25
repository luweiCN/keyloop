import { describe, expect, test } from "bun:test";
import { defaultSessionRecord, type KeyEventRecord, type SessionRecord } from "../src/domain/model";
import type { ProgrammingBasicsCard } from "../src/content/programmingBasics";
import {
  pickFormCoveredValueCards,
  pickWeakKeyTargetedCards,
  symbolsNumbersText,
  symbolWeakKeyWeights,
} from "../src/training/programmingBasicsTargets";

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

/** 可重复随机源（LCG），每 trial 独立；预热避免小种子首个输出极小。 */
function lcg(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rand = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5; i += 1) rand();
  return rand;
}

describe("pickWeakKeyTargetedCards", () => {
  const cards: ProgrammingBasicsCard[] = [
    { text: "a[0] = b => !c", topic: "x", source_id: "t" }, // 含 [ ] = > ! 五个弱键
    { text: "one two", topic: "x", source_id: "t" },
    { text: "three four", topic: "x", source_id: "t" },
    { text: "five six", topic: "x", source_id: "t" },
  ];
  const weights = new Map<string, number>([
    ["[", 0.9],
    ["]", 0.9],
    ["=", 0.9],
    [">", 0.9],
    ["!", 0.9],
  ]);

  function hitRate(weightOf: ReadonlyMap<string, number>, trials: number): number {
    let hits = 0;
    for (let i = 0; i < trials; i += 1) {
      const picked = pickWeakKeyTargetedCards(cards, weightOf, 1, lcg(i + 1));
      if (picked[0]?.text === "a[0] = b => !c") hits += 1;
    }
    return hits;
  }

  test("含弱符号键的卡入选频率显著高于无弱键(随机)对照", () => {
    const trials = 80;
    const targeted = hitRate(weights, trials);
    const control = hitRate(new Map(), trials); // 无弱键 → 纯随机 ≈ 25%
    expect(targeted).toBeGreaterThan(control + trials * 0.15);
  });

  test("count 超量返回全部、不重复、不改写卡", () => {
    const out = pickWeakKeyTargetedCards(cards, weights, 99, lcg(1));
    expect(out).toHaveLength(4);
    expect(new Set(out.map((c) => c.text)).size).toBe(4);
    expect(out.every((c) => cards.some((s) => s.text === c.text))).toBe(true);
  });
});

describe("pickFormCoveredValueCards", () => {
  const cards: ProgrammingBasicsCard[] = [
    { text: "10.0.0.1", topic: "x", form: "value", format: "ip", source_id: "s" },
    { text: "10.0.0.2", topic: "x", form: "value", format: "ip", source_id: "s" },
    { text: "2026-12-31", topic: "x", form: "value", format: "date", source_id: "s" },
    { text: "2026-01-01", topic: "x", form: "value", format: "date", source_id: "s" },
    { text: "$9.99", topic: "x", form: "value", format: "money", source_id: "s" },
    { text: "3.2.1", topic: "x", form: "value", format: "version", source_id: "s" },
  ];

  test("round-robin 覆盖尽量多形式：取 4 张 ≈ 4 种不同 format", () => {
    const picked = pickFormCoveredValueCards(cards, new Map(), 4, () => 0.42);
    const formats = new Set(picked.map((c) => c.format));
    expect(picked).toHaveLength(4);
    expect(formats.size).toBe(4); // ip/date/money/version 各一，不会同 format 连取
  });

  test("count 超可用形式时每形式可取多张、不重复卡", () => {
    const picked = pickFormCoveredValueCards(cards, new Map(), 6, () => 0.42);
    expect(picked).toHaveLength(6);
    expect(new Set(picked.map((c) => c.text)).size).toBe(6);
  });

  test("弱键加权：组内偏重含弱键的卡", () => {
    const two: ProgrammingBasicsCard[] = [
      { text: "$1=2", topic: "x", form: "value", format: "money", source_id: "s" }, // 含弱键 =
      { text: "$9.99", topic: "x", form: "value", format: "money", source_id: "s" },
    ];
    const weights = new Map([["=", 0.9]]);
    let hits = 0;
    for (let i = 0; i < 60; i += 1) {
      if (pickFormCoveredValueCards(two, weights, 1, lcg(i + 1))[0]?.text === "$1=2") hits += 1;
    }
    expect(hits).toBeGreaterThan(30); // 偏重含 = 的卡（>50%）
  });
});
