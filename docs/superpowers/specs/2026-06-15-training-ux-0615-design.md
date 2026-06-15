# 训练体验批量改进设计 (2026-06-15)

分支 `feature/training-ux-0615`。验证：`bun test tests` + `bun run typecheck`。TDD，分批提交。

## 背景与根因（已查实）

用户实练后提出 7 项问题。关键根因：

- **第 5 条（句子/文章重复）**：随机源是 `Math.random` 真随机（非固定种子），问题在**候选池太小**。文章 `everydayArticlesTarget`(targets.ts:1532) 永远取 1 篇，CET4+短池仅 3 篇 → 必然高频复现。句子 CET4 池 187，相对尚可。
- **第 7 条（选 45 实际 20）**：时长档位→`char_budget`(prescription.ts:208) 在处方层算了，但 `buildStageTarget`(targets.ts:2670) 各形态消费不一致：`words` 消费但封顶 40(:2714)、`code` 消费(:2686)，而 `articles`(:2684) 与 `keys`(:2676) **完全无视档位**，永远固定量。`estimated_minutes` 按实际字符反推(:673) → 凑不满 45。
- **第 5/7 同源**：everyday 语料池太小 + 部分阶段内容量不随时长伸缩。
- **文章扩库本质 = 翻译**：`everyday_reading_seed.json` 有 753 篇英文原文但 0 翻译；成品 `everyday_articles.json` 仅 63 篇（每 level×length 格约 3 篇），翻译经 `mergeEverydayReadingTranslations.ts` 批次 merge 进来。

## 决策（用户已定）

- 文章扩库：**大规模补译做大整库**，分阶段（阶段 1 先 CET4+高中）。
- 第 7 条：**内容随时长伸缩**；文章**拼多篇**，每换一篇插入**醒目换篇分隔/标题提示**（避免用户误以为同一篇）。
- 第 4 条：**逐词取极值**，合并一项「最快/最慢 92/41」显示。
- 选取保持**真随机**，不加防重复算法。

## 实施批次（每批 TDD + 可单独验证 + 用户 review）

### 批次 1 — 快速低风险（已完成）
1. **退出 bug**（第 6 条）✓：`startRunner.ts` 综合结束后用 `context.returnState` 回主菜单（参照单课结算），不再退出；`showSummaryPage` 返回其 renderer。
2. **放宽文章过滤**（第 5 条立即缓解）✓：新增 `everydayArticlePool`，精确 level+length 档位过小（CET4+短=3）时回退到该 level 全部长度（3→11），扩大真随机池。
- 配色（第 2 条）改与批次 2 同区域（`renderPanel`/stage_plan）一起做，避免重复改测。
- 测试：`tests/opentuiStartRunner.test.ts`、`tests/targets.test.ts`。

### 批次 2 — 综合训练核心
1. **时长伸缩 + 文章拼接**（第 7 条）：`buildStageTarget`(targets.ts:2670) 让 `articles`/`keys` 按 `stage.char_budget` 伸缩；文章拼多篇直到填满预算，**每篇间插入换篇标题分隔行**（复用 annotation `article`/`source_title`）；放宽 `words` 上限。
2. **计划用时**（第 3 条）：`running.ts` `renderPracticeTimeStack`(:333) 顶部 + `modals.ts` `renderCompletionDetails`(:472) 弹窗，显示「计划 X 分 / 实际 Y 分」（本组 `lesson.estimated_minutes`）。
3. **最快/最慢 WPM**（第 4 条）：逐词聚合极值，合并一项加到 `renderLiveMetrics`(running.ts:486) + `renderCompletionPopup`(modals.ts:433)。
4. **卡顿**（第 2 条）：`comprehensiveStagePlanState`(appModel.ts:1443) 切档时缓存 `buildSkillProfile`/`recommendGoalPlan`/diagnosis，只重算 `buildDailyPracticePlan`。
5. **配色**（第 2 条）：`renderPanel`(shared.ts:168) 支持按行高亮，提亮 `routeLines` 的「今日计划」「时长档位」引导行（当前非首行统一 `theme.muted`=brightBlack）。
- 测试：`tests/stageTargets.test.ts`、`tests/targets.test.ts`、`tests/prescription.test.ts`、`tests/liveSession.test.ts`、`tests/opentuiApp.test.ts`、`tests/opentuiRenderer.test.ts`。

### 批次 3 — 完成总览扩展（第 6 条）
- `summaryLines`(routeLines.ts:304) 扩展：练习数量、每个练习「预计 vs 实际时长」、总计预计/实际、速度/正确率。回车返回菜单（依赖批次 1 退出修复）。
- 测试：`tests/opentuiStartRunner.test.ts`、`tests/report.test.ts`。

### 批次 4 — 新手目标弹窗（第 1 条）
- `UserPreferences`(model.ts:207) 加 first-run 标志并持久化(cli.ts:584)；首次进入弹「是否启用目标驱动？」→ 启用进既有目标向导(settingsReducers.ts:545)，否则跳过并标记已见。
- 测试：`tests/opentuiAppSession.test.ts`、`tests/cli.test.ts`、`tests/storage.test.ts`。

### 文章补译（独立并行，不阻塞上面）
- 并行 subagent 翻译 `seed.articles` 段落 → 翻译批次 → `mergeEverydayReadingTranslations` → `buildEverydayReadingContent`。
- 阶段 1：CET4 + 高中两档每格扩到 ~15-20 篇；阶段 2+ 逐档覆盖至全库。
- 质量：段落对齐、术语准确；`buildEverydayReadingContent` 已有 `articleRanges` 词数/分级校验兜底。

## 风险
- 换篇分隔渲染需复用现有 annotation 机制，避免破坏输入判定。
- 卡顿缓存失效边界：仅档位变化时重算计划，profile/diagnosis 在同一 stage_plan 会话内复用。
- 翻译量大：用并行 subagent 分批，按格子配额控制。
