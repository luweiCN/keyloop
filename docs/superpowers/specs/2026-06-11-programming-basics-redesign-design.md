# 编程基础栏目重设计

日期:2026-06-11
状态:已与用户逐节确认,待实现

## 背景与目标

现有「编程基础」栏目的 5 个组别(符号与括号、编程常用词、命名形式、技术长词、编程基础综合)存在三个问题:

1. 孤立符号练习与「基础输入」栏目的「符号标点」「大小写基础」职责重叠,没有提供新的训练维度;
2. 从「会打符号」到「会打真实代码」之间存在断层——符号练得再熟,真实代码里的连续结构(`items.map((item) => item.id);`)仍然生疏;
3. 旧语料量少、质量差(用户判断)。

本次重设计的目标:把编程基础做成「基础输入」与「代码实战」之间缺失的一环,训练**语言的固定搭配**——符号和数字在真实语境中的输入、该语言生态的高频 API,同时保留按技能类型划分的组别骨架。

四栏目训练阶梯:

```
基础输入        日常练习       编程基础            代码实战
键盘指法    →   自然语言   →   语法模式卡片    →    真实代码
(字符级)       (单词/句子)    (语言的固定搭配)     (项目级)
```

编程基础与代码实战的分界:**能脱离项目上下文反复操练的固定搭配归基础;需要真实项目上下文的归实战。**

## 二级菜单(6 项)

| # | ID | 中文标签 | 性质 | 内容 |
|---|----|---------|------|------|
| 1 | `symbols_numbers` | 符号与数字 | 跟随语言 | 符号/数字的语境卡片:声明、调用、控制流、索引、版本号、十六进制等 |
| 2 | `programming_terms` | 编程常用词 | 语言无关 | 高频编程词肌肉记忆 |
| 3 | `naming_styles` | 命名形式 | 语言无关 | camelCase / PascalCase / snake_case / CONSTANT 切换 |
| 4 | `technical_long_words` | 技术长词 | 语言无关 | 长词拆解(internationalization → i18n) |
| 5 | `builtin_api` | 内置 API | 跟随语言 | 该语言生态高频 API 调用卡片 |
| 6 | `programming_basics_mix` | 基础综合 | 混合 | 新内容混合拼卷 + 弱项复习 |

菜单骨架沿用旧分类的「按技能类型划分」思路(目标单一、可孤立操练),两处升级:符号组语境化并跟随语言、新增内置 API 组。

## 数据模型变更

`src/domain/model.ts` 的 `TrainingCategory`:

- 删除:`operators_brackets_quotes`
- 新增:`symbols_numbers`、`builtin_api`

不做历史兼容:旧 category 的练习记录由 storage 现有的校验机制自动跳过(已有 "Skipped invalid session record" 处理,不会崩溃),旧符号练习的统计数据放弃。

新组别不复用旧 category ID 的原因:训练内容完全不同,WPM/准确率与旧数据不可比,混用会污染自适应难度的历史统计。

## 语料设计

### 目录结构

```
contents/programming_basics/
  index.json                 # 语言清单 + 元信息
  symbols_numbers/
    typescript.jsonl         # 每行一张语境卡片
    python.jsonl
    ...
  builtin_api/
    typescript.jsonl
    ...
```

首批 13 门语言:TypeScript、JavaScript、Python、Go、Java、Rust、C#、C++、C、PHP、Ruby、Kotlin、Swift。

### 符号与数字卡片

```json
{"text": "items.map((item) => item.id);", "topic": "call", "focus": ["=>", "()", ";"], "note_zh": "数组映射取字段"}
{"text": "const limit = arr[0] ?? 10;", "topic": "index", "focus": ["[]", "??"], "note_zh": "取首元素带默认值"}
```

- `text`:一行可独立输入的规范代码片段,自包含
- `topic`:语法主题,组卷时均衡取样
- `focus`:重点训练的符号/数字模式,供将来弱项匹配
- `note_zh`:中文注释(沿用项目 `note_zh` 惯例)

每语言 80–120 张,覆盖五类主题:

1. 声明类:变量 / 常量 / 函数 / 类声明
2. 调用类:方法链、回调、传参
3. 控制类:if / for / while / try
4. 数字类:数组索引、版本号、十六进制颜色、端口号
5. 字符串类:模板字符串、引号、文件路径

数字不做孤立数字串训练(那是基础输入「数字行」的职责),只练数字在代码中的真实出现形式。

### 内置 API 卡片

「内置 API」定义为**该语言生态里人人都在打的高频 API**,含三层:

1. 语言核心 API:类型自带方法(JS 的 Array/String/Object 方法)
2. 运行时/标准库 API:JS 的 DOM/BOM/fetch/localStorage,Python 的 os/json/re,Go 的 fmt/strings/time
3. 事实标准库:非语言内置但生态必引(C++ STL、Solidity 的 OpenZeppelin)。收录硬规则:写这门语言的人 50% 以上的项目都会引入才收;框架(React 等)不收,归实战栏目

```json
{"text": "const ids = items.map((item) => item.id);", "api": "Array.map", "group": "array", "note_zh": "数组映射"}
{"text": "document.querySelector(\".active\");", "api": "document.querySelector", "group": "dom", "note_zh": "选择元素"}
```

每语言 100–200 张,按 8–12 个 API 域(`group`)组织,每域 10–20 张。`group` 字段同时为将来域级弱项复习留接口(域级统计样本量比卡片级稳定)。

各语言 API 域规划要点:JS/TS 含 array、string、object、json、promise、map/set、dom、bom/web、node 常用;Python 含内置函数、str、list/dict/set、os/pathlib、json、re、collections;C++ 以 STL 为主;Solidity 含全局对象(msg/block/abi/require)与 OpenZeppelin 常用调用;其余语言同理按生态确定。

### 词库重建

旧词库(`programming_words.json`、`naming.json`、`long_words.json`)整体重建,不保留:

- **编程常用词库**:从 `contents/code/snippets/` 真实语料统计标识符词频生成候选,人工筛选,替代旧的手编词表
- **命名形式**:不再维护手编的 naming 静态文件;练习内容由重建后的词库按命名变换规则在生成时派生
- **技术长词**:重新精选,保留拆解结构(word/parts/aliases/note_zh)

重建后的词库同时承担两个角色:三个语言无关组别的数据源 + 语境卡片的标识符填充材料。

### 语料建设流水线

1. **手工种子清单**:每语言一份种子文件——语法模板 + 按域组织的 API 清单。人工质量把关集中在这一层
2. **生成脚本** `src/tools/buildProgrammingBasicsContent.ts`:模板 × 标识符词库展开成卡片;统一校验行长、字符集、去重。标识符填充按**语义配套组**取(集合名与元素名成对,如 items/item),符合最佳实践命名,不做无语义随机组合
3. **真实语料补充**:从 `contents/code/snippets/<语言>/block/easy` 筛选「单行、自包含、含目标符号/API」的真实语句,人工审核后并入

所有卡片带 `source_id`,纳入 `source_catalog.json` 溯源体系。

## 生成逻辑与语言联动

新函数(`src/training/targets.ts`):

- `buildSymbolsNumbersTarget(context)`:读 `symbols_numbers/<语言>.jsonl` 组卷
- `buildBuiltinApiTarget(context)`:读 `builtin_api/<语言>.jsonl` 组卷

语言决定规则(共用实战的 `code_practice` 语言设置,经 `openTuiCodeConfig` 读取):

1. 用户选了语言 → 按所选语言取卡;多选时**一次练习只用一门**(整卷同语言,轮换),不混合——不同语言的分号/引号/缩进习惯混练会互相干扰
2. 没选任何语言 → 从全部有语料的语言中随机
3. 所选语言无基础语料(实战 46 门 > 基础首批 13 门)→ 降级为全部语言随机,练习界面 hint 标注本卷实际语言,不报错不阻塞

组卷规则:每卷 8–10 张卡,每行一张;按 `topic`/`group` 均衡取样;避免与最近几次练习重复(复用项目已有的去重机制)。

练习模式:符号与数字、内置 API 用 `code` mode(与实战一致,按代码 token 统计、代码渲染);语言无关三项维持各自现有 mode。

## 基础综合拼卷

`programming_basics_mix` 整体替换为新拼卷:

- 符号数字卡 2–3 张
- 内置 API 卡 2–3 张
- 命名形式 1–2 行
- 常用词/长词 1–2 行
- 弱项数据(feedback terms)保留在卷首

## 清理范围(全删重写)

编程基础栏目相关的旧代码、旧语料、旧测试全部删除重写,不做兼容:

- 旧生成逻辑:`buildLessonSymbols`、旧 `buildProgrammingBasicsMixTarget` 等编程基础专用路径
- 旧语料:`symbols.json`(若仍被基础输入「符号标点」引用则保留文件、仅删编程基础侧使用——实现时核实引用)、`programming_words.json`、`naming.json`、`long_words.json`(重建替代)
- 旧测试:断言旧行为的用例全删,按新行为重写

## 测试策略(TDD)

1. 语料 schema 测试:遍历 `contents/programming_basics/**/*.jsonl`,校验 text 非空且单行、长度上限、topic/group 合法、无重复
2. 语言选择逻辑测试:选了语言用所选;多选轮换且整卷同语言;没选 → 全语言随机;无语料 → 全语言降级
3. 组卷测试:张数、topic/group 均衡、近期不重复
4. mix 拼卷构成测试
5. 菜单测试:programming 子菜单恰为新 6 项
6. 回归:`bun test tests` + `bun run typecheck` 全绿

## 不做的事(Non-goals)

- 实战错误统计反向驱动基础练习(方案 C):留待后续迭代,本次仅以 `focus`/`group` 字段留好接口
- 13 门之外语言的基础语料:后续按需追加
- 基础栏目内独立的语言选择 UI:共用实战设置,不新做
