# 弱点重构 · 阶段2：单词靶向（含弱键的词加权随机多练）— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让阶段1 的 per-key 弱点账本**真正驱动单词选材**——组单词卷时，对「含你弱键的真实词」加权随机偏重（不改写词、不硬置顶、掺入普通词）。

**Architecture:** 新建 `src/training/wordTargeting.ts`（纯函数）：把记录算成「弱键→权重」，给每个真实词算「弱键覆盖分」，再做加权无放回抽样。`wordsStageTarget` 把原来的「shuffle + capWeak 置顶 + slice」换成「中性算 dose + 加权随机抽 dose.count 个」。`chooseStageWordDose` 仍用全候选算数量（稳定），靶向只影响抽哪些词。

**Tech Stack:** TypeScript、`bun test`、TDD。复用阶段1 的 `keySignals` / `weakestKeys`。

参考设计：`docs/superpowers/specs/2026-06-25-weakness-mechanism-redesign-design.md` §4.2（原子层·单词）。

**关键决策（已定）：**
- **加权随机而非置顶**——含弱键词权重更高、被抽中概率更大，但普通词(基础权重)仍有机会。避免重蹈问题1 的"硬筛选/全置顶"。
- **保留 capWeak**——capitalization 作为少数跨键特征维度保留（设计 §4.1），其加权叠加进词权重。
- **不改写词**——只从真实词库里筛/抽，绝不伪造。

---

## 文件结构

- **Create** `src/training/wordTargeting.ts` — 弱键权重 / 词覆盖分 / 加权抽样。纯函数。
- **Create** `tests/wordTargeting.test.ts`。
- **Modify** `src/training/targets.ts` — `wordsStageTarget` 选材接入（约 3056-3068）。

三个新函数 + 一处接入：

1. `weakKeyWeights(records, options?)` → `Map<string, number>`：弱键→权重（越弱权重越高）。
2. `wordKeyWeight(text, weights)` → number：词里出现的弱键权重之和（字符去重）。
3. `weightedSampleWithoutReplacement(items, weightOf, count, random)` → `T[]`：加权无放回抽样。
4. 接入 `wordsStageTarget`。

---

## Task 1: 弱键权重 `weakKeyWeights`

**Files:**
- Create: `src/training/wordTargeting.ts`
- Test: `tests/wordTargeting.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";
import { defaultSessionRecord, type KeyEventRecord } from "../src/domain/model";
import { weakKeyWeights } from "../src/training/wordTargeting";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/wordTargeting.test.ts`
Expected: FAIL — `Export named 'weakKeyWeights' not found`。

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/training/wordTargeting.ts
import type { SessionRecord } from "../domain/model";
import { keySignals, weakestKeys } from "./keySignal";

/** 默认取最弱的前 N 个键参与靶向。可调。 */
export const WEAK_KEY_COUNT = 8;

export interface WeakKeyOptions {
  count?: number;
}

/**
 * 把记录算成「弱键 → 权重」：只取 confidence<1（真正落后）的键、最多前 count 个，
 * 权重 = 1 - confidence（越弱权重越高）。供单词加权选材用。
 */
export function weakKeyWeights(
  records: readonly SessionRecord[],
  options: WeakKeyOptions = {},
): Map<string, number> {
  const count = options.count ?? WEAK_KEY_COUNT;
  const weak = weakestKeys(keySignals(records), count).filter(
    (signal) => signal.confidence !== null && signal.confidence < 1,
  );
  const weights = new Map<string, number>();
  for (const signal of weak) {
    weights.set(signal.key, 1 - (signal.confidence as number));
  }
  return weights;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/wordTargeting.test.ts`
Expected: PASS（2 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/training/wordTargeting.ts tests/wordTargeting.test.ts
git commit -m "feat(training): 弱键权重 weakKeyWeights (弱点重构阶段2)"
```

---

## Task 2: 词的弱键覆盖分 `wordKeyWeight`

**Files:**
- Modify: `src/training/wordTargeting.ts`
- Test: `tests/wordTargeting.test.ts`

- [ ] **Step 1: Write the failing test**

在顶部 import 的花括号里补上 `wordKeyWeight`，追加 describe 块：

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/wordTargeting.test.ts`
Expected: FAIL — `Export named 'wordKeyWeight' not found`。

- [ ] **Step 3: Write minimal implementation**

追加到 `src/training/wordTargeting.ts`：

```typescript
/** 词的弱键覆盖分：词里出现的弱键的权重之和（同一字符只算一次）。 */
export function wordKeyWeight(text: string, weights: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const char of new Set(text)) {
    sum += weights.get(char) ?? 0;
  }
  return sum;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/wordTargeting.test.ts`
Expected: PASS（3 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/training/wordTargeting.ts tests/wordTargeting.test.ts
git commit -m "feat(training): 词的弱键覆盖分 wordKeyWeight (弱点重构阶段2)"
```

---

## Task 3: 加权无放回抽样 `weightedSampleWithoutReplacement`

**Files:**
- Modify: `src/training/wordTargeting.ts`
- Test: `tests/wordTargeting.test.ts`

- [ ] **Step 1: Write the failing test**

在顶部 import 的花括号里补上 `weightedSampleWithoutReplacement`，追加 describe 块：

```typescript
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
    const zero = [{ k: "x", w: 0 }, { k: "y", w: 0 }];
    const out = weightedSampleWithoutReplacement(zero, (x) => x.w, 2, () => 0.4);
    expect(new Set(out.map((x) => x.k)).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/wordTargeting.test.ts`
Expected: FAIL — `Export named 'weightedSampleWithoutReplacement' not found`。

- [ ] **Step 3: Write minimal implementation**

追加到 `src/training/wordTargeting.ts`：

```typescript
/**
 * 加权无放回抽样：按 weightOf 抽 count 个不重复项（权重高更可能被抽中）。
 * 剩余全为 0 权重时退化为均匀随机。负权重按 0 处理。
 */
export function weightedSampleWithoutReplacement<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  count: number,
  random: () => number,
): T[] {
  const pool = items.map((item) => ({ item, weight: Math.max(0, weightOf(item)) }));
  const result: T[] = [];
  const target = Math.min(count, pool.length);
  for (let picked = 0; picked < target; picked += 1) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let index: number;
    if (total <= 0) {
      index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    } else {
      let r = random() * total;
      index = pool.length - 1;
      for (let i = 0; i < pool.length; i += 1) {
        r -= pool[i]!.weight;
        if (r <= 0) {
          index = i;
          break;
        }
      }
    }
    result.push(pool[index]!.item);
    pool.splice(index, 1);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/wordTargeting.test.ts`
Expected: PASS（6 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/training/wordTargeting.ts tests/wordTargeting.test.ts
git commit -m "feat(training): 加权无放回抽样 weightedSampleWithoutReplacement (弱点重构阶段2)"
```

---

## Task 4: 接入 `wordsStageTarget`（靶向选材生效）

把「shuffle + capWeak 排序置顶 + slice」换成「中性算 dose + 加权随机抽」。`chooseStageWordDose` 用全候选算数量（稳定），抽样才靶向。

**Files:**
- Modify: `src/training/targets.ts:3054-3068`（`wordsStageTarget` 选材段）
- Modify import 顶部：从 `./wordTargeting` 引入函数
- Test: `tests/wordTargeting.test.ts`（端到端：靶向令含弱键词显著更常被选）

- [ ] **Step 1: Write the failing test**

在 `tests/wordTargeting.test.ts` 顶部 import 处补上 `import { buildStageTarget } from "../src/training/targets";` 以及需要的类型，追加端到端 describe（验证「含弱键的词在靶向下出现频率显著高于关闭靶向」）：

```typescript
import { buildStageTarget, type BuildTargetContext } from "../src/training/targets";

describe("wordsStageTarget 靶向接入", () => {
  // 简单可重复随机源（LCG），每个 trial 独立
  function lcg(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  // 词库放 programming_words（无 everyday 的来源门槛）：1 个含弱键 q/z 的词 + 7 个不含
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
      focus: { words: [], code: [], chars: [] },
      daily_active_minutes_7d: 0, generated_at: "",
    },
  } as never;

  // 构造「q、z 很弱」的历史（quiz 同时含这两键 → 靶向强）：弱键慢+错，其它键快+对
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/wordTargeting.test.ts`
Expected: FAIL — 当前 `wordsStageTarget` 不靶向（纯随机），含 q 词命中率达不到 60%。

- [ ] **Step 3: Write minimal implementation**

先在 `src/training/targets.ts` 顶部 import 区加入（紧跟现有 `./wordTargeting` 无则新增一行）：

```typescript
import {
  weakKeyWeights,
  wordKeyWeight,
  weightedSampleWithoutReplacement,
} from "./wordTargeting";
```

再把 `wordsStageTarget` 中这一段（约 3054-3068）：

```typescript
  // 单词层不回流具体薄弱词（ADR-0002 废弃 focus_words ③）：选材仅靠随机轮换 +
  // 字符类/技能维度加权（见下 ②），不把历史错过的具体词优先排到最前。
  const selected: StageWordCandidate[] = [];
  // 技能跨阶段（特征偏重）：大小写弱 → 多选含大写/驼峰词（spec §3.4）。
  // 长度不再是弱点维度（问题1：长词错多是普世现象、非个人短板），故取消长词加权。
  const capWeak = isDimensionWeak(options.profile, "capitalization");
  const wordBiasScore = (text: string): number =>
    capWeak && /[A-Z]/u.test(text) ? 1 : 0;
  const fill = [...pool.values()].filter((item) => !selected.includes(item));
  shuffleInPlace(fill, random);
  // 稳定排序把弱特征匹配的词排前；同分保持上面 shuffle 的随机序（JSC 排序稳定）
  fill.sort((left, right) => wordBiasScore(right.text) - wordBiasScore(left.text));
  selected.push(...fill);
  const dose = chooseStageWordDose(selected, options.stage.char_budget);
  const picked = selected.slice(0, dose.count);
```

替换为（per-key 弱键加权随机；capWeak 叠加；普通词保底权重 1 → 自然掺入）：

```typescript
  // 原子层靶向（弱点重构阶段2）：含你弱键的真实词加权随机偏重，绝不改写词；
  // capitalization 跨键特征叠加（设计 §4.1）；普通词保底权重 1，故仍会掺入。
  const candidates = [...pool.values()];
  const weakWeights = weakKeyWeights(context.records);
  const capWeak = isDimensionWeak(options.profile, "capitalization");
  const CAP_WEIGHT = 1;
  const wordWeightOf = (item: StageWordCandidate): number =>
    1 +
    (capWeak && /[A-Z]/u.test(item.text) ? CAP_WEIGHT : 0) +
    wordKeyWeight(item.text, weakWeights);
  // dose 用全候选「中性」估算数量/重复（不受靶向影响，保持时长稳定）
  const dose = chooseStageWordDose(candidates, options.stage.char_budget);
  const picked = weightedSampleWithoutReplacement(candidates, wordWeightOf, dose.count, random);
```

注意：删掉了已不再使用的 `selected` 局部变量与 `shuffleInPlace`/`wordBiasScore` 用法；若 `shuffleInPlace` 在本函数内不再被引用，保留其它处的 import 即可（它在别处仍用）。

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/wordTargeting.test.ts`
Expected: PASS（含 q 词命中率 >60%）。

- [ ] **Step 5: Run full suite + typecheck（接入改了现有函数，必须确认不破坏）**

Run: `bun test tests && bun run typecheck`
Expected: 全部 PASS、`tsc` 0 错。若个别现有 words 测试因「选材从纯随机改成加权随机」断言了具体词而 fail，按新行为更新断言（靶向是预期变化）。

- [ ] **Step 6: Commit**

```bash
git add src/training/targets.ts tests/wordTargeting.test.ts
git commit -m "feat(training): wordsStageTarget 接入 per-key 弱键加权随机选材 (弱点重构阶段2)"
```

---

## 阶段产出

单词卷选材**第一次真正由 per-key 弱点驱动**：含你弱键的真实词被加权随机偏重，普通词仍掺入，词内容绝不改写。capitalization 跨键特征保留。`chooseStageWordDose` 数量估算不变、时长稳定。

下一阶段（阶段3 数字/符号靶向）将复用 `weakKeyWeights` + 加权抽样，并加「形式」维度。
