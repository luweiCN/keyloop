# 阶段五：统一信号（安全清理）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐任务实现。步骤用 checkbox(`- [ ]`)跟踪。

**Goal:** 把基础键位钻头选择从旧的 `plan.focus_keys` 统一到 per-key `weakKeyWeights`（带降级），并删除已死的 `SkillProfile.focus` 信号。**不碰**有行为风险的点（moduleHasCurrentFocus 模块序列、everydayMix、codeMix 排序、处方权重——这些留阶段六/暂缓）。

**Architecture:** Task1 抽 `foundationDrillFocusKeys(context)` 纯函数（有 per-key 弱键用之、否则降级 focus_keys），`weightedFoundationDrillId` 调它，复用阶段二 `weakKeyWeights`。Task2 删 `SkillProfile.focus`/`FocusPools`/`focusPools`（生产 0 读取的死信号）+ 同步 6 个测试文件。

**Tech Stack:** TypeScript, bun test, TDD。

**用户决策（2026-06-25）:** 只做安全清理，阶段六调参（WEAK_WEIGHT 1.5→1.2 等）暂缓——属拍参数，需真实体感再调。

---

## Task 1: 基础键位钻头信号统一到 per-key

**Files:** Modify `src/training/targets.ts`、Test `tests/stageTargets.test.ts`

`weightedFoundationDrillId`（targets.ts:879）当前用 `context.plan.focus_keys` 经 `foundationDrillFocusWeights` 映射钻头区域。改为：有 per-key 弱键 → 用 `weakKeyWeights` 的键；无（冷启动）→ 降级 `focus_keys`。`foundationDrillFocusWeights`（键→区域映射）本身不变。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/stageTargets.test.ts —— 复用已 import 的 weakKeyWeights？没有则测新导出函数
import { foundationDrillFocusKeys } from "../src/training/targets";
import { defaultSessionRecord, type KeyEventRecord } from "../src/index";

// keysAt helper：若该测试文件没有则加（见 wordTargeting.test.ts 同款）
function keysAt(key: string, count: number, startMs: number, intervalMs: number, correct = true): KeyEventRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    at_ms: startMs + i * intervalMs, action: "insert" as const, position: i,
    expected: key, input: correct ? key : "?", correct,
  }));
}

describe("foundationDrillFocusKeys（基础键位信号统一）", () => {
  test("有 per-key 弱键时用 weakKeyWeights 的键（不再用 focus_keys）", () => {
    const fast = ["a", "e", "t", "o", "i", "n"].flatMap((k, idx) => keysAt(k, 6, idx * 20_000, 100));
    const slowW = keysAt("w", 8, 200_000, 600, false); // w 又慢又错 → 弱键
    const records = [defaultSessionRecord({ key_events: [...fast, ...slowW] })];
    const ctx = { records, plan: { focus_keys: ["z"] } } as unknown as BuildTargetContext;
    const keys = foundationDrillFocusKeys(ctx);
    expect(keys).toContain("w"); // 来自 per-key 弱键
    expect(keys).not.toContain("z"); // 不再用 plan.focus_keys
  });

  test("无记录（冷启动）降级到 plan.focus_keys", () => {
    const ctx = { records: [], plan: { focus_keys: ["z", "q"] } } as unknown as BuildTargetContext;
    expect(foundationDrillFocusKeys(ctx)).toEqual(["z", "q"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/stageTargets.test.ts -t "基础键位信号统一"`
Expected: FAIL（`foundationDrillFocusKeys` not exported）

- [ ] **Step 3: 实现**

`targets.ts` 顶部确认已 import `weakKeyWeights`（阶段二已加；没有则补 `import { weakKeyWeights } from "./wordTargeting";`）。在 `weightedFoundationDrillId` 前加：

```typescript
/**
 * 基础键位钻头的「弱键来源」：统一到 per-key 账本——有击键数据用 weakKeyWeights 的弱键，
 * 无（冷启动）降级到 plan.focus_keys（旧聚合快照）。消除基础键位的旧 focus_keys 专用信号。
 */
export function foundationDrillFocusKeys(context: BuildTargetContext): string[] {
  const weak = weakKeyWeights(context.records ?? []);
  return weak.size > 0 ? [...weak.keys()] : context.plan.focus_keys;
}
```

把 `weightedFoundationDrillId`（line 890）的：
```typescript
  const focusWeights = foundationDrillFocusWeights(context.plan.focus_keys);
```
改为：
```typescript
  const focusWeights = foundationDrillFocusWeights(foundationDrillFocusKeys(context));
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/stageTargets.test.ts -t "基础键位信号统一"`
Expected: PASS（2 tests）

- [ ] **Step 5: 回归 + typecheck + commit**

Run: `bun test tests/stageTargets.test.ts`（整文件绿）
Run: `bun run typecheck`
```bash
git add src/training/targets.ts tests/stageTargets.test.ts
git commit -m "feat(training): 基础键位钻头信号统一到per-key弱键(带降级)(阶段5-1)"
```

---

## Task 2: 删除死信号 `SkillProfile.focus`

**Files:** Modify `src/training/diagnosis.ts`、`src/domain/model.ts`(若 SkillProfile 在此)、Test `tests/diagnosis.test.ts` + `tests/{wordTargeting,stageTargets,goalPlan,prescription}.test.ts`

`SkillProfile.focus`（FocusPools: words/code/chars）生产于 `buildSkillProfile`（diagnosis.ts:463 `focus: focusPools(...)`）但**生产代码 0 读取**（已 grep 核实）。是 ADR-0002 废弃的弱标识符回流 + 死 chars。删之。

- [ ] **Step 1: 先确认 SkillProfile / FocusPools 定义位置**

Run: `grep -rn "interface SkillProfile\|interface FocusPools\|focus: FocusPools" src/training/diagnosis.ts src/domain/model.ts`
记录确切行号与字段。

- [ ] **Step 2: 改测试为「不再有 focus」（先让测试反映目标）**

`tests/diagnosis.test.ts:305-309` 删掉对 `profile.focus.*` 的 3 条断言：
```typescript
    // 删除这三行（focus 已废弃，不再产出）：
    // expect(profile.focus.words).toEqual([]);
    // expect(profile.focus.code).toContain("useEffect");
    // expect(profile.focus.code).not.toContain("algorithm");
    // expect(profile.focus.chars).toEqual(expect.arrayContaining(["b", ";"]));
```
（若该 test 仅为验证 focus，整 test 删除；若还验证别的，只删 focus 行。实现时读上下文判断。）

其余 5 处 SkillProfile 构造删 `focus` 字段：
- `tests/wordTargeting.test.ts:129` 删 `focus: { words: [], code: [], chars: [] },`
- `tests/stageTargets.test.ts:154` 删 `focus: { words: [], code: [], chars: [], ...overrides },`（注意 `...overrides` 若仅用于 focus 需一并清理；读上下文）
- `tests/stageTargets.test.ts:810` 删 `focus: { words: [], code: [], chars: [] },`
- `tests/goalPlan.test.ts:82` 删 `focus: { words: [], code: [], chars: [] },`
- `tests/prescription.test.ts:48` 删 `focus: { words: [], code: [], chars: [] },`

- [ ] **Step 3: 跑测试确认失败**

Run: `bun test tests/diagnosis.test.ts`
Expected: 编译/运行错误——`focus` 仍在 SkillProfile 类型里、buildSkillProfile 仍产出，但测试构造已无 focus（或反之类型不匹配）。这是 red：类型与测试不一致，需删生产侧。

- [ ] **Step 4: 删生产侧 focus**

`diagnosis.ts`：
1. 删 `FocusPools` interface（264-271）。
2. 删 `SkillProfile.focus` 字段（276，确认在 diagnosis.ts 还是 model.ts）。
3. 删 `focusPools` 函数（产生 words/code/chars 的整个函数）。
4. `buildSkillProfile`（463）删 `focus: focusPools(records, plan),` 这一行。
5. 删 focusPools 用到但别处不用的 helper（如 `FOCUS_CODE_LIMIT`、`topEntries` 若仅 focusPools 用——grep 确认后再删，别误删共用的）。

- [ ] **Step 5: 跑测试确认通过 + 全量回归**

Run: `bun test tests/diagnosis.test.ts`
Expected: PASS
Run: `bun run typecheck`（确认无残留 focus 引用）
Run: `bun test`（全量，对照 baseline：新增 Task1 的 2 个测试，5 fail/3 error 预存不变）

- [ ] **Step 6: commit**

```bash
git add src/training/diagnosis.ts src/domain/model.ts tests/
git commit -m "refactor(training): 删除死信号 SkillProfile.focus(0消费,ADR-0002废弃回流)(阶段5-2)"
```

---

## 验证清单（全部任务后）

- [ ] 基础键位钻头有击键数据时用 per-key 弱键、冷启动降级 focus_keys。
- [ ] `SkillProfile.focus`/`FocusPools`/`focusPools` 全删，无残留引用（typecheck 通过）。
- [ ] `plan.focus_keys` 字段**保留**（moduleHasCurrentFocus 仍用，阶段五不碰）。
- [ ] 未碰 moduleHasCurrentFocus / everydayMix / codeMix 排序 / 处方权重（阶段六/暂缓）。
- [ ] 全量测试无新增失败。

## 边界与风险

- **foundationDrill 行为变化**：弱键来源从「错误/慢键 top8 静态快照」变为「per-key confidence<某基线的弱键」，钻头分布可能不同。带降级（冷启动用 focus_keys）缓解。风险低（基础键位钻头只影响 keys 形态的练哪个区域，不改内容正确性）。
- **删 focus 的连带**：`focusPools` 内部读 `plan.focus_keys/focus_symbols`（产生 chars）；删 focusPools 不影响 plan.focus_*（plan.ts 独立产生）。`topEntries`/`FOCUS_CODE_LIMIT` 若被别处共用**勿删**——Step 4.5 grep 确认。
- **不做阶段六**：处方权重 1.5→1.2、codeMix focus_code 升级、moduleHasCurrentFocus 升级均**暂缓**——拍参数需真实体感，且会改训练手感。
