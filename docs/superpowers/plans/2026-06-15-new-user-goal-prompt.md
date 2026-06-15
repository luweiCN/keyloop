# 新手目标弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首次/无目标时弹一个轻量目标引导弹窗，目标达成或过期后温和提醒设新目标；是个有状态的提醒系统而非一次性 onboarding。

**Architecture:** 核心是纯函数 `shouldShowGoalPrompt(preferences, formSpeeds, now)` 决定弹/不弹及场景。新增 `goal_onboarding` route（覆盖 main_menu 的 modal），3 个用途大方向映射到代表 form。`runApp` 启动判定后注入初始 route，弹窗操作经既有 `preferencesFromAppState` 回流落盘。

**Tech Stack:** TypeScript + bun（测试 `bun test`，类型检查 `bun run typecheck`）。OpenTUI 渲染框架（既有 route/reducer/renderer 范式）。

参考 spec：`docs/superpowers/specs/2026-06-15-new-user-goal-prompt-design.md`

---

## 文件结构

- `src/domain/model.ts` — UserPreferences 加 2 字段；`defaultUserPreferences`/`parseUserPreferences` 兜底（:209/:524/:796）
- `src/training/goalPrompt.ts`（新）— `GOAL_DIRECTIONS` 方向表 + `shouldShowGoalPrompt` 纯函数
- `src/ui/opentui/appModel.ts` — `goal_onboarding` route 类型 + `createOpenTuiGoalOnboardingState` + `OpenTuiStateOptions` 加字段
- `src/ui/opentui/goalOnboardingReducer.ts`（新）— `reduceGoalOnboardingKey`
- `src/ui/opentui/appSession.ts` — 路由 switch 加 `goal_onboarding` case（:241）
- `src/ui/opentui/routeLines.ts` — `goalOnboardingLines` 渲染文案
- `src/cli.ts` — runApp 启动判定注入初始 route（:303/:325）；`preferencesFromAppState` 回流新字段（:584）；state options 注入（:352/:783）

---

## Task 1: UserPreferences 数据模型与兜底

**Files:**
- Modify: `src/domain/model.ts` (UserPreferences :209, parseUserPreferences :524, defaultUserPreferences :796)
- Test: `tests/preferences.test.ts`（若不存在则新建）

- [ ] **Step 1: 写失败测试**

在 `tests/preferences.test.ts` 加（文件不存在则新建并 import）：

```ts
import { describe, expect, test } from "bun:test";
import { parseUserPreferences, defaultUserPreferences } from "../src/domain/model";

describe("goal prompt preferences", () => {
  test("defaults opted_out to false and last_shown undefined", () => {
    const prefs = defaultUserPreferences();
    expect(prefs.goal_prompt_opted_out).toBe(false);
    expect(prefs.goal_prompt_last_shown).toBeUndefined();
  });

  test("parse fills missing goal-prompt fields from old file", () => {
    const parsed = parseUserPreferences({ interface_language: "zh" });
    expect(parsed.goal_prompt_opted_out).toBe(false);
    expect(parsed.goal_prompt_last_shown).toBeUndefined();
  });

  test("parse preserves stored goal-prompt fields", () => {
    const parsed = parseUserPreferences({
      goal_prompt_opted_out: true,
      goal_prompt_last_shown: "2026-06-10",
    });
    expect(parsed.goal_prompt_opted_out).toBe(true);
    expect(parsed.goal_prompt_last_shown).toBe("2026-06-10");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/preferences.test.ts`
Expected: FAIL（`goal_prompt_opted_out` 为 undefined / 字段不存在）

- [ ] **Step 3: 实现**

`src/domain/model.ts` 的 `UserPreferences` interface（:209 块内，`main_goal?` 旁）加：

```ts
  /** 新手目标弹窗：用户明确"不再用目标模式"后永久不弹 */
  goal_prompt_opted_out: boolean;
  /** 新手目标弹窗：上次提醒日期(YYYY-MM-DD)，控制达成后再提醒间隔；缺失=从未提醒 */
  goal_prompt_last_shown?: string | undefined;
```

`defaultUserPreferences()`（:796 返回的对象里）加：`goal_prompt_opted_out: false,`

`parseUserPreferences()`（:524）在构造返回对象处加兜底（沿用该函数既有逐字段读取风格；`value` 已是解析对象，用可选读取）：

```ts
    goal_prompt_opted_out:
      typeof (value as { goal_prompt_opted_out?: unknown }).goal_prompt_opted_out === "boolean"
        ? (value as { goal_prompt_opted_out: boolean }).goal_prompt_opted_out
        : false,
    ...(typeof (value as { goal_prompt_last_shown?: unknown }).goal_prompt_last_shown === "string"
      ? { goal_prompt_last_shown: (value as { goal_prompt_last_shown: string }).goal_prompt_last_shown }
      : {}),
```

> 注：若 `parseUserPreferences` 内部用的是其它读取 helper（如 `readBoolean`/`readString`），改用同款 helper 保持一致。先读该函数现有实现再落笔。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/preferences.test.ts && bun run typecheck`
Expected: PASS，tsc 无 error

- [ ] **Step 5: 提交**

```bash
git add src/domain/model.ts tests/preferences.test.ts
git commit -m "feat(training): UserPreferences 加目标弹窗状态字段（批次4·#1）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: shouldShowGoalPrompt 纯函数

**Files:**
- Create: `src/training/goalPrompt.ts`
- Test: `tests/goalPrompt.test.ts`

- [ ] **Step 1: 写失败测试（穷举状态机）**

`tests/goalPrompt.test.ts`：

```ts
import { describe, expect, test } from "bun:test";
import { shouldShowGoalPrompt, GOAL_DIRECTIONS } from "../src/training/goalPrompt";
import type { UserPreferences, MainGoal } from "../src/domain/model";
import type { FormSpeed } from "../src/training/diagnosis";

const NOW = new Date("2026-06-15T00:00:00Z");

function prefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return { goal_prompt_opted_out: false, ...overrides } as UserPreferences;
}
function goal(overrides: Partial<MainGoal> = {}): MainGoal {
  return { form: "code", target_wpm: 60, deadline: "2026-09-13", created_at: "2026-06-15", ...overrides };
}
function speed(form: MainGoal["form"], wpm: number | null): FormSpeed {
  return { form, samples: 5, ewma_wpm: wpm };
}

describe("shouldShowGoalPrompt", () => {
  test("no goal -> welcome", () => {
    expect(shouldShowGoalPrompt(prefs(), [], NOW)).toEqual({ show: true, scenario: "welcome" });
  });
  test("opted out -> not shown", () => {
    expect(shouldShowGoalPrompt(prefs({ goal_prompt_opted_out: true }), [], NOW).show).toBe(false);
  });
  test("goal in progress (not reached, not expired) -> not shown", () => {
    const p = prefs({ main_goal: goal({ target_wpm: 60, deadline: "2026-09-13" }) });
    expect(shouldShowGoalPrompt(p, [speed("code", 40)], NOW).show).toBe(false);
  });
  test("goal reached by speed -> achieved", () => {
    const p = prefs({ main_goal: goal({ target_wpm: 60 }) });
    expect(shouldShowGoalPrompt(p, [speed("code", 65)], NOW)).toEqual({ show: true, scenario: "achieved" });
  });
  test("goal expired -> achieved", () => {
    const p = prefs({ main_goal: goal({ deadline: "2026-06-01" }) });
    expect(shouldShowGoalPrompt(p, [speed("code", 10)], NOW).scenario).toBe("achieved");
  });
  test("achieved but last_shown within 7 days -> not shown", () => {
    const p = prefs({ main_goal: goal({ deadline: "2026-06-01" }), goal_prompt_last_shown: "2026-06-10" });
    expect(shouldShowGoalPrompt(p, [], NOW).show).toBe(false);
  });
  test("achieved and last_shown >=7 days ago -> achieved", () => {
    const p = prefs({ main_goal: goal({ deadline: "2026-06-01" }), goal_prompt_last_shown: "2026-06-01" });
    expect(shouldShowGoalPrompt(p, [], NOW).scenario).toBe("achieved");
  });
  test("GOAL_DIRECTIONS maps usage to forms", () => {
    expect(GOAL_DIRECTIONS.map((d) => d.form)).toEqual(["articles", "code", "keys"]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/goalPrompt.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/training/goalPrompt.ts`：

```ts
import type { MainGoal, UserPreferences } from "../domain/model";
import type { FormSpeed } from "./diagnosis";
import type { TrainingForm } from "../domain/model";

/** 新手弹窗的 3 个用途大方向 → 代表 form（处方据此加权侧重） */
export const GOAL_DIRECTIONS = [
  { key: "everyday", form: "articles" as TrainingForm, zh: "普通打字", en: "Everyday typing" },
  { key: "code", form: "code" as TrainingForm, zh: "打代码", en: "Coding" },
  { key: "foundation", form: "keys" as TrainingForm, zh: "键位基础", en: "Key basics" },
] as const;

const REPROMPT_DAYS = 7;
const DAY_MS = 86_400_000;

export type GoalPromptDecision =
  | { show: false }
  | { show: true; scenario: "welcome" | "achieved" };

export function shouldShowGoalPrompt(
  preferences: UserPreferences,
  formSpeeds: FormSpeed[],
  now: Date,
): GoalPromptDecision {
  if (preferences.goal_prompt_opted_out) {
    return { show: false };
  }
  const goal = preferences.main_goal;
  if (goal === undefined) {
    return { show: true, scenario: "welcome" };
  }
  if (!goalAchievedOrExpired(goal, formSpeeds, now)) {
    return { show: false };
  }
  if (daysSince(preferences.goal_prompt_last_shown, now) < REPROMPT_DAYS) {
    return { show: false };
  }
  return { show: true, scenario: "achieved" };
}

function goalAchievedOrExpired(goal: MainGoal, formSpeeds: FormSpeed[], now: Date): boolean {
  const speed = formSpeeds.find((item) => item.form === goal.form)?.ewma_wpm ?? 0;
  return speed >= goal.target_wpm || now.getTime() > Date.parse(goal.deadline);
}

function daysSince(date: string | undefined, now: Date): number {
  if (date === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return (now.getTime() - Date.parse(date)) / DAY_MS;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/goalPrompt.test.ts && bun run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/training/goalPrompt.ts tests/goalPrompt.test.ts
git commit -m "feat(training): shouldShowGoalPrompt 触发状态机 + 方向映射（批次4·#1）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: goal_onboarding route 类型与 createState

**Files:**
- Modify: `src/ui/opentui/appModel.ts`（OpenTuiRoute 联合类型；OpenTuiStateOptions :183；createState）
- Test: `tests/opentuiApp.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/opentuiApp.test.ts` 加（顶部 import 补 `createOpenTuiGoalOnboardingState`）：

```ts
  test("createOpenTuiGoalOnboardingState builds welcome route", () => {
    const state = createOpenTuiGoalOnboardingState("zh", { scenario: "welcome" });
    expect(state.route.screen).toBe("goal_onboarding");
    if (state.route.screen !== "goal_onboarding") throw new Error("expected goal_onboarding");
    expect(state.route.scenario).toBe("welcome");
    expect(state.route.selected_direction_index).toBe(0);
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/opentuiApp.test.ts -t "createOpenTuiGoalOnboardingState"`
Expected: FAIL（函数不存在）

- [ ] **Step 3: 实现**

`src/ui/opentui/appModel.ts` 的 `OpenTuiRoute` 联合类型加一支（紧邻 `screen: "summary"` 那支）：

```ts
  | {
      screen: "goal_onboarding";
      scenario: "welcome" | "achieved";
      selected_direction_index: number;   // 0..2
      achieved_goal?: MainGoal;
    }
```

加 options interface + createState（放在 `createOpenTuiSummaryState` 附近）：

```ts
export interface OpenTuiGoalOnboardingStateOptions extends OpenTuiStateOptions {
  scenario: "welcome" | "achieved";
  achievedGoal?: MainGoal;
}

export function createOpenTuiGoalOnboardingState(
  language: Language,
  options: OpenTuiGoalOnboardingStateOptions,
): OpenTuiAppState {
  const route: OpenTuiRoute = {
    screen: "goal_onboarding",
    scenario: options.scenario,
    selected_direction_index: 0,
  };
  if (options.achievedGoal !== undefined) {
    route.achieved_goal = options.achievedGoal;
  }
  return appState(language, route, options);
}
```

确保 `createOpenTuiGoalOnboardingState` 经 `src/index.ts`（或 appModel 的 re-export）导出，供测试与 cli 使用（与 `createOpenTuiSummaryState` 同样的导出路径）。

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/opentuiApp.test.ts -t "createOpenTuiGoalOnboardingState" && bun run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/ui/opentui/appModel.ts src/index.ts tests/opentuiApp.test.ts
git commit -m "feat(training): goal_onboarding route 类型与 createState（批次4·#1）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 弹窗渲染

**Files:**
- Modify: `src/ui/opentui/routeLines.ts`（route title :74 区；route lines :142 区；新增 `goalOnboardingLines`）
- Test: `tests/opentuiRenderer.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/opentuiRenderer.test.ts` 加（import 补 `createOpenTuiGoalOnboardingState`）：

```ts
  test("goal onboarding welcome renders directions and actions", async () => {
    const kit = fakeKit();
    const state = createOpenTuiGoalOnboardingState("zh", { scenario: "welcome" });
    await renderOpenTuiAppOnce(state, kit);
    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("普通打字");
    expect(content).toContain("打代码");
    expect(content).toContain("键位基础");
    expect(content).toContain("不再提醒");
  });

  test("goal onboarding achieved renders old goal form", async () => {
    const kit = fakeKit();
    const state = createOpenTuiGoalOnboardingState("zh", {
      scenario: "achieved",
      achievedGoal: { form: "code", target_wpm: 60, deadline: "2026-06-01", created_at: "2026-03-01" },
    });
    await renderOpenTuiAppOnce(state, kit);
    expect(flattenContent(kit.addedNodes)).toContain("代码");
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/opentuiRenderer.test.ts -t "goal onboarding"`
Expected: FAIL（route 未渲染对应内容）

- [ ] **Step 3: 实现**

`src/ui/opentui/routeLines.ts`：

route title switch（:74 `case "summary"` 旁）加：
```ts
    case "goal_onboarding":
      return state.language === "zh" ? "训练目标" : "Training goal";
```

route lines switch（:142 `case "summary"` 旁）加：
```ts
    case "goal_onboarding":
      return goalOnboardingLines(state.route, state.language);
```

新增函数（用既有 `formLabel` + `GOAL_DIRECTIONS`，import 之）：
```ts
import { GOAL_DIRECTIONS } from "../../training/goalPrompt";

export function goalOnboardingLines(
  route: Extract<OpenTuiRoute, { screen: "goal_onboarding" }>,
  language: Language,
): string[] {
  const zh = language === "zh";
  const dirs = GOAL_DIRECTIONS.map((d, i) =>
    i === route.selected_direction_index ? `‹ ${zh ? d.zh : d.en} ›` : zh ? d.zh : d.en,
  );
  const header =
    route.scenario === "welcome"
      ? zh
        ? "设个训练目标，让练习更有方向？系统会按目标调整每日训练侧重。"
        : "Set a training goal to focus your practice. The plan adapts to it."
      : zh
        ? `目标达成 🎉 你的「${formLabel(route.achieved_goal!.form, language)}」目标已完成，设个新目标继续？`
        : `Goal done 🎉 Your "${formLabel(route.achieved_goal!.form, language)}" goal is complete. Set a new one?`;
  return [
    header,
    (zh ? "主要想练：" : "I mainly want: ") + dirs.join(zh ? " · " : " · "),
    zh ? "Enter 设为目标   S 先跳过   N 不再提醒" : "Enter set goal   S skip   N stop reminding",
  ];
}
```

> 若该 route 需要专门的 screen 渲染器（像 running/summary 那样在 `screens/` 下），按既有 modal（如 exit_confirmation）渲染路径接入；否则 routeLines 文案 + 既有 panel 渲染即可。先看 summary route 的渲染落点，照搬。

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/opentuiRenderer.test.ts -t "goal onboarding" && bun run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/ui/opentui/routeLines.ts tests/opentuiRenderer.test.ts
git commit -m "feat(training): 目标弹窗渲染 welcome/achieved 双场景（批次4·#1）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 弹窗交互 reducer

**Files:**
- Create: `src/ui/opentui/goalOnboardingReducer.ts`
- Modify: `src/ui/opentui/appSession.ts`（路由 switch :241 加 case）
- Test: `tests/opentuiApp.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/opentuiApp.test.ts` 加（import 补 `reduceGoalOnboardingKey`；构造按键事件参考文件内既有 `isSelectEvent` 用法/其它 reducer 测试的 event 形状）：

```ts
  test("goal onboarding arrow cycles direction, enter sets mapped goal", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const welcome = createOpenTuiGoalOnboardingState("zh", { scenario: "welcome" });
    // → 切到 index 1（打代码）
    const right = reduceGoalOnboardingKey(welcome, { name: "right", sequence: "right" } as never, now);
    if (right.state.route.screen !== "goal_onboarding") throw new Error("stay");
    expect(right.state.route.selected_direction_index).toBe(1);
    // Enter 设目标 → main_menu + mainGoal.form === "code"
    const enter = reduceGoalOnboardingKey(right.state, { name: "return", sequence: "\r" } as never, now);
    expect(enter.state.route.screen).toBe("main_menu");
    expect(enter.state.mainGoal?.form).toBe("code");
    expect(enter.state.mainGoal?.target_wpm).toBeGreaterThan(0);
  });

  test("goal onboarding N opts out, S skips", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const welcome = createOpenTuiGoalOnboardingState("zh", { scenario: "welcome" });
    const opted = reduceGoalOnboardingKey(welcome, { name: "n", sequence: "n" } as never, now);
    expect(opted.state.route.screen).toBe("main_menu");
    expect(opted.state.goalPromptOptedOut).toBe(true);

    const skipped = reduceGoalOnboardingKey(welcome, { name: "s", sequence: "s" } as never, now);
    expect(skipped.state.route.screen).toBe("main_menu");
    expect(skipped.state.goalPromptOptedOut).toBeFalsy();
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/opentuiApp.test.ts -t "goal onboarding arrow"`
Expected: FAIL（reducer 不存在）

- [ ] **Step 3: 实现**

先在 `appModel.ts` 的 `OpenTuiStateOptions`（:183）与状态字段加（与 mainGoal 并列）：
```ts
  goalPromptOptedOut?: boolean;
  goalPromptLastShown?: string;
```
并在 createState 注入处（:1118 mainGoal 旁）补：
```ts
  if (options.goalPromptOptedOut !== undefined) state.goalPromptOptedOut = options.goalPromptOptedOut;
  if (options.goalPromptLastShown !== undefined) state.goalPromptLastShown = options.goalPromptLastShown;
```
（`OpenTuiAppState` 顶层也加这两个可选字段，与 `mainGoal` 同级。）

新建 `src/ui/opentui/goalOnboardingReducer.ts`：

```ts
import { GOAL_DIRECTIONS } from "../../training/goalPrompt";
import { GOAL_WPM_BASELINE } from "../../training/goalPlan";
import type { MainGoal } from "../../domain/model";
import {
  mainMenuState,
  type OpenTuiAppState,
  type OpenTuiKeyEvent,
} from "./appModel";

const GOAL_DAY_MS = 86_400_000;

export interface GoalOnboardingResult {
  state: OpenTuiAppState;
}

export function reduceGoalOnboardingKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  now: Date,
): GoalOnboardingResult {
  if (state.route.screen !== "goal_onboarding") {
    return { state };
  }
  const route = state.route;
  const name = event.name.toLowerCase();

  if (name === "left" || name === "right") {
    const delta = name === "left" ? -1 : 1;
    const next = (route.selected_direction_index + delta + GOAL_DIRECTIONS.length) % GOAL_DIRECTIONS.length;
    return { state: { ...state, route: { ...route, selected_direction_index: next } } };
  }
  if (name === "return" || name === "enter" || event.sequence === "\r") {
    const dir = GOAL_DIRECTIONS[route.selected_direction_index]!;
    const goal: MainGoal = {
      form: dir.form,
      target_wpm: GOAL_WPM_BASELINE[dir.form],
      deadline: new Date(now.getTime() + 90 * GOAL_DAY_MS).toISOString().slice(0, 10),
      created_at: now.toISOString(),
    };
    return { state: toMenu({ ...state, mainGoal: goal, goalPromptLastShown: today(now) }) };
  }
  if (name === "n") {
    return { state: toMenu({ ...state, goalPromptOptedOut: true }) };
  }
  if (name === "s") {
    // 达成场景跳过写 last_shown(7天静默)；welcome 场景不写
    const patch = route.scenario === "achieved" ? { goalPromptLastShown: today(now) } : {};
    return { state: toMenu({ ...state, ...patch }) };
  }
  return { state };
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function toMenu(state: OpenTuiAppState): OpenTuiAppState {
  return mainMenuState(state);
}
```

> `mainMenuState`：复用 appModel 里产生 `{ screen: "main_menu", selected_index: 0 }` 的现有 helper；若无同名 helper，直接 `{ ...state, route: { screen: "main_menu", selected_index: 0 } }`。先 grep `screen: "main_menu"` 确认既有构造方式并复用。
> `OpenTuiKeyEvent` 类型从 appModel/renderer 既有导出取（与其它 reducer 一致）。

`appSession.ts` 路由 switch（:241，`case "stage_plan"` 旁）加：
```ts
    case "goal_onboarding": {
      const result = reduceGoalOnboardingKey(state, event, context.now ?? new Date());
      return { state: result.state, action: "continue" };
    }
```
（`context.now` 若 OpenTuiAppSessionContext 无 now，则用 `new Date()`；保持与既有 time 注入一致——先查 context 是否带 now。）

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/opentuiApp.test.ts -t "goal onboarding" && bun run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/ui/opentui/goalOnboardingReducer.ts src/ui/opentui/appSession.ts src/ui/opentui/appModel.ts tests/opentuiApp.test.ts
git commit -m "feat(training): 目标弹窗交互 reducer（设目标/跳过/不再提醒）（批次4·#1）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: preferences 回流落盘

**Files:**
- Modify: `src/cli.ts`（`preferencesFromAppState` :469-595 区，state options 注入 :352/:783）
- Test: `tests/cli` 相关或 `tests/preferences.test.ts`（视既有 preferencesFromAppState 是否已测）

- [ ] **Step 1: 写失败测试**

若 `preferencesFromAppState` 未导出/未测，则改为在集成 Task 7 一并验证；否则加单测：构造一个带 `goalPromptOptedOut:true` 的 state，断言 `preferencesFromAppState` 返回的 preferences `goal_prompt_opted_out === true`。先 grep `preferencesFromAppState` 是否 export，决定测试落点。示例（若可导出）：

```ts
// 断言：state.goalPromptOptedOut=true -> next.goal_prompt_opted_out=true
// state.goalPromptLastShown="2026-06-15" -> next.goal_prompt_last_shown="2026-06-15"
```

- [ ] **Step 2: 运行确认失败**

Run: 对应测试命令
Expected: FAIL（回流未处理新字段）

- [ ] **Step 3: 实现**

`preferencesFromAppState`（cli.ts，:584 mainGoal 回流块旁）加：

```ts
  if (state.goalPromptOptedOut !== undefined && state.goalPromptOptedOut !== preferences.goal_prompt_opted_out) {
    next.goal_prompt_opted_out = state.goalPromptOptedOut;
    changed = true;
  }
  if (state.goalPromptLastShown !== undefined && state.goalPromptLastShown !== preferences.goal_prompt_last_shown) {
    next.goal_prompt_last_shown = state.goalPromptLastShown;
    changed = true;
  }
```

state options 注入（:352 与 :783，`mainGoal` 旁）补：
```ts
      goalPromptOptedOut: preferences.goal_prompt_opted_out,
      ...(preferences.goal_prompt_last_shown === undefined ? {} : { goalPromptLastShown: preferences.goal_prompt_last_shown }),
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test tests/preferences.test.ts && bun run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/cli.ts tests/preferences.test.ts
git commit -m "feat(training): 目标弹窗状态回流落盘 preferences（批次4·#1）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: runApp 启动判定集成

**Files:**
- Modify: `src/cli.ts`（runApp :303-325，初始 route 注入）
- Test: `tests/opentuiStartRunner.test.ts` 或 cli 集成测试（视既有 runApp 可测性）

- [ ] **Step 1: 写失败测试**

优先单元验证「初始 route 选择」逻辑。若 runApp 难直接测，抽一个小纯函数 `initialRouteForStartup(preferences, formSpeeds, now, language)` 返回 `OpenTuiAppState | undefined`，在 runApp 调用它。测试：

```ts
import { initialRouteForStartup } from "../src/cli";
test("new user (no goal) starts on goal_onboarding welcome", () => {
  const prefs = defaultUserPreferences();
  const state = initialRouteForStartup(prefs, [], new Date("2026-06-15"), "zh");
  expect(state?.route.screen).toBe("goal_onboarding");
});
test("opted-out user starts with no forced route", () => {
  const prefs = { ...defaultUserPreferences(), goal_prompt_opted_out: true };
  expect(initialRouteForStartup(prefs, [], new Date("2026-06-15"), "zh")).toBeUndefined();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test -t "starts on goal_onboarding"`
Expected: FAIL（函数不存在）

- [ ] **Step 3: 实现**

`src/cli.ts` 加并导出：
```ts
export function initialRouteForStartup(
  preferences: UserPreferences,
  formSpeeds: FormSpeed[],
  now: Date,
  language: Language,
): OpenTuiAppState | undefined {
  const decision = shouldShowGoalPrompt(preferences, formSpeeds, now);
  if (!decision.show) return undefined;
  return createOpenTuiGoalOnboardingState(language, {
    scenario: decision.scenario,
    ...(decision.scenario === "achieved" && preferences.main_goal !== undefined
      ? { achievedGoal: preferences.main_goal }
      : {}),
  });
}
```

runApp 中（:325 `let initialState` 之后、进入 `for` 循环前）：
```ts
  const startupNow = new Date();
  const startupProfile = buildSkillProfile(records, buildPlan(records, language, startupNow), startupNow);
  initialState = initialRouteForStartup(preferences, startupProfile.form_speeds, startupNow, language);
```
> import `buildSkillProfile`（diagnosis）、`buildPlan`（plan）、`shouldShowGoalPrompt`（goalPrompt）、`createOpenTuiGoalOnboardingState`（appModel）、类型 `FormSpeed`。确认 `buildSkillProfile`/`buildPlan` 签名（前文 targets/diagnosis 已有调用样例，照搬参数）。

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `bun test && bun run typecheck`
Expected: 新测试 PASS；既有测试除 pre-existing 的 `content/corpus-v4/scripts/collect_*_v4.test.ts`（模块路径问题，与本功能无关）外全绿。

- [ ] **Step 5: 提交**

```bash
git add src/cli.ts tests/
git commit -m "feat(training): runApp 启动判定注入目标弹窗（批次4·#1 完成）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review 结果

- **Spec 覆盖**：§1 状态机→Task2；§2 数据模型→Task1/6；§3 route/UI→Task3/4；§4 交互→Task5；§5 集成→Task7。全覆盖。
- **达成判定**：用 `FormSpeed.ewma_wpm`（Task2），与 spec「该 form 近期均速」一致。
- **方向映射**：`GOAL_DIRECTIONS`（articles/code/keys）在 Task2 定义，Task4/5 复用，命名一致。
- **回流字段名**：`goalPromptOptedOut`/`goalPromptLastShown`（state）↔ `goal_prompt_opted_out`/`goal_prompt_last_shown`（preferences），Task1/5/6 一致。
- **风险点（执行时先确认再落笔，plan 已标注）**：`parseUserPreferences` 既有读取 helper 风格；`mainMenuState` helper 是否存在；`OpenTuiKeyEvent`/`context.now` 来源；`preferencesFromAppState` 可测性；`buildSkillProfile`/`buildPlan` 签名。
