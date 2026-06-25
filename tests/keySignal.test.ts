import { describe, expect, test } from "bun:test";
import { defaultSessionRecord, type KeyEventRecord } from "../src/domain/model";
import {
  effectiveTimeMs,
  keySignals,
  perKeyStats,
  weakestKeys,
  type KeySignal,
} from "../src/training/keySignal";

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

describe("effectiveTimeMs", () => {
  test("错误率以放大耗时的形式体现（默认惩罚系数 1）", () => {
    expect(effectiveTimeMs(200, 0)).toBe(200); // 不错 → 不放大
    expect(effectiveTimeMs(200, 0.5)).toBe(300); // 200 × (1 + 1×0.5)
    expect(effectiveTimeMs(200, 1)).toBe(400); // 全错 → 翻倍
  });

  test("惩罚系数可配", () => {
    expect(effectiveTimeMs(200, 0.5, 2)).toBe(400); // 200 × (1 + 2×0.5)
  });
});

describe("keySignals", () => {
  test("confidence = 你的键速中位数 / 该键有效耗时；越快越高、越慢越低", () => {
    // 三键各打 6 次(满足最小样本)，段间用大跳分隔以过滤跨段间隔：
    // a 间隔100(快) / b 间隔200(中) / c 间隔400(慢)，全对
    const record = defaultSessionRecord({
      key_events: [
        ...keysAt("a", 6, 0, 100),
        ...keysAt("b", 6, 10_000, 200),
        ...keysAt("c", 6, 30_000, 400),
      ],
    });
    const signals = keySignals([record]);
    const conf = (k: string): number => signals.find((s) => s.key === k)?.confidence ?? 0;
    // 有效耗时 a=100 b=200 c=400 → 中位数 200 → target=200
    // confidence a=2.0 b=1.0 c=0.5
    expect(conf("a")).toBeGreaterThan(conf("b"));
    expect(conf("b")).toBeGreaterThan(conf("c"));
    expect(conf("c")).toBeLessThan(1); // 慢键低于中位达标线
    expect(conf("b")).toBeCloseTo(1, 1); // 中位键≈1
  });

  test("样本不足的键 confidence 记为 null（不参与评估）", () => {
    const record = defaultSessionRecord({
      key_events: [
        ...keysAt("a", 6, 0, 100), // 足够
        ...keysAt("z", 2, 50_000, 100), // 仅 2 次 < MIN_KEY_SAMPLES
      ],
    });
    const signals = keySignals([record]);
    expect(signals.find((s) => s.key === "z")?.confidence).toBeNull();
  });
});

describe("weakestKeys", () => {
  function sig(key: string, confidence: number | null): KeySignal {
    return {
      key,
      samples: 10,
      errorRate: 0,
      avgIntervalMs: 200,
      effectiveTimeMs: 200,
      confidence,
    };
  }

  test("返回 confidence 最低的若干键，跳过未评估(null)的", () => {
    const signals = [sig("a", 2.0), sig("b", 0.5), sig("c", 1.0), sig("d", null)];
    expect(weakestKeys(signals, 2).map((s) => s.key)).toEqual(["b", "c"]);
  });

  test("count 超过可评估键数时返回全部已评估键(升序)", () => {
    const signals = [sig("a", 1.2), sig("b", 0.3), sig("z", null)];
    expect(weakestKeys(signals, 10).map((s) => s.key)).toEqual(["b", "a"]);
  });
});
