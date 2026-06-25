import { describe, expect, test } from "bun:test";
import { defaultSessionRecord, type KeyEventRecord } from "../src/domain/model";
import { weakKeyWeights, wordKeyWeight } from "../src/training/wordTargeting";

/** 一段同键事件，从 startMs 起、段内固定间隔（段间用大跳分隔以过滤跨段间隔）。 */
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

describe("weakKeyWeights", () => {
  test("慢键(confidence<1)有正权重，快键不入选", () => {
    // a 快(100) / b 中(200) / c 慢(400)，全对 → 中位数 200，confidence a=2 b=1 c=0.5
    const record = defaultSessionRecord({
      key_events: [
        ...keysAt("a", 6, 0, 100),
        ...keysAt("b", 6, 10_000, 200),
        ...keysAt("c", 6, 30_000, 400),
      ],
    });
    const weights = weakKeyWeights([record]);
    // c confidence 0.5 → 权重 1-0.5=0.5；a/b confidence≥1 → 不算弱
    expect(weights.get("c")).toBeCloseTo(0.5, 5);
    expect(weights.has("a")).toBe(false);
    expect(weights.has("b")).toBe(false);
  });

  test("最多取 count 个最弱键", () => {
    const record = defaultSessionRecord({
      key_events: [
        ...keysAt("a", 6, 0, 100), // 快
        ...keysAt("b", 6, 10_000, 300), // 慢
        ...keysAt("c", 6, 30_000, 600), // 更慢
      ],
    });
    const weights = weakKeyWeights([record], { count: 1 });
    expect(weights.size).toBe(1); // 只留最弱的一个
  });
});

describe("wordKeyWeight", () => {
  const weights = new Map<string, number>([
    ["q", 0.8],
    ["z", 0.5],
  ]);

  test("词里出现的弱键权重之和（字符去重）", () => {
    expect(wordKeyWeight("quiz", weights)).toBeCloseTo(1.3, 5); // q 0.8 + z 0.5
    expect(wordKeyWeight("zzz", weights)).toBeCloseTo(0.5, 5); // z 去重只算一次
    expect(wordKeyWeight("apple", weights)).toBe(0); // 不含弱键
  });
});
