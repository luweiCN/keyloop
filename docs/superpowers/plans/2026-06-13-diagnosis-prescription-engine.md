# 诊断-处方引擎（第 1/3 期：纯函数层）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现技能画像诊断层（`diagnosis.ts`）与阶段计划处方层（`prescription.ts`）两个纯函数模块及其测试，为后续生成器改造和 TUI 阶段流程提供数据基础。

**Architecture:** 诊断层从全部历史 `SessionRecord` 提取字符/词级事件，产出按技能维度（键区/数字/符号/大小写/单词流畅/长词）的 EWMA 画像和按形态分桶的 focus 池；处方层将画像翻译为当日阶段计划（推荐时长、阶段权重、字符预算、长内容轮换），并支持会话内修正。两层都不做 IO，输入输出均为纯数据。

**Tech Stack:** TypeScript (bun)、bun test。无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-13-adaptive-comprehensive-training-design.md`

**分期说明:** 本计划是三期中的第一期。第二期（形态生成器改造，消费 `StagePlan.char_budget` 与分桶 focus 池）、第三期（TUI 诊断屏/阶段流程/进度保存）在本期合入后另行编写计划。

**分支:** `adaptive-comprehensive-training`（已存在，直接在其上工作）

**常用命令:**
- 跑单个测试文件：`bun test tests/diagnosis.test.ts`
- 类型检查：`bun run typecheck`
- 全部测试：`bun test tests`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| Create `src/training/diagnosis.ts` | 技能画像：维度类型、字符归维、EWMA/趋势、形态速度、focus 分桶、`buildSkillProfile` |
| Create `src/training/prescription.ts` | 阶段处方：推荐时长、阶段序列/权重/轮换、字符预算、`buildDailyPrescription`、`reviseStages` |
| Modify `src/domain/model.ts` | `UserPreferences` 新增 `enabled_modules` |
| Create `tests/diagnosis.test.ts` | 诊断层测试 |
| Create `tests/prescription.test.ts` | 处方层测试 |

既有约定（必须遵守）：
- 测试用 `bun:test` 的 `describe/expect/test`，测试数据用 `defaultSessionRecord(overrides)` 构造（从 `../src/domain/model` 导入）。
- 纯函数通过参数注入 `now: Date` 与 `random: () => number`，绝不在函数体内直接调 `new Date()` / `Math.random()`（参照 `BuildTargetContext` 的 `random?`/`now?` 模式）。
- 速度公式沿用 `correct_chars / 5 / (active_ms / 60000)`。

---

### Task 1: 诊断层类型与字符归维

**Files:**
- Create: `src/training/diagnosis.ts`
- Test: `tests/diagnosis.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/diagnosis.test.ts
import { describe, expect, test } from "bun:test";

import {
  charSkillDimensions,
  type SkillDimensionId,
} from "../src/training/diagnosis";

describe("charSkillDimensions", () => {
  test("home row letter maps to row and hand", () => {
    expect(charSkillDimensions("a")).toEqual(["home_row", "left_hand"]);
    expect(charSkillDimensions("j")).toEqual(["home_row", "right_hand"]);
  });

  test("uppercase letter adds capitalization", () => {
    expect(charSkillDimensions("A")).toEqual([
      "home_row",
      "left_hand",
      "capitalization",
    ]);
  });

  test("digit maps to digits only", () => {
    expect(charSkillDimensions("7")).toEqual(["digits"]);
  });

  test("symbol maps to symbols only", () => {
    expect(charSkillDimensions(";")).toEqual(["symbols"]);
    expect(charSkillDimensions("{")).toEqual(["symbols"]);
  });

  test("space and newline map to nothing", () => {
    expect(charSkillDimensions(" ")).toEqual([]);
    expect(charSkillDimensions("\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/diagnosis.test.ts`
Expected: FAIL，`Cannot find module '../src/training/diagnosis'`

- [ ] **Step 3: 写最小实现**

```typescript
// src/training/diagnosis.ts
import type {
  PracticePlan,
  SessionRecord,
  TrainingCategory,
} from "../domain/model";

export type SkillDimensionId =
  | "home_row"
  | "top_row"
  | "bottom_row"
  | "left_hand"
  | "right_hand"
  | "digits"
  | "symbols"
  | "capitalization"
  | "word_fluency"
  | "long_words";

export type SkillTrend = "improving" | "stable" | "declining" | "insufficient";
export type SkillStatus = "weak" | "normal" | "stable" | "unrated";

export interface SkillDiagnosis {
  id: SkillDimensionId;
  /** 参与统计的会话数（最近窗口内） */
  samples: number;
  /** 字符/词级事件总数 */
  events: number;
  /** EWMA 错误率（0-100），无数据为 null */
  ewma_error_rate: number | null;
  /** EWMA 速度：键维度为平均键间隔 ms（低好），词维度为 WPM（高好），无数据为 null */
  ewma_speed: number | null;
  trend: SkillTrend;
  status: SkillStatus;
}

const HOME_ROW = new Set([..."asdfghjkl"]);
const TOP_ROW = new Set([..."qwertyuiop"]);
const BOTTOM_ROW = new Set([..."zxcvbnm"]);
const LEFT_HAND = new Set([..."qwertasdfgzxcvb"]);
const RIGHT_HAND = new Set([..."yuiophjklnm"]);

export function charSkillDimensions(char: string): SkillDimensionId[] {
  if (/^[0-9]$/u.test(char)) {
    return ["digits"];
  }
  if (/^[A-Za-z]$/u.test(char)) {
    const lower = char.toLowerCase();
    const dimensions: SkillDimensionId[] = [];
    if (HOME_ROW.has(lower)) dimensions.push("home_row");
    if (TOP_ROW.has(lower)) dimensions.push("top_row");
    if (BOTTOM_ROW.has(lower)) dimensions.push("bottom_row");
    if (LEFT_HAND.has(lower)) dimensions.push("left_hand");
    if (RIGHT_HAND.has(lower)) dimensions.push("right_hand");
    if (/^[A-Z]$/u.test(char)) dimensions.push("capitalization");
    return dimensions;
  }
  if (char === " " || char === "\n" || char === "\t") {
    return [];
  }
  if (/^[!-/:-@[-`{-~]$/u.test(char)) {
    return ["symbols"];
  }
  return [];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/diagnosis.test.ts`
Expected: PASS（5 个测试）

- [ ] **Step 5: 提交**

```bash
git add src/training/diagnosis.ts tests/diagnosis.test.ts
git commit -m "feat(diagnosis): add skill dimension types and char mapping"
```

---

### Task 2: EWMA 与趋势工具

**Files:**
- Modify: `src/training/diagnosis.ts`
- Test: `tests/diagnosis.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/diagnosis.test.ts` 追加（import 行同步补充 `ewmaAverage, seriesTrend`）：

```typescript
import {
  charSkillDimensions,
  ewmaAverage,
  seriesTrend,
  type SkillDimensionId,
} from "../src/training/diagnosis";

describe("ewmaAverage", () => {
  test("empty series returns null", () => {
    expect(ewmaAverage([])).toBeNull();
  });

  test("single value returns itself", () => {
    expect(ewmaAverage([42])).toBe(42);
  });

  test("recent values weigh more (half-life 4)", () => {
    // values 按时间正序：旧 → 新。全 10 加一个最新 20，EWMA 必须明显偏向 20
    const result = ewmaAverage([10, 10, 10, 10, 20]);
    expect(result).toBeGreaterThan(12);
    expect(result).toBeLessThan(20);
  });
});

describe("seriesTrend", () => {
  test("fewer than 4 samples is insufficient", () => {
    expect(seriesTrend([10, 12, 11], "higher_is_better")).toBe("insufficient");
  });

  test("rising wpm is improving", () => {
    expect(seriesTrend([20, 20, 30, 30], "higher_is_better")).toBe("improving");
  });

  test("rising key delay is declining", () => {
    expect(seriesTrend([200, 200, 300, 300], "lower_is_better")).toBe("declining");
  });

  test("change within 8% is stable", () => {
    expect(seriesTrend([100, 100, 104, 104], "higher_is_better")).toBe("stable");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/diagnosis.test.ts`
Expected: FAIL，`ewmaAverage is not a function`（或同类导出缺失错误）

- [ ] **Step 3: 写最小实现**

在 `src/training/diagnosis.ts` 追加：

```typescript
/** EWMA 半衰期：4 个样本 */
const EWMA_HALF_LIFE = 4;
/** 每维度/形态取最近多少次会话 */
export const DIAGNOSIS_WINDOW_SESSIONS = 10;

/** values 按时间正序（旧→新），返回指数加权平均；空数组返回 null */
export function ewmaAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (let index = 0; index < values.length; index += 1) {
    const age = values.length - 1 - index; // 最新样本 age=0
    const weight = Math.pow(0.5, age / EWMA_HALF_LIFE);
    weightedSum += values[index]! * weight;
    weightTotal += weight;
  }
  return weightedSum / weightTotal;
}

export type TrendDirection = "higher_is_better" | "lower_is_better";

/** 窗口前半 vs 后半均值对比，变化超过 ±8% 判趋势；样本 <4 为 insufficient */
export function seriesTrend(values: number[], direction: TrendDirection): SkillTrend {
  if (values.length < 4) {
    return "insufficient";
  }
  const half = Math.floor(values.length / 2);
  const first = average(values.slice(0, half));
  const second = average(values.slice(values.length - half));
  if (first === 0) {
    return "stable";
  }
  const change = (second - first) / first;
  if (Math.abs(change) <= 0.08) {
    return "stable";
  }
  const better = direction === "higher_is_better" ? change > 0 : change < 0;
  return better ? "improving" : "declining";
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/diagnosis.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/training/diagnosis.ts tests/diagnosis.test.ts
git commit -m "feat(diagnosis): add ewma and trend helpers"
```

---

### Task 3: 字符级技能诊断

从每条会话的 `key_events` 提取各维度的（事件数、错误数、平均键间隔），跨会话做 EWMA 与状态判定。

**Files:**
- Modify: `src/training/diagnosis.ts`
- Test: `tests/diagnosis.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/diagnosis.test.ts` 追加（import 补充 `diagnoseCharSkills` 与 `defaultSessionRecord`、`KeyEventRecord` 类型）：

```typescript
import { defaultSessionRecord } from "../src/domain/model";
import type { KeyEventRecord } from "../src/domain/model";

/** 构造 insert 事件序列：每个条目 [expected, correct]，间隔 intervalMs */
function keyEvents(
  entries: Array<[string, boolean]>,
  intervalMs = 200,
): KeyEventRecord[] {
  return entries.map(([expected, correct], index) => ({
    at_ms: index * intervalMs,
    action: "insert" as const,
    position: index,
    expected,
    input: correct ? expected : "x",
    correct,
  }));
}

function sessionWithKeys(
  entries: Array<[string, boolean]>,
  startedAt: string,
  intervalMs = 200,
) {
  return defaultSessionRecord({
    started_at: startedAt,
    typed_len: entries.length,
    key_events: keyEvents(entries, intervalMs),
  });
}

describe("diagnoseCharSkills", () => {
  test("no records yields all unrated", () => {
    const result = diagnoseCharSkills([]);
    const digits = result.find((item) => item.id === "digits");
    expect(digits?.status).toBe("unrated");
    expect(digits?.ewma_error_rate).toBeNull();
  });

  test("high digit error rate marks digits weak", () => {
    // 5 个数字 4 错 1 对：错误率 80%，远超 weak 阈值 8%
    const events: Array<[string, boolean]> = [
      ["1", false],
      ["2", false],
      ["3", false],
      ["4", false],
      ["5", true],
      // 凑够维度事件量的字母（全对）
      ...[..."asdfghjkl".repeat(3)].map((c): [string, boolean] => [c, true]),
    ];
    // 4 个会话 × 每会话 5 个数字事件 = 20，正好达到 MIN_RATED_EVENTS 门槛
    const records = [1, 2, 3, 4].map((day) =>
      sessionWithKeys(events, `2026-06-${String(day).padStart(2, "0")}T08:00:00Z`),
    );
    const result = diagnoseCharSkills(records);
    const digits = result.find((item) => item.id === "digits");
    expect(digits?.status).toBe("weak");
    const homeRow = result.find((item) => item.id === "home_row");
    expect(homeRow?.status).not.toBe("weak");
  });

  test("clean accurate history marks dimension stable", () => {
    const events: Array<[string, boolean]> = [..."asdfghjkl".repeat(4)].map(
      (c): [string, boolean] => [c, true],
    );
    const records = [1, 2, 3, 4].map((day) =>
      sessionWithKeys(events, `2026-06-0${day}T08:00:00Z`),
    );
    const result = diagnoseCharSkills(records);
    const homeRow = result.find((item) => item.id === "home_row");
    expect(homeRow?.status).toBe("stable");
  });

  test("uppercase events feed capitalization dimension", () => {
    const events: Array<[string, boolean]> = [
      ["A", false],
      ["B", false],
      ["C", false],
      ["D", true],
      ...[..."asdf".repeat(5)].map((c): [string, boolean] => [c, true]),
    ];
    // 5 个会话 × 每会话 4 个大写事件 = 20，达到 MIN_RATED_EVENTS 门槛
    const records = [1, 2, 3, 4, 5].map((day) =>
      sessionWithKeys(events, `2026-06-0${day}T08:00:00Z`),
    );
    const result = diagnoseCharSkills(records);
    const cap = result.find((item) => item.id === "capitalization");
    expect(cap?.status).toBe("weak");
  });
});
```

（import 行同步加入 `diagnoseCharSkills`。）

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/diagnosis.test.ts`
Expected: FAIL，`diagnoseCharSkills` 未导出

- [ ] **Step 3: 写实现**

在 `src/training/diagnosis.ts` 追加：

```typescript
const CHAR_DIMENSIONS: SkillDimensionId[] = [
  "home_row",
  "top_row",
  "bottom_row",
  "left_hand",
  "right_hand",
  "digits",
  "symbols",
  "capitalization",
];

/** 单维度在单次会话内的样本 */
interface DimensionSessionSample {
  events: number;
  errors: number;
  /** 平均键间隔 ms（仅统计 ≤2000ms 的相邻 insert 间隔） */
  avgIntervalMs: number | null;
}

/** 键间隔超过该值视为停顿，不计入速度 */
const MAX_INTERVAL_MS = 2000;
/** 维度事件数低于此值的会话不计入该维度样本 */
const MIN_DIMENSION_EVENTS = 3;
/** 总事件量低于此值视为 unrated */
const MIN_RATED_EVENTS = 20;

function dimensionSamplesForRecord(
  record: SessionRecord,
): Map<SkillDimensionId, DimensionSessionSample> {
  const stats = new Map<
    SkillDimensionId,
    { events: number; errors: number; intervalSum: number; intervalCount: number }
  >();
  let previousAtMs: number | null = null;
  for (const event of record.key_events) {
    if (event.action !== "insert") {
      previousAtMs = null;
      continue;
    }
    const char = event.expected ?? event.input;
    const interval =
      previousAtMs === null ? null : event.at_ms - previousAtMs;
    previousAtMs = event.at_ms;
    if (char === null) {
      continue;
    }
    for (const dimension of charSkillDimensions(char)) {
      const entry = stats.get(dimension) ?? {
        events: 0,
        errors: 0,
        intervalSum: 0,
        intervalCount: 0,
      };
      entry.events += 1;
      if (!event.correct) {
        entry.errors += 1;
      }
      if (interval !== null && interval > 0 && interval <= MAX_INTERVAL_MS) {
        entry.intervalSum += interval;
        entry.intervalCount += 1;
      }
      stats.set(dimension, entry);
    }
  }
  const samples = new Map<SkillDimensionId, DimensionSessionSample>();
  for (const [dimension, entry] of stats) {
    if (entry.events < MIN_DIMENSION_EVENTS) {
      continue;
    }
    samples.set(dimension, {
      events: entry.events,
      errors: entry.errors,
      avgIntervalMs:
        entry.intervalCount === 0 ? null : entry.intervalSum / entry.intervalCount,
    });
  }
  return samples;
}

export function diagnoseCharSkills(records: SessionRecord[]): SkillDiagnosis[] {
  // 按时间正序处理（旧→新），EWMA 假定数组尾部最新
  const ordered = [...records].sort(
    (left, right) => Date.parse(left.started_at) - Date.parse(right.started_at),
  );
  const perDimension = new Map<SkillDimensionId, DimensionSessionSample[]>();
  for (const record of ordered) {
    for (const [dimension, sample] of dimensionSamplesForRecord(record)) {
      const list = perDimension.get(dimension) ?? [];
      list.push(sample);
      perDimension.set(dimension, list);
    }
  }

  return CHAR_DIMENSIONS.map((dimension) => {
    const all = perDimension.get(dimension) ?? [];
    const window = all.slice(-DIAGNOSIS_WINDOW_SESSIONS);
    const events = window.reduce((sum, sample) => sum + sample.events, 0);
    if (window.length === 0 || events < MIN_RATED_EVENTS) {
      return {
        id: dimension,
        samples: window.length,
        events,
        ewma_error_rate: null,
        ewma_speed: null,
        trend: "insufficient" as const,
        status: "unrated" as const,
      };
    }
    const errorRates = window.map((sample) => (sample.errors / sample.events) * 100);
    const intervals = window
      .map((sample) => sample.avgIntervalMs)
      .filter((value): value is number => value !== null);
    const ewmaErrorRate = ewmaAverage(errorRates);
    const ewmaInterval = ewmaAverage(intervals);
    const trend = seriesTrend(intervals, "lower_is_better");
    return {
      id: dimension,
      samples: window.length,
      events,
      ewma_error_rate: ewmaErrorRate,
      ewma_speed: ewmaInterval,
      trend,
      status: dimensionStatus(window.length, ewmaErrorRate, trend),
    };
  });
}

function dimensionStatus(
  samples: number,
  ewmaErrorRate: number | null,
  trend: SkillTrend,
): SkillStatus {
  if (ewmaErrorRate === null) {
    return "unrated";
  }
  if (ewmaErrorRate >= 8 || trend === "declining") {
    return "weak";
  }
  if (samples >= 3 && ewmaErrorRate <= 2.5 && trend !== "declining") {
    return "stable";
  }
  return "normal";
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/diagnosis.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查并提交**

Run: `bun run typecheck`
Expected: 无错误

```bash
git add src/training/diagnosis.ts tests/diagnosis.test.ts
git commit -m "feat(diagnosis): diagnose char-level skill dimensions from key events"
```

---

### Task 4: 词级维度、形态速度、focus 分桶与 buildSkillProfile

**Files:**
- Modify: `src/training/diagnosis.ts`
- Test: `tests/diagnosis.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/diagnosis.test.ts` 追加（import 补充 `buildSkillProfile, formForCategory, type TrainingForm`；`defaultSessionRecord` 已导入）：

```typescript
describe("formForCategory", () => {
  test("maps categories to training forms", () => {
    expect(formForCategory("home_row")).toBe("keys");
    expect(formForCategory("foundation_mix")).toBe("keys");
    expect(formForCategory("everyday_words")).toBe("words");
    expect(formForCategory("programming_terms")).toBe("words");
    expect(formForCategory("word_breakdown")).toBe("words");
    expect(formForCategory("naming_styles")).toBe("words");
    expect(formForCategory("symbols_numbers")).toBe("symbols");
    expect(formForCategory("everyday_sentences")).toBe("sentences");
    expect(formForCategory("everyday_articles")).toBe("articles");
    expect(formForCategory("code_snippet")).toBe("code");
    expect(formForCategory("code_mix")).toBe("code");
    expect(formForCategory("unknown")).toBeNull();
  });
});

describe("buildSkillProfile", () => {
  const emptyPlan = {
    focus_words: [],
    focus_symbols: [";"],
    focus_code: [],
    focus_keys: ["b"],
    advice: [],
    recommended_mode: "mixed" as const,
    has_recent_history: true,
  };

  test("form speeds use per-form wpm from active_ms", () => {
    // words 形态：300 正确字符 / 2 分钟活跃 = 30 WPM
    const wordSession = defaultSessionRecord({
      started_at: "2026-06-10T08:00:00Z",
      category: "everyday_words",
      module: "everyday_english",
      typed_len: 300,
      correct_chars: 300,
      active_ms: 120_000,
      wpm: 30,
      accuracy: 100,
    });
    const profile = buildSkillProfile([wordSession], emptyPlan, new Date("2026-06-13T08:00:00Z"));
    const words = profile.form_speeds.find((item) => item.form === "words");
    expect(words?.ewma_wpm).toBeCloseTo(30, 0);
    const code = profile.form_speeds.find((item) => item.form === "code");
    expect(code?.ewma_wpm).toBeNull();
  });

  test("focus pools bucket by form - words stay out of other pools", () => {
    const wordSession = defaultSessionRecord({
      started_at: "2026-06-10T08:00:00Z",
      category: "everyday_words",
      module: "everyday_english",
      typed_len: 100,
      correct_chars: 90,
      active_ms: 60_000,
      error_tokens: { algorithm: 3 },
    });
    const codeSession = defaultSessionRecord({
      started_at: "2026-06-11T08:00:00Z",
      category: "code_snippet",
      module: "code_practice",
      typed_len: 100,
      correct_chars: 90,
      active_ms: 60_000,
      error_tokens: { useEffect: 2 },
    });
    const profile = buildSkillProfile(
      [wordSession, codeSession],
      emptyPlan,
      new Date("2026-06-13T08:00:00Z"),
    );
    expect(profile.focus.words).toContain("algorithm");
    expect(profile.focus.words).not.toContain("useEffect");
    expect(profile.focus.code).toContain("useEffect");
    expect(profile.focus.code).not.toContain("algorithm");
    // chars 池来自 PracticePlan 的 focus_keys + focus_symbols
    expect(profile.focus.chars).toEqual(expect.arrayContaining(["b", ";"]));
  });

  test("sentence errors flow into sentence pool as full lines", () => {
    const sentenceSession = defaultSessionRecord({
      started_at: "2026-06-10T08:00:00Z",
      category: "everyday_sentences",
      module: "everyday_english",
      typed_len: 80,
      correct_chars: 70,
      active_ms: 60_000,
      target_text: "The weather is nice today.\nShe finished the report.",
      error_tokens: { weather: 2 },
    });
    const profile = buildSkillProfile(
      [sentenceSession],
      emptyPlan,
      new Date("2026-06-13T08:00:00Z"),
    );
    expect(profile.focus.sentences).toContain("The weather is nice today.");
  });

  test("daily active minutes uses 7-day median", () => {
    // 三天，每天一条 10 分钟会话
    const records = [10, 11, 12].map((day) =>
      defaultSessionRecord({
        started_at: `2026-06-${day}T08:00:00Z`,
        category: "everyday_words",
        module: "everyday_english",
        typed_len: 50,
        correct_chars: 50,
        active_ms: 600_000,
      }),
    );
    const profile = buildSkillProfile(records, emptyPlan, new Date("2026-06-13T08:00:00Z"));
    expect(profile.daily_active_minutes_7d).toBe(10);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/diagnosis.test.ts`
Expected: FAIL，`buildSkillProfile`/`formForCategory` 未导出

- [ ] **Step 3: 写实现**

在 `src/training/diagnosis.ts` 追加：

```typescript
export type TrainingForm =
  | "keys"
  | "words"
  | "symbols"
  | "sentences"
  | "articles"
  | "code";

export const TRAINING_FORMS: TrainingForm[] = [
  "keys",
  "words",
  "symbols",
  "sentences",
  "articles",
  "code",
];

export interface FormSpeed {
  form: TrainingForm;
  samples: number;
  ewma_wpm: number | null;
}

export interface FocusPools {
  /** 仅供单词形态回流 */
  words: string[];
  /** 仅供句子形态回流（整句） */
  sentences: string[];
  /** 仅供代码形态回流 */
  code: string[];
  /** 键位/符号技能特征，全形态可用于调整语料特征含量 */
  chars: string[];
}

export interface SkillProfile {
  dimensions: SkillDiagnosis[];
  form_speeds: FormSpeed[];
  focus: FocusPools;
  /** 近 7 天有练习的日子的日均活跃分钟（中位数），无数据为 0 */
  daily_active_minutes_7d: number;
  generated_at: string;
}

export function formForCategory(category: TrainingCategory): TrainingForm | null {
  switch (category) {
    case "foundation_mix":
    case "home_row":
    case "top_row":
    case "bottom_row":
    case "finger_transitions":
    case "punctuation_edges":
    case "letter_combinations":
      return "keys";
    case "basic_words":
    case "everyday_words":
    case "everyday_phrases":
    case "everyday_word_decomposition":
    case "everyday_mix":
    case "programming_terms":
    case "naming_styles":
    case "builtin_api":
    case "word_breakdown":
    case "personal_vocabulary":
    case "custom_library":
      return "words";
    case "numbers_symbols":
    case "symbols_numbers":
    case "programming_basics_mix":
      return "symbols";
    case "everyday_sentences":
      return "sentences";
    case "everyday_articles":
      return "articles";
    case "code_snippet":
    case "code_function":
    case "code_file_fragment":
    case "code_mix":
      return "code";
    case "review":
    case "unknown":
      return null;
  }
}
```

继续追加：

```typescript
const FOCUS_WORDS_LIMIT = 12;
const FOCUS_SENTENCES_LIMIT = 5;
const FOCUS_CODE_LIMIT = 8;

function formSpeeds(records: SessionRecord[]): FormSpeed[] {
  const ordered = [...records].sort(
    (left, right) => Date.parse(left.started_at) - Date.parse(right.started_at),
  );
  const perForm = new Map<TrainingForm, number[]>();
  for (const record of ordered) {
    const form = formForCategory(record.category);
    if (form === null || record.active_ms <= 0 || record.correct_chars <= 0) {
      continue;
    }
    const wpm = record.correct_chars / 5 / (record.active_ms / 60_000);
    const list = perForm.get(form) ?? [];
    list.push(wpm);
    perForm.set(form, list);
  }
  return TRAINING_FORMS.map((form) => {
    const window = (perForm.get(form) ?? []).slice(-DIAGNOSIS_WINDOW_SESSIONS);
    return {
      form,
      samples: window.length,
      ewma_wpm: ewmaAverage(window),
    };
  });
}

function focusPools(records: SessionRecord[], plan: PracticePlan): FocusPools {
  const wordErrors = new Map<string, number>();
  const sentenceErrors = new Map<string, number>();
  const codeErrors = new Map<string, number>();
  const window = [...records]
    .sort((left, right) => Date.parse(left.started_at) - Date.parse(right.started_at))
    .slice(-DIAGNOSIS_WINDOW_SESSIONS * 3);
  for (const record of window) {
    const form = formForCategory(record.category);
    if (form === null) {
      continue;
    }
    for (const [token, count] of Object.entries(record.error_tokens)) {
      if (form === "words") {
        wordErrors.set(token, (wordErrors.get(token) ?? 0) + count);
      } else if (form === "code") {
        codeErrors.set(token, (codeErrors.get(token) ?? 0) + count);
      } else if (form === "sentences" || form === "articles") {
        const line = record.target_text
          .split("\n")
          .find((candidate) => candidate.includes(token));
        if (line !== undefined && line.trim().length > 0) {
          sentenceErrors.set(line, (sentenceErrors.get(line) ?? 0) + count);
        }
      }
    }
  }
  return {
    words: topEntries(wordErrors, FOCUS_WORDS_LIMIT),
    sentences: topEntries(sentenceErrors, FOCUS_SENTENCES_LIMIT),
    code: topEntries(codeErrors, FOCUS_CODE_LIMIT),
    chars: [...new Set([...plan.focus_keys, ...plan.focus_symbols])],
  };
}

function topEntries(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort(([leftKey, left], [rightKey, right]) =>
      right === left ? leftKey.localeCompare(rightKey) : right - left,
    )
    .slice(0, limit)
    .map(([key]) => key);
}

function dailyActiveMinutesMedian7d(records: SessionRecord[], now: Date): number {
  const cutoffMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const perDay = new Map<string, number>();
  for (const record of records) {
    const startedMs = Date.parse(record.started_at);
    if (!Number.isFinite(startedMs) || startedMs < cutoffMs) {
      continue;
    }
    const day = record.started_at.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + record.active_ms);
  }
  const minutes = [...perDay.values()]
    .map((ms) => ms / 60_000)
    .sort((left, right) => left - right);
  if (minutes.length === 0) {
    return 0;
  }
  const middle = Math.floor(minutes.length / 2);
  return minutes.length % 2 === 1
    ? minutes[middle]!
    : (minutes[middle - 1]! + minutes[middle]!) / 2;
}

export function buildSkillProfile(
  records: SessionRecord[],
  plan: PracticePlan,
  now: Date = new Date(),
): SkillProfile {
  return {
    dimensions: [...diagnoseCharSkills(records), ...diagnoseTokenSkills(records)],
    form_speeds: formSpeeds(records),
    focus: focusPools(records, plan),
    daily_active_minutes_7d: dailyActiveMinutesMedian7d(records, now),
    generated_at: now.toISOString(),
  };
}

/** 词级维度：word_fluency（普通词）与 long_words（长度 ≥8 的词） */
const LONG_WORD_MIN_LENGTH = 8;

function diagnoseTokenSkills(records: SessionRecord[]): SkillDiagnosis[] {
  const ordered = [...records].sort(
    (left, right) => Date.parse(left.started_at) - Date.parse(right.started_at),
  );
  const fluencySessions: Array<{ wpm: number; errorRate: number; events: number }> = [];
  const longWordSessions: Array<{ wpm: number; errorRate: number; events: number }> = [];
  for (const record of ordered) {
    const wordStats = record.token_stats.filter((stat) => stat.kind === "word");
    collectTokenSample(
      wordStats.filter((stat) => [...stat.token].length < LONG_WORD_MIN_LENGTH),
      fluencySessions,
    );
    collectTokenSample(
      wordStats.filter((stat) => [...stat.token].length >= LONG_WORD_MIN_LENGTH),
      longWordSessions,
    );
  }
  return [
    tokenDiagnosis("word_fluency", fluencySessions),
    tokenDiagnosis("long_words", longWordSessions),
  ];
}

function collectTokenSample(
  stats: Array<{ token: string; duration_ms: number; errors: number }>,
  sessions: Array<{ wpm: number; errorRate: number; events: number }>,
): void {
  if (stats.length < MIN_DIMENSION_EVENTS) {
    return;
  }
  const chars = stats.reduce((sum, stat) => sum + [...stat.token].length, 0);
  const durationMs = stats.reduce((sum, stat) => sum + stat.duration_ms, 0);
  const errors = stats.reduce((sum, stat) => sum + stat.errors, 0);
  if (durationMs <= 0 || chars === 0) {
    return;
  }
  sessions.push({
    wpm: chars / 5 / (durationMs / 60_000),
    errorRate: (errors / chars) * 100,
    events: stats.length,
  });
}

function tokenDiagnosis(
  id: SkillDimensionId,
  sessions: Array<{ wpm: number; errorRate: number; events: number }>,
): SkillDiagnosis {
  const window = sessions.slice(-DIAGNOSIS_WINDOW_SESSIONS);
  const events = window.reduce((sum, session) => sum + session.events, 0);
  if (window.length === 0 || events < MIN_RATED_EVENTS) {
    return {
      id,
      samples: window.length,
      events,
      ewma_error_rate: null,
      ewma_speed: null,
      trend: "insufficient",
      status: "unrated",
    };
  }
  const ewmaErrorRate = ewmaAverage(window.map((session) => session.errorRate));
  const wpmSeries = window.map((session) => session.wpm);
  const trend = seriesTrend(wpmSeries, "higher_is_better");
  return {
    id,
    samples: window.length,
    events,
    ewma_error_rate: ewmaErrorRate,
    ewma_speed: ewmaAverage(wpmSeries),
    trend,
    status: dimensionStatus(window.length, ewmaErrorRate, trend),
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/diagnosis.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查并提交**

Run: `bun run typecheck && bun test tests`
Expected: 全部通过

```bash
git add src/training/diagnosis.ts tests/diagnosis.test.ts
git commit -m "feat(diagnosis): form speeds, focus pools by form, buildSkillProfile"
```

---

### Task 5: UserPreferences 新增 enabled_modules

**Files:**
- Modify: `src/domain/model.ts`
- Test: `tests/model.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

在 `tests/model.test.ts` 末尾追加（该文件已有 `parseUserPreferences`/`defaultUserPreferences` 的导入则复用；没有则按文件内现有 import 风格补充）：

```typescript
describe("enabled_modules preference", () => {
  test("defaults to all four practice modules", () => {
    const prefs = defaultUserPreferences();
    expect(prefs.enabled_modules).toEqual([
      "foundation_input",
      "everyday_english",
      "programming_basics",
      "code_practice",
    ]);
  });

  test("parse keeps valid modules and drops unknown values", () => {
    const prefs = parseUserPreferences({
      enabled_modules: ["everyday_english", "nonsense", "code_practice"],
    });
    expect(prefs.enabled_modules).toEqual(["everyday_english", "code_practice"]);
  });

  test("parse falls back to default when absent", () => {
    const prefs = parseUserPreferences({});
    expect(prefs.enabled_modules).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/model.test.ts`
Expected: FAIL，`enabled_modules` 属性不存在

- [ ] **Step 3: 写实现**

`src/domain/model.ts` 三处修改：

1. `UserPreferences` 接口（`personal_vocabulary` 字段后）追加：

```typescript
  /** 综合训练启用的一级模块；处方层只会开出启用模块的语料 */
  enabled_modules: TrainingModule[];
```

2. `parseUserPreferences` 返回对象中（`personal_vocabulary` 之后）追加：

```typescript
    enabled_modules: parseEnabledModules(object.enabled_modules),
```

并在文件底部 helper 区域新增：

```typescript
const adaptiveModules = [
  "foundation_input",
  "everyday_english",
  "programming_basics",
  "code_practice",
] as const;

function parseEnabledModules(value: unknown): TrainingModule[] {
  if (!Array.isArray(value)) {
    return [...adaptiveModules];
  }
  const result = value.filter(
    (item): item is TrainingModule =>
      typeof item === "string" && (adaptiveModules as readonly string[]).includes(item),
  );
  return result.length === 0 ? [...adaptiveModules] : result;
}
```

3. `defaultUserPreferences` 返回对象中（`personal_vocabulary` 之后、`...overrides` 之前）追加：

```typescript
    enabled_modules: [...adaptiveModules],
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/model.test.ts && bun run typecheck`
Expected: PASS、无类型错误（若其他文件构造 `UserPreferences` 字面量报缺字段，逐个补 `enabled_modules: defaultUserPreferences().enabled_modules` 或经由 `defaultUserPreferences()` 构造）

- [ ] **Step 5: 提交**

```bash
git add src/domain/model.ts tests/model.test.ts
git commit -m "feat(model): add enabled_modules preference"
```

---

### Task 6: 处方层——推荐时长

**Files:**
- Create: `src/training/prescription.ts`
- Test: `tests/prescription.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/prescription.test.ts
import { describe, expect, test } from "bun:test";

import { recommendedDailyMinutes } from "../src/training/prescription";
import type { SkillProfile, SkillDiagnosis } from "../src/training/diagnosis";

function diagnosis(
  id: SkillDiagnosis["id"],
  status: SkillDiagnosis["status"],
): SkillDiagnosis {
  return {
    id,
    samples: 5,
    events: 100,
    ewma_error_rate: status === "weak" ? 10 : 1,
    ewma_speed: 200,
    trend: "stable",
    status,
  };
}

function profileWith(
  statuses: Array<[SkillDiagnosis["id"], SkillDiagnosis["status"]]>,
  habitMinutes: number,
): SkillProfile {
  return {
    dimensions: statuses.map(([id, status]) => diagnosis(id, status)),
    form_speeds: [],
    focus: { words: [], sentences: [], code: [], chars: [] },
    daily_active_minutes_7d: habitMinutes,
    generated_at: "2026-06-13T08:00:00Z",
  };
}

describe("recommendedDailyMinutes", () => {
  test("new user with no data gets 15 minutes", () => {
    const profile = profileWith(
      [
        ["digits", "unrated"],
        ["symbols", "unrated"],
      ],
      0,
    );
    expect(recommendedDailyMinutes(profile)).toBe(15);
  });

  test("all-stable expert gets 10 minute maintenance", () => {
    const profile = profileWith(
      [
        ["home_row", "stable"],
        ["digits", "stable"],
        ["symbols", "stable"],
        ["word_fluency", "stable"],
      ],
      40,
    );
    expect(recommendedDailyMinutes(profile)).toBe(10);
  });

  test("each weak dimension adds 5 minutes", () => {
    const profile = profileWith(
      [
        ["digits", "weak"],
        ["symbols", "weak"],
        ["word_fluency", "normal"],
      ],
      30,
    );
    // 15 + 2*5 = 25，习惯上限 max(15, 30*1.5)=45 不约束
    expect(recommendedDailyMinutes(profile)).toBe(25);
  });

  test("habit ceiling caps the recommendation", () => {
    const profile = profileWith(
      [
        ["digits", "weak"],
        ["symbols", "weak"],
        ["word_fluency", "weak"],
        ["long_words", "weak"],
      ],
      8,
    );
    // 15 + 4*5 = 35，习惯上限 max(15, 8*1.5)=15
    expect(recommendedDailyMinutes(profile)).toBe(15);
  });

  test("result clamps to [10, 45]", () => {
    const manyWeak = profileWith(
      [
        ["home_row", "weak"],
        ["top_row", "weak"],
        ["bottom_row", "weak"],
        ["digits", "weak"],
        ["symbols", "weak"],
        ["capitalization", "weak"],
        ["word_fluency", "weak"],
        ["long_words", "weak"],
      ],
      60,
    );
    // 15 + 8*5 = 55 → clamp 45（习惯上限 90 不约束）
    expect(recommendedDailyMinutes(manyWeak)).toBe(45);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/prescription.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 写实现**

```typescript
// src/training/prescription.ts
import type { SkillProfile } from "./diagnosis";

const MIN_DAILY_MINUTES = 10;
const MAX_DAILY_MINUTES = 45;
const BASE_MINUTES = 15;
const MAINTENANCE_BASE_MINUTES = 10;
const MINUTES_PER_WEAK_DIMENSION = 5;
/** 判定"全面稳定"所需的最少已评估维度数 */
const MIN_RATED_FOR_MAINTENANCE = 3;

export function recommendedDailyMinutes(profile: SkillProfile): number {
  const rated = profile.dimensions.filter((item) => item.status !== "unrated");
  const weakCount = rated.filter((item) => item.status === "weak").length;
  const allStable =
    rated.length >= MIN_RATED_FOR_MAINTENANCE &&
    rated.every((item) => item.status === "stable");
  const base = allStable ? MAINTENANCE_BASE_MINUTES : BASE_MINUTES;
  let minutes = base + weakCount * MINUTES_PER_WEAK_DIMENSION;
  if (profile.daily_active_minutes_7d > 0) {
    minutes = Math.min(
      minutes,
      Math.max(BASE_MINUTES, Math.round(profile.daily_active_minutes_7d * 1.5)),
    );
  }
  return clamp(Math.round(minutes), MIN_DAILY_MINUTES, MAX_DAILY_MINUTES);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/prescription.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/training/prescription.ts tests/prescription.test.ts
git commit -m "feat(prescription): recommended daily minutes from skill profile"
```

---

### Task 7: 处方层——阶段序列、权重、轮换与字符预算

**Files:**
- Modify: `src/training/prescription.ts`
- Test: `tests/prescription.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/prescription.test.ts` 追加（import 补充 `buildDailyPrescription, FORM_FALLBACK_WPM, type PrescriptionInput`，以及 `defaultSessionRecord` from `../src/domain/model`）：

```typescript
import { defaultSessionRecord } from "../src/domain/model";
import {
  buildDailyPrescription,
  FORM_FALLBACK_WPM,
  recommendedDailyMinutes,
  type PrescriptionInput,
} from "../src/training/prescription";

const ALL_MODULES = [
  "foundation_input",
  "everyday_english",
  "programming_basics",
  "code_practice",
] as const;

function baseInput(overrides: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return {
    profile: profileWith([["digits", "normal"]], 20),
    enabledModules: [...ALL_MODULES],
    records: [],
    now: new Date("2026-06-13T08:00:00Z"),
    random: () => 0.99, // 默认让概率型轮换不触发
    ...overrides,
  };
}

describe("buildDailyPrescription", () => {
  test("always includes keys warmup and words stages", () => {
    const prescription = buildDailyPrescription(baseInput());
    const forms = prescription.stages.map((stage) => stage.form);
    expect(forms[0]).toBe("keys");
    expect(forms).toContain("words");
  });

  test("weak symbols dimension forces symbols stage with weak flag", () => {
    const prescription = buildDailyPrescription(
      baseInput({ profile: profileWith([["symbols", "weak"]], 20) }),
    );
    const symbols = prescription.stages.find((stage) => stage.form === "symbols");
    expect(symbols).toBeDefined();
    expect(symbols?.weak).toBe(true);
  });

  test("disabling code module removes code stage", () => {
    const prescription = buildDailyPrescription(
      baseInput({
        enabledModules: ["foundation_input", "everyday_english"],
      }),
    );
    expect(prescription.stages.find((stage) => stage.form === "code")).toBeUndefined();
  });

  test("article stage appears only after 3-day gap", () => {
    const recentArticle = defaultSessionRecord({
      started_at: "2026-06-12T08:00:00Z",
      category: "everyday_articles",
      module: "everyday_english",
      typed_len: 200,
      correct_chars: 200,
      active_ms: 120_000,
    });
    const withRecent = buildDailyPrescription(baseInput({ records: [recentArticle] }));
    expect(withRecent.stages.find((stage) => stage.form === "articles")).toBeUndefined();

    const oldArticle = defaultSessionRecord({
      ...recentArticle,
      started_at: "2026-06-09T08:00:00Z",
    });
    const withOld = buildDailyPrescription(baseInput({ records: [oldArticle] }));
    expect(withOld.stages.find((stage) => stage.form === "articles")).toBeDefined();
  });

  test("char budget uses form ewma wpm when available", () => {
    const profile = profileWith([["digits", "normal"]], 20);
    profile.form_speeds = [
      { form: "words", samples: 5, ewma_wpm: 40 },
    ];
    const prescription = buildDailyPrescription(baseInput({ profile }));
    const words = prescription.stages.find((stage) => stage.form === "words");
    expect(words).toBeDefined();
    // 预算 = 分钟 × 40 × 5，必须显著高于 fallback (22*0.8) 给出的量
    expect(words!.char_budget).toBe(Math.round(words!.minutes * 40 * 5));
  });

  test("cold start budget applies 0.8 discount on fallback wpm", () => {
    const prescription = buildDailyPrescription(baseInput());
    const words = prescription.stages.find((stage) => stage.form === "words");
    expect(words!.char_budget).toBe(
      Math.round(words!.minutes * FORM_FALLBACK_WPM.words * 0.8 * 5),
    );
  });

  test("stage minutes sum approximately to target", () => {
    const prescription = buildDailyPrescription(baseInput());
    const total = prescription.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    expect(Math.abs(total - prescription.target_minutes)).toBeLessThanOrEqual(1);
  });

  test("every stage carries non-empty bilingual reasons", () => {
    const prescription = buildDailyPrescription(baseInput());
    for (const stage of prescription.stages) {
      expect(stage.reason_zh.length).toBeGreaterThan(0);
      expect(stage.reason_en.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/prescription.test.ts`
Expected: FAIL，`buildDailyPrescription` 未导出

- [ ] **Step 3: 写实现**

在 `src/training/prescription.ts` 顶部把 import 扩充为：

```typescript
import type { SessionRecord, TrainingModule } from "../domain/model";
import type {
  FormSpeed,
  SkillDimensionId,
  SkillProfile,
  TrainingForm,
} from "./diagnosis";
import { formForCategory } from "./diagnosis";
```

然后追加：

```typescript
export interface StagePlan {
  form: TrainingForm;
  minutes: number;
  /** 该阶段语料的字符预算 = minutes × 形态 WPM × 5 */
  char_budget: number;
  /** 是否为弱项加强阶段（间歇屏与裁剪优先级用） */
  weak: boolean;
  reason_zh: string;
  reason_en: string;
}

export interface DailyPrescription {
  target_minutes: number;
  stages: StagePlan[];
}

export interface PrescriptionInput {
  profile: SkillProfile;
  enabledModules: TrainingModule[];
  /** 全部历史会话：用于长内容轮换查询 */
  records: SessionRecord[];
  now: Date;
  random?: () => number;
}

/** 冷启动各形态保守默认 WPM */
export const FORM_FALLBACK_WPM: Record<TrainingForm, number> = {
  keys: 18,
  words: 22,
  symbols: 16,
  sentences: 22,
  articles: 22,
  code: 14,
};

/** 冷启动预算折扣：宁可练完意犹未尽，不要超量劝退 */
const COLD_START_DISCOUNT = 0.8;
/** 键位热身固定分钟数 */
const WARMUP_MINUTES = 2;
/** 文章轮换间隔（天） */
const ARTICLE_ROTATION_DAYS = 3;
/** 非弱项时符号阶段的轮换概率 */
const SYMBOLS_ROTATION_PROBABILITY = 0.5;
/** 弱项阶段权重 / 稳定阶段权重 */
const WEAK_WEIGHT = 1.5;
const STABLE_WEIGHT = 0.5;
/** 权重分配阶段的最少分钟数 */
const MIN_STAGE_MINUTES = 2;

/** 技能维度 → 治疗形态（"技能跨阶段，内容不跨形态"中的技能侧映射） */
const DIMENSION_FORM: Record<SkillDimensionId, TrainingForm> = {
  home_row: "keys",
  top_row: "keys",
  bottom_row: "keys",
  left_hand: "keys",
  right_hand: "keys",
  digits: "symbols",
  symbols: "symbols",
  capitalization: "words",
  word_fluency: "words",
  long_words: "words",
};

export function buildDailyPrescription(input: PrescriptionInput): DailyPrescription {
  const random = input.random ?? Math.random;
  const targetMinutes = recommendedDailyMinutes(input.profile);
  const weakForms = collectWeakForms(input.profile);
  const stableForms = collectStableForms(input.profile);
  const everydayEnabled = input.enabledModules.includes("everyday_english");
  const codeEnabled = input.enabledModules.includes("code_practice");

  const forms: TrainingForm[] = ["words"];
  if (weakForms.has("symbols") || random() < SYMBOLS_ROTATION_PROBABILITY) {
    forms.push("symbols");
  }
  if (everydayEnabled) {
    forms.push("sentences");
    if (daysSinceForm(input.records, "articles", input.now) >= ARTICLE_ROTATION_DAYS) {
      forms.push("articles");
    }
  }
  if (codeEnabled) {
    forms.push("code");
  }

  const distributable = Math.max(targetMinutes - WARMUP_MINUTES, MIN_STAGE_MINUTES);
  const weighted = forms.map((form) => ({
    form,
    weight: weakForms.has(form)
      ? WEAK_WEIGHT
      : stableForms.has(form)
        ? STABLE_WEIGHT
        : 1,
  }));
  const weightTotal = weighted.reduce((sum, item) => sum + item.weight, 0);
  const stages: StagePlan[] = [
    stagePlan("keys", WARMUP_MINUTES, weakForms.has("keys"), input.profile),
  ];
  let allocated = 0;
  for (const [index, item] of weighted.entries()) {
    const isLast = index === weighted.length - 1;
    const rawMinutes = (item.weight / weightTotal) * distributable;
    const minutes = isLast
      ? Math.max(distributable - allocated, MIN_STAGE_MINUTES)
      : Math.max(Math.round(rawMinutes), MIN_STAGE_MINUTES);
    allocated += minutes;
    stages.push(stagePlan(item.form, minutes, weakForms.has(item.form), input.profile));
  }

  return { target_minutes: targetMinutes, stages };
}

function stagePlan(
  form: TrainingForm,
  minutes: number,
  weak: boolean,
  profile: SkillProfile,
): StagePlan {
  return {
    form,
    minutes,
    char_budget: charBudget(form, minutes, profile.form_speeds),
    weak,
    reason_zh: stageReasonZh(form, weak, profile),
    reason_en: stageReasonEn(form, weak, profile),
  };
}

export function charBudget(
  form: TrainingForm,
  minutes: number,
  speeds: FormSpeed[],
): number {
  const measured = speeds.find((item) => item.form === form)?.ewma_wpm ?? null;
  const wpm = measured ?? FORM_FALLBACK_WPM[form] * COLD_START_DISCOUNT;
  return Math.round(minutes * wpm * 5);
}

function collectWeakForms(profile: SkillProfile): Set<TrainingForm> {
  const forms = new Set<TrainingForm>();
  for (const dimension of profile.dimensions) {
    if (dimension.status === "weak") {
      forms.add(DIMENSION_FORM[dimension.id]);
    }
  }
  return forms;
}

function collectStableForms(profile: SkillProfile): Set<TrainingForm> {
  const byForm = new Map<TrainingForm, boolean>();
  for (const dimension of profile.dimensions) {
    if (dimension.status === "unrated") {
      continue;
    }
    const form = DIMENSION_FORM[dimension.id];
    const current = byForm.get(form);
    byForm.set(form, (current ?? true) && dimension.status === "stable");
  }
  const forms = new Set<TrainingForm>();
  for (const [form, allStable] of byForm) {
    if (allStable) {
      forms.add(form);
    }
  }
  return forms;
}

/** 该形态上次出现距今天数；从未出现返回 Infinity */
function daysSinceForm(
  records: SessionRecord[],
  form: TrainingForm,
  now: Date,
): number {
  let latestMs = 0;
  for (const record of records) {
    if (formForCategory(record.category) !== form) {
      continue;
    }
    const startedMs = Date.parse(record.started_at);
    if (Number.isFinite(startedMs) && startedMs > latestMs) {
      latestMs = startedMs;
    }
  }
  if (latestMs === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (now.getTime() - latestMs) / (24 * 60 * 60 * 1000);
}

function weakDimensionSummary(profile: SkillProfile, form: TrainingForm): string {
  return profile.dimensions
    .filter(
      (dimension) =>
        dimension.status === "weak" && DIMENSION_FORM[dimension.id] === form,
    )
    .map((dimension) => dimension.id)
    .join(", ");
}

function stageReasonZh(
  form: TrainingForm,
  weak: boolean,
  profile: SkillProfile,
): string {
  const base: Record<TrainingForm, string> = {
    keys: "键位指法热身",
    words: "单词流畅度训练",
    symbols: "符号与数字专项",
    sentences: "句子连贯输入",
    articles: "文章长文输入（轮换）",
    code: "真实代码实战",
  };
  if (weak) {
    return `${base[form]}：弱项加强（${weakDimensionSummary(profile, form)}）`;
  }
  return `${base[form]}：常规轮换维持手感`;
}

function stageReasonEn(
  form: TrainingForm,
  weak: boolean,
  profile: SkillProfile,
): string {
  const base: Record<TrainingForm, string> = {
    keys: "Key position warmup",
    words: "Word fluency training",
    symbols: "Symbols and digits focus",
    sentences: "Sentence flow input",
    articles: "Article long-form input (rotation)",
    code: "Real code practice",
  };
  if (weak) {
    return `${base[form]}: weak-spot boost (${weakDimensionSummary(profile, form)})`;
  }
  return `${base[form]}: regular rotation to keep touch`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/prescription.test.ts && bun run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/training/prescription.ts tests/prescription.test.ts
git commit -m "feat(prescription): stage sequence, weights, rotation and char budgets"
```

---

### Task 8: 处方层——会话内修正 reviseStages

**Files:**
- Modify: `src/training/prescription.ts`
- Test: `tests/prescription.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/prescription.test.ts` 追加（import 补充 `reviseStages, type CompletedStage`）：

```typescript
import { reviseStages, type CompletedStage } from "../src/training/prescription";

describe("reviseStages", () => {
  function prescriptionFixture() {
    return buildDailyPrescription(
      baseInput({ profile: profileWith([["digits", "normal"]], 30) }),
    );
  }

  test("slower-than-expected stage shrinks remaining budgets", () => {
    const prescription = prescriptionFixture();
    const first = prescription.stages[1]!; // stages[0] 是 keys 热身
    const completed: CompletedStage[] = [
      { form: prescription.stages[0]!.form, actual_minutes: 2, actual_wpm: 18 },
      // 实际花了预估的 2 倍时间，实测 WPM 只有预算假设的一半
      {
        form: first.form,
        actual_minutes: first.minutes * 2,
        actual_wpm: FORM_FALLBACK_WPM[first.form] * 0.8 * 0.5,
      },
    ];
    const revised = reviseStages(prescription, completed);
    // 已完成阶段被移除
    expect(revised.stages.find((stage) => stage.form === first.form)).toBeUndefined();
    // 同形态实测速度生效：剩余阶段预算 = 分钟 × 实测/估算速度 × 5，总分钟被压缩
    const remainingMinutes = revised.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    const spentMinutes = completed.reduce((sum, stage) => sum + stage.actual_minutes, 0);
    expect(remainingMinutes + spentMinutes).toBeLessThanOrEqual(
      prescription.target_minutes + 1,
    );
  });

  test("weak stages survive trimming before regular ones", () => {
    const prescription = buildDailyPrescription(
      baseInput({ profile: profileWith([["symbols", "weak"]], 30) }),
    );
    // 耗尽几乎全部时间，只剩 3 分钟
    const completed: CompletedStage[] = [
      {
        form: "keys",
        actual_minutes: prescription.target_minutes - 3,
        actual_wpm: 18,
      },
    ];
    const revised = reviseStages(prescription, completed);
    const forms = revised.stages.map((stage) => stage.form);
    // 弱项 symbols 阶段必须保留
    expect(forms).toContain("symbols");
  });

  test("all stages done returns empty remaining", () => {
    const prescription = prescriptionFixture();
    const completed: CompletedStage[] = prescription.stages.map((stage) => ({
      form: stage.form,
      actual_minutes: stage.minutes,
      actual_wpm: 25,
    }));
    const revised = reviseStages(prescription, completed);
    expect(revised.stages).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/prescription.test.ts`
Expected: FAIL，`reviseStages` 未导出

- [ ] **Step 3: 写实现**

在 `src/training/prescription.ts` 追加：

```typescript
export interface CompletedStage {
  form: TrainingForm;
  actual_minutes: number;
  actual_wpm: number;
}

/**
 * 会话内修正：移除已完成阶段，按实测速度重算剩余阶段预算，
 * 并向今日目标对齐——剩余时间不足时按"先砍常规、保留弱项"裁剪。
 */
export function reviseStages(
  prescription: DailyPrescription,
  completed: CompletedStage[],
): DailyPrescription {
  const doneCount = completed.length;
  const remaining = prescription.stages.slice(doneCount);
  const spentMinutes = completed.reduce((sum, stage) => sum + stage.actual_minutes, 0);
  let minutesLeft = Math.max(prescription.target_minutes - spentMinutes, 0);

  // 本会话实测速度（同形态多次取平均）
  const measured = new Map<TrainingForm, number>();
  for (const stage of completed) {
    if (stage.actual_wpm <= 0) {
      continue;
    }
    const existing = measured.get(stage.form);
    measured.set(
      stage.form,
      existing === undefined ? stage.actual_wpm : (existing + stage.actual_wpm) / 2,
    );
  }

  // 裁剪：时间不足时先砍常规阶段（保持原顺序），弱项阶段最后砍
  const regularFirst = [...remaining].sort(
    (left, right) => Number(left.weak) - Number(right.weak),
  );
  const dropped = new Set<StagePlan>();
  let needed = remaining.reduce(
    (sum, stage) => sum + Math.max(stage.minutes, MIN_STAGE_MINUTES),
    0,
  );
  for (const stage of regularFirst) {
    if (needed <= minutesLeft || minutesLeft < MIN_STAGE_MINUTES) {
      break;
    }
    if (needed - stage.minutes >= Math.max(minutesLeft, MIN_STAGE_MINUTES)) {
      dropped.add(stage);
      needed -= stage.minutes;
    }
  }

  const survivors = remaining.filter((stage) => !dropped.has(stage));
  if (survivors.length === 0) {
    return { target_minutes: prescription.target_minutes, stages: [] };
  }
  if (minutesLeft < MIN_STAGE_MINUTES) {
    // 时间已超目标：只保留弱项阶段，给最低剂量
    const weakOnly = survivors.filter((stage) => stage.weak);
    minutesLeft = weakOnly.length * MIN_STAGE_MINUTES;
    return {
      target_minutes: prescription.target_minutes,
      stages: weakOnly.map((stage) =>
        rebudget(stage, MIN_STAGE_MINUTES, measured),
      ),
    };
  }

  // 按原计划比例缩放剩余分钟
  const plannedTotal = survivors.reduce((sum, stage) => sum + stage.minutes, 0);
  const scale = plannedTotal === 0 ? 1 : minutesLeft / plannedTotal;
  return {
    target_minutes: prescription.target_minutes,
    stages: survivors.map((stage) =>
      rebudget(
        stage,
        Math.max(Math.round(stage.minutes * scale), MIN_STAGE_MINUTES),
        measured,
      ),
    ),
  };
}

function rebudget(
  stage: StagePlan,
  minutes: number,
  measured: Map<TrainingForm, number>,
): StagePlan {
  const measuredWpm = measured.get(stage.form);
  const budget =
    measuredWpm === undefined
      ? Math.round((stage.char_budget / Math.max(stage.minutes, 1)) * minutes)
      : Math.round(minutes * measuredWpm * 5);
  return { ...stage, minutes, char_budget: budget };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/prescription.test.ts && bun run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/training/prescription.ts tests/prescription.test.ts
git commit -m "feat(prescription): in-session stage revision with weak-stage priority"
```

---

### Task 9: spec 验收场景集成测试

把 spec 第 9 节的端到端断言落成测试：从原始 `SessionRecord` 一路走 `buildSkillProfile → buildDailyPrescription`。

**Files:**
- Test: `tests/prescription.test.ts`（追加）

- [ ] **Step 1: 写集成测试（预期直接通过；若失败则修实现而非测试）**

```typescript
import { buildSkillProfile } from "../src/training/diagnosis";

describe("end-to-end: spec acceptance scenarios", () => {
  const emptyPlan = {
    focus_words: [],
    focus_symbols: [],
    focus_code: [],
    focus_keys: [],
    advice: [],
    recommended_mode: "mixed" as const,
    has_recent_history: false,
  };
  const now = new Date("2026-06-13T08:00:00Z");

  test("no history yields 15-minute default plan with cold-start budgets", () => {
    const profile = buildSkillProfile([], emptyPlan, now);
    expect(profile.dimensions.every((item) => item.status === "unrated")).toBe(true);
    const prescription = buildDailyPrescription({
      profile,
      enabledModules: [...ALL_MODULES],
      records: [],
      now,
      random: () => 0.99,
    });
    expect(prescription.target_minutes).toBe(15);
    for (const stage of prescription.stages) {
      const fallback = FORM_FALLBACK_WPM[stage.form];
      expect(stage.char_budget).toBe(Math.round(stage.minutes * fallback * 0.8 * 5));
    }
  });

  test("symbol-heavy errors from code-only history force symbols stage", () => {
    // 用户只练代码，但符号键错误率高 → 跨模块诊断出 symbols 弱项
    const events: Array<[string, boolean]> = [
      [";", false],
      ["{", false],
      ["}", false],
      ["(", true],
      [")", false],
      ...[..."constreturn".repeat(3)].map((c): [string, boolean] => [c, true]),
    ];
    const records = [8, 9, 10, 11].map((day) =>
      defaultSessionRecord({
        started_at: `2026-06-${String(day).padStart(2, "0")}T08:00:00Z`,
        category: "code_snippet",
        module: "code_practice",
        typed_len: events.length,
        correct_chars: events.length - 4,
        active_ms: 60_000,
        key_events: events.map(([expected, correct], index) => ({
          at_ms: index * 200,
          action: "insert" as const,
          position: index,
          expected,
          input: correct ? expected : "x",
          correct,
        })),
      }),
    );
    const profile = buildSkillProfile(records, emptyPlan, now);
    const symbols = profile.dimensions.find((item) => item.id === "symbols");
    expect(symbols?.status).toBe("weak");
    const prescription = buildDailyPrescription({
      profile,
      enabledModules: [...ALL_MODULES],
      records,
      now,
      random: () => 0.99,
    });
    const symbolsStage = prescription.stages.find((stage) => stage.form === "symbols");
    expect(symbolsStage?.weak).toBe(true);
  });

  test("word errors never leak into non-word focus pools", () => {
    const record = defaultSessionRecord({
      started_at: "2026-06-12T08:00:00Z",
      category: "everyday_words",
      module: "everyday_english",
      typed_len: 100,
      correct_chars: 95,
      active_ms: 60_000,
      error_tokens: { algorithm: 3 },
    });
    const profile = buildSkillProfile([record], emptyPlan, now);
    expect(profile.focus.words).toContain("algorithm");
    expect(profile.focus.sentences).not.toContain("algorithm");
    expect(profile.focus.code).not.toContain("algorithm");
  });
});
```

- [ ] **Step 2: 运行**

Run: `bun test tests/prescription.test.ts`
Expected: PASS。任何失败都说明实现与 spec 不符——修 `diagnosis.ts`/`prescription.ts`，不要改断言。

- [ ] **Step 3: 全量回归并提交**

Run: `bun run typecheck && bun test tests`
Expected: 全部通过（既有测试无回归）

```bash
git add tests/prescription.test.ts
git commit -m "test: spec acceptance scenarios for diagnosis-prescription engine"
```

---

## 完成标准

- `bun run typecheck && bun test tests` 全绿。
- `diagnosis.ts` / `prescription.ts` 不含任何 IO 或 `Math.random()`/`new Date()` 直接调用（`random`/`now` 均参数注入）。
- 对照 spec 第 9 节：本期覆盖"无历史默认计划""跨模块技能诊断""focus 不串桶""禁用科目无对应阶段""轮换间隔""阶段修正""时长边界"。**未覆盖**（属于二、三期）："errword 只出现在单词阶段语料中"（需要生成器消费 focus 池）、诊断屏 UI、进度保存。

## 后续计划（本期合入后另行编写）

- **第 2 期**：形态生成器改造——各 mix 生成器参数化为（char_budget、特征侧重、同形态 focus 池），词阶段合并日常/编程/自建词库语料池。
- **第 3 期**：TUI——诊断/计划屏、阶段间歇屏、`daily_runs.json` 阶段计划与完成状态、`appModel.ts` 综合训练入口切换到 `buildSkillProfile → buildDailyPrescription` 流程、设置页 `enabled_modules` 开关。
