# 2026-06-16 综合训练组卷、结算页与返回导航

## 症状

- 45 分钟综合训练里，单词、符号、句子阶段的计划时间和实际用时差距很大。
- 单词、句子、文章跨天重复明显。
- 结算页只有第一行高亮，其他行像禁用状态。
- 结算页缺少原始 WPM、最快/最慢等关键指标。
- 从最终结算页按 Esc 会直接退出应用，而不是回到菜单。

## 根因

- 综合训练的懒加载阶段按 char budget 生成目标，但单词硬上限只有 40 个，句子硬上限只有 8 句，符号阶段只裁剪一组 programming basics 内容，不会补足预算。
- 最近内容过滤只覆盖了部分 standalone everyday 来源，没有覆盖 `keyloop:stage:*` 这类综合训练记录。
- 最终结算使用原始 daily plan 里的 pending lessons，未使用实际 materialized target 重新计算后的 estimated minutes。
- summary route 的强调规则只返回第 0 行，导致后续 summary 文案被 renderer 当成非重点文本降色。
- `waitForSummaryDismiss` 对 Enter/Esc/Q 都销毁 renderer，app 模式下 Esc 之后虽然返回 state，但真实 renderer 已不可再渲染菜单。

## 修复

- 单词/句子阶段改为按预算选取，取消过低硬上限；符号阶段预算大时会补充数字/标点基础行。
- 单词、句子、文章的最近过滤覆盖综合训练来源，优先避开最近 12 条相关记录中出现过的内容。
- materialize 后根据真实 target 字符数重新计算 estimated_minutes，并在最终 summary 使用 materialized lessons。
- summary route 全部行使用正常 foreground，并增加 Raw WPM、最快/最慢速度。
- summary dismiss 区分 return/quit：Esc 返回菜单且保留 renderer，Q/Ctrl-C 才退出；直接 start 模式下 Enter 仍可结束。

## 后续修正

- 综合训练不应靠练习历史避重来掩盖随机性问题。已撤掉 `keyloop:stage:*` 的历史避重，保留真正随机抽样；如果算法正常后仍高频重复，再扩充语料库。
- 单词阶段不再用“更多不同单词”硬填预算。现在根据该用户 `words` 形态速度换算出的 char budget，在候选 `(不同词数, 统一重复次数)` 中评分选择。重复次数对本轮所有单词统一，避免弱项词和普通词混用不同重复数。
- 句子阶段不再把句子堆到 30 句。现在根据该用户 `sentences` 形态预算，在 `(句子数, 文章数)` 候选中评分选择；预算较大时用文章吸收剂量，句子只做热身/补足。
- 中文时间单位统一补全为“分钟”，覆盖 TUI 计划页、结算页、目标提示、练习状态栏和 CLI 报告。

## 验证

- `bun test tests`
- `bun test tests/package.test.ts`
- `bun run typecheck`
- `bun run build`
- `bun run build:binary`
- 本地二进制 `--help` / `sources` 冒烟通过。
- 解压 `dist/keyloop-0.4.2-aarch64-apple-darwin.tar.gz` 后运行包内 `bin/keyloop --help` / `sources` 冒烟通过。
