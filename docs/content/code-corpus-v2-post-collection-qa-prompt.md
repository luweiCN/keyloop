# KeyLoop Corpus v2 采集完成后质量检查与返工提示词

把下面整段提示词交给负责采集语料的 Agent。这个提示词用于“采集完成之后”的质量检查、删除、重采和最终整理。

---

你是 KeyLoop 代码语料 QA / 返工 Agent。

当前采集阶段已经结束。你的任务不是继续随意追加语料，而是对已经采集到的全部 `content/corpus-v2` 数据做最终质量检查。所有不合格记录必须删除并按同一个 `technology_domain / level / difficulty / size` 重新采集替代记录，直到最终语料达到质量门禁。

## 目标模式结束条件

如果你在目标模式下执行本提示词，只有满足下面全部条件，才可以把目标标记为完成：

```text
invalid_json = 0
missing_text = 0
quality_gate.status_counts.reject = 0
quality_gate.status_counts.review = 0
coverage_after_quality_gate.shortfall_cells.length = 0
每个 technology_domain / level / difficulty / size 格子 accepted 数量 >= 30
content/corpus-v2/final/corpus.jsonl 可被 validate.py 完整校验通过
```

换句话说：所有最终代码块都必须通过质量检查，并且数量达标。

如果某些格子因为公开仓库中确实找不到合格代码而无法补齐，不要把目标标记为完成。你必须继续尝试同 domain 的其他高质量 repo；只有在连续多轮尝试后仍无法找到合格样本，并且已经输出明确的 `remaining_shortfalls` 和 `recollection_plan`，才可以报告 blocked。

## 硬性约束

1. 不要修改应用代码。
2. 不要修改 TS / Rust 读取语料的逻辑。
3. 不要修改 JSONL schema。
4. 不要修改目录契约。
5. 不要降低质量门禁阈值。
6. 不要为了凑数保留低质量片段。
7. 最终只交付稳定数据文件和报告。

后续 KeyLoop TS 版本会直接读取固定路径和固定 schema，所以你必须保证最终数据可以“不改代码直接接入”。

## 固定目录契约

项目根目录：

```text
/Users/luwei/code/ai/keyloop
```

最终语料必须写入：

```text
content/corpus-v2/final/corpus.jsonl
```

质量报告必须写入：

```text
content/corpus-v2/reports/typing_difficulty_report.json
content/corpus-v2/reports/post_collection_qa_summary.json
```

可选中间文件可以放在：

```text
content/corpus-v2/raw/
content/corpus-v2/accepted/
content/corpus-v2/reports/
```

但最终应用只依赖：

```text
content/corpus-v2/final/corpus.jsonl
```

## 固定数据格式

最终文件必须是 JSONL。

要求：

- 每一行是一个完整 JSON object。
- 不要输出 Markdown。
- 不要输出数组外壳。
- 不要输出解释性文字。
- 不要夹杂日志。
- 不要空行。

每条记录必须使用下面 schema，字段名不能改：

```json
{
  "id": "github:owner/repo:path/to/file.ts:120-148",
  "corpus_version": 2,
  "quality": "curated",
  "source_kind": "github",
  "repo": "owner/repo",
  "repo_url": "https://github.com/owner/repo",
  "source_url": "https://github.com/owner/repo/blob/<commit_sha>/path/to/file.ts#L120-L148",
  "commit_sha": "<full commit sha>",
  "file_path": "path/to/file.ts",
  "start_line": 120,
  "end_line": 148,
  "technology_domain": "typescript",
  "language": "typescript",
  "framework": "react",
  "domain": "frontend",
  "level": "function",
  "difficulty": "medium",
  "difficulty_score": 6,
  "difficulty_reasons": [
    "moderate symbol density",
    "mixed identifier casing",
    "async control flow"
  ],
  "size": "medium",
  "line_count": 29,
  "char_count": 812,
  "shape": ["async", "error-handling", "react-hook"],
  "skeleton_hash": "",
  "text": "actual source code text"
}
```

字段要求：

- `id` 必须稳定且唯一。
- `source_url` 必须固定到 commit，不要指向 `main` / `master`。
- `commit_sha` 必须是完整 commit sha。
- `text` 必须保持原始代码缩进。
- `line_count` 必须等于 `text.split("\n").length`。
- `char_count` 必须等于 `text.length`。
- `shape` 必须至少有 1 个标签，建议 2-5 个。
- `difficulty_score` 必须是 0-14 的整数。
- `difficulty_reasons` 必须非空，且解释输入难度来源。
- `skeleton_hash` 如果为空，最终整理阶段必须补齐。

## 覆盖目标

每个 `technology_domain` 都要覆盖：

```text
level: block / function / file
difficulty: easy / medium / hard
size: short / medium / long
```

每个组合目标 30 条。

即每个 `technology_domain`：

```text
3 levels x 3 difficulties x 3 sizes x 30 = 810 条
```

不要用降低质量标准的方式填满格子。缺哪个格子，就重采哪个格子。

## 尺寸标准

按实际行数判断：

```text
block:
  short 3-5
  medium 6-10
  long 11-18

function:
  short 6-12
  medium 13-28
  long 29-50

file:
  short 20-45
  medium 46-100
  long 101-180
```

## 输入难度标准

`difficulty` 是输入练习难度，不是代码理解难度。

评分维度：

```text
symbol density
shift-key load
digits and alphanumeric mixes
identifier complexity
edge-key load
input-mode transitions
tricky operator sequences
```

分数区间：

```text
easy: 0-5
medium: 6-10
hard: 11-14
```

如果 `difficulty_score` 和 `difficulty` 不匹配，必须修 metadata 或重采。

## 默认拒绝规则

以下内容只要出现，默认不进入最终语料。删除并按同格子重采。

```text
comment_only
license_header
license_only
doc_comment
high_comment_ratio
doc_marker
prose_only
no_code_signal
import_only
placeholder_only
minified_line
```

解释：

- `comment_only`：纯注释。
- `license_header`：非 SPDX 的 license/copyright 文件头。
- `license_only`：纯 license/copyright 说明。
- `doc_comment`：JSDoc、Rust doc comment、Python docstring、Go declaration doc 等文档注释。
- `high_comment_ratio`：注释占比过高。代码训练不应该变成英文段落训练。
- `doc_marker`：`docregion`、`endregion`、`snip`、教程抽取标记。
- `prose_only`：自然语言说明片段。
- `no_code_signal`：没有可识别代码结构。
- `import_only`：纯 import / export / use / using / include。
- `placeholder_only`：`...`、TODO placeholder、示例占位。
- `minified_line`：压缩代码或超长单行。

## 允许保留的短注释例外

以下属于代码输入习惯的一部分，可以保留：

```text
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
#!/usr/bin/env bash
#!/usr/bin/env python3
//go:build linux
// +build linux
/// <reference types="vite/client" />
```

要求：

- Solidity 文件头里的 `SPDX + pragma` 必须允许保留。
- 这些 directive 只允许作为短指令出现。
- 不要把普通解释性注释伪装成 directive。

## 好代码标准

最终保留的记录必须满足：

1. 来自真实高质量开源项目。
2. 是实际工程代码，不是教程说明、文档片段、生成模板。
3. 片段结构完整，不是随机截断。
4. `block` 是完整控制流、声明块、配置块、模板块、样式规则块等。
5. `function` 是完整函数、方法、组件、hook、handler、test case 或等价闭合结构。
6. `file` 是合理完整文件，不是文件头、纯导入区、纯文档区。
7. 不包含 generated、snapshot、fixture、lock、dist、build、vendor、node_modules、minified 内容。
8. 不包含纯注释、纯说明、纯导入、纯类型名列表、纯枚举成员列表。
9. 不手动改写、重排、美化源码。
10. 如果原始代码不适合，换来源，不要改源码凑合。

## 重新采集标准

只要一条记录被删除，就必须按原记录所属格子重采替代。格子定义为：

```text
technology_domain / level / difficulty / size
```

重采目标：

- 替代记录必须属于同一个 `technology_domain`。
- 替代记录必须属于同一个 `level`。
- 替代记录必须属于同一个 `difficulty`。
- 替代记录必须属于同一个 `size`。
- 如果同格子长期无法找到合格样本，记录到 `post_collection_qa_summary.json.remaining_shortfalls`，不要用错误难度或错误尺寸的样本凑数。

重采来源标准：

1. 优先从 `collection_plan.json` 中该 `technology_domain` 对应的高质量仓库采集。
2. 优先选择真实项目核心代码、常见业务代码、库内部实现、框架常见模式。
3. 不要从文档示例、教程片段、README、demo prose 中采集。
4. 不要从 generated、fixture、snapshot、dist、build、vendor、node_modules、lock 文件中采集。
5. 不要采集纯 import 区、文件头注释区、长注释区、类型名列表、枚举值列表。
6. 如果原文件某个片段不合格，优先在同文件附近重新切一个完整代码结构；如果附近没有合格结构，换同 repo 其他文件；如果同 repo 不足，换同 domain 其他高质量 repo。

重采切片标准：

- `block`：切完整语句块、声明块、配置块、模板块、样式规则块，不要切半个结构。
- `function`：切完整函数、方法、组件、hook、handler、test case 或等价闭合结构。
- `file`：切合理完整文件；跳过文件头注释和纯导入段，不能只拿文档区。
- 必须保持原始代码，不要手动美化或改写。
- 必须重新计算 `line_count`、`char_count`、`size`、`difficulty_score`、`difficulty_reasons`、`shape`、`skeleton_hash`。

重采完成后的替代记录必须重新跑质量门禁。只有 `accept` 记录可以填补目标格子。

## 执行流程

第一步：冻结当前采集结果。

不要边 QA 边随意追加。先把当前所有 raw/accepted/final 候选整理成一个候选集。

第二步：生成质量报告。

在项目根目录运行：

```bash
bun run corpus:typing-difficulty
```

读取：

```text
content/corpus-v2/reports/typing_difficulty_report.json
```

第三步：处理 reject。

对所有 `quality_gate.status_counts.reject` 对应记录：

- 删除。
- 记录删除原因。
- 按同一个 `technology_domain / level / difficulty / size` 重采替代。

第四步：处理 review。

review 不能留到最终语料。review 只能作为中间状态处理：

1. metadata 可机械修复，例如 `line_count_mismatch`、`char_count_mismatch`、`size_mismatch`，修复后必须重新跑质量门禁，并变成 `accept`。
2. 如果无法修到 `accept`，删除并按同格子重采。

如果 review 里出现默认拒绝 flag，按 reject 处理。

第五步：补齐覆盖。

读取：

```text
coverage_after_quality_gate.shortfall_cells
```

对每个缺口格子重采，直到每格达到 30 条合格记录。

第六步：重新生成最终文件。

输出：

```text
content/corpus-v2/final/corpus.jsonl
```

要求：

- 去重。
- `id` 唯一。
- `skeleton_hash` 正确。
- JSONL 可解析。
- 每行 schema 完整。
- 不包含 reject 记录。

第七步：验证。

运行：

```bash
bun run corpus:typing-difficulty
python content/corpus-v2/validate.py content/corpus-v2/final/corpus.jsonl
python content/corpus-v2/validate.py --stats content/corpus-v2/final/corpus.jsonl
```

通过标准：

```text
invalid_json = 0
missing_text = 0
reject = 0
review = 0
每个目标格子 >= 30
```

如果不满足，继续重采，不要交付。

## 最终交付

必须交付：

```text
content/corpus-v2/final/corpus.jsonl
content/corpus-v2/reports/typing_difficulty_report.json
content/corpus-v2/reports/post_collection_qa_summary.json
```

`post_collection_qa_summary.json` 格式：

```json
{
  "input_records": 0,
  "final_records": 0,
  "removed_count": 0,
  "recollected_count": 0,
  "fixed_metadata_count": 0,
  "remaining_reject_count": 0,
  "remaining_review_count": 0,
  "coverage_complete_cells": 0,
  "coverage_shortfall_cells": 0,
  "top_removed_flags": [],
  "remaining_shortfalls": [],
  "notes": []
}
```

## 禁止事项

1. 不要修改 KeyLoop 应用代码。
2. 不要改 schema。
3. 不要改最终路径。
4. 不要输出数组格式。
5. 不要保留默认拒绝项。
6. 不要把英文说明文字当代码。
7. 不要把纯 import 当 block。
8. 不要通过改 `difficulty` / `size` 掩盖缺口。
9. 不要手动改写源码。
10. 不要降低质量门禁。

## 最终回复格式

完成后只汇报：

```text
final corpus path:
report path:
summary path:
final record count:
reject count:
review count:
complete cells:
shortfall cells:
verification commands:
```

如果还没有通过，不要说完成，直接说明剩余 reject/review/shortfall 数量和下一轮重采计划。
