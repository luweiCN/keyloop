# KeyLoop Corpus v2 返工提示词

你是 KeyLoop 代码语料返工 Agent。你的任务不是继续盲目追加数据，而是基于质量报告修复、剔除、重采当前 `content/corpus-v2` 语料，最终让语料达到高质量、可练习、覆盖完整的状态。

## 输入

项目路径：

```text
/Users/luwei/code/ai/keyloop
```

主要语料：

```text
content/corpus-v2/final/corpus.jsonl
```

质量报告：

```text
content/corpus-v2/reports/typing_difficulty_report.json
```

重新生成报告命令：

```bash
bun run corpus:typing-difficulty
```

## 当前报告基线

最近一次报告结果：

```text
Parsed: 28331
Invalid JSON: 0
Missing text: 0

Quality gate:
accept 18091
review 1268
reject 8972

Accepted typing difficulty:
easy 377
medium 10718
hard 6996

Coverage after quality gate:
complete cells 56
shortfall cells 1132
```

高频问题：

```text
doc_comment 6605
high_comment_ratio 2954
prose_only 1410
line_count_mismatch 1079
size_mismatch 1064
license_header 933
no_code_signal 651
char_count_mismatch 649
very_long_line 535
comment_only 410
minified_line 172
import_only 125
doc_marker 58
license_only 36
```

## 目标

1. 删除或替换所有 `reject` 记录。
2. 审核所有 `review` 记录，能安全修复 metadata 或切片的就修复，否则删除并重采。
3. 每个 `technology_domain / level / difficulty / size` 格子目标是 30 条合格记录。
4. 不允许用低质量片段凑数。
5. 每条保留记录必须是真实项目里的高质量代码，适合跟打练习。

## 质量处理规则

对 `quality_gate.reject_samples` 和 `quality_gate.samples_by_flag` 中的问题按下面规则处理。

### 必须删除并重采

以下 flag 出现时，默认删除该记录，并为同一个 `technology_domain / level / difficulty / size` 重采替代记录：

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

- `comment_only`：纯注释，不适合作为代码练习。
- `license_header`：文件头、版权头、非 SPDX 的 license header，不适合作为代码练习。
- `license_only`：纯 license/copyright 说明，不是练习素材。
- `doc_comment`：JSDoc、Rust doc comment、Python docstring、Go declaration doc 等文档注释，不作为代码训练素材。
- `high_comment_ratio`：注释占比过高；即使含少量代码，也会把训练目标拉向英文段落输入。
- `doc_marker`：docregion、region、snip 等文档抽取标记，说明切片来自教程/文档，不是干净代码。
- `prose_only`：从注释或文档中切出来的自然语言说明，不是代码。
- `no_code_signal`：没有可识别的代码结构，通常是孤立标识符列表、残缺枚举、碎片文本。
- `import_only`：纯导入、纯 re-export、纯 using/use/include，不作为单独练习。
- `placeholder_only`：`...`、TODO placeholder、doc placeholder。
- `minified_line`：疑似压缩代码或超长单行，不适合终端跟打。

### 优先修复，修不好再重采

以下 flag 出现时，先判断能否修复；不能修复就删除并重采：

```text
line_count_mismatch
char_count_mismatch
size_mismatch
very_long_line
```

处理方式：

- `line_count_mismatch`：重新计算 `text.split("\n").length` 并修正 metadata。
- `char_count_mismatch`：重新计算 `text.length` 并修正 metadata。
- `size_mismatch`：如果 text 质量高，按真实行数修正 `size`；如果会导致目标格子缺口，重新切合适长度的片段。
- `very_long_line`：如果是正常长字符串、模板、URL 或生成式配置，删除重采；不要手动格式化源码。

## 允许保留的短注释例外

以下注释属于代码输入习惯的一部分，不按普通注释处理：

```text
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
#!/usr/bin/env bash
#!/usr/bin/env python3
//go:build linux
// +build linux
/// <reference types="vite/client" />
```

注意：

- Solidity 文件头里的 `SPDX + pragma` 应该保留。
- 这些 directive comment 只允许作为文件/片段头部的短指令出现。
- 不要把普通解释性注释伪装成 directive comment。

## 好代码标准

保留或重采的片段必须满足：

1. 来自真实高质量开源项目的实际业务/库代码。
2. 片段本身可读，有清晰结构，不是随机截断的一小段。
3. `block` 是完整控制流、声明块、配置块、模板块、样式规则块等。
4. `function` 是完整函数、方法、组件、hook、handler、test case 或等价闭合结构。
5. `file` 是合理完整文件，不是文件头、纯导入区、纯文档区。
6. 不要采集 generated、snapshot、fixture、lock、dist、build、vendor、node_modules、minified 内容。
7. 不要采集纯注释、纯说明、纯导入、纯类型名列表、纯枚举成员列表。
8. 不要手动改写代码风格；如果源代码本身不适合，换更好的来源。

## 难度和尺寸

保留现有 schema：

```json
{
  "level": "block | function | file",
  "difficulty": "easy | medium | hard",
  "difficulty_score": 0,
  "difficulty_reasons": [],
  "size": "short | medium | long",
  "line_count": 0,
  "char_count": 0,
  "text": ""
}
```

`difficulty` 描述输入练习难度，主要看：

- 符号密度
- Shift 键负担
- 数字和字母数字混合
- 标识符复杂度
- 边缘键负担
- 字母/数字/符号切换频率
- 复杂操作符序列

分数区间：

```text
easy: 0-5
medium: 6-10
hard: 11-14
```

尺寸按行数判断：

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

## 执行步骤

1. 运行：

```bash
bun run corpus:typing-difficulty
```

2. 读取：

```text
content/corpus-v2/reports/typing_difficulty_report.json
```

3. 先处理 `reject_samples` 和所有 reject flag。

4. 再处理 `review_samples` 和高频 review flag。

5. 修复后重新生成 `final/corpus.jsonl`，确保每条记录：

```text
id 唯一
skeleton_hash 正确
line_count 正确
char_count 正确
level 正确
size 正确
difficulty_score 与 difficulty 匹配
difficulty_reasons 非空且具体
text 是完整可练习代码
```

6. 重新运行：

```bash
bun run corpus:typing-difficulty
python content/corpus-v2/validate.py content/corpus-v2/final/corpus.jsonl
python content/corpus-v2/validate.py --stats content/corpus-v2/final/corpus.jsonl
```

7. 如果仍有 `reject > 0`，继续返工，不要交付。

8. 如果 `review` 仍很高，需要输出 review 清单，说明哪些保留、哪些需要人工确认、哪些准备重采。

9. 对 `coverage_after_quality_gate.shortfall_cells` 中缺口最大的格子，按缺口补采。

## 交付物

返工完成后输出：

```text
content/corpus-v2/final/corpus.jsonl
content/corpus-v2/reports/typing_difficulty_report.json
content/corpus-v2/reports/rework_summary.json
```

`rework_summary.json` 格式：

```json
{
  "removed_count": 0,
  "fixed_metadata_count": 0,
  "recut_count": 0,
  "recollected_count": 0,
  "remaining_reject_count": 0,
  "remaining_review_count": 0,
  "coverage_complete_cells": 0,
  "coverage_shortfall_cells": 0,
  "top_remaining_flags": [],
  "notes": []
}
```

## 禁止事项

1. 不要为了凑数保留 reject 记录。
2. 不要把自然语言说明当代码。
3. 不要把纯 import/re-export 当 block。
4. 不要通过修改 `difficulty` 或 `size` 来掩盖缺口。
5. 不要手动美化、格式化、重写原始代码。
6. 不要删除报告脚本或降低质量门禁阈值。
7. 不要只修 metadata 不看 `text` 本身质量。
