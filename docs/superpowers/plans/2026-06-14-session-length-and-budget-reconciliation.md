# 综合训练「按时长组卷 + 料量对账」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户每次进综合训练能选"这次练多久",系统按该时长组卷,且组出的料量与时长名副其实(消除预估失真)。

**Architecture:** 四个改动,自底向上:① 在 `prescription.ts` 加 `charBudget` 的逆运算 `estimatedMinutesFromChars`;② `targets.ts` 的 `stageLessonFromPlan` 用它按真实 target 字符回算 `estimated_minutes`(替掉照抄配额);③ `codeMixTarget` 按 `char_budget` 累加完整片段、不再硬凑 5 片;④ 诊断屏(`stage_plan`)把 `←→` 微调升级成 10/20/30/45 时长档位、顶部诚实显示真实计划分钟。

**Tech Stack:** TypeScript + Bun(`bun test tests`),OpenTUI。纯函数逻辑走单测,UI 接线走 `bun run smoke:plan` + 手动 TUI 验证。

---

## 文件结构

| 文件 | 职责 | 改动 |
|------|------|------|
| `src/training/prescription.ts` | 时长/预算策略 | 加 `formWpm`(内部)、`estimatedMinutesFromChars`(导出)、`SESSION_LENGTH_PRESETS`/`snapToPreset`/`cyclePreset`(导出) |
| `src/training/targets.ts` | 组卷 | `stageLessonFromPlan` 回算 `estimated_minutes`;`codeMixTarget` 按预算控片数 |
| `src/ui/opentui/appModel.ts` | 诊断屏状态 | `comprehensiveStagePlanState` 默认 snap 到档位;`adjustStagePlanMinutes` 改档位切换 |
| `src/ui/opentui/appSession.ts` | 键处理 | `←→` 传方向(±1)而非 ±5 |
| `src/ui/opentui/routeLines.ts` | 诊断屏渲染 | 顶部显示真实计划分钟 + 档位条 |
| `tests/prescription.test.ts` | | `estimatedMinutesFromChars`、`snapToPreset`、`cyclePreset` 单测 |
| `tests/stageTargets.test.ts` | | 回算 + 代码控片数测试 |

---

## Task 1: `estimatedMinutesFromChars`（charBudget 的逆运算）

**Files:**
- Modify: `src/training/prescription.ts:175-183`
- Test: `tests/prescription.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/prescription.test.ts` 末尾追加(文件已 `import { describe, expect, test } from "bun:test"`,并已从 `../src/training/prescription` import 其它符号——把 `estimatedMinutesFromChars` 加进同一条 import;`FormSpeed` 从 `../src/training/diagnosis` import):

```ts
import { estimatedMinutesFromChars } from "../src/training/prescription";
import type { FormSpeed } from "../src/training/diagnosis";

describe("estimatedMinutesFromChars", () => {
  test("inverts charBudget at the measured speed", () => {
    const speeds: FormSpeed[] = [{ form: "code", samples: 10, ewma_wpm: 40 }];
    // 40 wpm × 5 = 200 字符/分；600 字符 ≈ 3 分
    expect(estimatedMinutesFromChars(600, "code", speeds)).toBe(3);
  });

  test("falls back to cold-start wpm when the form has no samples", () => {
    // code 冷启动 14 × 0.8 = 11.2 wpm × 5 = 56 字符/分；560 字符 ≈ 10 分
    expect(estimatedMinutesFromChars(560, "code", [])).toBe(10);
  });

  test("never returns below 1 minute", () => {
    expect(estimatedMinutesFromChars(0, "words", [])).toBe(1);
    expect(estimatedMinutesFromChars(5, "words", [])).toBe(1);
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/prescription.test.ts -t "estimatedMinutesFromChars"`
Expected: FAIL —— `estimatedMinutesFromChars` 未导出/未定义。

- [ ] **Step 3: 重构 `charBudget` 提取 `formWpm`,新增逆函数**

在 `src/training/prescription.ts` 把现有 `charBudget`(175-183)替换为:

```ts
/** 形态速度解析：实测 EWMA 优先，冷启动回退到保守默认 × 折扣 */
function formWpm(form: TrainingForm, speeds: FormSpeed[]): number {
  const measured = speeds.find((item) => item.form === form)?.ewma_wpm ?? null;
  return measured ?? FORM_FALLBACK_WPM[form] * COLD_START_DISCOUNT;
}

export function charBudget(
  form: TrainingForm,
  minutes: number,
  speeds: FormSpeed[],
): number {
  return Math.round(minutes * formWpm(form, speeds) * 5);
}

/** charBudget 的逆运算：一段已生成语料按形态速度估算实际练习分钟（≥1） */
export function estimatedMinutesFromChars(
  chars: number,
  form: TrainingForm,
  speeds: FormSpeed[],
): number {
  if (chars <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(chars / (formWpm(form, speeds) * 5)));
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `bun test tests/prescription.test.ts`
Expected: PASS(新 3 个 + 原有全部)。

- [ ] **Step 5: typecheck + 提交**

```bash
bun run typecheck && git add src/training/prescription.ts tests/prescription.test.ts && git commit -m "feat(training): add estimatedMinutesFromChars (inverse of charBudget)"
```

---

## Task 2: `stageLessonFromPlan` 按真实字符回算 `estimated_minutes`

**Files:**
- Modify: `src/training/targets.ts:45`(import)、`:642-668`(`stageLessonFromPlan`)
- Test: `tests/stageTargets.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/stageTargets.test.ts` 追加(文件已有 `stageContext()`、`buildDailyPracticePlan`;新增两条 import):

```ts
import { estimatedMinutesFromChars } from "../src/training/prescription";
import { formForCategory } from "../src/training/diagnosis";

test("comprehensive lesson estimated_minutes is recomputed from real target chars, not the quota", () => {
  // records 为空 → profile.form_speeds 为空 → 回算用冷启动 wpm
  const plan = buildDailyPracticePlan(stageContext(), { targetMinutesOverride: 20 });
  expect(plan.lessons.length).toBeGreaterThan(0);
  for (const lesson of plan.lessons) {
    const form = formForCategory(lesson.category);
    if (form === null) {
      continue;
    }
    const chars = [...lesson.target.text].length;
    expect(lesson.estimated_minutes).toBe(estimatedMinutesFromChars(chars, form, []));
  }
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/stageTargets.test.ts -t "recomputed from real target chars"`
Expected: FAIL —— `estimated_minutes` 仍是 `stage.minutes`(配额),与按字符回算的值不等。

- [ ] **Step 3: 接入回算**

`src/training/targets.ts` 第 45 行的 import 改为同时引入逆函数:

```ts
import {
  buildDailyPrescription,
  charBudget,
  estimatedMinutesFromChars,
  type StagePlan,
} from "./prescription";
```

把 `stageLessonFromPlan`(642-668)替换为(先出料、再按真实字符回算):

```ts
function stageLessonFromPlan(
  context: BuildTargetContext,
  profile: SkillProfile,
  stage: StagePlan,
  index: number,
): PracticeLesson {
  const target = buildStageTarget(context, {
    stage,
    profile,
    ...(context.enabledModules === undefined
      ? {}
      : { enabledModules: context.enabledModules }),
    ...(context.customLibraries === undefined
      ? {}
      : { customLibraries: context.customLibraries }),
  });
  return {
    id: `stage:${stage.form}:${index + 1}`,
    kind: stageLessonKind(stage.form),
    module: stageLessonModule(stage.form),
    category: stageLessonCategory(stage.form),
    mix_profile: "comprehensive",
    estimated_minutes: estimatedMinutesFromChars(
      [...target.text].length,
      stage.form,
      profile.form_speeds,
    ),
    target,
    reason_zh: stage.reason_zh,
    reason_en: stage.reason_en,
  };
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `bun test tests/stageTargets.test.ts`
Expected: PASS。

- [ ] **Step 5: 跑全量 + 提交**

```bash
bun run typecheck && bun test tests && git add src/training/targets.ts tests/stageTargets.test.ts && git commit -m "fix(training): recompute stage estimated_minutes from real target chars"
```

注:此步会让若干旧测试中"`estimated_minutes` 等于配额"的断言失效——若有,改成对照 `estimatedMinutesFromChars`,这是预期的行为修正。

---

## Task 3: 代码阶段按 `char_budget` 控片数（保持完整合约）

**Files:**
- Modify: `src/training/targets.ts:1605-1646`(`codeMixTarget`)、`:2633-2640`(code 分支)、新增 `selectSnippetsWithinBudget`
- Test: `tests/stageTargets.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/stageTargets.test.ts` 追加(复用文件内 `stageContext()` / `emptyProfile()`;`stageLibrary()` 的 `code_snippets` 是 5 个 block,每个约 45 字符):

```ts
test("code stage caps snippet load by char budget and keeps whole snippets", () => {
  const target = buildStageTarget(stageContext(), {
    stage: { form: "code", char_budget: 90 },
    profile: emptyProfile(),
  });
  const chars = [...target.text].length;
  // 至少 1 片；累加到接近预算即停；总量不超 budget × 1.3
  expect(target.code_blocks?.length).toBeGreaterThanOrEqual(1);
  expect(chars).toBeLessThanOrEqual(Math.round(90 * 1.3));
  // 每片完整：code_blocks 的行数之和 + 片间空行 == 文本行数（没有被截断）
  const blockLines = (target.code_blocks ?? []).reduce((sum, b) => sum + b.line_count, 0);
  const gaps = Math.max((target.code_blocks?.length ?? 0) - 1, 0);
  expect(blockLines + gaps).toBe(target.text.split("\n").length);
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/stageTargets.test.ts -t "caps snippet load by char budget"`
Expected: FAIL —— 现在 code 分支用 `clamp(round(budget/180),1,5)`,budget=90 算出 1 片但不按累加截断;且 `char_budget` 未传入 `codeMixTarget`。

- [ ] **Step 3: 实现按预算累加**

在 `src/training/targets.ts` 顶部常量区(`STAGE_CHARS_PER_SNIPPET` 附近,约 2616 行)加:

```ts
/** 代码阶段防御性硬上限：再大的预算也不超这么多片 */
const STAGE_CODE_MAX_SNIPPETS = 8;
/** 最后一片完整保留可略超预算，但总量不超 budget × 此容差 */
const STAGE_CODE_BUDGET_TOLERANCE = 1.3;
```

把 code 分支(2633-2640)替换为:

```ts
    case "code":
      return codeMixTarget(context, undefined, options.stage.char_budget);
  }
}
```

`codeMixTarget`(1605)签名加第三参 `charBudget`,并在格式化后按预算截取。替换 1605-1646:

```ts
function codeMixTarget(
  context: BuildTargetContext,
  count?: number,
  charBudget?: number,
): PracticeTarget {
  const codeConfig = context.codeConfig ?? {};
  const excludedTexts = usedCodeSnippetTexts(context.records);
  const difficulty = codeDifficultyForContext(context);
  // 按预算控量时多抽候选再截取；否则沿用固定 count
  const targetCount =
    charBudget !== undefined
      ? STAGE_CODE_MAX_SNIPPETS
      : count ?? ((context.localCodeSnippets?.length ?? 0) > 0 ? 3 : 4);
  const localSnippets =
    context.localCodeSnippets === undefined
      ? []
      : pickCodeSnippetsExcludingByDifficulty(
          context.localCodeSnippets,
          context.plan.focus_code,
          codeConfig,
          targetCount,
          excludedTexts,
          difficulty,
        );
  for (const snippet of localSnippets) {
    excludedTexts.add(snippet.text);
  }
  const builtinSnippets = pickLibraryCodeSnippetsExcludingByDifficulty(
    context.library,
    context.plan.focus_code,
    codeConfig,
    Math.max(0, targetCount - localSnippets.length),
    excludedTexts,
    difficulty,
    codePickerOptions(context.random),
  );
  const formatted = formatCodeSnippetsForContext(
    [...localSnippets, ...builtinSnippets],
    context,
  );
  const snippets =
    charBudget === undefined
      ? formatted
      : selectSnippetsWithinBudget(formatted, charBudget);
  const source = codeMixSource(
    context.localCodeSource,
    context.localCodeScanError,
    localSnippets.length,
    snippets.length,
  );
  return {
    mode: "code",
    text: snippets.map((snippet) => snippet.text).join("\n\n"),
    source,
    code_blocks: codeBlocksFromSnippets(snippets),
  };
}

/** 按字符预算累加完整片段：至少 1 片，每片完整不切碎，总量不超 budget × 容差 */
function selectSnippetsWithinBudget(
  snippets: CodeSnippet[],
  charBudget: number,
): CodeSnippet[] {
  const picked: CodeSnippet[] = [];
  let chars = 0;
  for (const snippet of snippets) {
    const length = [...snippet.text].length;
    if (picked.length >= 1 && chars + length > charBudget * STAGE_CODE_BUDGET_TOLERANCE) {
      break;
    }
    picked.push(snippet);
    chars += length;
    if (chars >= charBudget) {
      break;
    }
  }
  return picked;
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `bun test tests/stageTargets.test.ts`
Expected: PASS。

- [ ] **Step 5: 跑全量 + 提交**

```bash
bun run typecheck && bun test tests && git add src/training/targets.ts tests/stageTargets.test.ts && git commit -m "fix(training): bound code stage snippets by char budget, keep whole contracts"
```

---

## Task 4: 诊断屏顶部显示真实计划分钟

**Files:**
- Modify: `src/ui/opentui/routeLines.ts:382-401`(`stagePlanLines`)
- Test: `tests/stageTargets.test.ts`(纯函数) + `bun run smoke:plan`

- [ ] **Step 1: 写失败测试**

`stagePlanLines` 是模块内函数,先把"计划总分钟"抽成导出纯函数再测。在 `tests/stageTargets.test.ts` 追加:

```ts
import { comprehensivePlanMinutes } from "../src/ui/opentui/routeLines";

test("comprehensivePlanMinutes sums lesson estimated_minutes (honest plan time)", () => {
  const plan = buildDailyPracticePlan(stageContext(), { targetMinutesOverride: 20 });
  const expected = plan.lessons.reduce((sum, l) => sum + l.estimated_minutes, 0);
  expect(comprehensivePlanMinutes(plan)).toBe(expected);
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/stageTargets.test.ts -t "comprehensivePlanMinutes"`
Expected: FAIL —— `comprehensivePlanMinutes` 未导出。

- [ ] **Step 3: 实现 + 接入顶部行**

在 `src/ui/opentui/routeLines.ts` 顶部(import 之后)加导出纯函数:

```ts
/** 本次综合训练的真实计划分钟 = 各阶段回算后 estimated_minutes 之和 */
export function comprehensivePlanMinutes(plan: DailyPracticePlan): number {
  return plan.lessons.reduce((sum, lesson) => sum + lesson.estimated_minutes, 0);
}
```

把 `stagePlanLines` 里 397-401 的总览行替换为(用真实总和、并标出选定档位):

```ts
  const completedMinutes = Math.round(plan.completed_ms / 60_000);
  const planMinutes = comprehensivePlanMinutes(plan);
  lines.push(
    zh
      ? `今日计划: ${plan.lessons.length} 个阶段，本次约 ${planMinutes} 分钟（选定 ${plan.target_minutes} 分 · 今日已练 ${completedMinutes} 分钟）`
      : `Plan: ${plan.lessons.length} stages, ~${planMinutes} min this run (target ${plan.target_minutes} · done today: ${completedMinutes} min)`,
  );
```

- [ ] **Step 4: 运行,确认通过**

Run: `bun test tests/stageTargets.test.ts && bun run smoke:plan`
Expected: PASS;smoke 退出码 0。

- [ ] **Step 5: 提交**

```bash
bun run typecheck && git add src/ui/opentui/routeLines.ts tests/stageTargets.test.ts && git commit -m "feat(ui): show honest plan minutes (sum of recomputed estimates) on stage_plan"
```

---

## Task 5: 时长档位选择（10/20/30/45）

**Files:**
- Modify: `src/training/prescription.ts`(新增档位常量与工具)、`src/ui/opentui/appModel.ts:1422-1475`、`src/ui/opentui/appSession.ts:335-337`、`src/ui/opentui/routeLines.ts`(档位条)
- Test: `tests/prescription.test.ts`(纯函数) + `bun run smoke:plan` + 手动 TUI

- [ ] **Step 1: 写失败测试(纯函数)**

在 `tests/prescription.test.ts` 追加:

```ts
import {
  SESSION_LENGTH_PRESETS,
  snapToPreset,
  cyclePreset,
} from "../src/training/prescription";

describe("session length presets", () => {
  test("presets are 10/20/30/45", () => {
    expect(SESSION_LENGTH_PRESETS).toEqual([10, 20, 30, 45]);
  });

  test("snapToPreset picks the nearest preset", () => {
    expect(snapToPreset(12)).toBe(10);
    expect(snapToPreset(16)).toBe(20);
    expect(snapToPreset(23)).toBe(20);
    expect(snapToPreset(38)).toBe(45);
    expect(snapToPreset(100)).toBe(45);
    expect(snapToPreset(3)).toBe(10);
  });

  test("cyclePreset moves to the adjacent preset and clamps at ends", () => {
    expect(cyclePreset(20, 1)).toBe(30);
    expect(cyclePreset(20, -1)).toBe(10);
    expect(cyclePreset(10, -1)).toBe(10); // 已在最低档
    expect(cyclePreset(45, 1)).toBe(45); // 已在最高档
    expect(cyclePreset(23, 1)).toBe(30); // 非档位值先归最近档再移动
    expect(cyclePreset(23, -1)).toBe(10);
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/prescription.test.ts -t "session length presets"`
Expected: FAIL —— 三个符号未导出。

- [ ] **Step 3: 实现档位工具**

在 `src/training/prescription.ts`(常量区,`MAX_OVERRIDE_MINUTES` 附近)加:

```ts
/** 单次综合训练的时长档位（分钟） */
export const SESSION_LENGTH_PRESETS = [10, 20, 30, 45] as const;

/** 取最接近的档位（用于把推荐值/旧值落到档位上） */
export function snapToPreset(minutes: number): number {
  return SESSION_LENGTH_PRESETS.reduce((best, preset) =>
    Math.abs(preset - minutes) < Math.abs(best - minutes) ? preset : best,
  );
}

/** 切换到相邻档位；direction: -1 上一档 / +1 下一档；两端 clamp */
export function cyclePreset(current: number, direction: -1 | 1): number {
  const snapped = snapToPreset(current);
  const index = SESSION_LENGTH_PRESETS.indexOf(snapped as (typeof SESSION_LENGTH_PRESETS)[number]);
  const next = clamp(index + direction, 0, SESSION_LENGTH_PRESETS.length - 1);
  return SESSION_LENGTH_PRESETS[next];
}
```

- [ ] **Step 4: 运行纯函数测试,确认通过**

Run: `bun test tests/prescription.test.ts`
Expected: PASS。

- [ ] **Step 5: 默认 snap 到档位 + ←→ 切档**

`src/ui/opentui/appModel.ts`:在 `comprehensiveStagePlanState`(1422)里,把无 override 时的默认时长 snap 到最接近推荐值的档位。先确保已 import:

```ts
import {
  recommendedDailyMinutes,
  snapToPreset,
  cyclePreset,
} from "../../training/prescription";
```

把 1427-1435 的 plan 构建改为:

```ts
  // 无显式选择时：默认落到"最接近推荐值"的档位（首次/手动调时长都重新生成）
  const profile = buildSkillProfile(
    effectiveContext.records,
    effectiveContext.plan,
    effectiveContext.now,
  );
  const defaultMinutes = snapToPreset(recommendedDailyMinutes(profile));
  const storedPlan =
    targetMinutesOverride === undefined ? effectiveContext.todayDailyPlan : undefined;
  const plan =
    storedPlan ??
    buildDailyPracticePlan(effectiveContext, {
      targetMinutesOverride: targetMinutesOverride ?? defaultMinutes,
    });
```

(删除原 1436-1440 重复的 `const profile = buildSkillProfile(...)`,上移到此处复用。)

把 `adjustStagePlanMinutes`(1458)的 `deltaMinutes` 语义从"加减分钟"改为"切档方向":

```ts
/** 诊断屏上按 ←/→ 切换时长档位 */
export function adjustStagePlanMinutes(
  state: OpenTuiAppState,
  context: BuildTargetContext,
  direction: -1 | 1,
): OpenTuiAppState {
  if (state.route.screen !== "stage_plan") {
    return state;
  }
  if (state.route.plan.run_id.length > 0) {
    return state;
  }
  return comprehensiveStagePlanState(
    state,
    buildTargetContextForState(state, context),
    cyclePreset(state.route.plan.target_minutes, direction),
  );
}
```

`src/ui/opentui/appSession.ts`:把 336 行的 `delta = ... ? -5 : 5` 改为方向:

```ts
  if (isStagePlanLeftEvent(event) || isStagePlanRightEvent(event)) {
    const direction = isStagePlanLeftEvent(event) ? -1 : 1;
    return { state: adjustStagePlanMinutes(state, context, direction), action: "continue" };
  }
```

- [ ] **Step 6: 渲染档位条**

`src/ui/opentui/routeLines.ts`:在 `stagePlanLines` 的总览行之后(Task 4 改过的那段后面)插入档位条,高亮当前档。先在文件顶部 import:

```ts
import { SESSION_LENGTH_PRESETS } from "../../training/prescription";
```

在 `stagePlanLines` 里 `lines.push("")`(约 409)之前插入:

```ts
  const current = plan.target_minutes;
  const presets = SESSION_LENGTH_PRESETS.map((m) =>
    m === current ? `[${m}]` : ` ${m} `,
  ).join(" ");
  lines.push(zh ? `时长档位: ${presets}  (←/→ 切换)` : `Length: ${presets}  (←/→)`);
```

- [ ] **Step 7: 验证(纯函数 + smoke + 手动)**

Run: `bun run typecheck && bun test tests && bun run smoke:plan`
Expected: 全 PASS;smoke 退出码 0。

手动 TUI(可选但建议):`bun run keyloop` → 进综合训练 → 确认顶部出现档位条、`←/→` 在 10/20/30/45 间切换、默认高亮最接近推荐值的档、`Enter` 按选定时长开练。

- [ ] **Step 8: 提交**

```bash
git add src/training/prescription.ts src/ui/opentui/appModel.ts src/ui/opentui/appSession.ts src/ui/opentui/routeLines.ts tests/prescription.test.ts && git commit -m "feat(ui): session length presets (10/20/30/45) on stage_plan diagnosis screen"
```

---

## Self-Review

**Spec 覆盖:**
- §3.1 时长档位选择 → Task 5 ✓
- §3.2 顶部诚实显示(本次计划 W = 回算总和) → Task 4 ✓(显示 `planMinutes` + 选定档位)
- §3.3.1 回算 `estimated_minutes` → Task 1(逆函数)+ Task 2(接入)✓
- §3.3.2 代码按预算控片数 → Task 3 ✓
- §3.4 数据流 → 由 Task 2/3 在 `buildDailyPracticePlan → stageLessonFromPlan → buildStageTarget` 链上落地 ✓
- §5 容差 1.3× → Task 3 `STAGE_CODE_BUDGET_TOLERANCE` ✓;料封顶导致 W < 选定档位 → Task 4 显示真实 W、保留选定档位 ✓

**占位扫描:** 无 TBD/TODO;每步含完整代码与确切命令。

**类型一致:** `estimatedMinutesFromChars(chars, form, speeds)` 在 Task 1 定义、Task 2 调用,签名一致;`adjustStagePlanMinutes` 第三参由"分钟 delta"改为 `-1 | 1` 方向,Task 5 同步改了 `appSession.ts` 调用点;`cyclePreset`/`snapToPreset`/`SESSION_LENGTH_PRESETS` 在 Task 5 定义并在 `appModel.ts`/`routeLines.ts` 引用,名称一致。

**已知风险(spec §5 已记):** 词/符号料封顶时本次计划 W 可能 < 选定档位——这是诚实显示,非 bug;扩料补偿留作后续。

---

## 关联

- Spec: `docs/superpowers/specs/2026-06-14-comprehensive-training-session-length-design.md`
- 分支: `feat/session-length-budget-reconciliation`
- 后续独立需求 B:目标驱动训练计划(WPM 目标 + 学习曲线预测),A 落地后单独 brainstorm。
