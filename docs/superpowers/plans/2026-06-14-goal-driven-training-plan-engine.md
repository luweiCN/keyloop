# 目标驱动训练计划 · 引擎(Plan B-1)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现目标驱动训练的纯逻辑引擎——目标数据结构、进度采集、学习曲线推荐算法、主攻权重——全部可单测,为后续接入(Plan B-2)打底。

**Architecture:** 三个纯函数单元 + 一处处方改动。`MainGoal` 进 `UserPreferences`;`goalProgress.ts` 从 `records` 按主形态算进度量;`goalPlan.ts` 用进度 + `form_speeds` 跑四阶段推荐(冷启动/on_track/unreachable/achieved);`buildDailyPrescription` 加 `mainGoalForm` 主攻权重。本计划不接 UI、不改训练流程入口(那是 B-2)。

**Tech Stack:** TypeScript + Bun(`bun test tests`)。全部纯函数 TDD。

---

## 文件结构

| 文件 | 职责 | 改动 |
|------|------|------|
| `src/domain/model.ts` | 领域类型 | 加 `MainGoal` 接口、`UserPreferences.main_goal?`、`parseMainGoal`、parse/default 接入 |
| `src/training/goalProgress.ts` | 进度采集(新) | `goalProgress(records, form, since)` → 起点/当前 WPM、累积小时、活跃天数 |
| `src/training/goalPlan.ts` | 推荐算法(新) | `recommendGoalPlan(...)` 四阶段 + `GoalRecommendation` + `GOAL_WPM_BASELINE` |
| `src/training/prescription.ts` | 处方 | `PrescriptionInput.mainGoalForm?` + 主攻权重 `GOAL_FORM_WEIGHT` |
| `tests/goalPlan.test.ts` | 测试(新) | `parseMainGoal` / `goalProgress` / `recommendGoalPlan` |
| `tests/prescription.test.ts` | 测试 | 主攻权重 |

**B-2(后续,不在本计划):** 接入 `comprehensiveStagePlanState`(推荐时长→档位默认)、`buildDailyPracticePlan`(穿 `mainGoalForm`)、目标设定 UI、进度展示。

---

## Task 1: `MainGoal` 数据结构 + 解析

**Files:**
- Modify: `src/domain/model.ts`(UserPreferences `:236`、parseUserPreferences `:596`、defaultUserPreferences `:809`)
- Test: `tests/goalPlan.test.ts`(新)

- [ ] **Step 1: 写失败测试**

新建 `tests/goalPlan.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { parseUserPreferences } from "../src/domain/model";

describe("parseMainGoal (via parseUserPreferences)", () => {
  test("parses a valid main_goal", () => {
    const prefs = parseUserPreferences({
      main_goal: {
        form: "code",
        target_wpm: 50,
        deadline: "2026-09-14",
        created_at: "2026-06-14T00:00:00Z",
      },
    });
    expect(prefs.main_goal).toEqual({
      form: "code",
      target_wpm: 50,
      deadline: "2026-09-14",
      created_at: "2026-06-14T00:00:00Z",
    });
  });

  test("returns undefined for missing or invalid goal", () => {
    expect(parseUserPreferences({}).main_goal).toBeUndefined();
    expect(parseUserPreferences({ main_goal: { form: "nope", target_wpm: 50 } }).main_goal).toBeUndefined();
    expect(parseUserPreferences({ main_goal: { form: "code", target_wpm: 0, deadline: "x", created_at: "y" } }).main_goal).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/goalPlan.test.ts -t "parseMainGoal"`
Expected: FAIL —— `prefs.main_goal` 不存在(parse 还没处理)。

- [ ] **Step 3: 实现**

`src/domain/model.ts`:在 `UserPreferences`(`:236` `enabled_modules` 后)加字段:

```ts
  enabled_modules: TrainingModule[];
  /** 目标驱动训练的主目标；undefined = 纯自适应综合训练 */
  main_goal?: MainGoal;
}

export interface MainGoal {
  form: TrainingForm;
  target_wpm: number;
  deadline: string;
  created_at: string;
}
```

文件顶部 import 区加(类型擦除,循环安全):

```ts
import type { TrainingForm } from "../training/diagnosis";
```

在 `parseEnabledModules`(`:607`)附近加解析(复用现有 `numberValue`/`stringValue`/`literalIfPresent`):

```ts
const TRAINING_FORMS = ["keys", "words", "symbols", "sentences", "articles", "code"] as const;

function parseMainGoal(value: unknown): MainGoal | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const object = value as Record<string, unknown>;
  const form = literalIfPresent(object.form, TRAINING_FORMS);
  const targetWpm = numberValue(object.target_wpm, 0);
  const deadline = stringValue(object.deadline, "");
  const createdAt = stringValue(object.created_at, "");
  if (form === undefined || targetWpm <= 0 || deadline === "" || createdAt === "") {
    return undefined;
  }
  return { form, target_wpm: targetWpm, deadline, created_at: createdAt };
}
```

在 `parseUserPreferences` 返回对象(`:596` `enabled_modules` 行后)加:

```ts
    enabled_modules: parseEnabledModules(object.enabled_modules),
    main_goal: parseMainGoal(object.main_goal),
  };
```

`defaultUserPreferences` 无需改(可选字段默认 `undefined`,`...overrides` 可覆盖)。

- [ ] **Step 4: 运行,确认通过**

Run: `bun test tests/goalPlan.test.ts`
Expected: PASS。

- [ ] **Step 5: typecheck + 提交**

```bash
bun run typecheck && git add src/domain/model.ts tests/goalPlan.test.ts && git commit -m "feat(domain): add MainGoal to UserPreferences with parsing"
```

注:若 typecheck 报 `TrainingForm` 循环依赖,把 `import type { TrainingForm }` 确认为 type-only(已是);type-only import 在运行时擦除,不构成真实循环。

---

## Task 2: 进度采集 `goalProgress.ts`

**Files:**
- Create: `src/training/goalProgress.ts`
- Test: `tests/goalPlan.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/goalPlan.test.ts` 追加(import 现有 `SessionRecord` 构造器与新函数):

```ts
import { defaultSessionRecord } from "../src/domain/model";
import { goalProgress } from "../src/training/goalProgress";

function codeRecord(day: string, correct: number, activeMs: number) {
  return defaultSessionRecord({
    started_at: `${day}T08:00:00Z`,
    category: "code_mix",
    active_ms: activeMs,
    char_stats: { correct, incorrect: 0, extra: 0, missed: 0 },
  });
}

describe("goalProgress", () => {
  test("computes start/current wpm, cumulative hours, active days for the goal form", () => {
    const records = [
      codeRecord("2026-06-14", 300, 60_000), // 300/5 / 1min = 60 wpm? -> 60 ; active 1min
      codeRecord("2026-06-15", 360, 60_000), // 72 wpm
      codeRecord("2026-06-16", 420, 120_000), // 420/5 / 2min = 42 wpm
    ];
    const p = goalProgress(records, "code", "2026-06-14T00:00:00Z");
    expect(p.active_days).toBe(3);
    expect(p.cum_hours).toBeCloseTo((60_000 + 60_000 + 120_000) / 3_600_000, 5);
    expect(p.start_wpm).toBeCloseTo(60, 1);
    expect(p.current_wpm).toBeCloseTo(42, 1);
  });

  test("filters out other forms and sessions before 'since'", () => {
    const records = [
      codeRecord("2026-06-10", 300, 60_000), // before since
      defaultSessionRecord({ started_at: "2026-06-15T08:00:00Z", category: "everyday_words", active_ms: 60_000, char_stats: { correct: 500, incorrect: 0, extra: 0, missed: 0 } }),
    ];
    const p = goalProgress(records, "code", "2026-06-14T00:00:00Z");
    expect(p.active_days).toBe(0);
    expect(p.cum_hours).toBe(0);
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/goalPlan.test.ts -t "goalProgress"`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

新建 `src/training/goalProgress.ts`:

```ts
import type { SessionRecord } from "../domain/model";
import { formForCategory, type TrainingForm } from "./diagnosis";

export interface GoalProgress {
  /** 目标创建后该形态最早一次的 WPM(学习曲线起点) */
  start_wpm: number;
  /** 最近一次的 WPM(form_speeds 无样本时的兜底) */
  current_wpm: number;
  /** 该形态累积练习小时 */
  cum_hours: number;
  /** 该形态有练习的不同自然日数 */
  active_days: number;
}

function sessionWpm(record: SessionRecord): number {
  const minutes = record.active_ms / 60_000;
  return minutes > 0 ? record.char_stats.correct / 5 / minutes : 0;
}

export function goalProgress(
  records: SessionRecord[],
  form: TrainingForm,
  since: string,
): GoalProgress {
  const relevant = records
    .filter(
      (record) =>
        formForCategory(record.category) === form &&
        record.started_at >= since &&
        record.active_ms > 0,
    )
    .sort((left, right) => left.started_at.localeCompare(right.started_at));
  if (relevant.length === 0) {
    return { start_wpm: 0, current_wpm: 0, cum_hours: 0, active_days: 0 };
  }
  const cumHours = relevant.reduce((sum, record) => sum + record.active_ms, 0) / 3_600_000;
  const activeDays = new Set(relevant.map((record) => record.started_at.slice(0, 10))).size;
  return {
    start_wpm: sessionWpm(relevant[0]!),
    current_wpm: sessionWpm(relevant[relevant.length - 1]!),
    cum_hours: cumHours,
    active_days: activeDays,
  };
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `bun test tests/goalPlan.test.ts`
Expected: PASS。

- [ ] **Step 5: typecheck + 提交**

```bash
bun run typecheck && git add src/training/goalProgress.ts tests/goalPlan.test.ts && git commit -m "feat(training): goalProgress collects per-form WPM progress"
```

---

## Task 3: 推荐算法 `goalPlan.ts`

**Files:**
- Create: `src/training/goalPlan.ts`
- Test: `tests/goalPlan.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/goalPlan.test.ts` 追加(构造 ≥7 活跃天的 records + profile):

```ts
import { recommendGoalPlan } from "../src/training/goalPlan";
import type { SkillProfile } from "../src/training/diagnosis";

function profileWithCodeWpm(wpm: number | null): SkillProfile {
  return {
    dimensions: [],
    form_speeds: [{ form: "code", samples: 10, ewma_wpm: wpm }],
    focus: { words: [], sentences: [], code: [], chars: [] },
    daily_active_minutes_7d: 0,
    generated_at: "2026-06-21T00:00:00Z",
  };
}

function sevenDayCodeRecords(startWpm: number, endWpm: number) {
  // 7 天，每天 active 30min；首末 WPM 控制 start/current
  const days = ["14", "15", "16", "17", "18", "19", "20"];
  return days.map((d, i) => {
    const wpm = i === 0 ? startWpm : i === days.length - 1 ? endWpm : (startWpm + endWpm) / 2;
    const correct = Math.round(wpm * 5 * 30); // 30 min active
    return defaultSessionRecord({
      started_at: `2026-06-${d}T08:00:00Z`,
      category: "code_mix",
      active_ms: 30 * 60_000,
      char_stats: { correct, incorrect: 0, extra: 0, missed: 0 },
    });
  });
}

const GOAL = { form: "code" as const, target_wpm: 50, deadline: "2026-09-14", created_at: "2026-06-14T00:00:00Z" };
const NOW = new Date("2026-06-21T00:00:00Z");

describe("recommendGoalPlan", () => {
  test("cold start when fewer than 7 active days", () => {
    const records = sevenDayCodeRecords(15, 19).slice(0, 3);
    const rec = recommendGoalPlan(GOAL, records, profileWithCodeWpm(17), NOW, 20);
    expect(rec.phase).toBe("cold_start");
    expect(rec.daily_minutes).toBe(20); // fallback
  });

  test("achieved when current >= target", () => {
    const records = sevenDayCodeRecords(48, 52);
    const rec = recommendGoalPlan(GOAL, records, profileWithCodeWpm(52), NOW, 20);
    expect(rec.phase).toBe("achieved");
  });

  test("on_track returns a clamped daily recommendation and a projected date", () => {
    const records = sevenDayCodeRecords(15, 19);
    const rec = recommendGoalPlan(GOAL, records, profileWithCodeWpm(19), NOW, 20);
    expect(rec.phase).toBe("on_track");
    expect(rec.daily_minutes).toBeGreaterThanOrEqual(10);
    expect(rec.daily_minutes).toBeLessThanOrEqual(60);
    expect(rec.projected_date).toBeDefined();
  });

  test("unreachable when even max daily cannot close the gap", () => {
    // 极慢进步 + 极近期限 → 不可达
    const records = sevenDayCodeRecords(15, 16);
    const soon = { ...GOAL, deadline: "2026-06-28" };
    const rec = recommendGoalPlan(soon, records, profileWithCodeWpm(16), NOW, 20);
    expect(rec.phase).toBe("unreachable");
    expect(rec.projected_wpm_at_deadline).toBeDefined();
    expect(rec.alternatives?.lower_target_wpm).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/goalPlan.test.ts -t "recommendGoalPlan"`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

新建 `src/training/goalPlan.ts`:

```ts
import type { MainGoal, SessionRecord } from "../domain/model";
import type { SkillProfile, TrainingForm } from "./diagnosis";
import { goalProgress } from "./goalProgress";

const COLD_START_DAYS = 7;
const CONSERVATIVE_FACTOR = 1.2;
const DAILY_MIN = 10;
const DAILY_MAX = 60;
const DAY_MS = 86_400_000;

/** 各形态"中位数偏上"推荐目标 WPM(公开打字统计估算,B-2 设目标向导用) */
export const GOAL_WPM_BASELINE: Record<TrainingForm, number> = {
  keys: 45,
  words: 45,
  symbols: 30,
  sentences: 50,
  articles: 50,
  code: 35,
};

export interface GoalRecommendation {
  phase: "cold_start" | "on_track" | "unreachable" | "achieved";
  daily_minutes: number;
  current_wpm: number;
  projected_date?: string;
  projected_wpm_at_deadline?: number;
  alternatives?: {
    extend_deadline_days?: number;
    daily_minutes_to_hit?: number;
    lower_target_wpm?: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function recommendGoalPlan(
  goal: MainGoal,
  records: SessionRecord[],
  profile: SkillProfile,
  now: Date,
  fallbackMinutes: number,
): GoalRecommendation {
  const progress = goalProgress(records, goal.form, goal.created_at);
  const measured = profile.form_speeds.find((item) => item.form === goal.form)?.ewma_wpm ?? null;
  const current_wpm = measured ?? progress.current_wpm;

  if (progress.active_days < COLD_START_DAYS) {
    return { phase: "cold_start", daily_minutes: fallbackMinutes, current_wpm };
  }

  const gap = goal.target_wpm - current_wpm;
  if (gap <= 0) {
    return { phase: "achieved", daily_minutes: DAILY_MIN, current_wpm };
  }

  const wpmPerHour =
    progress.cum_hours > 0 ? (current_wpm - progress.start_wpm) / progress.cum_hours : 0;
  const daysLeft = Math.max(1, Math.ceil((Date.parse(goal.deadline) - now.getTime()) / DAY_MS));

  // 没进步 / 倒退 → 不可达
  if (wpmPerHour <= 0) {
    return {
      phase: "unreachable",
      daily_minutes: DAILY_MAX,
      current_wpm,
      projected_wpm_at_deadline: Math.round(current_wpm),
      alternatives: { lower_target_wpm: Math.round(current_wpm), extend_deadline_days: 30 },
    };
  }

  const hoursNeeded = (gap / wpmPerHour) * CONSERVATIVE_FACTOR;
  const maxReachableHours = (daysLeft * DAILY_MAX) / 60;

  // 练满每日上限也追不上 → 诚实不可达
  if (maxReachableHours * wpmPerHour < gap) {
    const projected = current_wpm + maxReachableHours * wpmPerHour;
    return {
      phase: "unreachable",
      daily_minutes: DAILY_MAX,
      current_wpm,
      projected_wpm_at_deadline: Math.round(projected),
      alternatives: {
        extend_deadline_days: Math.max(0, Math.ceil(hoursNeeded / (DAILY_MAX / 60)) - daysLeft),
        daily_minutes_to_hit: Math.ceil((hoursNeeded / daysLeft) * 60),
        lower_target_wpm: Math.round(projected),
      },
    };
  }

  const daily = clamp(Math.round((hoursNeeded / daysLeft) * 60), DAILY_MIN, DAILY_MAX);
  const daysToFinish = Math.ceil(hoursNeeded / (daily / 60));
  const projected_date = new Date(now.getTime() + daysToFinish * DAY_MS).toISOString().slice(0, 10);
  return { phase: "on_track", daily_minutes: daily, current_wpm, projected_date };
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `bun test tests/goalPlan.test.ts`
Expected: PASS(全部 4 个 phase)。

- [ ] **Step 5: typecheck + 提交**

```bash
bun run typecheck && git add src/training/goalPlan.ts tests/goalPlan.test.ts && git commit -m "feat(training): goal learning-curve recommendation (4 phases, guarded)"
```

---

## Task 4: 主攻权重(`buildDailyPrescription`)

**Files:**
- Modify: `src/training/prescription.ts`(`PrescriptionInput` `:55`、`buildDailyPrescription` `:133`)
- Test: `tests/prescription.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/prescription.test.ts` 追加(文件已有 `buildDailyPrescription`、`profileWith` 等;构造一个所有维度正常的 profile,对比有无 `mainGoalForm` 时 code 形态的分钟):

```ts
test("mainGoalForm gives the goal form a dominant share of distributable minutes", () => {
  const profile = profileWith([], 0); // 无弱项,基线均衡
  const base = { profile, enabledModules: [...ALL_MODULES], records: [], now: new Date("2026-06-14T00:00:00Z"), random: () => 0.99 };
  const withoutGoal = buildDailyPrescription(base);
  const withGoal = buildDailyPrescription({ ...base, mainGoalForm: "code" });
  const codeMinutes = (plan: ReturnType<typeof buildDailyPrescription>) =>
    plan.stages.find((stage) => stage.form === "code")?.minutes ?? 0;
  expect(codeMinutes(withGoal)).toBeGreaterThan(codeMinutes(withoutGoal));
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `bun test tests/prescription.test.ts -t "mainGoalForm"`
Expected: FAIL —— `PrescriptionInput` 无 `mainGoalForm`(typecheck 阻断或 code 分钟相等)。

- [ ] **Step 3: 实现**

`src/training/prescription.ts`:`PrescriptionInput`(`:55`)加字段:

```ts
  /** 覆盖推荐时长（诊断屏手动调整），clamp [10, 60] */
  targetMinutesOverride?: number;
  /** 主目标形态：组卷时给它主攻权重，保证占大头 */
  mainGoalForm?: TrainingForm;
}
```

常量区(`WEAK_WEIGHT` 附近 `:88`)加:

```ts
/** 主目标形态的组卷权重（高于弱项，保证主攻占大头） */
const GOAL_FORM_WEIGHT = 2.5;
```

`buildDailyPrescription` 的 `weighted` 映射(`:133`)改为主目标优先:

```ts
  const weighted = forms.map((form) => ({
    form,
    weight:
      form === input.mainGoalForm
        ? GOAL_FORM_WEIGHT
        : weakForms.has(form)
          ? WEAK_WEIGHT
          : stableForms.has(form)
            ? STABLE_WEIGHT
            : 1,
  }));
```

注:`GOAL_FORM_WEIGHT=2.5` 高于 `WEAK_WEIGHT=1.5`,确保主目标即使非弱项也占大头;主目标形态若不在 `forms`(其模块未启用)则不生效——约定主目标形态对应模块应启用(B-2 设目标时保证)。

- [ ] **Step 4: 运行,确认通过**

Run: `bun test tests/prescription.test.ts -t "mainGoalForm"`
Expected: PASS。

- [ ] **Step 5: 全量 + 提交**

```bash
bun run typecheck && bun test tests && git add src/training/prescription.ts tests/prescription.test.ts && git commit -m "feat(training): main-goal form weight in prescription"
```

---

## Self-Review

**Spec 覆盖(对照 B spec):**
- §3 数据结构 → Task 1 ✓
- §4 进度采集 → Task 2 ✓
- §5 算法(四阶段 + 参数 + 接口) → Task 3 ✓(COLD_START_DAYS/CONSERVATIVE_FACTOR/DAILY_MIN/MAX 一致,phase 四态一致)
- §6 主攻组卷 → Task 4 ✓
- §7 推荐目标值基准 → Task 3 `GOAL_WPM_BASELINE` ✓(设目标向导用,属 B-2)
- §9 集成、§8 进度展示/UI → **Plan B-2**(本计划范围外,已在文件结构标注)

**占位扫描:** 无 TBD/TODO;每步完整代码 + 确切命令。

**类型一致:** `MainGoal`(Task 1)被 Task 3 `recommendGoalPlan` 引用,字段一致(form/target_wpm/deadline/created_at);`GoalProgress`(Task 2)被 Task 3 使用,字段一致(start_wpm/current_wpm/cum_hours/active_days);`recommendGoalPlan` 签名 `(goal, records, profile, now, fallbackMinutes)` 在测试与实现一致;`mainGoalForm`(Task 4)类型 `TrainingForm` 与 `MainGoal.form` 一致。

**注:** Task 3 测试依赖 `defaultSessionRecord` 接受 `started_at/category/active_ms/char_stats` 覆盖——若该构造器字段名不符,按其真实签名调整 fixture(实现时以 `domain/model.ts` 的 `defaultSessionRecord` 为准)。

---

## 关联

- Spec: `docs/superpowers/specs/2026-06-14-goal-driven-training-plan-design.md`
- 分支: `feat/goal-driven-training-plan`
- 后续: **Plan B-2**(集成 + UI):接入 `comprehensiveStagePlanState`(goal 推荐 → 档位默认)、`buildDailyPracticePlan`(穿 `mainGoalForm`)、目标设定向导、进度展示。
