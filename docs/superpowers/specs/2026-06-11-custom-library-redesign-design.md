# 自建语料库重设计 + 内置词典集成

日期：2026-06-11
状态：已确认（用户逐项决策）

## 背景与目标

2026-06-10 的 custom corpus 实现（P1-P3）走的是"收藏"模型：错词捕捉、全局的我的单词/句子/文章、CLI 录入。这与用户的真实意图不符。用户要的是：

1. **真正独立的自建语料库**：与内置语料库平级，每个库内部可同时包含单词、词组、句子、文章。
2. **全程 TUI 操作**：创建库、录入内容、编辑管理都在 TUI 菜单里完成，不再依赖 CLI。
3. **内置词典**：集成 ECDICT 英汉词典，新增单词时自动查出释义，无需手动补充。

旧的收藏式功能**全部移除**，旧数据（`~/.keyloop/` 下的 vocabulary/sentences/articles/collections）**直接丢弃，不迁移**（磁盘文件不主动删除，代码不再读写）。

## 1. 数据模型

每个自建语料库一个文件：`~/.keyloop/libraries/<slug>.json`。slug 由名称自动生成：纯 ASCII 名称转 kebab-case；含中文等非 ASCII 字符时使用 `lib-<序号>`；冲突时追加序号。slug 仅作文件名与内部 ID，界面始终显示 name。

```typescript
interface CustomLibrary {
  slug: string;
  name: string;            // 显示名，如「考研英语」
  created_at: string;
  words: CustomWord[];
  sentences: CustomSentence[];
  articles: CustomArticle[];
}

interface CustomWord {
  id: string;
  text: string;            // 含空格 → 自动归类为词组（phrase）
  kind: "word" | "phrase"; // 录入时按是否含空格自动判定
  meaning_zh?: string;     // 手动给出或词典查得；查不到则为空
  phonetic?: string;       // 词典查得（音标文本）
  source: "dict" | "manual";
}

interface CustomSentence {
  id: string;
  text: string;
  translation_zh?: string;
}

interface CustomArticle {
  id: string;
  title: string;
  paragraphs: { text: string; translation_zh?: string }[];
}
```

一库一文件的附带好处：备份/分享一个语料库就是拷一个 JSON。

## 2. 词典模块（`src/content/dictionary.ts`）

两级词典，数据源为开源 ECDICT：

- **精简版（打包进仓库）**：`contents/dictionary_mini.json`，数万常用词，`word → { phonetic, translation_zh }`。离线零配置可用。由脚本从 ECDICT 精简词表生成（`scripts/` 下提供生成脚本）。
- **完整版（后台下载）**：TUI 启动时检查 `~/.keyloop/dict/ecdict.db`；不存在则后台静默下载 ECDICT 官方 SQLite 版（压缩包约 55MB，解压后约 350MB，约 340 万词条，含词组短语）。下载到临时文件、解压校验后**原子 rename** 就位——存在即完整，无需状态标志。失败静默放弃，下次启动重试，不打扰前台。
- **查询接口** `lookupWord(text): { phonetic?: string; translation_zh?: string } | null`：
  - 完整版存在 → `bun:sqlite` 索引查询（零 npm 依赖，毫秒级）；
  - 否则 → mini JSON 查询；
  - 归一化：先查原文，未命中再试小写。
  - 词组（含空格）同样可查（ECDICT 收录常见词组）。
- 设置页显示词典状态：精简版 / 完整版已就绪 / 下载中。

注：ECDICT 只有音标文本，**没有发音音频**。真人发音（如有道发音 API）留作后续功能，本次不做。

## 3. TUI 交互

### 菜单结构

主菜单「自建语料库」子菜单：

```
<库 A>（N 词 · N 句 · N 篇）
<库 B>（…）
──────────
新建语料库
管理语料库
```

### 新建语料库

输入名称 → 回车创建空库。

### 录入内容（管理语料库 → 选库 → 添加）

- **添加单词/词组**：多行输入区，每行一条：`text` 或 `text: 中文释义`。
  - 带冒号 → 用手动释义（source: manual）；
  - 不带 → 查词典自动填（source: dict）；
  - 含空格 → kind 自动判为 phrase；
  - 提交后进入**预览确认页**：逐行显示解析结果与释义，查不到且未手动给释义的条目标黄提示，仍允许保存（释义留空，之后可编辑补上）。
  - 该格式天然支持单条与批量录入。
- **添加句子**：单次粘贴，交替格式——每块第 1 行英文、第 2 行中文翻译（可省略），**空行分隔条目**：

  ```
  The weather is nice today.
  今天天气很好。

  I'll see you tomorrow.
  明天见。
  ```

- **添加文章**：输入标题 → 单次粘贴：**整篇英文在前（每段一行，段间不空行），一个空行，整篇中文在后（每行对应一段）**；中文块可省略（无翻译）。不使用任何分隔符。

  ```
  First paragraph in English...
  Second paragraph in English...

  第一段的中文翻译……
  第二段的中文翻译……
  ```

- 单次粘贴的就近配对取代了原"两次粘贴整体对齐"方案：错位只影响单个条目/段落，不会从中间错到结尾。

### 管理

管理语料库 → 库列表 → 进入某库：

- 添加单词 / 添加句子 / 添加文章
- 浏览编辑（按内容类型进入）：复用 `codeFilterPicker` 的模糊搜索选择器——搜索过滤 → 回车编辑该条 → `d` 删除单条（带确认）
- 删除整库（带确认）

### 新组件

- **多行输入区**：现有 TUI 仅有单行搜索输入，需新写多行文本输入组件（换行、退格、整段粘贴）。
- 新增 route screens：库表单（新建）、管理列表、三类录入页、预览确认页、浏览编辑页。

## 4. 练习编排

进入某个库 → 子菜单按内容类型分项，**无内容的类型不显示**：

```
单词（N 词）
词组（N 条）
句子（N 句）
文章（N 篇）
混合练习
```

- 各项转为现有 `PracticeTarget`（句子/文章带 translation_zh 标注，与内置语料显示一致）。练习管线零改动。
- 混合练习参考 `everyday_mix` 编排：一组单词 → 词组 → 几个句子 → 一篇文章节选，仅含该库有的类型。

### 词组的视觉区分（通用渲染改进）

词组练习的渲染规则：

- **每行只摆一条**词组，条目边界靠换行天然分隔；
- 词组**内部空格渲染为淡色中点 `·`**（输入层不变，仍敲空格键）。

该机制做成通用能力（按 target 标记生效），**内置的词组练习（everyday_phrases）一并切换**到此显示，修掉其现存的"条目间空格与词组内空格无法区分"问题。

## 5. 旧功能移除清单

- CLI：`keyloop corpus | sentence | article` 全部子命令与解析（`src/cli.ts`）
- 错词捕捉：完成页 A 键（`isCaptureWordsEvent`）、`errorWordsFromRecord`、`captureVocabulary`、完成弹窗相关文案
- 菜单：`custom_my_words / custom_my_sentences / custom_my_articles / custom_tag_*`，编程子菜单的 `my_vocabulary`
- 类型与存储：`PersonalVocabularyEntry / PersonalSentenceEntry / PersonalArticleEntry / CorpusCollectionMeta`、`personalCorpus.ts` 中对应 builder、keyloopStore 中四个旧文件（collections/vocabulary/sentences/articles）的读写
- 用户磁盘上的旧 JSON 文件不主动删除，仅不再读取

## 6. 错误处理

- 词典下载：网络失败/校验失败 → 静默放弃，mini 版兜底，下次启动重试
- 录入解析：单词页空行跳过；单词行非 ASCII 主体（排除释义部分）拒绝并提示；句子条目块超过 2 行 → 第 2 行起合并为翻译；文章按空行分块多于 2 块、或中文行数与英文段数不齐 → 预览页提示差异但允许保存（多余翻译丢弃、缺少的留空）
- 库文件读取：单个库 JSON 损坏 → 跳过该库并在菜单提示，不影响其他库
- slug 冲突：自动加序号后缀

## 7. 测试

- 单元：单词行解析（`text: 释义`、冒号边界、词组判定）、句子交替块解析（无翻译块、多行块）、文章两块解析（无翻译、段数不齐、多块）、词典 lookup（完整版缺失时 mini 兜底、大小写归一）、库 store 增删改、菜单项生成（空类型隐藏）、各 PracticeTarget builder、词组渲染标记
- 回归：现有测试套件全绿，确认练习管线与内置语料不受影响
