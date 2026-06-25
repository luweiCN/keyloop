# 弱点重构 · 阶段1：统一 per-key 有效速度账本 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个独立的 per-key 弱点信号模块——从所有训练记录的击键事件，按「单个键」统计速度与错误，折算成「有效耗时」，相对你自己的键速中位数算出每个键的 confidence，并选出最弱的几个键。

**Architecture:** 新建 `src/training/keySignal.ts`，纯函数式、无副作用。第一阶段**只产出信号、不接选材、不改现有 `diagnosis.ts` 的维度**——可与旧维度并存、对照验证。复用现有 `dimensionSamplesForRecord` 的击键间隔算法（过滤 >2000ms 停顿），但按单个字符（而非字符类维度）归类。

**Tech Stack:** TypeScript（strict）、`bun test`、TDD。速度用「平均击键间隔 ms」表示（越小越快），无需 WPM 转换。

参考设计：`docs/superpowers/specs/2026-06-25-weakness-mechanism-redesign-design.md` §4.1。

---

## 文件结构

- **Create** `src/training/keySignal.ts` — per-key 信号：原始统计 → 有效耗时 → confidence → 最弱键。一个清晰职责，纯函数。
- **Create** `tests/keySignal.test.ts` — 单元测试。

四个导出函数，逐个 TDD：

1. `perKeyStats(records)` → `Map<string, KeyRawStat>`：per-key 的 samples / errorRate / avgIntervalMs。
2. `effectiveTimeMs(avgIntervalMs, errorRate, penalty?)` → number：有效耗时（把错误折成变慢）。
3. `keySignals(records, options?)` → `KeySignal[]`：组合上两者 + confidence（相对你自己键速中位数）。
4. `weakestKeys(signals, count)` → `KeySignal[]`：confidence 最低的若干键。

---

## Task 1: per-key 原始统计 `perKeyStats`

**Files:**
- Create: `src/training/keySignal.ts`
- Test: `tests/keySignal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/keySignal.test.ts`
Expected: FAIL — `Export named 'perKeyStats' not found`（模块/函数不存在）。

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/training/keySignal.ts
import type { SessionRecord } from "../domain/model";

/** 击键间隔超过该值视为停顿，不计入速度（与 diagnosis.ts 一致）。 */
const MAX_INTERVAL_MS = 2000;

export interface KeyRawStat {
  /** 该键的击键次数 */
  samples: number;
  /** 错误率 0–1 */
  errorRate: number;
  /** 平均击键间隔 ms（速度代理，越小越快）；无有效间隔样本时为 null */
  avgIntervalMs: number | null;
}

/** 空白键不作为练习目标键统计。 */
function isTrackedKey(char: string): boolean {
  return char.length > 0 && char !== " " && char !== "\n" && char !== "\t";
}

/**
 * 按「单个键」聚合所有记录的击键事件：samples、错误率、平均击键间隔。
 * 击键间隔取相邻 insert 事件的 at_ms 差，过滤 >MAX_INTERVAL_MS 的停顿。
 */
export function perKeyStats(records: readonly SessionRecord[]): Map<string, KeyRawStat> {
  const acc = new Map<
    string,
    { events: number; errors: number; intervalSum: number; intervalCount: number }
  >();
  for (const record of records) {
    let previousAtMs: number | null = null;
    for (const event of record.key_events) {
      if (event.action !== "insert") {
        previousAtMs = null;
        continue;
      }
      const char = event.expected ?? event.input;
      const interval = previousAtMs === null ? null : event.at_ms - previousAtMs;
      previousAtMs = event.at_ms;
      if (char === null || !isTrackedKey(char)) {
        continue;
      }
      const entry = acc.get(char) ?? { events: 0, errors: 0, intervalSum: 0, intervalCount: 0 };
      entry.events += 1;
      if (!event.correct) {
        entry.errors += 1;
      }
      if (interval !== null && interval > 0 && interval <= MAX_INTERVAL_MS) {
        entry.intervalSum += interval;
        entry.intervalCount += 1;
      }
      acc.set(char, entry);
    }
  }
  const result = new Map<string, KeyRawStat>();
  for (const [key, entry] of acc) {
    result.set(key, {
      samples: entry.events,
      errorRate: entry.events === 0 ? 0 : entry.errors / entry.events,
      avgIntervalMs: entry.intervalCount === 0 ? null : entry.intervalSum / entry.intervalCount,
    });
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/keySignal.test.ts`
Expected: PASS（3 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/training/keySignal.ts tests/keySignal.test.ts
git commit -m "feat(training): per-key 击键统计 perKeyStats (弱点重构阶段1)"
```

---

## Task 2: 有效耗时 `effectiveTimeMs`

把「打错」折算成「变慢」，融进同一个速度指标。纯函数。

**Files:**
- Modify: `src/training/keySignal.ts`
- Test: `tests/keySignal.test.ts`

- [ ] **Step 1: Write the failing test**

在测试文件顶部 import 的花括号里补上 `effectiveTimeMs`，追加 describe 块：

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/keySignal.test.ts`
Expected: FAIL — `Export named 'effectiveTimeMs' not found`。

- [ ] **Step 3: Write minimal implementation**

追加到 `src/training/keySignal.ts`：

```typescript
/** 错误惩罚系数默认值：errorRate=1（全错）时有效耗时翻倍。可调（实测再定）。 */
export const KEY_PENALTY = 1.0;

/**
 * 有效耗时 = 平均击键间隔 × (1 + penalty × 错误率)。
 * 把「打错」折算成「变慢」，让"又慢"和"又错"都表现为有效速度低。
 */
export function effectiveTimeMs(
  avgIntervalMs: number,
  errorRate: number,
  penalty: number = KEY_PENALTY,
): number {
  return avgIntervalMs * (1 + penalty * errorRate);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/keySignal.test.ts`
Expected: PASS（5 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/training/keySignal.ts tests/keySignal.test.ts
git commit -m "feat(training): 有效耗时 effectiveTimeMs(错误折算成变慢) (弱点重构阶段1)"
```

---

## Task 3: per-key confidence `keySignals`

组合统计 + 有效耗时，算出每个键相对「你自己键速中位数」的 confidence。

**Files:**
- Modify: `src/training/keySignal.ts`
- Test: `tests/keySignal.test.ts`

- [ ] **Step 1: Write the failing test**

在顶部 import 的花括号里补上 `keySignals`；复用文件顶部已有的 `keysAt` helper，追加 describe 块：

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/keySignal.test.ts`
Expected: FAIL — `Export named 'keySignals' not found`。

- [ ] **Step 3: Write minimal implementation**

追加到 `src/training/keySignal.ts`：

```typescript
/** 样本数低于此值的键不评估 confidence（数据不足）。可调。 */
export const MIN_KEY_SAMPLES = 5;
/** 目标键速取「你自己各键有效耗时」的分位（0.5=中位数）。相对基线，避免绝对阈值。可调。 */
export const TARGET_PERCENTILE = 0.5;

export interface KeySignal {
  key: string;
  samples: number;
  errorRate: number;
  avgIntervalMs: number | null;
  /** 有效耗时；样本不足或无速度样本时为 null */
  effectiveTimeMs: number | null;
  /** 目标键速/有效耗时，≥1 达标，越低越弱；无法评估时为 null */
  confidence: number | null;
}

export interface KeySignalOptions {
  penalty?: number;
  minSamples?: number;
  targetPercentile?: number;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index]!;
}

/**
 * per-key 弱点账本：每个键的有效耗时 + confidence（相对你自己键速中位数）。
 * confidence ≥1 表示该键达到/超过你的中位水平；<1 表示落后。
 */
export function keySignals(
  records: readonly SessionRecord[],
  options: KeySignalOptions = {},
): KeySignal[] {
  const penalty = options.penalty ?? KEY_PENALTY;
  const minSamples = options.minSamples ?? MIN_KEY_SAMPLES;
  const targetPercentile = options.targetPercentile ?? TARGET_PERCENTILE;

  const raw = perKeyStats(records);
  const effByKey = new Map<string, number | null>();
  const ratedEff: number[] = [];
  for (const [key, stat] of raw) {
    const eff =
      stat.avgIntervalMs === null || stat.samples < minSamples
        ? null
        : effectiveTimeMs(stat.avgIntervalMs, stat.errorRate, penalty);
    effByKey.set(key, eff);
    if (eff !== null) {
      ratedEff.push(eff);
    }
  }
  const target = percentile(ratedEff, targetPercentile);

  const signals: KeySignal[] = [];
  for (const [key, stat] of raw) {
    const eff = effByKey.get(key) ?? null;
    signals.push({
      key,
      samples: stat.samples,
      errorRate: stat.errorRate,
      avgIntervalMs: stat.avgIntervalMs,
      effectiveTimeMs: eff,
      confidence: eff === null || target === null ? null : target / eff,
    });
  }
  return signals;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/keySignal.test.ts`
Expected: PASS（7 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/training/keySignal.ts tests/keySignal.test.ts
git commit -m "feat(training): per-key confidence keySignals(相对自己键速中位数) (弱点重构阶段1)"
```

---

## Task 4: 选最弱键 `weakestKeys`

**Files:**
- Modify: `src/training/keySignal.ts`
- Test: `tests/keySignal.test.ts`

- [ ] **Step 1: Write the failing test**

在顶部 import 的花括号里补上 `weakestKeys` 与 `type KeySignal`，追加 describe 块：

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/keySignal.test.ts`
Expected: FAIL — `Export named 'weakestKeys' not found`。

- [ ] **Step 3: Write minimal implementation**

追加到 `src/training/keySignal.ts`：

```typescript
/** confidence 最低的若干键（升序），跳过未评估(null)的。用于原子层靶向选材。 */
export function weakestKeys(signals: readonly KeySignal[], count: number): KeySignal[] {
  return signals
    .filter((signal) => signal.confidence !== null)
    .sort((left, right) => (left.confidence ?? 0) - (right.confidence ?? 0))
    .slice(0, Math.max(0, count));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/keySignal.test.ts`
Expected: PASS（9 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/training/keySignal.ts tests/keySignal.test.ts
git commit -m "feat(training): 选最弱键 weakestKeys (弱点重构阶段1)"
```

---

## 收尾验证

- [ ] **Step: 全量测试 + 类型检查**

Run: `bun test tests && bun run typecheck`
Expected: 全部 PASS、`tsc` 0 错（新模块并存，不影响现有诊断/选材）。

---

## 阶段产出

`src/training/keySignal.ts` 提供一套**跨形态统一的 per-key 弱点账本**：

- `perKeyStats` — 按单键聚合速度+错误。
- `effectiveTimeMs` — 错误折算成变慢。
- `keySignals` — 相对你自己键速中位数的 per-key confidence。
- `weakestKeys` — 选最弱键，供阶段2（单词靶向）起消费。

第一阶段**纯并存**：不改 `diagnosis.ts` 现有维度、不接选材，可单独喂记录验证。下一阶段（单词靶向）将用 `weakestKeys` + 词库倒排索引改 `wordsStageTarget`。
