import { describe, expect, test } from "bun:test";
import { defaultSessionRecord, type KeyEventRecord, type SessionRecord } from "../src/domain/model";
import { buildStageTarget, type BuildTargetContext } from "../src/training/targets";
import {
  weakKeyWeights,
  weightedSampleWithoutReplacement,
  wordKeyWeight,
} from "../src/training/wordTargeting";

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

describe("weightedSampleWithoutReplacement", () => {
  const items = [
    { k: "a", w: 1 },
    { k: "b", w: 100 },
  ];
  const weightOf = (x: { k: string; w: number }): number => x.w;

  test("rng→1 偏向高权重项，rng→0 偏向先出现项", () => {
    expect(weightedSampleWithoutReplacement(items, weightOf, 1, () => 0.99)[0]?.k).toBe("b");
    expect(weightedSampleWithoutReplacement(items, weightOf, 1, () => 0.001)[0]?.k).toBe("a");
  });

  test("无放回：抽 count 个不重复；count 超量时返回全部", () => {
    const out = weightedSampleWithoutReplacement(items, weightOf, 5, () => 0.5);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((x) => x.k)).size).toBe(2);
  });

  test("全为 0 权重时退化为随机、仍不重复", () => {
    const zero = [
      { k: "x", w: 0 },
      { k: "y", w: 0 },
    ];
    const out = weightedSampleWithoutReplacement(zero, (x) => x.w, 2, () => 0.4);
    expect(new Set(out.map((x) => x.k)).size).toBe(2);
  });
});

describe("wordsStageTarget 靶向接入", () => {
  // 简单可重复随机源（LCG），每个 trial 独立
  function lcg(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    const rand = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5; i += 1) rand(); // 预热，避免小种子首个输出极小
    return rand;
  }

  function wordsContext(records: SessionRecord[], random: () => number): BuildTargetContext {
    const words = ["quiz", "apple", "table", "mango", "water", "plant", "stone", "bread"];
    return {
      records,
      plan: {
        focus_words: [], focus_symbols: [], focus_code: [], focus_keys: [],
        advice: [], recommended_mode: "words", has_recent_history: false,
      },
      library: {
        everyday_words: { entries: [] },
        programming_words: words.map((word) => ({ word, note_zh: "释义" })),
      },
      random,
    } as unknown as BuildTargetContext;
  }

  const wordsOptions = {
    stage: { form: "words", char_budget: 18 },
    profile: {
      dimensions: [], form_speeds: [],
      daily_active_minutes_7d: 0, generated_at: "",
    },
  } as never;

  // q、z 都很弱（quiz 同时含这两键 → 靶向强）
  function recordsWithWeakQZ(): SessionRecord[] {
    const fast = ["a", "e", "t", "o", "i", "n"].flatMap((k, idx) => keysAt(k, 6, idx * 20_000, 100));
    const slowQ = keysAt("q", 6, 200_000, 600, false);
    const slowZ = keysAt("z", 6, 400_000, 600, false);
    return [defaultSessionRecord({ key_events: [...fast, ...slowQ, ...slowZ] })];
  }

  function countQuizHits(records: SessionRecord[], trials: number): number {
    let hits = 0;
    for (let i = 0; i < trials; i += 1) {
      const target = buildStageTarget(wordsContext(records, lcg(i + 1)), wordsOptions);
      if (target.text.includes("quiz")) hits += 1;
    }
    return hits;
  }

  test("含弱键的词在靶向下入选频率显著高于无弱键(随机)对照", () => {
    const trials = 80;
    const targeted = countQuizHits(recordsWithWeakQZ(), trials);
    const control = countQuizHits([], trials); // 无记录 → 无弱键 → 纯随机
    expect(targeted).toBeGreaterThan(control + trials * 0.15);
  });
});
