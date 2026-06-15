# 新手目标弹窗设计（需求 #1）

日期：2026-06-15
分支：feature/training-ux-0615
状态：已与用户确认，待写实现计划

## 背景与目标

KeyLoop 当前**无 first-run 检测**：`UserPreferences` 无首次标志，启动恒进 `main_menu`。目标驱动训练（`main_goal`）已实现（settings 里配置 form/target_wpm/deadline），但新用户不知道有这个能力，也没有引导。

需求 #1：首次/无目标时弹一个轻量弹窗，引导用户设定训练目标（或明确选择不用目标模式）；目标达成或过期后温和提醒设新目标。**不是一次性 onboarding，而是一个有状态的提醒系统。**

非目标（YAGNI）：不做多步向导、不做功能巡览、不改既有 settings 目标配置 UI。

## 1. 触发状态机

核心是一个**纯函数**，无副作用，便于穷举 TDD：

```
shouldShowGoalPrompt(preferences, records, now) -> { show: boolean, scenario: "welcome" | "achieved" }

  if preferences.goal_prompt_opted_out        -> { show: false }
  if preferences.main_goal === undefined       -> { show: true, scenario: "welcome" }
  // 有目标：
  achieved = formRecentWpm(records, goal.form) >= goal.target_wpm
             || now > Date.parse(goal.deadline)
  if achieved && daysSince(goal_prompt_last_shown, now) >= REPROMPT_DAYS(=7)
                                               -> { show: true, scenario: "achieved" }
  else                                         -> { show: false }
```

- **达成判定 = 达速或过期任一**：该 form 近期均速 ≥ `target_wpm`（用 `buildSkillProfile(records).form_speeds` 取对应 form 的速度），**或** `now > deadline`。
- **`formRecentWpm`**：复用 `buildSkillProfile` 的 `form_speeds`；某 form 无数据时视为 0（未达成）。
- **"本次会话已弹过"** 不进纯函数：启动时只判定一次，弹窗关闭后进 `main_menu` 不会再回到判定，故本会话天然只弹一次。
- **REPROMPT_DAYS = 7**（达成/过期后的再提醒静默期）。`goal_prompt_last_shown` 缺失时视为很久以前（达成即可弹）。

## 2. 数据模型

`UserPreferences` 新增 2 个字段（向后兼容，加载旧文件时给默认值）：

```ts
goal_prompt_opted_out: boolean;      // 默认 false；"不再提醒" 置 true
goal_prompt_last_shown?: string;     // ISO 日期(YYYY-MM-DD)；控制达成后的 7 天间隔
```

- `defaultPreferences` 补 `goal_prompt_opted_out: false`。
- `loadPreferencesFromPath` 对旧文件缺字段时填默认（沿用既有逐字段兜底模式）。
- 持久化沿用既有 `preferencesFromAppState` → `savePreferencesToPath` 链路。

## 3. 弹窗 UI

新增 route `goal_onboarding`，覆盖式 modal（参考既有 `exit_confirmation`/`code_settings_confirmation` route）。route state：

```ts
{
  screen: "goal_onboarding";
  scenario: "welcome" | "achieved";
  selected_form_index: number;          // 0..5，←/→ 切换
  achieved_goal?: MainGoal;             // achieved 场景用于显示旧目标信息
}
```

**场景 A·无目标（welcome）：**
```
┌─ 欢迎来到 KeyLoop ──────────────────┐
│  设个训练目标，让练习更有方向？      │
│  系统会按目标调整每日训练侧重。      │
│                                     │
│  主要想练：‹ 键位 ›                  │
│   键位 · 单词 · 符号 · 句子 · 文章 · 代码 │
│                                     │
│  Enter 设为目标   S 先跳过   N 不再提醒 │
└─────────────────────────────────────┘
```

**场景 B·达成/过期（achieved）：**
```
┌─ 目标达成 🎉 ───────────────────────┐
│  你的「代码」已达到 60 WPM 目标！    │
│  （过期时改为：目标期限已到）        │
│  设个新目标继续保持？                │
│  主要想练：‹ 代码 ›                  │
│  Enter 设新目标   S 先跳过   N 不再提醒 │
└─────────────────────────────────────┘
```

- 主练方向 = **6 个 form 平铺**，直接复用 `formLabel`（键位/单词/符号/句子/文章/代码），零映射层。
- 中英文双语，沿用现有 route 渲染与 `theme`。

## 4. 交互与持久化

| 键 | 行为 |
|---|---|
| **← / →** | 切换 `selected_form_index`（6 个 form 循环） |
| **Enter** | 用 `MainGoal{ form: 选中, target_wpm: GOAL_WPM_BASELINE[form], deadline: now+90天, created_at: now }` 设目标 → 写 preferences（含 `goal_prompt_last_shown=今天`）→ 进 `main_menu` |
| **S 先跳过** | 进 `main_menu`；**场景 B 额外写 `goal_prompt_last_shown=今天`**（7 天静默），场景 A 不写（下次启动仍温和提醒，直到设目标或永久关闭） |
| **N 不再提醒** | 写 `goal_prompt_opted_out=true` → 进 `main_menu`（永不弹） |

设目标复用 `defaultMainGoal` 的构造逻辑（form 改为选中值，`target_wpm` 取 `GOAL_WPM_BASELINE[form]`）。

## 5. 集成点

`runApp`（`cli.ts:303` 加载 preferences 之后）：
1. 加载当日/全部 records（判定达成需要）。
2. 调 `shouldShowGoalPrompt(preferences, records, now)`。
3. `show` 为真 → 初始 `initialState` 设为 `goal_onboarding` route（带 scenario）；否则照常 `main_menu`。
4. 弹窗的键由 `appSession` 的 reducer 处理（新增 `reduceGoalOnboardingKey`），产出的 preferences 变更经既有 `preferencesFromAppState` 落盘。

## 6. 边界与不变量

- **独立练习/综合训练流程不受影响**：弹窗仅在启动判定，进入任一训练后不再出现。
- **向后兼容**：旧 preferences 文件无新字段 → 默认 `opted_out=false`、`last_shown` 缺失。
- **opted_out 后**：永不弹，但 settings 里目标配置仍可手动开启（不影响既有 settings 路径）。
- **无 records 的全新用户**：`formRecentWpm` 全 0，但场景由"无 main_goal"决定走 welcome，不依赖速度。

## 7. 测试策略（TDD）

**纯函数 `shouldShowGoalPrompt`（穷举）：**
- 无目标 → welcome
- opted_out=true → 不弹
- 有目标·未达速·未过期 → 不弹
- 有目标·达速 → achieved（last_shown 久远）
- 有目标·过期 → achieved
- 有目标·达成但 last_shown <7天 → 不弹
- 有目标·达成且 last_shown ≥7天 → achieved

**reducer `reduceGoalOnboardingKey`：**
- ←/→ 切 form index（循环边界）
- Enter → state 带正确 MainGoal（form/baseline wpm/+90天）+ 路由 main_menu + preferences 变更
- S → main_menu；场景B 写 last_shown，场景A 不写
- N → opted_out=true + main_menu

**渲染（opentuiRenderer）：**
- welcome 场景渲染欢迎文案 + 6 form + 三个操作键
- achieved 场景渲染达成文案 + 旧目标 form/wpm

**集成（cli/appSession）：**
- 无目标的新用户启动 → 初始 route 是 goal_onboarding(welcome)
- opted_out 用户启动 → 初始 route main_menu

## 8. 涉及文件（预估）

- `src/domain/model.ts`：UserPreferences 加 2 字段
- `src/domain/preferences.ts`（或现有默认/加载处）：默认值 + 加载兜底
- `src/training/goalPrompt.ts`（新）：`shouldShowGoalPrompt` 纯函数 + 达成判定
- `src/ui/opentui/appModel.ts`：goal_onboarding route 类型 + createState
- `src/ui/opentui/appSession.ts`：`reduceGoalOnboardingKey`
- `src/ui/opentui/routeLines.ts` / `screens/`：渲染
- `src/cli.ts`：runApp 启动判定 + 初始 route
- 测试：goalPrompt、appModel/appSession、renderer、cli 集成
