# 质量检查

[English](QUALITY.md)

KeyLoop 是终端打字训练工具，所以代码变更既要检查 Rust 正确性，也要检查 TUI 行为。

## 必跑检查

提交前运行：

```bash
cargo fmt --check
cargo test
cargo clippy -- -D warnings
```

`cargo test` 已包含 CLI 集成检查，以及基于 ratatui `TestBackend` 的主要 TUI 页面渲染冒烟测试。

常用冒烟检查：

```bash
cargo run -- --help
cargo run -- plan
cargo run -- plan --language en
cargo run -- report today
cargo run -- import .
```

## TUI Review 重点

- 不要每帧清屏；正常重绘交给 ratatui diff rendering。
- 跟打面板保持居中和可读。
- 中文输入法提交的非 ASCII 字符应被忽略，不能推进练习。
- 换行和 Tab 标记必须在溢出前换行。
- 完成课程后停在结果页，不能直接退出。
- 小终端显示清晰提示，不渲染压坏的面板。

## 指标 Review 重点

- 正确率基于 insert 事件，修正过的错误仍然计入。
- Raw WPM 基于所有 insert 事件，包括后来被退格删掉的字符。
- 汇总统计要兼容新旧混合记录。
- 跨 token 回退重打后，token timing 不能把旧事件计入后续 token。
- report、stats 和 plan 对 legacy 记录使用一致的 effective typed length fallback。
