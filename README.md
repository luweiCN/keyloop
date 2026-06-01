# KeyLoop

[English](README.en.md)

KeyLoop 是一个面向程序员的终端打字训练工具。它关注真实开发输入：英文词块、程序员词汇、代码符号、命名习惯和完整代码块。

打开后可以直接进入综合练习，也可以选择基础输入、代码实战或数据统计。KeyLoop 会把练习记录保存在本机，并根据最近的错误、慢项和键位热区调整后续练习内容。

默认中文界面，也可以切换英文。

## 核心闭环

```text
练习菜单 -> 今日练习 / 单项练习 -> 跟打 -> 记录 -> 报告 -> 调整内容
```

练习记录保存在：

```text
~/.keyloop/sessions.jsonl
~/.keyloop/preferences.json
~/.keyloop/daily_runs.json
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

正在跟打时可以按 `Ctrl+P` 暂停/继续；按 `Esc` 会暂停并打开退出选项。暂停期间计时、WPM 和按键事件时间都会停止。

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

也可以从源码安装：

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

没有历史记录时，综合练习会使用默认学习路径：

1. 基础输入：覆盖 Home/Top/Bottom row、手指过渡和最近弱键
2. 日常英语：常见词、词块和自然英文输入
3. 编程基础：数字、符号、命名和技术词
4. 代码实战：完整代码块和多行结构

有历史记录后，综合练习会根据最近 21 天的错误热区动态调整：高错键位会提高基础输入里的对应素材占比，高错符号会进入编程基础，高错词/标识符会进入日常英语或编程基础，慢项会回到完整代码块里练。每组完成后的错项和慢项也会影响后续模块内容，但不会再追加第二组完整符号或完整 Top row 专项。

入口菜单固定为 6 个入口：

- 综合练习：按今日动态计划练完基础练习、日常练习、编程基础和编程实战四个模块。
- 基础练习：进入二级菜单，选择 Home row、Top row、Bottom row、横向、竖向、手指移动等专项，底部有基础综合。
- 日常练习：进入二级菜单，选择常见 100 词、常见 500 词、常见 1000 词、日常句子或日常综合；单词入口可切换每组 10 / 20 / 50 / 100 词，句子入口内部切换短 / 中 / 长 / 混合。
- 编程基础：进入二级菜单，选择数字和符号、操作符/括号/引号、命名和驼峰、技术词或编程基础综合。
- 编程实战：进入二级菜单，选择代码块、函数块、文件片段或随机综合，并继续支持语言、框架、项目多选；选过或置顶的过滤项会排在列表顶部，并保存为全局代码范围，后续综合练习默认读取它。
- 数据统计：查看累计总时长、历史最高 WPM、平均正确率、最低错误率、错词/错键热区，并提示下一次综合训练会优先补什么。

## 内容方向

内置练习内容放在 `content/` 目录。内容结构见 [docs/content/CATALOG.md](docs/content/CATALOG.md)。

日常英语使用 `content/everyday_english.json`，这是 KeyLoop 自有手写清洁语料，覆盖日常/职场常见词、短语和短中长句；不会直接搬运外部打字网站词库。需要加入自己的工作句子或私有表达时，可以用 `KEYLOOP_EVERYDAY_CORPUS=/path/to/everyday.json` 合并本地语料。

练习内容会重点丰富：

- 基础键位和字母过渡：14 个基础专项，每个专项 56 组素材
- 英文拼写词块，例如常见前缀、后缀、三连字母和字母组合，内置 400+ 组
- 真正英语高频词，例如 `the`、`people`、`because`、`through`
- 程序员高频词和前端变量名，内置 900 组词和命名片段
- 数字行、括号、引号、箭头、比较符等代码符号，内置 200+ 组符号和 100+ 组数字模式
- 语言 / 框架感知符号，例如 TS/JS 的 `=>`、`?.`、`??`，Rust 的 `::`、`->`、`'a`，CSS/Sass 的 `@media`、`&`、`:root`，Solidity 的 `indexed`、`payable` 和 `mapping`
- camelCase、PascalCase、DOM/React/API 命名，内置 300+ 组
- TS / JS / Vue / Solidity / Rust / HTML / CSS / Less / Sass 代码块，每种语言和每个内置框架至少 100 条练习，并覆盖 block / function / file 三种层级

代码块优先使用完整语句、函数块和结构清晰的多行片段，不再抽单行碎片。默认启动会直接使用内置代码语料池，不扫描当前目录；只有传入 `--repo /path/to/project` 时，才会额外扫描指定仓库并和内置语料混合。代码缩进会在进入练习前做归一化：去掉整段共同的外层缩进，保留函数体、HTML 树、CSS 嵌套等相对缩进。代码模式下按 Enter 后会自动补齐下一行前导缩进空格，接近真实编辑器里的输入节奏。代码难度会根据近期代码练习的正确率、WPM 和错误率自动选择 easy / medium / hard 层级。

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
~/.keyloop/preferences.json
~/.keyloop/daily_runs.json
```

练习记录会包含目标文本、最终输入、按键事件、错误字符、token 统计、模块、分类、daily run ID 和 lesson ID；偏好记录会保存代码实战里置顶的语言、框架、项目过滤项、全局代码范围和日常英语设置。`daily_runs.json` 保存当天已经生成的综合训练计划，未完成时下次启动会继续同一份计划，完成后再次启动会生成当天下一份综合训练。用 `KEYLOOP_HOME=/path/to/dir` 可以切换数据目录。

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
