# 弱点机制重构设计（对标 keybr）

日期：2026-06-25 · 状态：设计待评审 · 演进自 [ADR-0002 弱点只归击键结构](../../adr/0002-weakness-only-by-keystroke-structure.md)

## 1. 背景与动机

keyloop 的弱点机制反复调过多次仍不理想，根因不是参数没调好，而是**维度造错了 + 当年凭直觉发散、没参考成熟方案**：

- 把「长词 / 长句 / 长文章错得多」当弱点 —— 长度是**内容属性**、不是个人短板；越长错得越多对所有人成立。
- 用**绝对错误率阈值（8%）**判弱 —— 对天生难的类别（符号、数字、大写）不公平，"难=永远弱"。
- 问题 1（2026-06-25）已删 `long_words` 维度、判弱改相对基线，是本方向的开端，但只动了一角。

参考系：**keybr**（开源 [aradzie/keybr.com](https://github.com/aradzie/keybr.com)）是公认做得好的自适应打字训练器。读其 `keybr-lesson` 包源码，提炼出可借鉴的**机制**（而非照抄它的单一载体）：

- **per-key 统一账本**：每个字母独立 confidence（`key.ts`）。
- **confidence = 目标速度 / 实际速度**（相对，≥1 即掌握）（`target.ts`）。
- **弱点直接驱动选材**：对词库建倒排索引（字符 → 含它的词），组卷选「含最弱字母的真实词」（`dictionary.ts` / `guided.ts`）。
- 自洽、相对化、不依赖绝对阈值。

## 2. 现状病灶（重构前）

完整链路梳理后，弱点信号的真实流向是「诊断维度 → 时长增量 → 形态时间权重 → 极少量形态内选材」：

| 环节 | 弱点信号实际怎么用 |
|---|---|
| 每日时长（`prescription.ts` recommendedDailyMinutes） | ✅ 每个 weak 维度 +5 分钟 |
| 形态时间分配（buildDailyPrescription） | ✅ weak 维度 → 对应 form ×1.5 |
| words 选材（`targets.ts` wordsStageTarget） | ✅ 仅 `capitalization` 维度（大写词置顶） |
| keys 选材 | 用 `plan.focus_keys`（历史错键），**不用诊断维度** |
| code 选材 | 用 `plan.focus_code`（历史错代码），**不用诊断维度** |
| symbols / sentences / articles 选材 | ❌ 纯随机 / 纯预算，**完全不用弱点** |

三个根本病灶：

1. **诊断的维度基本不决定「练什么」，只决定「练多久」**。判你 symbols 弱 → 多分时间给符号专项，但符号专项选材纯预算、不挑你弱的那些符号。与 keybr 正相反。
2. **两套弱点信号打架**：诊断维度（SkillProfile）vs 历史错数回流（plan.focus_keys / focus_code），各管一摊、碎片化。
3. **粒度是「类别」不是「键」**：`home_row` / `symbols` 是一类键，不告诉你具体哪个键慢。

## 3. 设计原则（借鉴 keybr 的机制）

1. **一套跨形态统一的 per-key 弱点账本** —— 你打某个键，无论在单词、符号、代码里打的，都汇总到「这个键」一个账上。
2. **confidence = 目标键速 / 有效键速**（相对你自己，≥1 掌握）。
3. **弱点直接驱动选材**，不只调时间。
4. **靶向 = 对真实素材建倒排索引、按弱键「筛选」；绝不「伪造 / 改写」内容**。keyloop 比 keybr 更克制：连 keybr 的伪词都不用，全程练真实素材，弱点只决定「从真实素材里挑哪些」，永远不决定「内容长什么样」。
5. **数字 / 符号索引带「形式」维度**（时间 / 日期 / 金额 / IP / 端口 / 版本…），保证真实形式覆盖 —— 这是 keyloop 超出 keybr 的一层（keybr 只有字母、没有形式）。

## 4. 三层架构

```
① 信号层：统一 per-key 有效速度账本（跨所有形态）
        │  confidence = 目标键速 / 有效键速（相对自己）
        ▼
② 原子练习层（靶向选材）        ③ 真实语境层（纯粹演练）
   单词 / 数字 / 符号 / 单行代码语句     句子 / 文章 / 完整代码块·函数·文件
   倒排索引 → 多挑「含弱键」的真实素材    纯粹随机 → 在真实语境里巩固
   （不改内容；数字/符号带形式维度）      （不被弱点扭曲）
```

### 4.1 信号层 — 统一 per-key 有效速度账本

- **统计**：从所有形态的 `record.key_events`（已存每键 `at_ms` 时间戳 + `correct`），per-key 算「平均击键间隔」与「错误率」。
- **有效耗时**：`effTime(key) = avgInterval(key) × (1 + PENALTY × errorRate(key))` —— 把「打错」折算成「变慢」，让"又慢"和"又错"都表现为有效速度低。一个指标同时反映快慢与准确。
- **目标键速**：取「你自己所有键速度的某个分位」（相对基线），**不用绝对值**。
- **confidence**：`confidence(key) = targetTime / effTime(key)`，≥1 掌握，越低越弱。
- **弱键**：confidence 最低的若干键。
- **参数**：`PENALTY`（错误惩罚系数）、目标分位 —— 给保守默认 + 可调 + 埋点，实测再定。

> 为什么这样：keybr 能只看速度，是因为它**强制纠错重打**，速度里自动隐含准确率；keyloop 不一定如此（会出现"手快但老错"的键），故把错误率**折成耗时惩罚**显式补进同一指标，而非另开一个指标拍权重。相对自己判弱，根治"难键放谁面前都是弱点"。

### 4.2 原子练习层 — 靶向选材（单词 / 数字 / 符号 / 单行代码语句）

- **倒排索引**：`字符 → 含它的素材[]`（一次建好、O(1) 查，仿 keybr `dictionary.ts` 的 `#dict`）。数字 / 符号额外建 `形式 → 素材[]`。
- **组卷**：取最弱 N 键 → 从索引取「含弱键」的素材 → 按「弱键覆盖密度」（命中几个弱键、键有多弱）加权随机 + 形式覆盖 → 凑字符预算 → 掺一部分普通素材，避免整卷怪异（仿 keybr 解锁全字母后掺真实词）。
- **铁律**：只**筛选**真实素材，**绝不改写素材内容**。
- 各形态落地：
  - **单词**：字母弱键 → 含弱字母的真实词（词库 ~1 万日常 + ~1300 编程，值得建真倒排索引）。
  - **数字**：弱数字键 + 形式 → 含弱数字的各种真实形式串。
  - **符号**：弱符号键 + 语境 → 含弱符号的真实素材（复用问题 2/3 改过的符号专项卡池，打「含哪些符号 / 哪种形式」标签）。
  - **单行代码语句**：弱键 → 含弱键的真实单行语句（如 `x = items[0]`），**只挑不改**。

### 4.3 真实语境层 — 纯粹演练（句子 / 文章 / 完整代码块·函数·文件）

- 保持**纯粹随机 / 轮换**，不靶向弱键。原因：①靶向会扭曲真实性（真实文章里几乎没有 `{`，硬挑要么挑不出、要么挑出畸形文本，毁了「练真实输入」）；②池子有限、按"含某键"过滤直接见底；③它的角色是**综合演练场** —— 把原子层靶向练过的键，丢回真实语境巩固检验。
- 基本保持现状（已是纯随机，见 [ADR-0001](../../adr/0001-applied-layer-no-mistake-replay.md)）。

## 5. 落到现有模块的改动

| 模块 | 改动 |
|---|---|
| `diagnosis.ts` | 「9 类别维度」重构为「per-key 有效速度账本」；`home_row` 等可降级为「展示聚合」，底层信号为单键；`capitalization` / 标点等「组合特征」作为少数跨键维度保留 |
| 新增索引模块 | 词库 + 数字/符号/单行语句素材的倒排索引（字符维度 + 形式维度） |
| `targets.ts` | 原子层（words / symbols / 数字 / 单行语句）选材改「索引靶向」；真实语境层（sentences / articles / 完整 code）**不变** |
| `prescription.ts` | 弱点 → 时长 / 形态时间分配可**简化**（选材层已做靶向，形态时间权重可弱化或保留为"练哪类内容"的调度） |
| 统一信号 | `plan.focus_keys` / `focus_code` 回流并入 per-key 账本，消除两套信号打架 |
| ADR | 写新 ADR 记录「per-key 有效速度 + 靶向选材」，演进 ADR-0002 |

## 6. 分阶段落地（每阶段独立可验证，各自一个实现 plan）

1. **信号层**：per-key 有效速度账本（`diagnosis.ts` 重构 + confidence）。先**并存**，不改选材，可对照验证。
2. **单词靶向**：词库倒排索引 + `wordsStageTarget` 改「含弱字母词」。
3. **数字 / 符号靶向**：素材双维度索引 + 符号专项选材。
4. **单行语句靶向**：单行语句索引 + 选材。
5. **统一信号**：废 `focus_keys` / `focus_code`，并入 per-key。
6. **简化处方**：形态时间分配按需调整。

> 本方案体量较大，**不是单个实现 plan**；每个阶段各自走 spec→plan→实现 循环。本文是统领设计。

## 7. 边界与风险

- **改动核心训练系统** → 分阶段、真实语境层不变，缩小爆炸半径。
- **参数未定**（PENALTY、目标分位）→ 给保守默认 + 可调 + 埋点，实测再定。**严禁拍脑袋写死系数**（这正是历史教训）。
- **数据不足的键**：样本不足 → confidence 记为「未评估」，不参与弱键排序（仿现有 unrated）。
- **无弱键 / 素材不足**：原子层回退到普通随机选材（不报错、不空卷）。
- **怪卷风险**：掺普通素材 + 绝不改写内容缓解。
- **历史数据迁移**：per-key 统计可从现有 `key_events`（已存每键时间戳 + correct）**重算**，无需新埋点 / 新数据格式。
- **向后兼容**：信号层先并存验证、再切选材，可随时回退。

## 8. 测试策略（TDD）

- 单元：per-key 统计、有效耗时 / confidence、相对目标分位、倒排索引构建与查询、各原子形态靶向选材、参数边界。
- 回归：真实语境层（句子 / 文章 / 完整代码）选材**不变**。
- 集成：端到端组卷验证「原子层偏重含弱键的真实素材、真实语境层保持纯粹、绝无改写内容」。

## 附：keybr 源码出处

- [target.ts](https://github.com/aradzie/keybr.com/blob/master/packages/keybr-lesson/lib/target.ts) — `confidence = speedToTime(targetSpeed) / timeToType`
- [guided.ts](https://github.com/aradzie/keybr.com/blob/master/packages/keybr-lesson/lib/guided.ts) — 最弱字母聚焦、渐进解锁、真实词优先（`naturalWords` 默认 true）、伪词兜底
- [dictionary.ts](https://github.com/aradzie/keybr.com/blob/master/packages/keybr-lesson/lib/dictionary.ts) — 倒排索引 `字符 → 含它的词`，`find(focusedCodePoint)` 取含最弱字母的词
- [key.ts](https://github.com/aradzie/keybr.com/blob/master/packages/keybr-lesson/lib/key.ts) — 每个字母 current / best confidence
- [settings.ts](https://github.com/aradzie/keybr.com/blob/master/packages/keybr-lesson/lib/settings.ts) — `targetSpeed` 默认 175 CPM（=35 WPM），`naturalWords` 默认 true
