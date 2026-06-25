# 符号专项「形式维度」设计（form coverage）

日期：2026-06-25 · 状态：设计待评审 · 承接 [弱点机制重构设计](./2026-06-25-weakness-mechanism-redesign-design.md) §4.2 的「数字/符号形式维度」，是其阶段三的第二刀（第一刀「字符维度靶向」已完成：commit 765d164c/6556ead5/d2b2609a）。

## 1. 目标

给符号专项的 **value 裸值卡**打上「形式」标签（date / time / ip / money / version…），选材时**保证每课覆盖多种真实形式**——这是 keyloop 超出 keybr 的一层（keybr 只有字母、没有形式）。用户练符号专项时，稳定接触到日期、IP、金额、版本号等各种真实输入形态，而非单一或几乎没有。

**作用 = 形式覆盖（多样性保证），不是靶向弱形式**（用户 2026-06-25 已确认）。不新建「形式级速度账本」——每语言 value 卡仅 ~40 张、细分到形式后每种样本太稀疏，弱形式信号不可靠。

## 2. 关键现状与动机

- value 卡很少：typescript 仅 40 张 value 卡 / 434 总卡（~9%）。现状选材（pickWeakKeyTargetedCards 从全卡池混选 10 张）期望选中 value < 1 张 → **很多课根本没有裸值行**，date/IP/money 等形式几乎练不到。
- value 卡 `text` 高度规整（IP=`10.0.0.1`、date=`2026-12-31`、money=`$1,299.00`），且 `note_zh` 本身就是形式语义标签（"IP 地址"、"日期串"、"金额"、"端口号"）→ **可脚本半自动推断 format**，无需手工标注。
- 形式只对 value 卡有意义：statement/block 是代码结构（`first = items[0]`），没有"形式"。

## 3. 范围

| 做 | 不做 |
|---|---|
| 给 **value 卡** 编译时推断并写入 `format` 字段 | statement/block 卡不标 format |
| 选材时保证 value 卡覆盖多种 format + 提升 value 配额 | 不建形式级速度账本、不靶向"弱形式" |
| 字符维度靶向（弱键加权）**保留**，与形式覆盖叠加 | 真实语境层（句子/文章/完整 code）不碰 |

## 4. format 枚举

有限集 + `other` 兜底（够细以体现覆盖、够粗以稳定推断）：

```
date · time · datetime · ip · port · version · money · percent
· email · url · path · mime · color · regex · http_method · http_status · number · other
```

`number` 兜底「光秃数字」（超时 `60_000`、计数），`other` 兜底推断不出的。枚举可在评审/实现中增删。

## 5. 标注：编译时推断（不手工标）

在 `buildProgrammingBasicsContent.ts` 的 `buildLanguageCorpus`（value 卡编译，line 153-164）加 `inferValueFormat(text, note_zh): string`，写入 `OutputCard.format`。重新编译 17 语言 → format 自动落入各 `{lang}.jsonl`。

**推断策略**（text 强模式优先 → note_zh 关键词兜底 → other）：
- text 正则可定的：`ip`(`^\d{1,3}(\.\d{1,3}){3}$`)、`date`(`^\d{4}-\d{2}-\d{2}$`)、`datetime`(含 `T…Z`/ISO)、`time`(`^\d{2}:\d{2}`)、`version`(`^[~^]?\d+\.\d+\.\d+`)、`email`(`@…\.`)、`url`(`^https?://`)、`path`(`^[./].*/`）、`color`(`^#[0-9a-fA-F]{3,8}$`/`^rgb`)、`regex`(`^/.*/[a-z]*$`)、`percent`(`%$`)、`money`(`^\$`)。
- 纯数字 / 歧义靠 note_zh 关键词：含「端口」→`port`、「金额/价格」→`money`、「HTTP 状态」→`http_status`、「方法」+全大写→`http_method`、「MIME」→`mime`、「超时/毫秒/计数」→`number`。
- 都不中 → `other`。

覆盖率不要求 100%（形式覆盖不依赖精确分类），但编译期 `assertCorpusQuality` 加一条软校验：`other` 占比过高（如 >40%）时告警（提示推断规则或 note 需补），不阻断。

`ProgrammingBasicsCard`（content/programmingBasics.ts:12）与 `OutputCard`（buildProgrammingBasicsContent.ts:44）同步加 `format?: string`。

## 6. 选材：形式覆盖 + 字符靶向叠加（专项固定 / 综合按时长）

把 `symbols_numbers` 的选材拆成 **value 路 + 非 value 路**，合并：

1. **value 路（形式覆盖）**：从 value 卡按 format **分组 round-robin** 取 `Nv` 张（每轮各 format 取 1，组内用弱键加权 `weightedSampleWithoutReplacement` 排序）→ 保证尽量**不同形式**。format 种类 < Nv 时取满可用种类。
2. **非 value 路（字符靶向）**：statement/block 用现有 `pickWeakKeyTargetedCards` 取剩余。
3. 合并 → `symbolsNumbersText`（value 聚合排最前、不高亮）组装。

**`Nv` 怎么定——分两个入口（关键，用户 2026-06-25 校正：综合训练时长是日计划算好的，不能拍死数量）：**

| 入口 | `Nv` | 说明 |
|---|---|---|
| **专项训练**（菜单单独练，`buildSymbolsNumbersTarget` 直接调，无时长约束，appModel.ts:955） | **固定默认 6** | 用户主动练符号，给个稳定的形式覆盖数；常量可调 |
| **综合训练**（`symbolsStageTarget`，时长由日计划算好 → `char_budget`） | **按预算伸缩** | `Nv = round(char_budget × VALUE_RATIO / 平均 value 长)`，时长长→多覆盖、短→少；`VALUE_RATIO` 默认 ~0.45（裸值与代码语句大致各半、裸值略多） |

实现上 `buildSymbolsNumbersTarget(context, options, valueCount?)` 加可选 `valueCount`：专项不传 → 用默认 6；综合由 `symbolsStageTarget` 按 `char_budget` 算好传入。**预算→数量换算只在综合入口做**，选卡函数本身只认「要几张 value」。

综合训练的 `fitSymbolsTargetToBudget`（最终按 char_budget 裁/补）**保留**，但裁剪时**优先保 value 行**（别把形式覆盖裁没）。

无弱键时：value 路 round-robin 仍保证形式覆盖，组内退化随机；非 value 路退化均衡随机。**形式覆盖恒生效，字符靶向有弱键才生效**，正交叠加。

value 卡池为空（某语言无 value 卡）：Nv=0，全走非 value 路（=阶段三现状），不报错、不空卷。

## 7. 落到模块的改动

| 模块 | 改动 |
|---|---|
| `buildProgrammingBasicsContent.ts` | `OutputCard` 加 `format?`；`inferValueFormat()`；value 编译写入 format；`assertCorpusQuality` 加 other 占比软校验 |
| `content/programmingBasics.ts` | `ProgrammingBasicsCard` 加 `format?: string`（loader 透传） |
| 重新编译 | 跑 build 脚本重生成 17 语言 `symbols_numbers/*.jsonl`（format 落盘） |
| `programmingBasicsTargets.ts` | 新增 `pickFormCoveredValueCards()`（format round-robin + 弱键加权）；`buildSymbolsNumbersTarget` 加可选 `valueCount`（专项默认 6）；`basicsTarget` 的 symbols_numbers 路径改「value 路 + 非 value 路」合并 |
| `targets.ts`（综合训练入口） | `symbolsStageTarget` 按 `char_budget × VALUE_RATIO / 平均 value 长` 算 `valueCount` 传入；`fitSymbolsTargetToBudget` 裁剪时优先保 value 行 |

## 8. 测试策略（TDD）

- 单元：`inferValueFormat` 各形式（text 正则 + note 关键词 + other 兜底）；`pickFormCoveredValueCards` 形式覆盖（选出的 value 卡 format 去重数 ≈ min(Nv, 可用种类)）+ 弱键加权（组内偏重含弱键）。
- 集成：`buildSymbolsNumbersTarget` 端到端——每课**含 value 行**且 value 覆盖**多种** format（修复"几乎没 value"现状）；无弱键时形式覆盖仍生效；value 卡池空时不报错。
- 回归：字符维度靶向（阶段三）不退化；真实语境层选材不变；编译后卡池 format 标注覆盖率（other 占比）软校验。

## 9. 边界与风险

- **推断不准**：note_zh 自由文本、纯数字歧义 → 个别卡 format 误判。缓解：形式覆盖对精度不敏感（只要多样），other 兜底，软校验告警。**绝不因标注改写卡内容**。
- **Nv 配额**：默认 4，提升了 value 占比（从 ~9% 自然比例到固定 ~4/课）。风险：value 太多挤占 statement。缓解：Nv 可调；symbolsNumbersText 已把 value 聚成 1 行（4 个/行），视觉占比小。
- **小语言 value 稀少**：format 种类 < 4 → 覆盖能力有限，取满可用即可，不补造（绝不伪造形式）。
- **重新编译影响面**：format 是**新增字段**，旧无 format 的卡 loader 当 undefined（向后兼容）；选材对无 format 卡归入 other 组。
