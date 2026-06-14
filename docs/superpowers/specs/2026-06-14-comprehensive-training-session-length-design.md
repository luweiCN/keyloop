# 综合训练「按时长组卷 + 料量对账」设计

日期：2026-06-14
状态：已与用户确认设计方向，spec 待用户审阅 → 实现

## 1. 背景与问题

延续 2026-06-13《自适应综合训练（诊断-处方引擎）》。上线试用后，实测今天一次综合训练发现**预估时长严重失真**：

| 阶段 | 计划预计 | 实际 | 计划料量 | 偏差 |
|------|---------|------|---------|------|
| 常用词 | 9 分 | 2.3 分 | 396 字 | 虚高 ~4× |
| 符号 | 9 分 | 1.6 分 | 194 字 | 虚高 ~5× |
| 句子 | 6 分 | 4.3 分 | 914 字 | 略高 |
| 代码 | 5 分 | 26.7 分 | 4735 字 | **虚低 5.3×** |
| 合计 | 31 分 | 36.4 分 | | |

根因有三层，互相叠加：

1. **配额与料量从不对账**：`estimated_minutes` 在 `targets.ts:654`（`stageLessonFromPlan`）直接照抄处方分配的 `stage.minutes`，**从不参照实际生成的 target 字符数**。
2. **料供给有硬上限/粗估，与配额脱节**：
   - 词阶段 `count = clamp(…, 6, 40)`（`targets.ts:2668`），料封顶 ~400 字 → 9 分配额装不满 → 虚高。
   - 符号固定 8–10 张卡、`trimTargetToCharBudget` 只裁不补（`targets.ts:2825`）→ 虚高。
   - 代码 `count = clamp(round(char_budget/180), 1, 5)`（`targets.ts:2634`），按 180 字/片估算；但实际抽 file 级真实合约，单片 ~940 字，5 片堆到 4735 字 → 5 分配额实打 26 分 → 虚低。
3. **用户无法控制单次时长**：总时长由 `recommendedDailyMinutes` 算法定，诊断屏只能 `←→` 微调，没有"这次想练多久"的明确入口。

## 2. 目标与非目标

**目标：**

- 每次进综合训练，用户能从几个**时长档位**里选"这次练多久"，系统按这个时长组卷。
- 顶部常驻显示系统**推荐时长**与本次选定时长。
- 组卷的料量与时长**名副其实**（选 20 分 ≈ 练 20 分），消除预估失真。

**非目标（明确划走，避免范围膨胀）：**

- **不做**各模块的目标值 / 护栏 / 偏好旋钮——各模块仍由现有弱项加权算法分配，用户不管模块细节。
- **不做**目标驱动的训练计划（设定 WPM 目标 + 学习曲线预测 + 每日推荐时长）——这是独立的**需求 B**，单独立项、单独走 spec。
- **不做**词/符号语料的扩容（料封顶问题本期只"诚实对账"，不扩料，见 §5）。

## 3. 设计

### 3.1 单次时长选择（改造 `stage_plan` 诊断屏）

现有 `stage_plan` 屏（`appModel.ts:691` / `:1448`）已支持 `←→` 调时长并写入 `targetMinutesOverride`，链路 `appModel.ts:1425` → `buildDailyPracticePlan` 完整可用。本期是对它的**交互升级**，非新建：

- 呈现 4 个时长档位：🌱 轻量 10 分 / ⭐ 标准 20 分 / 🔥 强化 30 分 / 🚀 冲刺 45 分。
- 默认高亮**最接近推荐值的档**；`Enter` 确认 → 写入 `targetMinutesOverride` → 组卷。
- 保留 `←→` 作为档位内/档位间的细调（不破坏现有能力）。
- 推荐值 = `recommendedDailyMinutes(profile)`（`prescription.ts:18`，现有：基础 15 + 弱项数 ×5，受七日均 ×1.5 收口，clamp[10,45]）。

每档附一句"为什么"（科学依据，给用户看）：

| 档位 | 时长 | 说明 |
|------|------|------|
| 🌱 轻量 | 10 分 | 碎片时间也能坚持；分散练习少量多次也有效，关键别断 |
| ⭐ 标准 | 20 分 | ≈ 一个专注块，强度与坚持的甜区，最易养成习惯 |
| 🔥 强化 | 30 分 | 两个专注块，进步更快，但需专注力支撑 |
| 🚀 冲刺 | 45 分 | 上限；再多易疲劳掉质量，适合短期攻坚、别天天 |

### 3.2 顶部推荐/计划时长显示

`routeLines.ts:399` 已显示「今日计划: N 阶段，约 X 分钟（今日已练 Y 分钟）」。增强为呈现三个量，让"计划 vs 实际"一眼可见：

- **推荐 X 分**（`recommendedDailyMinutes`）——常驻引导值
- **本次计划 ~W 分**——§3.3.1 回算后各阶段 `estimated_minutes` 之和的**真实总和**
- **今日已练 Y 分**（`completedMsForDate`）

> 关键区分：用户在 `stage_plan` 选的档位（写入 `targetMinutesOverride`）决定各阶段 `char_budget`；顶部"本次计划 W"显示的是回算后的真实总和。词/符号料封顶时 `W ≤ 选定档位`——二者不等正是"诚实显示"的体现（见 §5），不可拿选定档位冒充计划时长。

### 3.3 料量对账（底座，两部分）

这是 §3.1「按时长组卷」能否成立的前提——否则选 20 分仍可能塞代码塞到 26 分。

#### 3.3.1 回算 `estimated_minutes`（修虚高 + 虚低的预计显示）

- **落点**：`stageLessonFromPlan`（`targets.ts:642`）。
- **现状**：`estimated_minutes: stage.minutes`（照抄配额，`:654`）。
- **改为**：先 `buildStageTarget` 出料，再按真实字符回算
  `estimated_minutes = round(target_chars / (form_wpm × 5))`，
  其中 `form_wpm` 取 `profile.form_speeds` 的 EWMA（与 `charBudget` 同源，`prescription.ts:180`）；冷启动无 EWMA 时沿用 `FORM_FALLBACK_WPM[form] × 0.8`。
- **注意顺序**：`char_budget` 仍由 `stage.minutes`（配额）算、决定抽多少料；回算只改 `lesson.estimated_minutes`（显示/记录），**不回头改 budget**。
- **效果**：词/符号料少 → 预计如实变小；代码料多（或经 §3.3.2 后贴合预算）→ 预计名副其实。

#### 3.3.2 代码阶段按预算控片数（修料量虚低的根本）

- **落点**：`buildStageTarget` 的 `code` 分支（`targets.ts:2633`）+ `codeMixTarget`（`targets.ts:1605`）。
- **现状**：`count = clamp(round(char_budget/180), 1, 5)`，硬抽 `count` 片；file 级合约导致料量远超预算。
- **改为**：把 `char_budget` 传入 `codeMixTarget`，**边抽完整片边累加字符，累计达到/接近 `char_budget` 即停**——保持每片是完整合约、绝不切碎；至少 1 片，并保留一个防御性硬上限（如 8 片）兜底。现有去重（`usedCodeSnippetTexts`）与难度筛选不变。
- **效果**：代码料量贴合 `char_budget`，选定时长内代码占比名副其实，不再 5 分配额打 26 分。

### 3.4 数据流

```
进综合训练
  → stage_plan 选时长档位 → 写 targetMinutesOverride
  → buildDailyPracticePlan(targetMinutesOverride)
  → buildDailyPrescription（弱项加权分各阶段，不变）
  → 各 stage：
      buildStageTarget 出料（代码按 char_budget 控片数）
      → 回算 estimated_minutes（按真实字符）
  → plan（lessons + 真实 target_minutes）→ 运行
```

## 4. 测试策略

- **回算**：给定 target 字符 + `form_speeds`，断言 `estimated_minutes = round(chars/(wpm×5))`；构造"词阶段料封顶"用例断言预计变小、"代码 file 级料"用例断言（§3.3.2 前）预计变大。
- **代码控片**：给定 `char_budget`，断言累加片数的总字符接近预算、不超防御上限、**每片完整**（不截断合约）；预算极小时至少 1 片。
- **时长档位**：选档 → `targetMinutesOverride` 写入正确、plan `target_minutes` ≈ 选定值；默认高亮 = 最接近推荐值的档。
- **回归**：现有自适应分配、去重、难度筛选、`←→` 细调、所见即所练（未完成计划复用）均不破坏。

## 5. 风险与待定

- **词/符号料封顶 → 实际计划时长可能 < 选定档位**：选 30 分，但词/符号料就那么点，多出的时长无处放。本期策略是**诚实回算并显示真实计划时长**（§3.2 显示真实总和），不强行填满；扩料 / 把省下时长补偿给有料形态留作后续优化。
- **推荐值落在档位之间**（如 23 分）默认高亮哪档：取最接近，`round` 规则实现时定。
- **代码"接近预算即停"的容差**：最后一片完整保留可能略超预算；建议约束总量 ≤ `char_budget × 1.3`，实现时定。

## 6. 关联

- 前置：`docs/superpowers/specs/2026-06-13-adaptive-comprehensive-training-design.md`
- 后续独立需求 B：目标驱动训练计划（WPM 目标 + 学习曲线预测 + 每日推荐时长 + 动态校准），待 A 落地后单独 brainstorm。
