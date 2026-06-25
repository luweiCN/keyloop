# 阶段三：符号/数字专项弱键靶向选材 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐任务实现。步骤用 checkbox(`- [ ]`)跟踪。

**Goal:** 符号与数字专项的选材从「topic 均衡随机」改为「偏重含你弱符号/数字键的真实卡」，复用 per-key 信号，绝不改写卡内容。

**Architecture:** 完全复用阶段二的三件工具——`weakKeyWeights`(records→弱键权重)、`wordKeyWeight`(text→弱键覆盖分)、`weightedSampleWithoutReplacement`(加权无放回抽样)。新增 `symbolWeakKeyWeights`(只取数字/符号弱键，滤掉字母)+ `pickWeakKeyTargetedCards`(加权选卡，保底权重 1 掺普通卡避免怪卷）。`basicsTarget` 的 symbols_numbers 路径：有弱键→靶向，无弱键→保持现有 `pickBalancedCards` 均衡行为（向后兼容、爆炸半径小）。真实语境层（句子/文章/完整 code）**不碰**。

**Tech Stack:** TypeScript, bun test, TDD(red-green-refactor)。

**范围边界（本阶段不做）：** 形式维度（time/date/money/IP 的 `format` 标注 + 形式覆盖）—— 用户已确认拆成独立的后续 plan。

---

## File Structure

- **Modify** `src/training/programmingBasicsTargets.ts`：
  - 新增 `symbolWeakKeyWeights(records)` —— 从 `weakKeyWeights` 过滤出非字母键（数字+符号）。
  - 新增 `pickWeakKeyTargetedCards(cards, weakWeights, count, random)` —— 加权选卡。
  - 改 `basicsTarget`：symbols_numbers 路径接入靶向（其余 kind 不变）。
  - import `weakKeyWeights, wordKeyWeight, weightedSampleWithoutReplacement` from `./wordTargeting`。
- **Modify** `tests/programmingBasicsTargets.test.ts`：新增 3 组测试。

---

## Task 1: `symbolWeakKeyWeights` —— 只取数字/符号弱键

**Files:** Modify `src/training/programmingBasicsTargets.ts`、Test `tests/programmingBasicsTargets.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/programmingBasicsTargets.test.ts 内
import { symbolWeakKeyWeights } from "../src/training/programmingBasicsTargets";
import { defaultSessionRecord, type KeyEventRecord } from "../src/domain/model";

function keysAt(key: string, count: number, startMs: number, intervalMs: number, correct = true): KeyEventRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    at_ms: startMs + i * intervalMs, action: "insert" as const, position: i,
    expected: key, input: correct ? key : "?", correct,
  }));
}

describe("symbolWeakKeyWeights", () => {
  test("只保留数字/符号弱键，滤掉字母弱键", () => {
    // a 字母慢、= 符号慢、2 数字慢，t/e 快做基线
    const record = defaultSessionRecord({
      key_events: [
        ...keysAt("t", 6, 0, 100), ...keysAt("e", 6, 10_000, 100),
        ...keysAt("a", 6, 20_000, 600, false),
        ...keysAt("=", 6, 40_000, 600, false),
        ...keysAt("2", 6, 60_000, 600, false),
      ],
    });
    const weights = symbolWeakKeyWeights([record]);
    expect(weights.has("a")).toBe(false); // 字母键被滤掉
    expect(weights.has("=")).toBe(true);  // 符号键保留
    expect(weights.has("2")).toBe(true);  // 数字键保留
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/programmingBasicsTargets.test.ts -t "symbolWeakKeyWeights"`
Expected: FAIL（`symbolWeakKeyWeights` is not exported / not a function）

- [ ] **Step 3: 实现**

```typescript
// programmingBasicsTargets.ts 顶部 import 补充
import { weakKeyWeights, weightedSampleWithoutReplacement, wordKeyWeight } from "./wordTargeting";
import type { SessionRecord } from "../domain/model";

/**
 * 符号专项弱键账本：从统一 per-key 弱键里只取「数字 / 符号键」（滤掉 a-zA-Z 字母键），
 * 这样符号专项靶向只被你弱的符号/数字键驱动，不因卡里恰好含某个弱字母（如 items 的 i）跑偏。
 */
export function symbolWeakKeyWeights(records: readonly SessionRecord[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, weight] of weakKeyWeights(records)) {
    if (!/[a-zA-Z]/u.test(key)) {
      out.set(key, weight);
    }
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/programmingBasicsTargets.test.ts -t "symbolWeakKeyWeights"`
Expected: PASS

- [ ] **Step 5: typecheck + commit**

Run: `bun run typecheck`
```bash
git add src/training/programmingBasicsTargets.ts tests/programmingBasicsTargets.test.ts
git commit -m "feat(training): 阶段3-1 符号专项弱键账本(只取数字/符号键)"
```

---

## Task 2: `pickWeakKeyTargetedCards` —— 加权选卡

**Files:** Modify `src/training/programmingBasicsTargets.ts`、Test `tests/programmingBasicsTargets.test.ts`

- [ ] **Step 1: 写失败测试（统计：含弱符号键的卡入选频率显著高于对照）**

```typescript
import { pickWeakKeyTargetedCards } from "../src/training/programmingBasicsTargets";
import type { ProgrammingBasicsCard } from "../src/content/programmingBasics";

function lcg(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rand = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5; i += 1) rand(); // 预热，避免小种子首个输出极小
  return rand;
}

describe("pickWeakKeyTargetedCards", () => {
  const cards: ProgrammingBasicsCard[] = [
    { text: "x = y", topic: "a", source_id: "t" },       // 含弱键 =
    { text: "a in b", topic: "b", source_id: "t" },      // 普通
    { text: "p or q", topic: "c", source_id: "t" },      // 普通
    { text: "m and n", topic: "d", source_id: "t" },     // 普通
  ];
  const weights = new Map<string, number>([["=", 0.9]]); // = 很弱

  function hitRate(weightOf: Map<string, number>, trials: number): number {
    let hits = 0;
    for (let i = 0; i < trials; i += 1) {
      const picked = pickWeakKeyTargetedCards(cards, weightOf, 1, lcg(i + 1));
      if (picked[0]?.text === "x = y") hits += 1;
    }
    return hits;
  }

  test("含弱键 = 的卡入选频率显著高于无弱键(随机)对照", () => {
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/programmingBasicsTargets.test.ts -t "pickWeakKeyTargetedCards"`
Expected: FAIL（not exported）

- [ ] **Step 3: 实现**

```typescript
/**
 * 偏重「含弱符号/数字键」的真实卡：按弱键覆盖分加权无放回抽样。
 * 保底权重 1 让普通卡也掺入（避免怪卷，仿阶段二单词靶向）；绝不改写卡内容——只筛选。
 * weakWeights 为空（无弱键/无记录）时全卡权重 1，退化为均匀随机。
 */
export function pickWeakKeyTargetedCards(
  cards: ProgrammingBasicsCard[],
  weakWeights: ReadonlyMap<string, number>,
  count: number,
  random: () => number,
): ProgrammingBasicsCard[] {
  return weightedSampleWithoutReplacement(
    cards,
    (card) => 1 + wordKeyWeight(card.text, weakWeights),
    count,
    random,
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/programmingBasicsTargets.test.ts -t "pickWeakKeyTargetedCards"`
Expected: PASS（2 tests）

- [ ] **Step 5: typecheck + commit**

Run: `bun run typecheck`
```bash
git add src/training/programmingBasicsTargets.ts tests/programmingBasicsTargets.test.ts
git commit -m "feat(training): 阶段3-2 符号卡弱键加权选材"
```

---

## Task 3: `basicsTarget` 接入靶向（有弱键→靶向，无弱键→回退均衡）

**Files:** Modify `src/training/programmingBasicsTargets.ts`、Test `tests/programmingBasicsTargets.test.ts`

- [ ] **Step 1: 写失败测试**

测试要点：① 有弱符号键 records → symbols_numbers 产出明显偏重含该弱键的卡（统计）；② 无 records → 组装仍非空、form 分布正常（回退 pickBalancedCards 行为不变）。用真实卡池（`buildSymbolsNumbersTarget`）跑端到端：

```typescript
import { buildSymbolsNumbersTarget } from "../src/training/programmingBasicsTargets";
import type { BuildTargetContext } from "../src/training/targets";

function symbolsCtx(records: SessionRecord[], random: () => number): BuildTargetContext {
  return {
    records,
    codeConfig: { languages: ["typescript"] },
    random,
  } as unknown as BuildTargetContext;
}

describe("buildSymbolsNumbersTarget 弱键靶向接入", () => {
  // = 与 > 都很弱（typescript 卡含大量 =>、=== 等）
  function recordsWeakArrow(): SessionRecord[] {
    const fast = ["a", "e", "t", "o", "i", "n"].flatMap((k, idx) => keysAt(k, 6, idx * 20_000, 100));
    const slowEq = keysAt("=", 8, 200_000, 600, false);
    const slowGt = keysAt(">", 8, 400_000, 600, false);
    return [defaultSessionRecord({ key_events: [...fast, ...slowEq, ...slowGt] })];
  }

  test("有弱符号键时，符号卡里含该键的字符出现率显著升高", () => {
    const trials = 30;
    const countEq = (records: SessionRecord[]): number => {
      let total = 0;
      for (let i = 0; i < trials; i += 1) {
        const target = buildSymbolsNumbersTarget(symbolsCtx(records, lcg(i + 1)));
        total += (target.text.match(/=/gu) ?? []).length;
      }
      return total;
    };
    const targeted = countEq(recordsWeakArrow());
    const control = countEq([]);
    expect(targeted).toBeGreaterThan(control); // 弱 = → 含 = 的卡被偏重 → = 字符更多
  });

  test("无记录时组装正常：非空、含可打文本", () => {
    const target = buildSymbolsNumbersTarget(symbolsCtx([], lcg(1)));
    expect(target.text.trim().length).toBeGreaterThan(0);
    expect(target.mode).toBe("code");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/programmingBasicsTargets.test.ts -t "弱键靶向接入"`
Expected: FAIL（接入前 targeted ≈ control，第一个测试失败）

- [ ] **Step 3: 实现 —— 改 `basicsTarget` 的选卡分支**

把 `basicsTarget` 里这一行：
```typescript
  const picked = pickBalancedCards(cards, random);
```
改为：
```typescript
  // 符号/数字专项：有弱符号/数字键 → 偏重含弱键的真实卡（阶段3靶向）；
  // 无弱键（无记录/全达标）→ 回退 topic 均衡随机，行为不变。其余 kind 不变。
  const picked = ((): ProgrammingBasicsCard[] => {
    if (kind === "symbols_numbers") {
      const weak = symbolWeakKeyWeights(context.records ?? []);
      if (weak.size > 0) {
        return pickWeakKeyTargetedCards(cards, weak, CARDS_PER_LESSON_MAX, random);
      }
    }
    return pickBalancedCards(cards, random);
  })();
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/programmingBasicsTargets.test.ts -t "弱键靶向接入"`
Expected: PASS（2 tests）

- [ ] **Step 5: 全量回归 + typecheck**

Run: `bun test tests/programmingBasicsTargets.test.ts`（整文件绿）
Run: `bun run typecheck`
Run: `bun test`（确认无新增失败，对照 baseline 836 pass / 5 预存 fail）

- [ ] **Step 6: commit**

```bash
git add src/training/programmingBasicsTargets.ts tests/programmingBasicsTargets.test.ts
git commit -m "feat(training): 阶段3-3 符号专项接入弱键靶向选材(有弱键偏重/无弱键回退均衡)"
```

---

## 验证清单（全部任务后）

- [ ] 符号专项有弱符号/数字键时偏重含弱键的真实卡（统计验证）。
- [ ] 无弱键/无记录时行为不变（回退 `pickBalancedCards`）。
- [ ] 绝不改写卡内容（只筛选，pickWeakKeyTargetedCards 返回原卡对象）。
- [ ] 真实语境层（句子/文章/完整 code）选材**未改动**。
- [ ] 字母弱键不污染符号专项靶向（`symbolWeakKeyWeights` 滤掉 a-zA-Z）。
- [ ] typecheck 通过；全量测试无新增失败。

## 已知风险（实测再调，本阶段不预先优化）

- **form 偏斜**：纯弱键加权可能让 value/statement/block 分布偏移（如全 statement、无 value），影响 `symbolsNumbersText` 的高亮分层。缓解：保底权重 1 + value 卡（日期/IP 含数字）在数字键弱时也会入选。Task 3 Step 2 的「组装正常」测试兜底；若实测怪卷，下一刀按 form 分层加权。
- **跨天重复**：靶向会让含弱键的卡更常出现（这是预期），与 ADR-0002 跨天去重的张力由卡池规模（每语言 ~400 卡）+ 保底随机缓解。
