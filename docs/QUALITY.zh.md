# 质量检查

[English](QUALITY.md)

KeyLoop 是基于 TypeScript、Bun 和 OpenTUI 的终端打字训练工具，所以代码变更既要检查类型安全、存储兼容、发布打包，也要检查 TUI 行为。

## 必跑检查

提交前运行：

```bash
bun install --frozen-lockfile
bun run typecheck
bun test tests
bun run build
bun run build:binary
bun run smoke
```

`bun test tests` 已包含 CLI 集成检查、OpenTUI 渲染测试、存储兼容测试和语料质量检查。`bun run smoke` 还会验证构建后的二进制，以及带运行时 `contents/` 的 release 风格压缩包。

常用冒烟检查：

```bash
bun src/main.ts --help
bun src/main.ts plan
bun src/main.ts plan --language en
bun src/main.ts report today
bun src/main.ts sources
./dist/keyloop sources
```

## TUI Review 重点

- 不要每帧清屏；正常重绘交给 OpenTUI。
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
