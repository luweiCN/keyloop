# 自建语料库（Custom Corpus）设计

日期：2026-06-10
状态：设计稿（待评审）

## 1. 动机

用户在日常学习中持续遇到值得练习的语言材料：

- 阅读时遇到的生词，想"背单词 + 练打字"双重巩固；
- 好句子、好文章，想收藏起来反复跟打、背诵；
- 主题性的专有名词集合：如 Web3 术语（staking、liquidity、rollup…）、
  某门编程语言的关键字（Rust 的 `impl`/`trait`/`lifetime`…）、
  某个领域文档的高频词。

KeyLoop 目前只内置编辑好的语料。本设计让用户拥有**自己的语料层**，
与内置语料并列，统一入口为主菜单新增的「自建语料库」。

## 2. 现状盘点（设计基础）

已有可复用的机制，不重复造轮子：

| 现有能力 | 位置 | 复用方式 |
|---|---|---|
| `keyloop vocab add TEXT [--parts a,b] [--alias V] [--tag V] [--priority 1-3]` | `cli.ts` | 扩展为多实体入口 |
| `PersonalVocabularyEntry`（kind: word/phrase/identifier/code_term；tags；meaning_zh；parts） | `training/vocabulary.ts` | **tags 升级为主题词库**的分组键 |
| `my_vocabulary` 练习模块（编程基础子菜单内） | `menuItems.ts` | 迁入新主菜单，保留兼容入口 |
| everyday sentences/articles 的实体结构与渲染（双语 ghost、段落翻译） | `content/library.ts`、`screens/ghostText.ts` | 个人句子/文章直接复用同一渲染路径 |
| 质量门（`readingTextQuality`、词数分档） | `content/readingTextQuality.ts` | 导入时做**软校验**（警告不阻断） |

## 3. 目标 / 非目标

**目标**

1. 主菜单新增「自建语料库」，内含：我的单词、我的句子、我的文章、主题词库（按 tag 列出）。
2. 主题词库：一条命令/一次导入创建一个命名词库（如 `web3`、`rust-keywords`），可单独成组练习。
3. 三种添加途径：CLI 命令、文件导入、**练习后错词一键收录**（TUI 内）。
4. 单词支持「学习模式」：先展示词+释义再开打（背单词），与纯打字模式并存。
5. 取消/归档不丢数据（沿用 `archived` 标志）。

**非目标（本期不做）**

- 间隔重复算法（SRS）——先用现有 priority + daily_review_limit 的朴素调度；
- 云同步/分享词库；
- TUI 内的全文编辑器（添加长文走文件导入，不在终端里写文章）。

## 4. 数据模型

存储沿用 `KEYLOOP_HOME` 下的 JSON 文件（与 `keyloopStore.ts` 同模式）。

```ts
// 已有，小幅扩展
interface PersonalVocabularyEntry {
  // ……现有字段不变……
  collection?: string;        // 新增：所属主题词库 slug（如 "web3"）；
                              // 兼容：旧数据无此字段 = 默认词库
}

// 新增实体：主题词库元信息
interface CorpusCollection {
  slug: string;               // "web3" / "rust-keywords"
  name: string;               // 显示名："Web3 术语"
  kind: "words" | "sentences" | "articles";
  description?: string;
  created_at: string;
  archived: boolean;
}

// 新增实体：个人句子（结构对齐 EverydaySentenceEntry，复用渲染）
interface PersonalSentenceEntry {
  id: string;
  text: string;
  translation_zh?: string;    // 可选——自己收藏的句子可以不带翻译
  collection?: string;
  source_note?: string;       // 出处备注（书名/网址，自由文本）
  created_at: string;
  archived: boolean;
}

// 新增实体：个人文章（结构对齐 EverydayArticleEntry）
interface PersonalArticleEntry {
  id: string;
  title: string;
  paragraphs: { text: string; translation_zh?: string }[];
  collection?: string;
  source_note?: string;
  created_at: string;
  archived: boolean;
}
```

文件布局（`$KEYLOOP_HOME/`）：

```
vocabulary.json        # 已有
collections.json       # 新增：CorpusCollection[]
sentences.json         # 新增：PersonalSentenceEntry[]
articles.json          # 新增：PersonalArticleEntry[]
```

## 5. 入口设计

### 5.1 主菜单

```
 1  综合练习
 ...
 6  自建语料库            ‹mine›      ← 新增
 7  设置
 8  统计
```

「自建语料库」子菜单（动态生成）：

```
 1  我的单词        (42 词 · 今日待练 8)        words
 2  我的句子        (17 句)                      sent
 3  我的文章        (3 篇)                       text
 ── 主题词库 ──
 4  Web3 术语       (65 词)                      topic
 5  Rust 关键字     (38 词)                      topic
 ...
 n  管理词库        新建 / 归档 / 导入            manage
```

空状态：没有任何自建内容时，显示 emptyState + 添加指引
（`keyloop vocab add …` / `keyloop corpus import …` 的提示文案）。

### 5.2 CLI 命令（扩展现有 `vocab` 风格）

```
keyloop vocab add TEXT [--collection web3] [--zh 释义] [...]   # 现有命令加 --collection/--zh
keyloop sentence add "TEXT" [--zh 译文] [--collection NAME]
keyloop corpus new web3 --name "Web3 术语" [--kind words]
keyloop corpus import web3 ./terms.txt        # 每行一词；"word<TAB>释义" 也支持
keyloop corpus import reading ./article.md    # 标题=H1，段落=空行分隔（kind=articles）
keyloop corpus list / archive SLUG / restore SLUG
```

导入时跑软校验：非 ASCII 字符、超长行、重复条目 → 打印警告与行号，
默认跳过问题行（`--force` 强制收录）。复用 `readingTextQuality` 的检测。

### 5.3 TUI 内一键收录（杀手功能）

练习完成弹窗（complete）增加一个动作：

```
Enter 关闭 · R 重练 · A 收录错词 · Q 退出
```

按 `A` 把本组**错误率最高的词**（来自已有的 KeyDiagnostics）批量加入
「我的单词」，去重后提示"已收录 5 个词"。这是打字练习与生词积累的
天然闭环，零输入成本。

## 6. 练习模式

| 内容 | 模式 | 实现 |
|---|---|---|
| 我的单词 / 主题词库 | 打字练习 | 走现有 words target 构建管线（`buildPersonalVocabularyPracticeTarget` 已存在，加 collection 过滤） |
| 我的单词 / 主题词库 | **学习模式**（背单词） | 新：每词先整行展示 `word  释义`，按任意键开始打该词，打完自动下一个；本质是 word_decomposition 渲染路径的变体 |
| 我的句子 | 跟打 | 复用 everyday sentences 渲染（含译文行） |
| 我的文章 | 跟打 | 复用 everyday articles 渲染（段落+译文） |

学习模式 vs 打字模式通过 Ctrl+O 练习选项切换（复用现有 practice options 机制）。

## 7. 与现有功能的关系

- `my_vocabulary`（编程基础子菜单）保留为别名入口，指向「我的单词」默认词库，
  避免破坏老用户习惯与现有测试；
- 综合练习的 personal_vocabulary 组继续从默认词库抽词（行为不变），
  后续可加设置项"综合练习是否包含主题词库"；
- 统计：自建语料的练习记录与现有 SessionRecord 同构（source 标
  `keyloop:custom:<collection>`），自动进入现有统计。

## 8. 分阶段实施

| 阶段 | 内容 | 规模 |
|---|---|---|
| P1 | 主菜单入口 + collections.json + `corpus new/list/import`（words）+ 主题词库按 collection 练习 | 中 |
| P2 | 我的句子/我的文章（实体 + 导入 + 渲染复用） | 中 |
| P3 | 完成弹窗错词一键收录（A 键） | 小 |
| P4 | 学习模式（背单词节奏） | 中 |

P1/P3 性价比最高，建议先做；P2 依赖 P1 的菜单骨架；P4 独立。

## 9. 开放问题（评审时定）

1. 学习模式是否需要"遮释义回想"（先看英文回想中文，再揭示）？
2. `corpus import` 是否需要支持从剪贴板读入（`--from-clipboard`）？
3. 主题词库数量多时子菜单滚动即可，还是需要搜索（复用 code filter picker 的搜索框）？
