# 自建语料库重设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 独立的自建语料库（一库一文件，含单词/词组/句子/文章），全程 TUI 创建与管理，集成 ECDICT 词典自动查释义，移除旧收藏式 custom corpus。

**Architecture:** 新增 `src/training/customLibrary.ts`（模型+解析）、`src/training/customLibraryTargets.ts`（练习 builder）、`src/content/dictionary.ts`（两级词典：打包 mini JSON + 后台下载 ECDICT SQLite，`bun:sqlite` 查询）。TUI 在 `appModel.ts` 增 7 个 route，reducer 保持同步纯函数，持久化通过 `OpenTuiAppKeyResult.persist` 字段由 `appSession.ts` 主循环异步落盘。最后整体移除旧 personal corpus（CLI 命令、A 键错词捕捉、旧菜单与 store）。

**Tech Stack:** TypeScript + Bun（`bun:test`、`bun:sqlite`、内置 fetch）、`@opentui/core` TUI。

**Spec:** `docs/superpowers/specs/2026-06-11-custom-library-redesign-design.md`

**全局约定：**
- 测试命令：`bun test tests/<file>.test.ts`；全量：`bun test tests`
- 类型检查：`bunx tsc --noEmit`
- 每个任务结束必须：全量测试绿 + tsc 无错 + commit
- 现有代码风格：不可变更新、`...(x === undefined ? {} : { x })` 可选字段展开、双语 label（`state.language === "zh"`）

---

## 任务总览

| # | 任务 | 产出 |
|---|------|------|
| 1 | 数据模型与录入解析器 | `src/training/customLibrary.ts` |
| 2 | 存储层：libraries 目录读写 | `src/storage/keyloopStore.ts` 扩展 |
| 3 | mini 词典生成脚本与数据 | `src/tools/buildDictionaryMini.ts` + `contents/dictionary_mini.json` |
| 4 | 词典查询模块 | `src/content/dictionary.ts` |
| 5 | 完整词典后台下载器 | `dictionary.ts` 扩展 |
| 6 | 练习 target builders | `src/training/customLibraryTargets.ts` |
| 7 | 词组视觉：空格渲染为中点 | `domain/model.ts` + `ghostText.ts` + everyday phrases 切换 |
| 8 | TUI 接线：context/菜单/练习入口 | `appModel.ts` / `appSession.ts` / `menuItems.ts` / `cli.ts` |
| 9 | 新建语料库流程（单行输入屏） | `screens/library.ts` + `libraryReducers.ts` |
| 10 | 添加单词流程（多行输入+词典+预览） | 同上扩展 |
| 11 | 添加句子/文章流程 | 同上扩展 |
| 12 | 管理：浏览/编辑/删除 | 同上扩展 |
| 13 | 设置页词典状态 | `settingsItems.ts` |
| 14 | 移除旧功能 | 多文件删改 |
| 15 | 回归与验收 | 全量测试 + 手动清单 |

---

### Task 1: 数据模型与录入解析器

**Files:**
- Create: `src/training/customLibrary.ts`
- Create: `tests/customLibrary.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/customLibrary.test.ts
import { describe, expect, test } from "bun:test";

import {
  createCustomLibrary,
  librarySlugFromName,
  parseArticlePaste,
  parseSentenceBlocks,
  parseWordLines,
} from "../src/training/customLibrary";

describe("librarySlugFromName", () => {
  test("ascii name becomes kebab-case", () => {
    expect(librarySlugFromName("Kaoyan English 2026", [])).toBe("kaoyan-english-2026");
  });

  test("non-ascii name falls back to lib prefix", () => {
    expect(librarySlugFromName("考研英语", [])).toBe("lib");
  });

  test("conflict appends numeric suffix", () => {
    expect(librarySlugFromName("考研英语", ["lib"])).toBe("lib-2");
    expect(librarySlugFromName("web", ["web", "web-2"])).toBe("web-3");
  });
});

describe("parseWordLines", () => {
  test("plain word, colon meaning, and phrase detection", () => {
    const result = parseWordLines("apple\nmachine learning: 机器学习\nresilient：有弹性的\n\n");
    expect(result.entries).toEqual([
      { text: "apple", kind: "word" },
      { text: "machine learning", kind: "phrase", meaning_zh: "机器学习" },
      { text: "resilient", kind: "word", meaning_zh: "有弹性的" },
    ]);
    expect(result.errors).toEqual([]);
  });

  test("non-ascii word body is rejected with line number", () => {
    const result = parseWordLines("苹果: apple");
    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([{ line: 1, raw: "苹果: apple", reason: "non_ascii" }]);
  });
});

describe("parseSentenceBlocks", () => {
  test("blank-line separated blocks: first line text, rest is translation", () => {
    const input = "The weather is nice.\n今天天气很好。\n\nSee you tomorrow.\n\nLong one.\n第一行\n第二行";
    expect(parseSentenceBlocks(input)).toEqual([
      { text: "The weather is nice.", translation_zh: "今天天气很好。" },
      { text: "See you tomorrow." },
      { text: "Long one.", translation_zh: "第一行\n第二行" },
    ]);
  });
});

describe("parseArticlePaste", () => {
  test("two blocks pair paragraphs by line index", () => {
    const result = parseArticlePaste("Para one.\nPara two.\n\n第一段。\n第二段。");
    expect(result.paragraphs).toEqual([
      { text: "Para one.", translation_zh: "第一段。" },
      { text: "Para two.", translation_zh: "第二段。" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  test("single block means no translation", () => {
    const result = parseArticlePaste("Para one.\nPara two.");
    expect(result.paragraphs).toEqual([{ text: "Para one." }, { text: "Para two." }]);
  });

  test("mismatched counts and extra blocks produce warnings", () => {
    const short = parseArticlePaste("P1.\nP2.\n\n译一。");
    expect(short.paragraphs).toEqual([{ text: "P1.", translation_zh: "译一。" }, { text: "P2." }]);
    expect(short.warnings.length).toBe(1);
    const extra = parseArticlePaste("P1.\n\n译一。\n\n多余块");
    expect(extra.warnings.length).toBe(1);
  });
});

describe("createCustomLibrary", () => {
  test("creates empty library with injected id/time", () => {
    const library = createCustomLibrary("考研英语", [], { now: new Date("2026-06-11T00:00:00Z") });
    expect(library).toEqual({
      version: 1,
      slug: "lib",
      name: "考研英语",
      created_at: "2026-06-11T00:00:00.000Z",
      words: [],
      sentences: [],
      articles: [],
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/customLibrary.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```typescript
// src/training/customLibrary.ts
export interface CustomWord {
  id: string;
  text: string;
  kind: "word" | "phrase";
  meaning_zh?: string;
  phonetic?: string;
  source: "dict" | "manual";
}

export interface CustomSentence {
  id: string;
  text: string;
  translation_zh?: string;
}

export interface CustomArticleParagraph {
  text: string;
  translation_zh?: string;
}

export interface CustomArticle {
  id: string;
  title: string;
  paragraphs: CustomArticleParagraph[];
}

export interface CustomLibrary {
  version: 1;
  slug: string;
  name: string;
  created_at: string;
  words: CustomWord[];
  sentences: CustomSentence[];
  articles: CustomArticle[];
}

export function librarySlugFromName(name: string, existing: readonly string[]): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  const base = ascii === "" ? "lib" : ascii;
  if (!existing.includes(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function createCustomLibrary(
  name: string,
  existingSlugs: readonly string[],
  options: { now?: Date } = {},
): CustomLibrary {
  return {
    version: 1,
    slug: librarySlugFromName(name, existingSlugs),
    name: name.trim(),
    created_at: (options.now ?? new Date()).toISOString(),
    words: [],
    sentences: [],
    articles: [],
  };
}

export interface ParsedWordLine {
  text: string;
  kind: "word" | "phrase";
  meaning_zh?: string;
}

export interface WordLineError {
  line: number;
  raw: string;
  reason: "non_ascii";
}

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/u;

export function parseWordLines(input: string): {
  entries: ParsedWordLine[];
  errors: WordLineError[];
} {
  const entries: ParsedWordLine[] = [];
  const errors: WordLineError[] = [];
  const lines = input.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "") {
      continue;
    }
    const colonIndex = colonSplitIndex(trimmed);
    const text = (colonIndex === -1 ? trimmed : trimmed.slice(0, colonIndex)).trim();
    const meaning =
      colonIndex === -1 ? undefined : trimmed.slice(colonIndex + 1).trim();
    if (text === "" || !PRINTABLE_ASCII.test(text)) {
      errors.push({ line: index + 1, raw: trimmed, reason: "non_ascii" });
      continue;
    }
    entries.push({
      text,
      kind: text.includes(" ") ? "phrase" : "word",
      ...(meaning === undefined || meaning === "" ? {} : { meaning_zh: meaning }),
    });
  }
  return { entries, errors };
}

function colonSplitIndex(line: string): number {
  const half = line.indexOf(":");
  const full = line.indexOf("：");
  if (half === -1) return full;
  if (full === -1) return half;
  return Math.min(half, full);
}

function splitBlocks(input: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const rawLine of input.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push(current);
  }
  return blocks;
}

export function parseSentenceBlocks(
  input: string,
): { text: string; translation_zh?: string }[] {
  return splitBlocks(input).map((block) => {
    const [first, ...rest] = block;
    const translation = rest.join("\n");
    return {
      text: first ?? "",
      ...(translation === "" ? {} : { translation_zh: translation }),
    };
  });
}

export interface ParsedArticlePaste {
  paragraphs: CustomArticleParagraph[];
  warnings: string[];
}

export function parseArticlePaste(input: string): ParsedArticlePaste {
  const blocks = splitBlocks(input);
  const warnings: string[] = [];
  if (blocks.length === 0) {
    return { paragraphs: [], warnings };
  }
  const english = blocks[0] ?? [];
  const chinese = blocks.length > 1 ? (blocks[1] ?? []) : [];
  if (blocks.length > 2) {
    warnings.push(`检测到 ${blocks.length} 个空行分块，仅使用前两块（英文/中文）`);
  }
  if (chinese.length > 0 && chinese.length !== english.length) {
    warnings.push(`英文 ${english.length} 段、翻译 ${chinese.length} 行，数量不一致`);
  }
  const paragraphs = english.map((text, index) => {
    const translation = chinese[index];
    return {
      text,
      ...(translation === undefined ? {} : { translation_zh: translation }),
    };
  });
  return { paragraphs, warnings };
}
```

- [ ] **Step 4: 测试通过 + 类型检查**

Run: `bun test tests/customLibrary.test.ts && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/training/customLibrary.ts tests/customLibrary.test.ts
git commit -m "feat: custom library model, slug, and paste parsers"
```

---

### Task 2: 存储层 libraries 读写

**Files:**
- Modify: `src/storage/keyloopStore.ts`（路径函数区第 98-108 行附近、文件末尾）
- Test: `tests/storage.test.ts`（追加）

- [ ] **Step 1: 写失败测试**（追加到 `tests/storage.test.ts` 末尾；文件顶部 import 区追加 `customLibrariesDirPath, deleteCustomLibraryAtDir, loadCustomLibrariesFromDir, saveCustomLibraryToDir` 与 `type CustomLibrary`，均从 `"../src/index"` 导入）

```typescript
describe("custom library store", () => {
  const sample: CustomLibrary = {
    version: 1,
    slug: "kaoyan",
    name: "考研英语",
    created_at: "2026-06-11T00:00:00.000Z",
    words: [{ id: "w1", text: "abandon", kind: "word", meaning_zh: "放弃", source: "dict" }],
    sentences: [],
    articles: [],
  };

  test("save, load, delete round-trip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-lib-"));
    const librariesDir = customLibrariesDirPath(dir);
    expect(await loadCustomLibrariesFromDir(librariesDir)).toEqual([]);
    await saveCustomLibraryToDir(sample, librariesDir);
    expect(await loadCustomLibrariesFromDir(librariesDir)).toEqual([sample]);
    await deleteCustomLibraryAtDir("kaoyan", librariesDir);
    expect(await loadCustomLibrariesFromDir(librariesDir)).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  test("corrupt json file is skipped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-lib-"));
    const librariesDir = customLibrariesDirPath(dir);
    await saveCustomLibraryToDir(sample, librariesDir);
    await writeFile(join(librariesDir, "broken.json"), "{not json");
    expect(await loadCustomLibrariesFromDir(librariesDir)).toEqual([sample]);
    await rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/storage.test.ts`
Expected: FAIL（函数未导出）

- [ ] **Step 3: 实现**（`keyloopStore.ts`；顶部 import 区加 `import { readdir, rm as removePath } from "node:fs/promises"` 所缺项与 `import type { CustomLibrary } from "../training/customLibrary"`；复用文件内已有的 `writePrettyJson`/`readJsonIfExists`）

```typescript
export function customLibrariesDirPath(dataDir: string): string {
  return join(dataDir, "libraries");
}

export async function loadCustomLibrariesFromDir(dir: string): Promise<CustomLibrary[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const libraries: CustomLibrary[] = [];
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const parsed = JSON.parse(await readFile(join(dir, file), "utf8")) as CustomLibrary;
      if (parsed.version === 1 && typeof parsed.slug === "string") {
        libraries.push(parsed);
      }
    } catch {
      continue; // 损坏文件跳过，不影响其他库
    }
  }
  return libraries;
}

export async function saveCustomLibraryToDir(
  library: CustomLibrary,
  dir: string,
): Promise<void> {
  await writePrettyJson(join(dir, `${library.slug}.json`), library);
}

export async function deleteCustomLibraryAtDir(slug: string, dir: string): Promise<void> {
  await removePath(join(dir, `${slug}.json`), { force: true });
}
```

并在 `src/index.ts` 导出上述 4 个函数和 `customLibrary.ts` 的全部导出（跟随文件内现有 re-export 风格）。

- [ ] **Step 4: 测试通过**

Run: `bun test tests/storage.test.ts && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/keyloopStore.ts src/index.ts tests/storage.test.ts
git commit -m "feat: per-file custom library persistence under ~/.keyloop/libraries"
```

---

### Task 3: mini 词典生成脚本与打包数据

**Files:**
- Create: `src/tools/buildDictionaryMini.ts`
- Create: `tests/dictionaryMini.test.ts`
- Create: `contents/dictionary_mini.json`（脚本生成后提交）
- Modify: `package.json`（scripts 加 `"content:build-dictionary-mini": "bun src/tools/buildDictionaryMini.ts"`）

**数据源**：`https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.mini.csv`（CSV 列：word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio）。CSV 解析参考 `src/tools/buildEverydayWordsContent.ts` 中已有的 ECDICT CSV 处理（带引号转义）；若该解析未导出，将其提取为本文件内的 `parseCsvRows` 私有实现。

**目标 JSON 结构**（字段名压缩省体积）：

```json
{
  "version": 1,
  "source_url": "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.mini.csv",
  "retrieved_at": "2026-06-11",
  "words": { "abandon": { "p": "ə'bændən", "t": "v. 放弃, 抛弃" } }
}
```

- [ ] **Step 1: 写失败测试**（测纯函数 `miniEntriesFromCsv`，不联网）

```typescript
// tests/dictionaryMini.test.ts
import { describe, expect, test } from "bun:test";

import { miniEntriesFromCsv } from "../src/tools/buildDictionaryMini";

describe("miniEntriesFromCsv", () => {
  test("maps word to phonetic and translation, lowercases key, joins multiline", () => {
    const csv = [
      "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
      'Abandon,ə\'bændən,"to leave","v. 放弃\\n n. 放任",,,,,,,,,',
      'the,ðə,,art. 那,,,,,,,,,',
    ].join("\n");
    expect(miniEntriesFromCsv(csv)).toEqual({
      abandon: { p: "ə'bændən", t: "v. 放弃; n. 放任" },
      the: { p: "ðə", t: "art. 那" },
    });
  });

  test("skips rows without translation", () => {
    const csv = "word,phonetic,definition,translation\nfoo,,,";
    expect(miniEntriesFromCsv(csv)).toEqual({});
  });
});
```

- [ ] **Step 2: 确认失败**：`bun test tests/dictionaryMini.test.ts` → FAIL

- [ ] **Step 3: 实现脚本**

```typescript
// src/tools/buildDictionaryMini.ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const MINI_CSV_URL =
  "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.mini.csv";

export interface MiniDictionaryEntry {
  p?: string;
  t: string;
}

export function miniEntriesFromCsv(csv: string): Record<string, MiniDictionaryEntry> {
  const entries: Record<string, MiniDictionaryEntry> = {};
  const rows = parseCsvRows(csv);
  const header = rows[0] ?? [];
  const wordIndex = header.indexOf("word");
  const phoneticIndex = header.indexOf("phonetic");
  const translationIndex = header.indexOf("translation");
  for (const row of rows.slice(1)) {
    const word = (row[wordIndex] ?? "").trim();
    const translation = (row[translationIndex] ?? "")
      .replaceAll("\\n", "; ")
      .replaceAll("\n", "; ")
      .trim();
    if (word === "" || translation === "") {
      continue;
    }
    const phonetic = (row[phoneticIndex] ?? "").trim();
    entries[word.toLowerCase()] = {
      ...(phonetic === "" ? {} : { p: phonetic }),
      t: translation,
    };
  }
  return entries;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    if (inQuotes) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function main(): Promise<void> {
  const response = await fetch(MINI_CSV_URL);
  if (!response.ok) {
    throw new Error(`fetch failed ${response.status}: ${MINI_CSV_URL}`);
  }
  const words = miniEntriesFromCsv(await response.text());
  const outPath = resolve(import.meta.dir, "../../contents/dictionary_mini.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    `${JSON.stringify(
      {
        version: 1,
        source_url: MINI_CSV_URL,
        retrieved_at: new Date().toISOString().slice(0, 10),
        words,
      },
      null,
      0,
    )}\n`,
  );
  console.log(`dictionary_mini.json written: ${Object.keys(words).length} words`);
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 4: 测试通过**：`bun test tests/dictionaryMini.test.ts` → PASS

- [ ] **Step 5: 生成数据并校验**

Run: `bun run content:build-dictionary-mini`
Expected: 输出 `dictionary_mini.json written: N words`，N > 20000
Run: `bun -e "const d=require('./contents/dictionary_mini.json'); console.log(Object.keys(d.words).length, d.words['abandon'])"`
Expected: 词数 + abandon 的 `{ p, t }`

- [ ] **Step 6: Commit**

```bash
git add src/tools/buildDictionaryMini.ts tests/dictionaryMini.test.ts contents/dictionary_mini.json package.json
git commit -m "feat: bundled mini dictionary generated from ECDICT mini CSV"
```

---

### Task 4: 词典查询模块

**Files:**
- Create: `src/content/dictionary.ts`
- Create: `tests/dictionary.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/dictionary.test.ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { Dictionary } from "../src/content/dictionary";

async function writeMini(dir: string): Promise<string> {
  const path = join(dir, "mini.json");
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      words: { abandon: { p: "ə'bændən", t: "v. 放弃" }, "give up": { t: "放弃" } },
    }),
  );
  return path;
}

function writeFullDb(dir: string): string {
  const path = join(dir, "ecdict.db");
  const db = new Database(path);
  db.run(
    "CREATE TABLE stardict (word TEXT PRIMARY KEY, phonetic TEXT, translation TEXT)",
  );
  db.run("INSERT INTO stardict VALUES ('serendipity', ',serən'dipəti', 'n. 意外发现珍奇事物的本领')");
  db.close();
  return path;
}

describe("Dictionary", () => {
  test("mini lookup with case normalization, tier=mini", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dict-"));
    const dictionary = await Dictionary.open({ miniPath: await writeMini(dir) });
    expect(dictionary.tier).toBe("mini");
    expect(dictionary.lookup("Abandon")).toEqual({ phonetic: "ə'bändən".replace("ä", "æ"), translation_zh: "v. 放弃" });
    expect(dictionary.lookup("give up")).toEqual({ translation_zh: "放弃" });
    expect(dictionary.lookup("nonexistent")).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  test("full db preferred when present, tier=full, falls back to mini", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dict-"));
    const dictionary = await Dictionary.open({
      miniPath: await writeMini(dir),
      fullDbPath: writeFullDb(dir),
    });
    expect(dictionary.tier).toBe("full");
    expect(dictionary.lookup("serendipity")?.translation_zh).toContain("珍奇");
    expect(dictionary.lookup("abandon")?.translation_zh).toBe("v. 放弃"); // mini 兜底
    await rm(dir, { recursive: true, force: true });
  });

  test("missing everything yields tier=none and null lookups", async () => {
    const dictionary = await Dictionary.open({});
    expect(dictionary.tier).toBe("none");
    expect(dictionary.lookup("abandon")).toBeNull();
  });
});
```

注意：第一个断言中 phonetic 写成原值 `"ə'bændən"` 即可（上面 replace 写法仅为防转义示意，落盘测试直接用原字符串）。

- [ ] **Step 2: 确认失败**：`bun test tests/dictionary.test.ts` → FAIL

- [ ] **Step 3: 实现**

```typescript
// src/content/dictionary.ts
import { Database } from "bun:sqlite";

export interface DictionaryEntry {
  phonetic?: string;
  translation_zh?: string;
}

export type DictionaryTier = "full" | "mini" | "none";

interface MiniDictionaryFile {
  version: number;
  words: Record<string, { p?: string; t: string }>;
}

interface StardictRow {
  phonetic: string | null;
  translation: string | null;
}

export class Dictionary {
  private constructor(
    private readonly mini: Map<string, { p?: string; t: string }>,
    private readonly db: Database | null,
  ) {}

  static async open(options: {
    miniPath?: string;
    fullDbPath?: string;
  }): Promise<Dictionary> {
    let mini = new Map<string, { p?: string; t: string }>();
    if (options.miniPath !== undefined && (await Bun.file(options.miniPath).exists())) {
      try {
        const parsed = (await Bun.file(options.miniPath).json()) as MiniDictionaryFile;
        mini = new Map(Object.entries(parsed.words ?? {}));
      } catch {
        // 损坏的 mini 文件视为不存在
      }
    }
    let db: Database | null = null;
    if (options.fullDbPath !== undefined && (await Bun.file(options.fullDbPath).exists())) {
      try {
        db = new Database(options.fullDbPath, { readonly: true });
        db.query("SELECT 1 FROM stardict LIMIT 1").get();
      } catch {
        db = null; // 半截/损坏 db 退回 mini
      }
    }
    return new Dictionary(mini, db);
  }

  get tier(): DictionaryTier {
    if (this.db !== null) return "full";
    if (this.mini.size > 0) return "mini";
    return "none";
  }

  lookup(text: string): DictionaryEntry | null {
    const candidates = [text.trim(), text.trim().toLowerCase()];
    for (const candidate of candidates) {
      if (candidate === "") continue;
      const fromDb = this.lookupDb(candidate);
      if (fromDb !== null) return fromDb;
    }
    for (const candidate of candidates) {
      const entry = this.mini.get(candidate) ?? this.mini.get(candidate.toLowerCase());
      if (entry !== undefined) {
        return {
          ...(entry.p === undefined ? {} : { phonetic: entry.p }),
          translation_zh: entry.t,
        };
      }
    }
    return null;
  }

  private lookupDb(word: string): DictionaryEntry | null {
    if (this.db === null) return null;
    const row = this.db
      .query<StardictRow, [string]>(
        "SELECT phonetic, translation FROM stardict WHERE word = ?1 LIMIT 1",
      )
      .get(word);
    if (row === null || row.translation === null || row.translation === "") {
      return null;
    }
    return {
      ...(row.phonetic === null || row.phonetic === "" ? {} : { phonetic: row.phonetic }),
      translation_zh: row.translation.replaceAll("\\n", "; ").replaceAll("\n", "; "),
    };
  }
}
```

- [ ] **Step 4: 测试通过**：`bun test tests/dictionary.test.ts && bunx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/dictionary.ts tests/dictionary.test.ts
git commit -m "feat: two-tier dictionary lookup (bundled mini JSON + ECDICT sqlite)"
```

---

### Task 5: 完整词典后台下载器

**Files:**
- Modify: `src/content/dictionary.ts`（追加）
- Test: `tests/dictionary.test.ts`（追加）

下载源：`https://github.com/skywind3000/ECDICT/releases/download/1.0.28/ecdict-sqlite-28.zip`。解压用系统 `unzip`（darwin/linux 自带），取压缩包内第一个 `.db` 文件原子 rename 到目标路径。

- [ ] **Step 1: 写失败测试**（注入 fake fetch 与 fake unzip，不联网）

```typescript
// 追加到 tests/dictionary.test.ts
import { ensureFullDictionary } from "../src/content/dictionary";
import { mkdir } from "node:fs/promises";

describe("ensureFullDictionary", () => {
  test("returns exists without fetching when db present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dl-"));
    const dbPath = join(dir, "ecdict.db");
    await writeFile(dbPath, "stub");
    const result = await ensureFullDictionary({
      dbPath,
      fetchImpl: () => {
        throw new Error("should not fetch");
      },
    });
    expect(result).toBe("exists");
    await rm(dir, { recursive: true, force: true });
  });

  test("downloads, extracts, and renames atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dl-"));
    const dbPath = join(dir, "dict", "ecdict.db");
    const result = await ensureFullDictionary({
      dbPath,
      fetchImpl: async () => new Response("zipbytes"),
      unzipImpl: async (_zipPath, destDir) => {
        await mkdir(destDir, { recursive: true });
        await writeFile(join(destDir, "stardict.db"), "dbcontent");
      },
    });
    expect(result).toBe("downloaded");
    expect(await Bun.file(dbPath).text()).toBe("dbcontent");
    await rm(dir, { recursive: true, force: true });
  });

  test("fetch failure returns failed and leaves no db", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dl-"));
    const dbPath = join(dir, "ecdict.db");
    const result = await ensureFullDictionary({
      dbPath,
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });
    expect(result).toBe("failed");
    expect(await Bun.file(dbPath).exists()).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 确认失败**：`bun test tests/dictionary.test.ts` → FAIL

- [ ] **Step 3: 实现**（追加到 `dictionary.ts`）

```typescript
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export const ECDICT_SQLITE_URL =
  "https://github.com/skywind3000/ECDICT/releases/download/1.0.28/ecdict-sqlite-28.zip";

export async function ensureFullDictionary(options: {
  dbPath: string;
  url?: string;
  fetchImpl?: (url: string) => Promise<Response>;
  unzipImpl?: (zipPath: string, destDir: string) => Promise<void>;
}): Promise<"exists" | "downloaded" | "failed"> {
  const { dbPath } = options;
  if (await Bun.file(dbPath).exists()) {
    return "exists";
  }
  const url = options.url ?? ECDICT_SQLITE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const unzipImpl = options.unzipImpl ?? systemUnzip;
  const zipPath = `${dbPath}.download.zip`;
  const extractDir = `${dbPath}.extract`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return "failed";
    }
    await mkdir(dirname(dbPath), { recursive: true });
    await Bun.write(zipPath, response);
    await unzipImpl(zipPath, extractDir);
    const dbFile = (await readdir(extractDir)).find((name) => name.endsWith(".db"));
    if (dbFile === undefined) {
      return "failed";
    }
    await rename(join(extractDir, dbFile), dbPath); // 原子就位：存在即完整
    return "downloaded";
  } catch {
    return "failed";
  } finally {
    await rm(zipPath, { force: true });
    await rm(extractDir, { recursive: true, force: true });
  }
}

async function systemUnzip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const proc = Bun.spawn(["unzip", "-o", zipPath, "-d", destDir], {
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await proc.exited) !== 0) {
    throw new Error("unzip failed");
  }
}
```

- [ ] **Step 4: 测试通过**：`bun test tests/dictionary.test.ts && bunx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/dictionary.ts tests/dictionary.test.ts
git commit -m "feat: background full-dictionary download with atomic rename"
```

---

### Task 6: 练习 target builders

**Files:**
- Create: `src/training/customLibraryTargets.ts`
- Create: `tests/customLibraryTargets.test.ts`

参照模板：`buildPersonalSentencesTarget` / `buildPersonalArticleTarget`（`src/training/personalCorpus.ts:155-227`，本任务期间仍在）与 `chunkWords`（`targets.ts:2188`）。`PracticeTarget`/`PracticeTargetAnnotation` 类型见 `src/domain/model.ts:101-128`。注意 Task 7 会给 `PracticeTarget` 加 `space_glyph` 字段——本任务 phrases builder 先不写该字段，Task 7 再补。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/customLibraryTargets.test.ts
import { describe, expect, test } from "bun:test";

import type { CustomLibrary } from "../src/training/customLibrary";
import {
  buildLibraryArticleTarget,
  buildLibraryMixTarget,
  buildLibraryPhrasesTarget,
  buildLibrarySentencesTarget,
  buildLibraryWordsTarget,
} from "../src/training/customLibraryTargets";

const library: CustomLibrary = {
  version: 1,
  slug: "kaoyan",
  name: "考研英语",
  created_at: "2026-06-11T00:00:00.000Z",
  words: [
    { id: "w1", text: "abandon", kind: "word", meaning_zh: "v. 放弃", source: "dict" },
    { id: "w2", text: "machine learning", kind: "phrase", meaning_zh: "机器学习", source: "manual" },
    { id: "w3", text: "vivid", kind: "word", source: "dict" },
  ],
  sentences: [
    { id: "s1", text: "The weather is nice.", translation_zh: "今天天气很好。" },
    { id: "s2", text: "See you tomorrow." },
  ],
  articles: [
    {
      id: "a1",
      title: "My Day",
      paragraphs: [
        { text: "First paragraph.", translation_zh: "第一段。" },
        { text: "Second paragraph.", translation_zh: "第二段。" },
      ],
    },
  ],
};

const fixedRandom = () => 0;

describe("custom library targets", () => {
  test("words target chunks words and annotates meanings", () => {
    const target = buildLibraryWordsTarget(library, { random: fixedRandom });
    expect(target.mode).toBe("words");
    expect(target.text).toContain("abandon");
    expect(target.text).not.toContain("machine learning"); // 词组不混入单词练习
    const abandonStart = target.text.indexOf("abandon");
    expect(target.annotations).toContainEqual({
      start: abandonStart,
      end: abandonStart + "abandon".length,
      translation_zh: "v. 放弃",
      display: "word",
    });
    expect(target.source).toBe("keyloop:library:kaoyan:words");
  });

  test("phrases target puts one phrase per line", () => {
    const target = buildLibraryPhrasesTarget(library, { random: fixedRandom });
    expect(target.text.split("\n")).toEqual(["machine learning"]);
    expect(target.annotations?.[0]?.translation_zh).toBe("机器学习");
  });

  test("sentences target annotates per line", () => {
    const target = buildLibrarySentencesTarget(library, { random: fixedRandom, count: 2 });
    const lines = target.text.split("\n");
    expect(lines.length).toBe(2);
    expect(target.annotations?.length).toBe(1); // 只有 s1 有翻译
  });

  test("article target joins paragraphs with article annotation", () => {
    const target = buildLibraryArticleTarget(library, { random: fixedRandom });
    expect(target.text).toBe("First paragraph.\nSecond paragraph.");
    expect(target.annotations?.[0]?.display).toBe("article");
    expect(target.annotations?.[0]?.source_title).toBe("My Day");
  });

  test("mix target includes available kinds and skips empty ones", () => {
    const target = buildLibraryMixTarget(library, { random: fixedRandom });
    expect(target.text).toContain("abandon");
    expect(target.text).toContain("machine learning");
    expect(target.text).toContain("The weather is nice.");
    expect(target.text).toContain("First paragraph.");
    const empty = buildLibraryMixTarget({ ...library, articles: [], sentences: [] }, { random: fixedRandom });
    expect(empty.text).not.toContain("First paragraph.");
  });
});
```

- [ ] **Step 2: 确认失败**：`bun test tests/customLibraryTargets.test.ts` → FAIL

- [ ] **Step 3: 实现**

```typescript
// src/training/customLibraryTargets.ts
import type { PracticeTarget, PracticeTargetAnnotation } from "../domain/model";
import type { CustomLibrary, CustomSentence, CustomWord } from "./customLibrary";

interface BuildOptions {
  random?: () => number;
  count?: number;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

interface AppendState {
  text: string;
  annotations: PracticeTargetAnnotation[];
}

function appendWordLine(state: AppendState, words: readonly CustomWord[]): void {
  if (state.text !== "") {
    state.text += "\n";
  }
  for (let index = 0; index < words.length; index += 1) {
    if (index > 0) {
      state.text += " ";
    }
    const word = words[index]!;
    const start = state.text.length;
    state.text += word.text;
    if (word.meaning_zh !== undefined) {
      state.annotations.push({
        start,
        end: state.text.length,
        translation_zh: word.meaning_zh,
        display: "word",
      });
    }
  }
}

function appendLine(
  state: AppendState,
  text: string,
  translation: string | undefined,
  display: "line",
): void {
  if (state.text !== "") {
    state.text += "\n";
  }
  const start = state.text.length;
  state.text += text;
  if (translation !== undefined) {
    state.annotations.push({ start, end: state.text.length, translation_zh: translation, display });
  }
}

function finish(state: AppendState, mode: "words", source: string): PracticeTarget {
  return {
    mode,
    text: state.text,
    source,
    ...(state.annotations.length === 0 ? {} : { annotations: state.annotations }),
  };
}

const WORDS_PER_LINE = 4;

export function buildLibraryWordsTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const count = options.count ?? 16;
  const chosen = shuffled(
    library.words.filter((word) => word.kind === "word"),
    random,
  ).slice(0, count);
  const state: AppendState = { text: "", annotations: [] };
  for (let index = 0; index < chosen.length; index += WORDS_PER_LINE) {
    appendWordLine(state, chosen.slice(index, index + WORDS_PER_LINE));
  }
  return finish(state, "words", `keyloop:library:${library.slug}:words`);
}

export function buildLibraryPhrasesTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const count = options.count ?? 8;
  const chosen = shuffled(
    library.words.filter((word) => word.kind === "phrase"),
    random,
  ).slice(0, count);
  const state: AppendState = { text: "", annotations: [] };
  for (const phrase of chosen) {
    appendLine(state, phrase.text, phrase.meaning_zh, "line");
  }
  return finish(state, "words", `keyloop:library:${library.slug}:phrases`);
}

export function buildLibrarySentencesTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const count = options.count ?? 5;
  const chosen = shuffled(library.sentences, random).slice(0, count);
  const state: AppendState = { text: "", annotations: [] };
  for (const sentence of chosen) {
    appendLine(state, sentence.text, sentence.translation_zh, "line");
  }
  return finish(state, "words", `keyloop:library:${library.slug}:sentences`);
}

export function buildLibraryArticleTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const article = shuffled(library.articles, random)[0];
  if (article === undefined) {
    return { mode: "words", text: "", source: `keyloop:library:${library.slug}:articles` };
  }
  const text = article.paragraphs.map((paragraph) => paragraph.text).join("\n");
  const translation = article.paragraphs
    .map((paragraph) => paragraph.translation_zh ?? "")
    .filter((line) => line !== "")
    .join("\n");
  return {
    mode: "words",
    text,
    source: `keyloop:library:${library.slug}:articles:${article.id}`,
    ...(translation === ""
      ? {}
      : {
          annotations: [
            {
              start: 0,
              end: text.length,
              translation_zh: translation,
              source_title: article.title,
              display: "article" as const,
            },
          ],
        }),
  };
}

export function buildLibraryMixTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const state: AppendState = { text: "", annotations: [] };
  const words = shuffled(library.words.filter((w) => w.kind === "word"), random).slice(0, 8);
  for (let index = 0; index < words.length; index += WORDS_PER_LINE) {
    appendWordLine(state, words.slice(index, index + WORDS_PER_LINE));
  }
  for (const phrase of shuffled(library.words.filter((w) => w.kind === "phrase"), random).slice(0, 3)) {
    appendLine(state, phrase.text, phrase.meaning_zh, "line");
  }
  for (const sentence of shuffled(library.sentences, random).slice(0, 2) as CustomSentence[]) {
    appendLine(state, sentence.text, sentence.translation_zh, "line");
  }
  const article = shuffled(library.articles, random)[0];
  const paragraph = article?.paragraphs[0];
  if (paragraph !== undefined) {
    appendLine(state, paragraph.text, paragraph.translation_zh, "line");
  }
  return finish(state, "words", `keyloop:library:${library.slug}:mix`);
}
```

- [ ] **Step 4: 测试通过**：`bun test tests/customLibraryTargets.test.ts && bunx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/training/customLibraryTargets.ts tests/customLibraryTargets.test.ts
git commit -m "feat: practice target builders for custom libraries"
```

---

### Task 7: 词组视觉——空格渲染为中点

**Files:**
- Modify: `src/domain/model.ts:101-128`（`PracticeTarget` 加字段）
- Modify: `src/ui/opentui/screens/ghostText.ts`（`ghostRows` 第 422-462 行 + 调用点第 88 行及其外层函数签名）
- Modify: `src/training/customLibraryTargets.ts`（phrases target 加标记）
- Modify: `src/training/targets.ts`（内置 everyday phrases target：找到 `case "phrases"`（第 467 行附近）对应 builder，改为每行一条 + 标记）
- Test: `tests/customLibraryTargets.test.ts`、ghostRows 单测追加到 `tests/opentuiRenderer.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// 追加到 tests/opentuiRenderer.test.ts（import 区加 ghostRows）
describe("ghostRows space glyph", () => {
  test("renders interior spaces as middle dot when spaceDot enabled", () => {
    const rows = ghostRows("give up", "give", undefined, false, { spaceDot: true });
    const texts = (rows[0] ?? []).map((segment) => segment.text).join("");
    expect(texts).toBe("give·up");
  });

  test("default keeps plain spaces", () => {
    const rows = ghostRows("give up", "", undefined, false);
    const texts = (rows[0] ?? []).map((segment) => segment.text).join("");
    expect(texts).toBe("give up");
  });
});
```

```typescript
// 追加到 tests/customLibraryTargets.test.ts 的 phrases 测试中
expect(buildLibraryPhrasesTarget(library, { random: fixedRandom }).space_glyph).toBe("dot");
```

- [ ] **Step 2: 确认失败**：`bun test tests/opentuiRenderer.test.ts tests/customLibraryTargets.test.ts` → FAIL

- [ ] **Step 3: 实现**

1. `src/domain/model.ts` `PracticeTarget` 接口加一行：

```typescript
  /** 渲染提示：空格显示为中点 ·（输入仍为空格），用于词组练习 */
  space_glyph?: "dot";
```

2. `ghostText.ts` `ghostRows` 加第五参并在空格分支替换显示字符：

```typescript
export function ghostRows(
  targetText: string,
  inputText: string,
  highlightedRows: HighlightRows | undefined,
  allowFallbackSyntax = false,
  options: { spaceDot?: boolean } = {},
): GhostSegment[][] {
```

在函数体内普通字符 append 处（第 454-460 行附近，`expected === "\n"` 分支之后的默认分支）：

```typescript
      appendGhostSegment(rows[lineIndex] ?? [], {
        text: options.spaceDot === true && expected === " " ? "·" : expected,
        state,
        syntax: syntax?.[index] ?? "plain",
      });
```

3. 第 88 行调用点：该外层渲染函数能访问练习 target（与 `targetMode`/`annotations` 同源），透传：

```typescript
const sourceRows = ghostRows(targetText, inputText, syntaxRows, targetMode === "code", {
  spaceDot: targetSpaceGlyph === "dot",
});
```

`targetSpaceGlyph` 由外层函数参数链新增透传（从 `running.ts` 调用处的 `state.route.target.space_glyph` 一路传入；沿现有参数传递方式逐层加一个可选参数）。

4. `buildLibraryPhrasesTarget` 的 `finish` 返回处改为：

```typescript
  return {
    ...finish(state, "words", `keyloop:library:${library.slug}:phrases`),
    space_glyph: "dot" as const,
  };
```

5. `targets.ts` 内置 everyday phrases：定位 `case "phrases"`（第 467 行附近）指向的 builder，将其输出从 `chunkWords(phrases, 3)` 多条一行改为每行一条（`phrases.join("\n")` 形式，保持原有数量上限逻辑），并在返回的 target 上加 `space_glyph: "dot"`。同一文件 `everydayMixTarget` 中 `chunkWords(phrases, 3).slice(0, 2)`（第 1218 行）保持不变（混合模式不启用点显示）。

- [ ] **Step 4: 全量测试**：`bun test tests && bunx tsc --noEmit` → PASS（everyday phrases 相关旧断言若因排版改变而失败，按新排版更新断言）

- [ ] **Step 5: Commit**

```bash
git add src/domain/model.ts src/ui/opentui/screens/ghostText.ts src/training/customLibraryTargets.ts src/training/targets.ts tests
git commit -m "feat: render phrase-internal spaces as middle dots, one phrase per line"
```

---

### Task 8: TUI 接线——context、菜单、练习入口

**Files:**
- Modify: `src/ui/opentui/appSession.ts`（`OpenTuiAppSessionContext` 第 67-80 行、主循环第 157-204 行）
- Modify: `src/ui/opentui/appModel.ts`（route 第 160-219 行、`OpenTuiSessionState`、`reduceMenuKey` 第 607-789 行）
- Modify: `src/ui/opentui/menuItems.ts`（custom 子菜单第 111-139 行、子菜单类型）
- Modify: `src/cli.ts` `runApp`（第 374-470 行：加载 libraries + 词典 + 触发后台下载）
- Test: `tests/opentuiApp.test.ts`（菜单与启动断言）

**设计：**
- `OpenTuiAppSessionContext` 增加：`customLibraries?: CustomLibrary[]`、`dictionary?: Dictionary`、`librariesDir?: string`
- `OpenTuiSessionState` 增加：`customLibraries?: CustomLibrary[]`、`dictionaryTier?: "full" | "mini" | "none"`；删除时机：`CustomCorpusSummary` 在 Task 14 移除，本任务先并存
- `OpenTuiAppKeyResult` 增加可选字段 `persist?: LibraryPersist`：

```typescript
export type LibraryPersist =
  | { kind: "save"; library: CustomLibrary }
  | { kind: "delete"; slug: string };
```

- `appSession.ts` 主循环在 `reduceOpenTuiAppKey` 返回后：

```typescript
if (result.persist !== undefined && context.librariesDir !== undefined) {
  if (result.persist.kind === "save") {
    await saveCustomLibraryToDir(result.persist.library, context.librariesDir);
  } else {
    await deleteCustomLibraryAtDir(result.persist.slug, context.librariesDir);
  }
}
```

- 新 route（追加到 `OpenTuiRoute` union；后续任务使用，本任务先全部声明）：

```typescript
  | { screen: "library_menu"; slug: string; selected_index?: number }
  | { screen: "library_create"; name: string }
  | { screen: "library_manage"; selected_index?: number }
  | { screen: "library_actions"; slug: string; selected_index?: number }
  | {
      screen: "library_input";
      slug: string;
      kind: "words" | "sentences" | "article";
      phase: "title" | "body";
      article_title: string;
      text: string;
      editing_id?: string;
    }
  | { screen: "library_preview"; slug: string; payload: LibraryPreviewPayload }
  | {
      screen: "library_browse";
      slug: string;
      entry_type: "words" | "sentences" | "articles";
      query: string;
      index: number;
    }
  | { screen: "library_delete_confirm"; slug: string }
```

```typescript
export type LibraryPreviewPayload =
  | {
      kind: "words";
      raw_text: string;
      entries: {
        text: string;
        word_kind: "word" | "phrase";
        meaning_zh?: string;
        phonetic?: string;
        source: "dict" | "manual";
      }[];
      error_lines: string[];
      editing_id?: string;
    }
  | {
      kind: "sentences";
      raw_text: string;
      entries: { text: string; translation_zh?: string }[];
      editing_id?: string;
    }
  | {
      kind: "article";
      raw_text: string;
      title: string;
      paragraphs: { text: string; translation_zh?: string }[];
      warnings: string[];
      editing_id?: string;
    };

（`raw_text` 保存录入原文，供预览页退格返回修改时回填输入屏。）
```

- 菜单（`menuItems.ts`）：`OpenTuiSubmenuId` 增加 `` `library_${string}` ``、`library_new`、`library_manage`、`` `library_kind_${string}` ``（库子菜单项 id 形如 `library_kind_<slug>:<words|phrases|sentences|articles|mix>`）。`customSubmenuItems` 重写：

```typescript
function customSubmenuItems(state: OpenTuiAppState): OpenTuiMenuItem[] {
  const zh = state.language === "zh";
  const items: OpenTuiMenuItem[] = [];
  for (const library of state.customLibraries ?? []) {
    const wordCount = library.words.filter((w) => w.kind === "word").length;
    const phraseCount = library.words.length - wordCount;
    items.push({
      id: `library_${library.slug}`,
      label: library.name,
      hint: zh
        ? `${wordCount} 词 · ${phraseCount} 组 · ${library.sentences.length} 句 · ${library.articles.length} 篇`
        : `${wordCount}w · ${phraseCount}p · ${library.sentences.length}s · ${library.articles.length}a`,
    });
  }
  items.push({ id: "library_new", label: zh ? "新建语料库" : "New library", hint: "" });
  items.push({ id: "library_manage", label: zh ? "管理语料库" : "Manage libraries", hint: "" });
  return items;
}
```

新增 `libraryMenuItems(state, slug)`：按库内容生成 `单词/词组/句子/文章/混合练习` 五项（计数为 0 的类型不显示；混合在库非空时总是显示），id 形如 `library_kind_kaoyan:words`。

- `reduceMenuKey`（`appModel.ts`）新增 case（模仿现有 `custom_my_words` case 第 773 行的 `runningState(...)` 模式）：
  - `library_<slug>` → `withRoute(state, { screen: "library_menu", slug, selected_index: 0 })`
  - `library_new` → `withRoute(state, { screen: "library_create", name: "" })`
  - `library_manage` → `withRoute(state, { screen: "library_manage", selected_index: 0 })`
  - `library_kind_<slug>:<kind>` → 找到 `state.customLibraries` 中对应库，按 kind 调 `buildLibraryWordsTarget / buildLibraryPhrasesTarget / buildLibrarySentencesTarget / buildLibraryArticleTarget / buildLibraryMixTarget`，`target.text === "" ? state : runningState(state.language, itemId, target, undefined, stateOptions(state))`
  - `library_menu` 屏的方向键/回车导航复用现有 submenu 的 `menuSelectionState` 模式（该屏在 `openTuiMenuItems` 分发中返回 `libraryMenuItems`）

- `cli.ts` `runApp`：

```typescript
import { Dictionary, ensureFullDictionary } from "./content/dictionary";
import { customLibrariesDirPath, loadCustomLibrariesFromDir } from "./storage/keyloopStore";
// runApp 内构建 context 前：
const librariesDir = customLibrariesDirPath(dataDir);
const customLibraries = await loadCustomLibrariesFromDir(librariesDir);
const fullDbPath = join(dataDir, "dict", "ecdict.db");
const dictionary = await Dictionary.open({
  miniPath: resolveContentPath("dictionary_mini.json"), // 用 library.ts 同款 content 根解析；若无现成单文件接口，新增导出 resolveContentFilePath(name) 于 src/content/library.ts
  fullDbPath,
});
void ensureFullDictionary({ dbPath: fullDbPath }); // 后台静默，不 await
// context 增加字段：
//   customLibraries, dictionary, librariesDir
// initialState 构建处增加：customLibraries, dictionaryTier: dictionary.tier
```

- [ ] **Step 1: 写失败测试**（`tests/opentuiApp.test.ts` 追加：custom 子菜单渲染库列表与两个固定项；`library_kind_*` 回车进入 running；空库 mix 不启动）——测试构造 state 时通过 `createOpenTuiInitialState` 的 options 注入 `customLibraries`（按该文件现有测试构造模式）。

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 按上述设计实现**（route 声明、context/state 字段、菜单、reduceMenuKey case、persist 处理、cli 接线；`renderer.ts` 的 `renderRoute` switch 为 8 个新 screen 先各加占位分支返回简单 `kit.Text({ content: "…" })`，后续任务逐屏替换——保证 tsc 的 exhaustive switch 通过）

- [ ] **Step 4: 全量测试**：`bun test tests && bunx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/opentui src/cli.ts src/content/library.ts tests/opentuiApp.test.ts
git commit -m "feat: wire custom libraries and dictionary into TUI context and menus"
```

---

### Task 9: 新建语料库流程

**Files:**
- Create: `src/ui/opentui/libraryReducers.ts`
- Create: `src/ui/opentui/screens/library.ts`
- Modify: `src/ui/opentui/appSession.ts`（`reduceOpenTuiAppKey` switch 加 `library_create` 分发）
- Modify: `src/ui/opentui/renderer.ts`（替换 `library_create` 占位）
- Create: `tests/opentuiLibrary.test.ts`

**交互**：`library_create` 屏一个单行输入框（标题"新建语料库"，提示"输入名称，Enter 创建，Esc 取消"）。打字追加 `name`，退格删尾，Enter（非空时）→ `createCustomLibrary(name, existingSlugs)` → state.customLibraries 追加 + `persist: { kind: "save", library }` + 回 custom 子菜单。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/opentuiLibrary.test.ts
import { describe, expect, test } from "bun:test";

import { reduceLibraryCreateKey } from "../src/ui/opentui/libraryReducers";
// 按 tests/opentuiAppSession.test.ts 现有方式构造 state 与 OpenTuiKeyEvent 辅助函数

function keyEvent(name: string, sequence: string): OpenTuiKeyEvent {
  return { name, sequence, ctrl: false, meta: false };
}

describe("library create screen", () => {
  test("typing accumulates name, enter creates library and persists", () => {
    let state = stateAt({ screen: "library_create", name: "" }); // stateAt: 本文件辅助函数，包 createOpenTuiInitialState + withRoute
    state = reduceLibraryCreateKey(state, keyEvent("w", "w")).state;
    state = reduceLibraryCreateKey(state, keyEvent("e", "e")).state;
    state = reduceLibraryCreateKey(state, keyEvent("b", "b")).state;
    const result = reduceLibraryCreateKey(state, keyEvent("enter", "\r"));
    expect(result.persist).toEqual({
      kind: "save",
      library: expect.objectContaining({ slug: "web", name: "web" }),
    });
    expect(result.state.customLibraries?.length).toBe(1);
    expect(result.state.route.screen).toBe("submenu");
  });

  test("enter with empty name does nothing", () => {
    const result = reduceLibraryCreateKey(stateAt({ screen: "library_create", name: "" }), keyEvent("enter", "\r"));
    expect(result.state.route.screen).toBe("library_create");
    expect(result.persist).toBeUndefined();
  });
});
```

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现**

```typescript
// src/ui/opentui/libraryReducers.ts（核心；import 按需补全）
export interface LibraryReduceResult {
  state: OpenTuiAppState;
  persist?: LibraryPersist;
}

function isBackspace(event: OpenTuiKeyEvent): boolean {
  return event.name === "backspace" || event.sequence === "\b" || event.sequence === "\x7f";
}

function printableChar(event: OpenTuiKeyEvent): string | null {
  if (event.ctrl || event.meta) return null;
  const chars = Array.from(event.sequence);
  if (chars.length !== 1) return null;
  const codePoint = chars[0]!.codePointAt(0) ?? 0;
  if (codePoint < 0x20 || codePoint === 0x7f) return null;
  return chars[0]!;
}

export function reduceLibraryCreateKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_create") return { state };
  if (isEnterEvent(event)) {
    const name = route.name.trim();
    if (name === "") return { state };
    const existing = (state.customLibraries ?? []).map((library) => library.slug);
    const library = createCustomLibrary(name, existing);
    const next: OpenTuiAppState = {
      ...state,
      customLibraries: [...(state.customLibraries ?? []), library],
      route: { screen: "submenu", menu: "custom", selected_index: 0 },
    };
    return { state: next, persist: { kind: "save", library } };
  }
  if (isBackspace(event)) {
    return { state: withRoute(state, { ...route, name: route.name.slice(0, -1) }) };
  }
  const char = printableChar(event);
  if (char !== null) {
    return { state: withRoute(state, { ...route, name: route.name + char }) };
  }
  return { state };
}
```

`appSession.ts` `reduceOpenTuiAppKey` switch 加：

```typescript
    case "library_create": {
      const result = reduceLibraryCreateKey(state, event);
      return { state: result.state, action: "continue", ...(result.persist === undefined ? {} : { persist: result.persist }) };
    }
```

（ESC 已由 reduceOpenTuiAppKey 顶部统一处理回主菜单——可接受，不需屏内处理。）

渲染（`screens/library.ts`）：`renderLibraryCreateScreen(state, kit)` 参照 `codeFilterPicker.ts` 搜索面板（第 38-85 行）：带边框 Box + 一行 `kit.Text` 显示 `route.name + "▏"`，空时显示占位提示，底部一行帮助文案。`renderer.ts` 替换占位分支。

- [ ] **Step 4: 测试通过**：`bun test tests/opentuiLibrary.test.ts tests && bunx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/opentui tests/opentuiLibrary.test.ts
git commit -m "feat: create custom library from TUI"
```

---

### Task 10: 添加单词流程（多行输入 + 词典 + 预览确认）

**Files:**
- Modify: `src/ui/opentui/libraryReducers.ts`（`reduceLibraryInputKey`、`reduceLibraryPreviewKey`）
- Modify: `src/ui/opentui/screens/library.ts`（`renderLibraryInputScreen`、`renderLibraryPreviewScreen`）
- Modify: `src/ui/opentui/appSession.ts` / `renderer.ts`（分发）
- Test: `tests/opentuiLibrary.test.ts`（追加）

**交互**：
- `library_actions` 屏（Task 12 完整实现列表；本任务先实现 route 跳转目标 `library_input`）
- `library_input`（kind=words，phase 固定 "body"）：多行输入区。可打印字符追加；Enter 追加 `"\n"`；退格删尾字符；**Ctrl+D 提交**；Esc 返回（全局 ESC 行为已回主菜单，可接受）。
- 提交 → `parseWordLines(text)` → 对无 `meaning_zh` 的条目逐个 `context.dictionary?.lookup(entry.text)` 填充 `meaning_zh`/`phonetic`（命中 source="dict"；用户给了释义 source="manual"；都没有 source="dict" 且 meaning 缺失）→ route `library_preview`（payload kind "words"，含 `error_lines`）
- `library_preview`：列表逐行 `text — 释义`，缺失释义行黄色提示"未找到释义"；Enter 确认 → 生成 `CustomWord[]`（id 用 `crypto.randomUUID()`），追加进库（编辑模式 `editing_id` 存在时替换该条）→ 更新 state + persist + 回 `library_actions`；Esc/退格 → 返回 `library_input`（保留原文本，需要 preview payload 带回 `raw_text`——在 payload 加字段 `raw_text: string`）。

注意：`reduceLibraryInputKey` 需要 `context`（词典查询），签名 `(state, event, context: OpenTuiAppSessionContext)`。

- [ ] **Step 1: 写失败测试**（追加；用 fake dictionary：构造 `Dictionary.open({})` 替身——直接传 `{ lookup: (t) => t === "abandon" ? { translation_zh: "v. 放弃" } : null, tier: "mini" }`，context 类型用结构兼容对象）

```typescript
describe("library words input flow", () => {
  test("ctrl+d parses lines, queries dictionary, routes to preview", () => {
    let state = stateAt({
      screen: "library_input", slug: "web", kind: "words",
      phase: "body", article_title: "", text: "",
    }, { customLibraries: [emptyLibrary("web")] });
    for (const char of "abandon\nfoo: 自定义") {
      state = reduceLibraryInputKey(state, charEvent(char), fakeContext).state;
    }
    const result = reduceLibraryInputKey(state, { name: "d", sequence: "\x04", ctrl: true, meta: false }, fakeContext);
    expect(result.state.route.screen).toBe("library_preview");
    const payload = (result.state.route as { payload: LibraryPreviewPayload }).payload;
    expect(payload).toMatchObject({
      kind: "words",
      entries: [
        { text: "abandon", meaning_zh: "v. 放弃", source: "dict" },
        { text: "foo", meaning_zh: "自定义", source: "manual" },
      ],
    });
  });

  test("preview enter appends words to library and persists", () => {
    const previewState = stateAt({
      screen: "library_preview", slug: "web",
      payload: { kind: "words", raw_text: "abandon", entries: [{ text: "abandon", word_kind: "word", meaning_zh: "v. 放弃", source: "dict" }], error_lines: [] },
    }, { customLibraries: [emptyLibrary("web")] });
    const result = reduceLibraryPreviewKey(previewState, keyEvent("enter", "\r"));
    expect(result.persist?.kind).toBe("save");
    const library = result.state.customLibraries?.[0];
    expect(library?.words.length).toBe(1);
    expect(result.state.route.screen).toBe("library_actions");
  });
});
```

（`charEvent(char)`：char 为 `"\n"` 时返回 enter 事件，否则普通字符事件——测试辅助函数。）

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现**

`reduceLibraryInputKey` 核心（words 分支；sentences/article 留待 Task 11 扩展同函数）：

```typescript
export function reduceLibraryInputKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_input") return { state };
  const isSubmit = event.ctrl && (event.name === "d" || event.sequence === "\x04");
  if (isSubmit) {
    if (route.kind === "words") {
      const parsed = parseWordLines(route.text);
      const entries = parsed.entries.map((entry) => {
        if (entry.meaning_zh !== undefined) {
          return { text: entry.text, word_kind: entry.kind, meaning_zh: entry.meaning_zh, source: "manual" as const };
        }
        const hit = context.dictionary?.lookup(entry.text) ?? null;
        return {
          text: entry.text,
          word_kind: entry.kind,
          ...(hit?.translation_zh === undefined ? {} : { meaning_zh: hit.translation_zh }),
          ...(hit?.phonetic === undefined ? {} : { phonetic: hit.phonetic }),
          source: "dict" as const,
        };
      });
      return {
        state: withRoute(state, {
          screen: "library_preview",
          slug: route.slug,
          payload: {
            kind: "words",
            raw_text: route.text,
            entries,
            error_lines: parsed.errors.map((error) => `第 ${error.line} 行：${error.raw}`),
            ...(route.editing_id === undefined ? {} : { editing_id: route.editing_id }),
          },
        }),
      };
    }
    // sentences / article 分支：Task 11
  }
  if (isEnterEvent(event)) {
    return { state: withRoute(state, { ...route, text: `${route.text}\n` }) };
  }
  if (isBackspace(event)) {
    return { state: withRoute(state, { ...route, text: route.text.slice(0, -1) }) };
  }
  const char = printableChar(event);
  if (char !== null) {
    return { state: withRoute(state, { ...route, text: route.text + char }) };
  }
  return { state };
}
```

`reduceLibraryPreviewKey`（Enter 落库；words 分支）：

```typescript
export function reduceLibraryPreviewKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_preview") return { state };
  if (isBackspace(event)) {
    const payload = route.payload;
    return {
      state: withRoute(state, {
        screen: "library_input",
        slug: route.slug,
        kind: payload.kind === "article" ? "article" : payload.kind,
        phase: "body",
        article_title: payload.kind === "article" ? payload.title : "",
        text: payload.raw_text,
        ...(payload.editing_id === undefined ? {} : { editing_id: payload.editing_id }),
      }),
    };
  }
  if (!isEnterEvent(event)) return { state };
  const libraries = state.customLibraries ?? [];
  const index = libraries.findIndex((library) => library.slug === route.slug);
  const library = libraries[index];
  if (library === undefined) return { state };
  const updated = applyPreviewToLibrary(library, route.payload); // 纯函数：words 追加/替换；Task 11 扩展 sentences/article
  const next: OpenTuiAppState = {
    ...state,
    customLibraries: [...libraries.slice(0, index), updated, ...libraries.slice(index + 1)],
    route: { screen: "library_actions", slug: route.slug, selected_index: 0 },
  };
  return { state: next, persist: { kind: "save", library: updated } };
}

function applyPreviewToLibrary(library: CustomLibrary, payload: LibraryPreviewPayload): CustomLibrary {
  if (payload.kind === "words") {
    const incoming: CustomWord[] = payload.entries.map((entry) => ({
      id: crypto.randomUUID(),
      text: entry.text,
      kind: entry.word_kind,
      ...(entry.meaning_zh === undefined ? {} : { meaning_zh: entry.meaning_zh }),
      ...(entry.phonetic === undefined ? {} : { phonetic: entry.phonetic }),
      source: entry.source,
    }));
    if (payload.editing_id !== undefined) {
      const keep = library.words.filter((word) => word.id !== payload.editing_id);
      return { ...library, words: [...keep, ...incoming] };
    }
    const existing = new Set(library.words.map((word) => word.text.toLowerCase()));
    return {
      ...library,
      words: [...library.words, ...incoming.filter((word) => !existing.has(word.text.toLowerCase()))],
    };
  }
  return library; // sentences/article: Task 11
}
```

`LibraryPreviewPayload` 的 `raw_text` 字段已在 Task 8 声明，提交时填入 `route.text` 原文。

渲染：
- `renderLibraryInputScreen`：边框 Box，标题"添加单词 — <库名>"；正文按 `route.text.split("\n")` 取尾部可视行数逐行 `kit.Text`，末行追加 `▏` 光标；底部帮助行 `每行一条：word 或 word: 释义 · Ctrl+D 提交 · Esc 取消`。
- `renderLibraryPreviewScreen`：列表行 `text — meaning`（缺 meaning 用 `theme.warning ?? theme.error` 显示"未找到释义，可保存后编辑补充"）；顶部显示 `error_lines`；底部 `Enter 保存 N 条 · 退格返回修改`。

- [ ] **Step 4: 测试通过**：`bun test tests && bunx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/opentui tests/opentuiLibrary.test.ts
git commit -m "feat: add words to custom library with dictionary auto-lookup and preview"
```

---

### Task 11: 添加句子/文章流程

**Files:**
- Modify: `src/ui/opentui/libraryReducers.ts`（`reduceLibraryInputKey` 补 sentences/article 提交分支与 title phase；`applyPreviewToLibrary` 补两分支）
- Modify: `src/ui/opentui/screens/library.ts`（input 屏按 kind 切换标题与帮助文案；preview 屏渲染句子/文章分支）
- Test: `tests/opentuiLibrary.test.ts`（追加）

**交互：**
- 句子（kind=sentences，phase 固定 "body"）：Ctrl+D → `parseSentenceBlocks(route.text)` → preview（kind "sentences"）→ Enter 落库（id `crypto.randomUUID()`；编辑模式替换 `editing_id` 对应条目，否则全部追加）。
- 文章（kind=article）：phase "title" 时单行输入标题（Enter → phase "body"；帮助文案"输入标题，Enter 继续"）；phase "body" 多行粘贴，Ctrl+D → `parseArticlePaste(route.text)` → preview（kind "article"，含 warnings）→ Enter 落库为一篇 `CustomArticle`。
- preview 渲染：句子分支每条两行（英文 + 缩进中文）；文章分支显示标题、段数、warnings（黄色）与前 3 段预览。

`applyPreviewToLibrary` 两个新分支：

```typescript
  if (payload.kind === "sentences") {
    const incoming = payload.entries.map((entry) => ({ id: crypto.randomUUID(), ...entry }));
    if (payload.editing_id !== undefined) {
      const keep = library.sentences.filter((sentence) => sentence.id !== payload.editing_id);
      return { ...library, sentences: [...keep, ...incoming] };
    }
    return { ...library, sentences: [...library.sentences, ...incoming] };
  }
  // article
  const article: CustomArticle = {
    id: payload.editing_id ?? crypto.randomUUID(),
    title: payload.title === "" ? "未命名文章" : payload.title,
    paragraphs: payload.paragraphs,
  };
  if (payload.editing_id !== undefined) {
    return { ...library, articles: library.articles.map((existing) => existing.id === payload.editing_id ? article : existing) };
  }
  return { ...library, articles: [...library.articles, article] };
```

- [ ] **Step 1: 写失败测试**（句子双行块解析入 preview；文章 title→body 两阶段；落库后 persist 与计数断言——风格与 Task 10 一致）
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现上述分支与渲染**
- [ ] **Step 4: 全量测试**：`bun test tests && bunx tsc --noEmit` → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat: add sentences and articles to custom library via single paste"`

---

### Task 12: 管理——库列表、浏览/编辑/删除

**Files:**
- Modify: `src/ui/opentui/libraryReducers.ts`（`reduceLibraryManageKey`、`reduceLibraryActionsKey`、`reduceLibraryBrowseKey`、`reduceLibraryDeleteConfirmKey`）
- Modify: `src/ui/opentui/screens/library.ts`（四个渲染函数）
- Modify: `src/ui/opentui/appSession.ts` / `renderer.ts`（分发，替换全部剩余占位）
- Test: `tests/opentuiLibrary.test.ts`（追加）

**交互：**
- `library_manage`：库列表（↑/↓ + Enter → `library_actions`），列表渲染复用 `screens/menu.ts` 的 `listRow` 组件模式。
- `library_actions`：固定七项菜单 `添加单词 / 添加句子 / 添加文章 / 浏览单词与词组 / 浏览句子 / 浏览文章 / 删除语料库`（↑/↓ + Enter）：
  - 添加* → `library_input`（对应 kind；article 从 phase "title" 起）
  - 浏览* → `library_browse`（对应 entry_type，query ""、index 0）
  - 删除语料库 → `library_delete_confirm`
- `library_browse`：复用 `codeFilterPicker` 交互模式（字符追加 query、退格删、↑/↓ 移动 index）。过滤用与 `fuzzyIncludes`（`appModel.ts:553-564`）相同的算法——把该函数导出复用，匹配字段：words 用 `text + meaning_zh`、sentences 用 `text + translation_zh`、articles 用 `title`。
  - **Enter = 编辑**：跳 `library_input` 预填录入格式文本并带 `editing_id`：word → `"text: meaning"`（无 meaning 则 `"text"`）；sentence → `"text\ntranslation"`；article → phase "title" 预填标题、body 预填 `段落英文行…\n\n译文行…` 交替重建
  - **`d` 键 = 删除当前条**（query 为空时才生效，避免与搜索输入冲突；query 非空时 d 是搜索字符）：直接从库中移除该条 + persist save + index 修正
- `library_delete_confirm`：显示"删除语料库「<name>」？该操作不可恢复。Enter 确认 · 退格取消"；Enter → 从 state 移除 + `persist: { kind: "delete", slug }` + 回 `library_manage`。

- [ ] **Step 1: 写失败测试**（至少覆盖：actions 菜单 Enter 路由正确；browse 模糊过滤 + Enter 携带 editing_id 与预填文本；query 为空时 d 删除并 persist；删除确认产生 delete persist）
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现**（reducer 模式同 Task 9/10；browse 的列表项与选中行渲染参照 `codeFilterPicker.ts` 第 200-273 行）
- [ ] **Step 4: 全量测试**：`bun test tests && bunx tsc --noEmit` → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat: manage custom libraries (browse, fuzzy search, edit, delete)"`

---

### Task 13: 设置页词典状态

**Files:**
- Modify: `src/ui/opentui/settingsItems.ts`（`openTuiFlatSettingsItems` 第 66-114 行追加只读项；`OpenTuiFlatSettingsItem["kind"]` union 加 `"dictionary_status"`）
- Modify: `src/ui/opentui/settingsReducers.ts`（该 kind 回车无操作——在 kind switch 中显式 no-op）
- Test: `tests/opentuiRenderer.test.ts` 或 settings 相关测试文件追加断言

```typescript
// openTuiFlatSettingsItems 追加：
    {
      kind: "dictionary_status",
      label: state.language === "zh" ? "词典" : "Dictionary",
      value: dictionaryStatusLabel(state),
    },
// 同文件：
function dictionaryStatusLabel(state: OpenTuiAppState): string {
  const zh = state.language === "zh";
  switch (state.dictionaryTier) {
    case "full":
      return zh ? "完整版已就绪（ECDICT）" : "Full (ECDICT)";
    case "mini":
      return zh ? "精简版（完整版后台下载中）" : "Mini (full version downloading)";
    default:
      return zh ? "未加载" : "Not loaded";
  }
}
```

- [ ] **Step 1: 写失败测试**（settings items 包含 dictionary_status 且 value 随 dictionaryTier 变化）
- [ ] **Step 2: 确认失败** → **Step 3: 实现** → **Step 4: 全量测试 PASS**
- [ ] **Step 5: Commit**：`git commit -m "feat: show dictionary status in settings"`

---

### Task 14: 移除旧收藏式功能

**Files（删改清单）：**
- Modify: `src/cli.ts`：删 `parseSentenceCommand`(730-763)、`parseArticleCommand`(765-795)、`parseCorpusCommand`(797-844)、`parseVocabCommand`、`runSentence`(1583-1631)、`runArticle`(1633-1681)、`runCorpus`(1683-1818)、`runVocab`(1820-1917)、`parseCliArgs` switch 中对应 case（236-267 内）、help 文本相关行（320-372 内 vocab/corpus/sentence/article 行）、`captureVocabulary` 注入（1030-1056）、`vocabularyCreateOptions` 及 950-969 中 `personalVocabulary` 装载
- Modify: `src/ui/opentui/startRunner.ts`：删 A 键捕捉块（1073-1086）与 `captureVocabulary` option 类型
- Modify: `src/ui/opentui/runnerEvents.ts`：删 `isCaptureWordsEvent`(183-188)
- Modify: `src/ui/opentui/appModel.ts`：删 route `complete` 的 `captured_words` 字段、`custom_tag_*`/`custom_my_*`/`my_vocabulary` 菜单 case（628-789 内）、相关 import（21、64 行）
- Modify: `src/ui/opentui/menuItems.ts`：删 `custom_my_words/custom_my_sentences/custom_my_articles/custom_tag_${string}/my_vocabulary` id 与 programming 子菜单中 `my_vocabulary` 项
- Modify: `src/ui/opentui/appSession.ts`：删 `customCorpusFromContext`(206-231)、`customCollections` context 字段、`CustomCorpusSummary` 状态装配
- Modify: `src/ui/opentui/screens/modals.ts`：删错词收录弹窗文案（464-467 附近）与"按 A 收录"提示
- Delete: `src/training/personalCorpus.ts` + `tests/personalCorpus.test.ts`
- Modify: `src/training/vocabulary.ts`：删 `PersonalVocabularyEntry/PersonalVocabularyStore/CorpusCollectionMeta/CorpusCollectionsStore/RankedPersonalVocabulary` 类型、`createPersonalVocabularyEntry/upsertPersonalVocabularyEntry/rankPersonalVocabulary/emptyCollectionsStore/collectionTagCounts/errorWordsFromRecord`；**保留** `LongWordEntry` 与 `buildLongWordBreakdownTarget`（内置长词练习仍用）
- Modify: `src/training/targets.ts`：删 `buildPersonalVocabularyPracticeTarget`(584-607)、`BuildTargetContext` 的 `personalVocabulary/personalSentences/personalArticles/personalVocabularyLimit` 字段及全部使用点；删 plan 构建中 `personal_vocabulary` 课的生成逻辑
- Modify: `src/storage/keyloopStore.ts`：删 `vocabularyPath/collectionsPath/personalSentencesPath/personalArticlesPath` 与四组 load/save 函数
- Modify: `src/domain/model.ts`：**保留** `LessonKind` 中 `"personal_vocabulary"` 字面量与 preferences `personal_vocabulary` 字段的解析（历史 daily_runs/sessions/preferences JSON 兼容），但 plan 生成不再产出该课
- Modify: `src/ui/opentui/menuItems.ts` 中 `CustomCorpusSummary` 类型（104-109）删除
- Modify: `src/index.ts`：删上述全部旧导出
- Tests: 删/改 `tests/cli.test.ts`、`tests/opentuiApp.test.ts`、`tests/opentuiStartRunner.test.ts`、`tests/opentuiRenderer.test.ts`、`tests/storage.test.ts`、`tests/targets.test.ts` 中引用被删 API 的用例

- [ ] **Step 1: 全局定位引用**

Run: `grep -rn "PersonalVocabulary\|personalVocabulary\|personal_vocabulary\|PersonalSentence\|PersonalArticle\|personalCorpus\|CorpusCollection\|customCollections\|CustomCorpusSummary\|captureVocabulary\|errorWordsFromRecord\|isCaptureWordsEvent\|captured_words" src tests`
Expected: 输出与上方清单一致的引用列表；逐项删改，发现清单外引用一并处理（保留 model.ts 的兼容解析点）

- [ ] **Step 2: 按清单删改源代码**（先 src 后 tests；删除菜单 case 后确认 `OpenTuiSubmenuId` 不再含旧 id；`tsc --noEmit` 驱动找漏）

- [ ] **Step 3: 修测试**：删除针对被删功能的用例；改动涉及共享 fixture 的（如 cli.test.ts 解析断言）按现状更新

- [ ] **Step 4: 全量验证**

Run: `bun test tests && bunx tsc --noEmit`
Expected: PASS、无类型错误
Run: `grep -rn "personalCorpus\|PersonalVocabularyEntry" src` → 无输出

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor!: remove legacy personal corpus, error-word capture, and corpus CLI"
```

---

### Task 15: 回归与验收

- [ ] **Step 1: 全量自动验证**

Run: `bun test tests && bunx tsc --noEmit`
Expected: 全绿

- [ ] **Step 2: 手动验收**（`bun src/main.ts` 或项目惯用启动方式，逐项走查）：

1. 主菜单 → 自建语料库 → 新建语料库 → 输入「考研英语」→ 创建成功，列表出现
2. 管理语料库 → 考研英语 → 添加单词 → 粘贴 `abandon\nmachine learning: 机器学习\nzzzqqq` → Ctrl+D → 预览：abandon 自动出释义、machine learning 用手动释义、zzzqqq 黄色"未找到释义" → Enter 保存
3. 添加句子（交替格式两条）、添加文章（标题 + 整篇英文 + 空行 + 整篇中文）→ 保存成功
4. 返回自建语料库 → 考研英语 → 子菜单出现 单词/词组/句子/文章/混合，计数正确；进入词组练习：每行一条、空格显示为 `·`，敲空格键正确命中
5. 句子/文章练习显示中文标注（与内置语料一致）
6. 浏览单词与词组 → 模糊搜索 → Enter 编辑补释义 → 保存生效；`d` 删除一条生效
7. 删除语料库 → 确认 → 菜单消失；`~/.keyloop/libraries/` 下文件已删
8. 设置 → 词典：显示精简版或完整版状态；联网等待后台下载完成后重启显示完整版
9. `keyloop corpus`/`keyloop sentence`/`keyloop article`/`keyloop vocab` → 报未知命令
10. 练习完成页不再出现"按 A 收录错词"
11. 重启应用：自建库内容完整保留

- [ ] **Step 3: 结果记录与修复**：任何一项不符 → 回到对应任务修复后重跑本任务

- [ ] **Step 4: Commit（如有修复）**

```bash
git add -A && git commit -m "test: regression fixes after custom library redesign"
```
