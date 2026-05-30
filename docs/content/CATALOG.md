# Content Catalog

## 中文

KeyLoop 的练习内容不再写在 Rust 源码的大字符串数组里。内置内容放在仓库根目录的 `content/`：

- `warmup.json`：基础键位、重复键位、字母过渡。
- `word_chunks.json`：常见词块、前缀、后缀、程序员常见拼写块。
- `common_words.json`：高频英文词。
- `programming_words.json`：前端、Web3、Rust 和常见程序员词。
- `symbols.json`：代码符号、括号、箭头、比较符、模板字符串、泛型等。
- `number_drills.json`：数字行和代码里的数字模式。
- `naming.json`：camelCase、PascalCase、DOM/React/Vue/Nest/Solidity/Rust 名称。
- `code_snippets.json`：内置短代码块，带 `language`、`framework`、`project`、`level`。
- `source_catalog.json`：未来可抽取代码语料的候选开源仓库、license 和用途。

代码块当前支持这些过滤参数：

```bash
keyloop start --code-language typescript
keyloop start --code-framework react
keyloop start --code-project keyloop-builtin
keyloop start --repo /path/to/project --code-language rust
```

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

KeyLoop training content is no longer embedded as large Rust string arrays. Built-in content lives in the root `content/` directory.

Code snippets carry `language`, `framework`, `project`, and `level` metadata, so future plans can choose React/Vue/NestJS/Solidity/Rust or local repository snippets without changing Rust source.

Use:

```bash
keyloop sources
```

to inspect recommended source repositories and their license metadata.
