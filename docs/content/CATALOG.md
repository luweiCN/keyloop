# Content Catalog

## 中文

KeyLoop 的练习内容放在仓库根目录的 `content/`，便于扩充和审阅：

- `warmup.json`：基础键位、重复键位、字母过渡。
- `foundation_drills.json`：基础练习专项，按键盘行位、左右手、手指、横向、竖向、斜向和边缘标点拆分。
- `word_chunks.json`：常见词块、前缀、后缀、程序员常见拼写块。
- `common_words.json`：高频英文词。
- `programming_words.json`：前端、Web3、Rust 和常见程序员词。
- `symbols.json`：代码符号、括号、箭头、比较符、模板字符串、泛型等。
- `language_symbols.json`：语言和框架特定符号专项，例如 TS/JS、Vue、React、NestJS、Rust、Solidity、CSS、SCSS、Less。
- `number_drills.json`：数字行和代码里的数字模式。
- `naming.json`：camelCase、PascalCase、DOM/React/Vue/Nest/Solidity/Rust 名称。
- `code/*.json`：按方向拆分的手工精选代码语料，带 `language`、`framework`、`project`、`level`。
  当前包括 `react`、`vue`、`nestjs`、`solidity`、`rust`、`web`、`css`。
- `code/generated/*.json`：KeyLoop 自有补充语料，保证 `typescript`、`javascript`、`vue`、`solidity`、`rust`、`html`、`css`、`scss`、`less` 每种语言至少 120 条。
- `source_catalog.json`：内置代码语料和后续精确抽取使用的开源来源、license 和用途。
- `tools/build_foundation_content.py`：生成基础练习、词块、符号、数字、命名和程序员词补充语料的确定性脚本。
- `tools/build_generated_code_corpus.py`：生成 `code/generated/*.json` 的确定性脚本。

代码块当前支持这些过滤参数：

```bash
keyloop start --code-language typescript
keyloop start --code-framework react
keyloop start --code-project nextjs
keyloop start --repo /path/to/project --code-language rust
```

普通 `keyloop` 和 `keyloop start` 不会扫描当前目录，避免在大仓库中进入 TUI 前卡住。
只有显式传入 `--repo /path/to/project` 时，才会扫描指定仓库；`keyloop import /path/to/project` 可用于预览扫描结果。

TUI 里的“代码专项”支持多选语言、框架和项目；如果没有选择，则使用全部代码语料。每组完成后按 Enter 会继续生成下一组，并尽量避开本机历史里已经练过的代码片段。

TUI 里的“基础练习”支持单选专项，例如 Home row、Top row、Bottom row、横向连打、竖向楼梯、斜向过渡和小指边缘键。每组完成后按 Enter 会继续同一个专项的下一组。

TUI 里的“综合练习”按当天计划动态生成。没有历史记录时使用默认学习路径；有最近 21 天历史后，会根据 `error_chars`、`key_events`、`error_tokens`、`token_stats` 自动调整今日组别。高错键位会触发 `Foundation` 组，高错符号会增加 `Symbols` 权重，高错词/标识符会优先进入 `Chunks` 和 `Words`，慢项/错项会进入完整代码块。每个 `PracticeLesson` 都带中英文 `reason`，用于计划页和完成页说明安排原因。

查看推荐语料来源：

```bash
keyloop sources
```

## License Policy

KeyLoop 是 MIT 项目。外部内容进入仓库前必须确认 license：

- MIT、Apache-2.0、BSD、ISC、CC0 等宽松 license 可以作为候选，但仍要保存来源。
- GPL 项目只借鉴结构，不直接复制素材进仓库。
- 无 license 的项目不复制内容。
- 从真实代码仓库抽取代码块时，必须记录 repo、license、commit、path、line range 和 origin URL。

## English

KeyLoop training content lives in the root `content/` directory so it can be reviewed and expanded without changing trainer logic.

Built-in code snippets live under `content/code/*.json` and carry `language`, `framework`, `project`, and `level` metadata, so future plans can choose React/Vue/NestJS/Solidity/Rust or local repository snippets without changing Rust source.

Indentation is normalized before practice: repository-extracted blocks strip the minimum shared leading indentation, and built-in snippets are normalized the same way when loaded. Relative indentation inside functions, CSS rules, and HTML/Vue trees is preserved.

Foundation drills live in `content/foundation_drills.json`. They are generated from `tools/build_foundation_content.py` and grouped by row, hand, finger, horizontal movement, vertical movement, diagonal movement, punctuation edges, and English transitions.

Code focus mode supports multi-select language/framework/project filters inside the TUI. After each completed group, Enter generates another group and skips recently practiced snippets when the corpus still has unused material.

Full practice is adaptive. With no history it uses the default learning path; with recent history it reads key errors, token errors, slow tokens, and code terms to decide whether to add foundation, symbol, word/chunk, naming, or complete-code groups. Lesson reasons are rendered in both the plan screen and the completion screen.

Use:

```bash
keyloop sources
```

to inspect recommended source repositories and their license metadata.
