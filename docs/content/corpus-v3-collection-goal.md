# KeyLoop Corpus V3 代码采集
协调代理，只协调不亲自采集。每次只派一个子代理串行执行。

## 仓库要求
真实高质量开源项目。优先官方仓库、主流框架、成熟基础设施。通用语言优先 5k stars+；垂直库最低 1k；官方核心可低于 1k 须说明。不采低star无维护、demo spam、生成代码重、风格混乱的。**每个 domain 至少 10 个仓库，跨 domain 不可重复。**

## 采集顺序与 Domain 列表（43个，按此串行）
typescript, javascript, python, rust, go, react, vue, nextjs, solidity, html, css, tailwind, express, nestjs, django, fastapi, spring_boot, aspnet_core, gin, axum, rails, laravel, hono, fastify, nuxt, svelte, astro, angular, java, c, cpp, csharp, kotlin, swift, php, ruby, sql, shell, scss, sass, less, foundry, hardhat, openzeppelin

## Level 定义
- **block**: if/for/switch/try/const赋值组/type/interface/enum/对象数组字面量/导出常量组/短函数(≤6行)/同目的顺序语句。不拼凑不相关代码。
- **function**: 恰好一个 callable unit。不含多个同级函数。
- **file**: 完整不截断。排除 .d.ts/test/spec/fixture/generated/minified/lock/dist/build。

## Size（行数+字符数双满足）
|Level|Short|Medium|Long|
|---|---|---|---|
|block|3-8行,100-350ch|8-16行,350-700ch|15-28行,700-1100ch|
|function|6-16行,250-550ch|14-32行,550-900ch|28-50行,900-1300ch|
|file|20-60行,800-1200ch|40-100行,1200-1700ch|80-160行,1700-2500ch|

## 难度（质检时由 TS scorer 修正）
easy(0-5): 少符号、短标识符、简单赋值、基本英文单词
medium(6-10): 适度符号、camelCase、类型注解、对象操作
hard(11-14): 大量符号（泛型、位运算、正则）、长标识符、频繁大小写切换、嵌套解构

## 工作流程
对每个 domain 串行：
1. 按仓库标准搜索该 domain 的仓库（≥10个，与已采集不重复）
2. 对每个仓库串行：
   a. `gh api repos/{o}/{r}/commits/main --jq .sha` 取 SHA
   b. `git clone --depth 1 https://github.com/{o}/{r}.git /tmp/keyloop-repos/{o}--{r}`
   c. 派采集Agent从**本地文件**提取 → `content/corpus-v3/raw/{domain}/{o}--{r}.jsonl`
   d. `rm -rf /tmp/keyloop-repos/{o}--{r}`
   e. 派质检Agent审核 → `content/corpus-v3/final/{domain}/{o}--{r}.jsonl`

### 采集Agent
从本地文件读取（不用在线API），至少通读30个文件。每文件可提取多个不重叠代码段，相同模式只保留最有代表性的一条。

### 质检Agent
`python3 content/corpus-v2/validate.py {jsonl}` 校验 + `bun run ts/src/tools/scoreJsonl.ts {in} {out}` 评分 + 长度硬检查 + 难度修正 + 语义审查(真实代码/level正确/无截断/非import-only/无secrets) + normalized text / source range 去重

### JSONL 字段
id, corpus_version(3), quality("curated"), source_kind("github"), repo, repo_url, source_url(含commit SHA), commit_sha, file_path, start_line, end_line, technology_domain, language, framework, domain, level, difficulty, difficulty_score, difficulty_reasons, size, line_count(精确), char_count(精确), shape(≥1标签), text, license_spdx

## 关键约束
- 每次只派一个子代理串行，主代理只协调
- 长度硬要求（行数+字符数双满足）
- source_url 用 commit SHA
- 不生成代码，只从真实项目提取
- 不采 test/spec/fixture/generated/minified/lock
- 仓库不重复（跨 domain）
- tailwind/css/scss/sass/less/html 采使用方代码，非框架源码

## 目录
content/corpus-v3/raw/{domain}/ final/{domain}/ reports/{domain}/

## 完成
43 个 domain 各≥10 仓库、每仓库≥30 个文件后，全局统计评估缺口，决定是否补采。
