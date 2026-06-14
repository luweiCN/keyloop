# 目标驱动训练计划（需求 B）设计

日期：2026-06-14
状态：已与用户确认设计，spec 待审阅 → 实现

## 1. 背景与动机

很多人练打字漫无目的、不知练到什么程度，难坚持。给一个**明确目标 + 进度感 + "每天该练多久"**能显著提升留存。

需求 B **不是新系统**，是给现有的自适应综合训练（2026-06-13 诊断-处方引擎）+ 时长档位（2026-06-14 需求 A）装三样东西：

- 🎯 **方向盘** — 一个主目标（主形态 WPM + 期限），让综合训练有"主攻方向"
- 📊 **进度仪表盘** — 主目标形态 WPM 朝目标前进
- 🧭 **学习曲线导航** — 按个人进步速率推荐每天该练多久，好按期达成

**核心是借力诊断引擎的强项**：不管用户练什么，系统都能从字符级数据揪出底层薄弱（键位/单词/符号），用各形态组合补强；而这一切瞄准一个主目标。用户只设代码目标，卷子却是综合的；主目标形态练得多是直接推目标，补底层薄弱是间接扫障碍。

## 2. 核心理念

- **单主目标驱动**：用户设一个主形态的 WPM 目标 + 期限。综合训练照常诊断薄弱、各形态组卷、次日针对加强，但整盘棋以主目标为锚。
- **不设目标 = 纯需求 A**：零影响、通用、不强加（与需求 A 的"不设档位偏好=现状"同一哲学）。

## 3. 目标数据结构

`UserPreferences`（`domain/model.ts:205`）新增可选字段：

```ts
main_goal?: {
  form: TrainingForm;      // 主目标形态（如 "code"）
  target_wpm: number;      // 目标 WPM
  deadline: string;        // 期限（ISO 日期）
  created_at: string;      // 创建时间（学习曲线起点）
};
```

单主目标，`undefined` = 没设目标。`parseUserPreferences` / `defaultUserPreferences` 同步处理。

## 4. 进度采集（复用现有）

- **当前 WPM**：`profile.form_speeds` 里主形态的 `ewma_wpm`（现成，`diagnosis.ts:329` `formSpeeds`）。
- **WPM 历史 + 累积练习量**：从 `records`（`SessionRecord[]`）筛 `formForCategory(record.category) === goal.form` 且 `started_at >= goal.created_at` 的会话：
  - 每条 WPM = `char_stats.correct / 5 / (active_ms / 60000)`。
  - 累积练习小时 `cumHours = Σ active_ms / 3_600_000`。
  - 起点 WPM（目标创建附近）vs 当前 WPM → 用于算速率。

## 5. 学习曲线推荐算法（新文件 `src/training/goalPlan.ts`，纯函数）

思路：近期速率 + 持续校准。不假装一次算准，靠校准收敛 + 护栏 + 诚实兜底。

**常量：**
```ts
const COLD_START_DAYS = 7;        // 攒够数据前不精确预测
const CONSERVATIVE_FACTOR = 1.2;  // 外推保守系数（进步会变慢，宁可略多练）
const RECALIBRATE_DAYS = 3;       // 每 3 天用新数据重算
const DAILY_MIN = 10;             // 每日推荐时长护栏
const DAILY_MAX = 60;
```

**四阶段：**

1. **冷启动**（主形态有数据的天数 < `COLD_START_DAYS`）：不精确预测，返回保守起步时长（A 的推荐档 `recommendedDailyMinutes`）+ `phase: "cold_start"`，UI 提示"先练 7 天，摸清进步速度再给精准计划"。

2. **正常推荐**（≥ 7 天）：
   - 速率 `wpmPerHour = (current_wpm - start_wpm) / cumHours`（cumHours > 0；近期窗口见 §11）。
   - 缺口 `gap = target_wpm - current_wpm`；若 `gap <= 0` → 已达成（`phase: "achieved"`）。
   - 需求练习量 `hoursNeeded = gap / wpmPerHour * CONSERVATIVE_FACTOR`。
   - 剩余天数 `daysLeft = max(1, (deadline - now) / 1d)`。
   - 每日时长 `daily = clamp(hoursNeeded / daysLeft * 60, DAILY_MIN, DAILY_MAX)`。
   - 预计达成日 = now + hoursNeeded / (daily/60) 天。
   - 返回 `phase: "on_track"`、`daily_minutes`、`projected_date`、`current_wpm`。

3. **持续校准**：每 `RECALIBRATE_DAYS` 天用最新数据重算 §5.2（速率随幂律变慢 → 自动加时长或提示；超预期 → 减时长 / 提前）。校准是"重新跑一遍 §5.2"，无独立状态。

4. **不可达诚实**：若 `daysLeft * DAILY_MAX/60 * wpmPerHour < gap`（练满上限也追不上）→ `phase: "unreachable"`，返回 `projected_wpm_at_deadline`（= current + daysLeft*DAILY_MAX/60*wpmPerHour）+ 三个选项：延期 / 加量（每日 X 分，可超 DAILY_MAX 提示）/ 调目标（建议降到可达 WPM）。

**接口：**
```ts
interface GoalRecommendation {
  phase: "cold_start" | "on_track" | "unreachable" | "achieved";
  daily_minutes: number;        // 推荐每日主目标导向训练时长
  current_wpm: number;
  projected_date?: string;      // on_track
  projected_wpm_at_deadline?: number;  // unreachable
  alternatives?: { extend_deadline_days?: number; daily_minutes_to_hit?: number; lower_target_wpm?: number };
}
function recommendGoalPlan(goal, records, profile, now): GoalRecommendation
```

## 6. 主攻组卷（B 对 A 的增量）

`buildDailyPrescription`（`prescription.ts:107`）：当有 `main_goal` 时，主目标形态的 `weight` 设为 `GOAL_FORM_WEIGHT = 2`（覆盖其常规/稳定/弱项权重），保证占大头；其余形态照常弱项加权（×1.5）补暴露的薄弱。

- 目标驱动、非手动旋钮（区别于需求 A 砍掉的"代码专属旋钮"——这里是"你设了 code 目标 → code 自动主攻"）。
- 完全复用 A 的 `charBudget` + 料量对账 + 诊断-处方循环（弱项加权、focus 回流、次日加强）。

## 7. 目标设定 + 推荐值

- **设目标**：设置页（或首次向导）选主形态 + 目标 WPM + 期限。
- **推荐目标值**：各形态"中位数偏上"硬编码基准（单机无他人数据 → 基于公开打字速度统计），用户可调。初值建议：`keys/words ~45`、`sentences/articles ~50`、`symbols ~30`、`code ~35`（实现时按公开统计微调，见 §11）。
- **期限**：默认 90 天，可调。

## 8. 进度展示

- **顶部**：在需求 A 的"今日推荐/计划"旁加「目标:代码 19→50 · 预计 9/5 · 理想每日 ~16 分」（"理想节奏";实际练 A 的档位值，见 §9）。
- **诊断屏**：里程碑（本周 +X WPM）+ 进度条。**[里程碑放第二轮]**

## 9. 与需求 A 集成

- B 的 `daily_minutes`（理想每日节奏，精确分钟）→ A 的时长档位默认值：`comprehensiveStagePlanState`（`appModel.ts:1422`）的 `defaultMinutes` 在有 goal 时改用 `recommendGoalPlan(...).daily_minutes`，否则沿用 `recommendedDailyMinutes`；A 照常 `snapToPreset` 到最近档位（如理想 16 分 → 默认高亮 20 档）。用户练档位值，≥ 理想节奏即更快达成（符合保守哲学）。顶部显示理想节奏，档位条显示实际选择，二者语义不同、不矛盾。
- B 的主目标形态 → A 组卷主攻权重（§6）。

## 10. 测试策略

- **`goalPlan.ts` 纯函数全覆盖**：冷启动（数据 < 7 天）；正常推荐（构造已知 records，断言速率/外推/保守系数/护栏 clamp）；不可达（缺口大、断言 phase + 三选项 + projected_wpm）；已达成（current ≥ target）；校准（不同窗口数据得不同推荐）。
- **进度采集**：构造主形态 records，断言 WPM 历史/累积练习量正确，非主形态被过滤。
- **主攻权重**：有 goal 时主目标形态在 plan 里占比明显高于无 goal。
- **集成回归**：无 goal 时需求 A 行为完全不变。

## 11. 风险与待定

- **速率窗口**：用"目标创建至今"还是"最近 N 天"算速率？建议最近 14 天（够稳又跟得上变化），数据少时退回全窗口。实现时定。
- **保守系数 1.2 是否够**：幂律递减可能更陡，但每 3 天校准兜底，先 1.2 试用、按反馈调。
- **推荐目标值基准具体数值**：实现时查公开打字统计核定。
- **里程碑 UI、目标达成后处理（庆祝 + 设新目标）**：放第二轮。

## 12. MVP 范围

§3–7 + §9 + §10 为核心必做；§8 的里程碑、§11 的目标达成后处理放第二轮。

## 关联

- 前置：`docs/superpowers/specs/2026-06-13-adaptive-comprehensive-training-design.md`、`docs/superpowers/specs/2026-06-14-comprehensive-training-session-length-design.md`
- 需求 A（进综合训练选时长 + 料量对账）已落地合入 main（commit dedde44a）。
