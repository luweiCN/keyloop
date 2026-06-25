import { describe, expect, test } from "bun:test";
import { defaultSessionRecord, type KeyEventRecord } from "../src/domain/model";
import { perKeyStats } from "../src/training/keySignal";

/** 构造连续 insert 事件：每项 [expected, correct]，相邻间隔 intervalMs。 */
function keyEvents(entries: Array<[string, boolean]>, intervalMs = 200): KeyEventRecord[] {
  return entries.map(([expected, correct], index) => ({
    at_ms: index * intervalMs,
    action: "insert" as const,
    position: index,
    expected,
    input: correct ? expected : "x",
    correct,
  }));
}

/** 一段同键事件，从 startMs 起、段内固定间隔（段间用大跳分隔以过滤跨段间隔）。 */
function keysAt(key: string, count: number, startMs: number, intervalMs: number): KeyEventRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    at_ms: startMs + i * intervalMs,
    action: "insert" as const,
    position: i,
    expected: key,
    input: key,
    correct: true,
  }));
}

describe("perKeyStats", () => {
  test("按单键聚合 samples / errorRate / 平均击键间隔", () => {
    // a 打 3 次(2 对 1 错)，b 打 2 次全对，相邻间隔 200ms
    const record = defaultSessionRecord({
      key_events: keyEvents([
        ["a", true],
        ["a", false],
        ["b", true],
        ["a", true],
        ["b", true],
      ]),
    });
    const stats = perKeyStats([record]);
    expect(stats.get("a")?.samples).toBe(3);
    expect(stats.get("a")?.errorRate).toBeCloseTo(1 / 3, 5);
    expect(stats.get("a")?.avgIntervalMs).toBe(200);
    expect(stats.get("b")?.samples).toBe(2);
    expect(stats.get("b")?.errorRate).toBe(0);
  });

  test("跳过 >2000ms 的停顿，不计入速度", () => {
    const record = defaultSessionRecord({ key_events: keyEvents([["a", true], ["a", true]], 5000) });
    const a = perKeyStats([record]).get("a");
    expect(a?.samples).toBe(2);
    expect(a?.avgIntervalMs).toBeNull(); // 唯一间隔 5000ms 被过滤 → 无有效速度样本
  });

  test("跳过空白键（空格/换行/Tab）", () => {
    const record = defaultSessionRecord({
      key_events: keyEvents([["a", true], [" ", true], ["a", true]]),
    });
    const stats = perKeyStats([record]);
    expect(stats.has(" ")).toBe(false);
    expect(stats.get("a")?.samples).toBe(2);
  });
});
