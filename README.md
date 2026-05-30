# KeyLoop

[English](README.en.md)

KeyLoop 是一个个人化的程序员终端打字训练工具。它不是通用打字游戏：打开后先显示练习菜单，可以选择“综合练习”按今日计划走完整流程，也可以只练某一个步骤。

默认中文界面，也可以切换英文。

## 核心闭环

```text
练习菜单 -> 今日练习 / 单项练习 -> 跟打 -> 记录 -> 报告 -> 调整内容
```

练习记录保存在：

```text
~/.keyloop/sessions.jsonl
```

可以用 `KEYLOOP_HOME` 改存储位置。

## 用法

```bash
keyloop
keyloop start
keyloop start --repo /path/to/project
keyloop report today
keyloop plan
keyloop import /path/to/project
keyloop sources
```

切换英文：

```bash
keyloop --language en
keyloop plan --language en
```

TUI 里也可以切换语言：菜单、计划和结果页按 `L`；正在跟打时按 `Ctrl+L`，避免和练习输入里的字母 `l` 冲突。
切换后，菜单、课程标题、课程说明和固定 UI 文案都会一起切换。

代码块练习可以按语言、框架或项目过滤：

```bash
keyloop start --code-language typescript
keyloop start --code-framework react
keyloop start --repo /path/to/project --code-language rust
```

## 安装

使用 Homebrew：

```bash
brew tap luweiCN/keyloop
brew install keyloop
```

也可以一条命令安装：

```bash
brew install luweiCN/keyloop/keyloop
```

当前仓库仍是 private，未配置 GitHub 私有仓库认证的普通 Homebrew 环境无法下载 release 资产。公开发布前，可以从源码安装：

```bash
cargo install --path .
```

也可以直接开发运行：

```bash
cargo run -- start
cargo run -- report today
cargo run -- plan
```

## 今日练习

默认每日目标是 20 分钟。可以一次练完，也可以零碎时间分几次练；每次完成都会累计到今日进度。TUI 会用文本显示 `已练 / 目标`，超过 20 分钟后继续显示真实累计时长。

当前课程结构：

1. 热身：基础键位
2. 词块：英文拼写块，例如 `the`、`tion`、`ing`、`ment`、`pre`、`con`、`str`
3. 高频词：真正英语常用词，不混大小写
4. 单词：前端高频词
5. 专项：数字和符号
6. 命名：大小写和前端 API
7. 代码块：前端短代码

软件里不再暴露练习长度、大小写、数字、符号、代码片段等开关。这些由内容计划和历史记录决定。

入口菜单保留两种练法：

- 综合练习：按上面的 7 个步骤顺序练。
- 单项练习：只选择其中一个步骤针对性练习。
- 数据统计：查看累计总时长、历史最高 WPM、平均正确率、最低错误率，并按日期切换查看每天每次练习的记录。

## 内容方向

内置练习内容放在 `content/` 目录，不再硬编码在 Rust 字符串数组里。内容结构见 [docs/content/CATALOG.md](docs/content/CATALOG.md)。

练习内容会重点丰富：

- 基础键位和字母过渡
- 英文拼写词块，例如常见前缀、后缀、三连字母和字母组合
- 真正英语高频词，例如 `the`、`people`、`because`、`through`
- 程序员高频词和前端变量名
- 数字行、括号、引号、箭头、比较符等代码符号
- camelCase、PascalCase、DOM/React/API 命名
- TS / JS / Solidity / HTML / CSS / Less / Sass 代码块

代码块优先使用完整代码块，不再只抽单行碎片。默认启动会直接使用内置代码语料池，不扫描当前目录；只有传入 `--repo /path/to/project` 时，才会额外扫描指定仓库并和内置语料混合。

## 指标

每次完成的练习会记录：

- 练习时长
- WPM 和原始 WPM
- 正确率
- 错误数
- 退格数
- 目标文本和最终输入
- 每次按键事件
- 错误字符
- 错误词块
- token 启动延迟和耗时

`keyloop report today` 查看当天练习；`keyloop plan` 查看当前建议和内容方向。

## 数据和隐私

KeyLoop 不上传练习数据。默认只写入本机：

```text
~/.keyloop/sessions.jsonl
```

记录里会包含目标文本、最终输入、按键事件、错误字符和 token 统计。用 `KEYLOOP_HOME=/path/to/dir` 可以切换数据目录。

功能规划见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## Development / Quality

```bash
cargo fmt
cargo test
cargo clippy -- -D warnings
cargo run -- plan
```

更多检查说明见 [docs/QUALITY.md](docs/QUALITY.md)。

## 发布 / Homebrew

本仓库采用 GitHub PR 工作流：

1. 功能分支提交 PR。
2. PR 通过 CI 后合并到 `main`。
3. `main` 上的 release workflow 读取 `Cargo.toml` 版本号。
4. 如果对应的 `vX.Y.Z` release 不存在，就自动构建 macOS/Linux 包、创建 GitHub Release，并更新 Homebrew tap。

发布和 Homebrew 说明见 [docs/RELEASE.md](docs/RELEASE.md)。
