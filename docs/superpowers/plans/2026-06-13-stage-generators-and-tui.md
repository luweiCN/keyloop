# 诊断-处方引擎（第 2+3 期：形态生成器 + TUI 阶段流程）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把第 1 期的纯函数引擎接到真实训练流程：形态生成器按字符预算产出语料（含分桶 focus 回流与自建词库合并），一级菜单综合训练改为"诊断屏 → 逐阶段懒生成 → 间歇屏"流程，二级菜单各综合训练切换到新生成器，设置页提供科目开关。

**Architecture:**
- 形态生成器实现在 `targets.ts`（复用其私有 helper），统一入口 `buildStageTarget(context, stage, profile, customLibraries?)` 按 `TrainingForm` 分发；数量由 `charBudget` 换算，内容回流只读同形态 focus 桶。
- 阶段会话记录的 `category` 按 form 映射到既有 `TrainingCategory`（keys→foundation_mix、words→everyday_words、symbols→symbols_numbers、sentences→everyday_sentences、articles→everyday_articles、code→code_mix），保证 `formForCategory` 闭环。
- TUI 新增 `stage_plan` 路由（诊断/计划屏），complete 屏的 `next_lesson` 机制扩展为"下一阶段"，阶段进度持久化到 `daily_runs.json`。

**Spec:** `docs/superpowers/specs/2026-06-13-adaptive-comprehensive-training-design.md`
**前置:** 第 1 期已合入本分支（`diagnosis.ts` / `prescription.ts` / `enabled_modules`）。

---

## 任务清单

### Task A: 形态生成器 buildStageTarget（targets.ts）

- words 形态合并池：everyday_words（带翻译）+ programming_words（programming 启用时）+ 自建词库 words；`profile.focus.words` 优先回流；词数 ≈ `charBudget / 7`（均词长 6 + 空格），clamp [6, 40]；输出带翻译注解（复用 annotatedTokenText 思路）。
- sentences 形态：everyday_sentences 按 settings 过滤 + 自建库句子；`focus.sentences` 中能在库中找回的句子优先；句数 ≈ `charBudget / 40`，clamp [2, 8]。
- articles 形态：复用现有文章 target 函数选一篇（按 article_level/article_length）。
- keys 形态：复用 `foundationMixTarget`（focus_keys 加权已有）。
- symbols 形态：programming 启用时复用 `buildSymbolsNumbersTarget`；否则用 foundation 的 number-row/punctuation-edges drill。
- code 形态：复用 `codeMixTarget(context, count)`，`count ≈ charBudget / 180`，clamp [1, 5]。
- 测试 `tests/stageTargets.test.ts`：每形态预算缩放、focus 回流（错词出现在 words 形态语料中且不出现在 symbols）、自建词库词进入 words 池、禁用 programming 时 symbols 退化到 foundation 行。

### Task B: 二级菜单综合训练切换

- `everyday_mix` → words（仅 everyday 池）+ sentences 两段拼接，预算按该形态 EWMA × 固定分钟（4+4 分钟）。
- `programming_basics_mix` → words（仅 programming 池 + 技术长词）+ symbols 拼接（4+4 分钟）。
- `foundation_mix` / `code_mix` → 保持现有生成器，但 focus 来源换成分桶池（foundation 用 focus.chars 中键位、code 用 focus.code）。
- mix 函数签名增加可选 `profile?: SkillProfile`；未传时回退现有行为（兼容 CLI 等旧调用方）。
- appModel 二级菜单激活路径传入 profile。
- 测试：错词只回流到含 words 段的 mix；source/category 不变。

### Task C: appModel 阶段流程（一级综合训练）

- 新 route：`{ screen: "stage_plan"; prescription: DailyPrescription; profile_summary: string[]; stage_index: number; completed: CompletedStage[] }`。
- `comprehensive` 激活 → `buildSkillProfile` + `buildDailyPrescription`（enabled_modules 来自 preferences）→ stage_plan 屏。
- stage_plan 交互：Enter 开始当前阶段（懒生成 target → running，lesson.id = `stage:<form>:<index>`）；←/→ 调整 target_minutes（±5，[10,60]，重算各阶段预算）；Esc 返回主菜单。
- 阶段完成（complete 屏）→ Enter：`reviseStages` 后生成下一阶段；最后一个阶段完成 → summary。
- Esc 中途退出：阶段进度已通过 daily_runs 持久化（Task D），下次进入恢复。
- 测试 `tests/opentuiApp.test.ts` 追加：comprehensive 进入 stage_plan；Enter 进入 running 且 category 映射正确；完成一阶段后 next 进入下一阶段。

### Task D: 阶段进度持久化

- `StoredDailyRun.plan` 旁新增可选 `prescription?: { target_minutes, stages, completed }`（JSON 兼容旧文件）。
- 当日已有未完成 prescription → comprehensive 入口直接恢复（跳过已完成阶段，剩余阶段用 reviseStages 重算）。
- 测试 `tests/storage.test.ts` 追加：保存/加载 roundtrip；旧格式文件无 prescription 字段可正常解析。

### Task E: stage_plan 屏渲染

- `renderer.ts` 路由分发新增 `stage_plan`；新渲染函数：诊断摘要（弱项维度 + 数据）、阶段表（序号/名称/分钟/理由/完成标记）、操作提示（Enter/←→/Esc）、今日进度行。
- 中英双语跟随 interface_language。
- 测试：`openTuiRouteLines` 包含阶段理由与进度。

### Task F: 设置页科目开关

- 设置菜单新增「综合训练科目」项：四个模块逐个开/关（至少保留一个）。
- 写回 preferences.json 的 enabled_modules。
- 测试：切换后 enabled_modules 持久化；buildDailyPrescription 收到更新后的列表。

### Task G: 回归与验收

- `bun run typecheck && bun test tests && bun run smoke`。
- 对照 spec 第 8 节行为变更清单逐条核对。
