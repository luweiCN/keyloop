# 编程基础栏目重设计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「编程基础」栏目重写为 6 个组别(符号与数字、编程常用词、命名形式、技术长词、内置 API、基础综合),其中符号与数字、内置 API 按语言提供语境化卡片语料(首批 13 门语言),旧代码/旧语料/旧测试全删重写。

**Architecture:** 新增独立的卡片语料层(`contents/programming_basics/` JSONL + 种子 + 生成脚本)、独立的加载器(`src/content/programmingBasics.ts`)和组卷逻辑(`src/training/programmingBasicsTargets.ts`);UI 层只改菜单与 case 接线。语言无关三项的词库整体重建。规格见 `docs/superpowers/specs/2026-06-11-programming-basics-redesign-design.md`。

**Tech Stack:** Bun + TypeScript,`bun test` 测试,无新增依赖。

**对规格的实现层澄清(已锁定,执行者不需再决策):**

- 卡片 JSONL 统一用 `topic` 字段做均衡取样键(符号卡 topic=语法主题;API 卡 topic=API 域,即规格中的 `group`,字段名统一为 topic)
- 新组别 lesson `kind` 用 `"code_block"`,练习 `mode` 用 `"code"`
- 一卷卡片以 `"\n"` 连接(每行一张卡),整卷生成一个 `code_blocks` 条目标注语言
- 无语料可用时(语料缺失=安装损坏)直接 throw,正常安装不可能发生
- 种子文件入库(不进 .gitignore),路径 `contents/programming_basics/seeds/<语言>.json`

**全局质量规则(所有语料任务遵守):**

- 卡片 text:单行、自包含、可独立输入、≤ 90 字符、仅 ASCII、符合该语言最佳实践(规范命名、规范空格)
- 标识符语义配套:集合名/元素名/字段名成组(items/item/id、users/user/name),不做无语义随机组合
- 每语言:symbols_numbers ≥ 80 张且每个 topic ≥ 8 张;builtin_api ≥ 80 张(≥ 40 个不同 API)且每个 topic(域)≥ 8 张
- symbols_numbers 的合法 topic:`declaration` `call` `control` `index` `literal` `string`
- builtin_api 的 topic 为该语言的 API 域名(小写 snake_case,如 `array` `string` `dom` `os`)

---

## 文件结构

```
新建:
  src/content/programmingBasics.ts          # 卡片类型 + 索引/卡片加载器
  src/training/programmingBasicsTargets.ts  # 语言解析 + 组卷 + mix
  src/tools/buildProgrammingBasicsContent.ts # 种子 → JSONL 生成脚本
  src/tools/buildProgrammingWordsContent.ts  # 从代码语料统计重建词库
  contents/programming_basics/seeds/<lang>.json      # 13 门语言种子
  contents/programming_basics/symbols_numbers/<lang>.jsonl
  contents/programming_basics/builtin_api/<lang>.jsonl
  contents/programming_basics/index.json
  tests/programmingBasics.test.ts           # 加载器/语言解析/组卷/mix 单测
  tests/programmingBasicsContent.test.ts    # 语料 schema 测试

修改:
  src/domain/model.ts        # TrainingCategory 增删
  src/cli.ts                 # 菜单项 → lesson 映射
  src/ui/opentui/menuItems.ts # programming 子菜单 6 项
  src/ui/opentui/appModel.ts # case 接线
  src/content/library.ts     # 删除 symbols/naming/number_drills/language_symbols 字段
  src/training/targets.ts    # 删除旧编程基础路径,保留/改造 buildLessonWords、命名派生
  contents/programming_words.json  # 重建
  contents/long_words.json         # 重建
  contents/source_catalog.json     # 追加新 source 条目

删除:
  contents/symbols.json
  contents/number_drills.json
  contents/naming.json
  contents/language_symbols.json
  旧编程基础相关测试用例(分散在 tests/targets.test.ts 等)
```

任务依赖:Task 1 → Task 2 → Task 3-7(语料,可并行)→ Task 9 → Task 10;Task 8(词库)独立,需在 Task 10 前完成;Task 11 需要 9、10;Task 12、13 收尾。

---

### Task 1: 卡片类型与加载器

**Files:**
- Create: `src/content/programmingBasics.ts`
- Test: `tests/programmingBasics.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/programmingBasics.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
} from "../src/content/programmingBasics";

function makeFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "keyloop-basics-"));
  const base = join(root, "programming_basics");
  mkdirSync(join(base, "symbols_numbers"), { recursive: true });
  mkdirSync(join(base, "builtin_api"), { recursive: true });
  writeFileSync(
    join(base, "index.json"),
    JSON.stringify({
      schema: "keyloop.programming_basics",
      schema_version: 1,
      languages: ["typescript"],
    }),
  );
  writeFileSync(
    join(base, "symbols_numbers", "typescript.jsonl"),
    [
      JSON.stringify({
        text: "const items = [];",
        topic: "declaration",
        focus: ["=", "[]", ";"],
        note_zh: "声明空数组",
        source_id: "keyloop:programming-basics:typescript:seed",
      }),
    ].join("\n") + "\n",
  );
  writeFileSync(
    join(base, "builtin_api", "typescript.jsonl"),
    [
      JSON.stringify({
        text: "const ids = items.map((item) => item.id);",
        topic: "array",
        api: "Array.map",
        note_zh: "数组映射",
        source_id: "keyloop:programming-basics:typescript:seed",
      }),
    ].join("\n") + "\n",
  );
  return root;
}

describe("programming basics content loader", () => {
  test("lists languages from index.json", () => {
    const contentRoot = makeFixtureRoot();
    expect(listProgrammingBasicsLanguages({ contentRoot })).toEqual(["typescript"]);
  });

  test("loads symbols_numbers cards with fields", () => {
    const contentRoot = makeFixtureRoot();
    const cards = loadProgrammingBasicsCards("symbols_numbers", "typescript", { contentRoot });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.text).toBe("const items = [];");
    expect(cards[0]?.topic).toBe("declaration");
    expect(cards[0]?.focus).toEqual(["=", "[]", ";"]);
  });

  test("loads builtin_api cards with api field", () => {
    const contentRoot = makeFixtureRoot();
    const cards = loadProgrammingBasicsCards("builtin_api", "typescript", { contentRoot });
    expect(cards[0]?.api).toBe("Array.map");
  });

  test("throws on missing language file", () => {
    const contentRoot = makeFixtureRoot();
    expect(() => loadProgrammingBasicsCards("symbols_numbers", "python", { contentRoot })).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/programmingBasics.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现加载器**

```typescript
// src/content/programmingBasics.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveCodeContentRoot,
  type ResolveCodeContentRootOptions,
} from "./codeCorpus";

export type ProgrammingBasicsKind = "symbols_numbers" | "builtin_api";

export interface ProgrammingBasicsCard {
  text: string;
  topic: string;
  focus?: string[];
  api?: string;
  note_zh?: string;
  source_id: string;
}

export interface ProgrammingBasicsIndex {
  schema: string;
  schema_version: number;
  languages: string[];
}

export type ProgrammingBasicsOptions = ResolveCodeContentRootOptions;

function basicsRoot(options: ProgrammingBasicsOptions = {}): string {
  return join(resolveCodeContentRoot(options), "programming_basics");
}

export function loadProgrammingBasicsIndex(
  options: ProgrammingBasicsOptions = {},
): ProgrammingBasicsIndex {
  const raw = readFileSync(join(basicsRoot(options), "index.json"), "utf8");
  return JSON.parse(raw) as ProgrammingBasicsIndex;
}

export function listProgrammingBasicsLanguages(
  options: ProgrammingBasicsOptions = {},
): string[] {
  return loadProgrammingBasicsIndex(options).languages;
}

export function loadProgrammingBasicsCards(
  kind: ProgrammingBasicsKind,
  language: string,
  options: ProgrammingBasicsOptions = {},
): ProgrammingBasicsCard[] {
  const path = join(basicsRoot(options), kind, `${language}.jsonl`);
  const raw = readFileSync(path, "utf8");
  const cards: ProgrammingBasicsCard[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const card = JSON.parse(trimmed) as ProgrammingBasicsCard;
    if (typeof card.text !== "string" || card.text.length === 0) {
      throw new Error(`invalid programming basics card in ${path}`);
    }
    cards.push(card);
  }
  return cards;
}
```

注意:`resolveCodeContentRoot` 当前在 `src/content/codeCorpus.ts` 中,若未导出 `ResolveCodeContentRootOptions` 类型则补导出。执行时先 `grep -n "resolveCodeContentRoot" src/content/codeCorpus.ts` 确认签名,保持同一 contentRoot 解析机制(测试用 `{ contentRoot }` 注入临时目录的方式必须与 codeCorpus 现有测试一致,参照 `tests/` 中现有 codeCorpus 测试的 fixture 写法)。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/programmingBasics.test.ts`
Expected: PASS(4 tests)

- [ ] **Step 5: 提交**

```bash
git add src/content/programmingBasics.ts tests/programmingBasics.test.ts
git commit -m "feat: programming basics card loader"
```

---

### Task 2: 生成脚本、TypeScript 种子、语料 schema 测试

**Files:**
- Create: `src/tools/buildProgrammingBasicsContent.ts`
- Create: `contents/programming_basics/seeds/typescript.json`
- Create: `tests/programmingBasicsContent.test.ts`
- Modify: `contents/source_catalog.json`(追加条目)

- [ ] **Step 1: 写种子文件 `contents/programming_basics/seeds/typescript.json`**

种子分四段:`identifier_sets`(标识符配套组)、`symbols_numbers_templates`(模板,`{collection}`/`{element}`/`{field}`/`{value}` 占位)、`symbols_numbers_static`(不吃模板的静态卡,数字/字符串类为主)、`builtin_api_cards`(完整 API 卡)。完整结构与必须包含的内容:

```json
{
  "language": "typescript",
  "source_id": "keyloop:programming-basics:typescript:seed",
  "identifier_sets": [
    { "collection": "items", "element": "item", "field": "id", "value": "[]" },
    { "collection": "users", "element": "user", "field": "name", "value": "[]" },
    { "collection": "orders", "element": "order", "field": "total", "value": "[]" },
    { "collection": "tasks", "element": "task", "field": "done", "value": "[]" },
    { "collection": "posts", "element": "post", "field": "title", "value": "[]" },
    { "collection": "events", "element": "event", "field": "type", "value": "[]" },
    { "collection": "files", "element": "file", "field": "path", "value": "[]" },
    { "collection": "nodes", "element": "node", "field": "label", "value": "[]" }
  ],
  "symbols_numbers_templates": [
    { "topic": "declaration", "template": "const {collection} = {value};", "focus": ["=", ";"], "note_zh": "常量声明" },
    { "topic": "declaration", "template": "let selected{Element}: string | null = null;", "focus": [":", "|"], "note_zh": "可空变量声明" },
    { "topic": "declaration", "template": "function get{Element}(id: number) {", "focus": ["()", ":", "{"], "note_zh": "函数声明" },
    { "topic": "declaration", "template": "class {Element}Service {", "focus": ["{"], "note_zh": "类声明" },
    { "topic": "declaration", "template": "const { {field} } = {element};", "focus": ["{}", "="], "note_zh": "解构赋值" },
    { "topic": "call", "template": "{collection}.map(({element}) => {element}.{field});", "focus": ["=>", "()", "."], "note_zh": "数组映射" },
    { "topic": "call", "template": "{collection}.filter(({element}) => {element}.{field} !== null);", "focus": ["=>", "!=="], "note_zh": "数组过滤" },
    { "topic": "call", "template": "await fetch{Element}({element}.{field});", "focus": ["()", "."], "note_zh": "异步调用" },
    { "topic": "control", "template": "if ({element}.{field} !== undefined) {", "focus": ["!==", "{"], "note_zh": "判空守卫" },
    { "topic": "control", "template": "for (const {element} of {collection}) {", "focus": ["()", "{"], "note_zh": "for-of 循环" },
    { "topic": "control", "template": "return {element}.{field} ?? fallback;", "focus": ["??", ";"], "note_zh": "空值合并返回" },
    { "topic": "index", "template": "const first = {collection}[0];", "focus": ["[]", "="], "note_zh": "取首元素" },
    { "topic": "index", "template": "const rest = {collection}.slice(1, 10);", "focus": ["()", ","], "note_zh": "切片" }
  ],
  "symbols_numbers_static": [
    { "topic": "literal", "text": "const color = \"#ff6600\";", "focus": ["#", "\""], "note_zh": "十六进制颜色" },
    { "topic": "literal", "text": "const port = 8080;", "focus": ["="], "note_zh": "端口号" },
    { "topic": "literal", "text": "const version = \"1.2.3\";", "focus": ["\"", "."], "note_zh": "版本号" },
    { "topic": "literal", "text": "const flags = 0xff & mask;", "focus": ["0x", "&"], "note_zh": "十六进制与位运算" },
    { "topic": "literal", "text": "const ratio = 16 / 9;", "focus": ["/"], "note_zh": "数字除法" },
    { "topic": "string", "text": "import { join } from \"node:path\";", "focus": ["{}", "\""], "note_zh": "模块导入" },
    { "topic": "string", "text": "const url = `${base}/api/users`;", "focus": ["`", "${}"], "note_zh": "模板字符串" },
    { "topic": "string", "text": "const file = \"./src/utils/index.ts\";", "focus": ["\"", "/"], "note_zh": "相对路径" },
    { "topic": "control", "text": "try { parse(raw); } catch (error) {", "focus": ["{}", "()"], "note_zh": "异常捕获" },
    { "topic": "control", "text": "value > 0 && value < 100 ? \"ok\" : \"bad\";", "focus": ["&&", "?:"], "note_zh": "三元判断" }
  ],
  "builtin_api_cards": [
    { "topic": "array", "api": "Array.map", "text": "const ids = items.map((item) => item.id);", "note_zh": "数组映射" },
    { "topic": "array", "api": "Array.filter", "text": "const active = users.filter((user) => user.active);", "note_zh": "数组过滤" },
    { "topic": "object", "api": "Object.keys", "text": "const keys = Object.keys(config);", "note_zh": "取对象键" },
    { "topic": "json", "api": "JSON.parse", "text": "const data = JSON.parse(raw);", "note_zh": "解析 JSON" },
    { "topic": "promise", "api": "Promise.all", "text": "const results = await Promise.all(tasks);", "note_zh": "并发等待" },
    { "topic": "dom", "api": "document.querySelector", "text": "const button = document.querySelector(\".submit\");", "note_zh": "选择元素" },
    { "topic": "bom", "api": "localStorage.getItem", "text": "const token = localStorage.getItem(\"token\");", "note_zh": "读本地存储" }
  ]
}
```

以上是格式范例与起步内容;执行者须按下述清单**补全 TypeScript 种子**(每张卡都给真实可运行的规范代码):

- `symbols_numbers_templates` 补到 ≥ 13 条(上面已给 13 条,可直接用)
- `symbols_numbers_static` 补到 ≥ 20 条,literal/string/control 各 ≥ 6
- `builtin_api_cards` 补到 ≥ 80 张、≥ 40 个不同 API,按域:`array`(map/filter/reduce/find/some/every/flat/includes/slice/sort/join/from)、`string`(split/replace/trim/startsWith/endsWith/includes/padStart/slice/toLowerCase)、`object`(keys/values/entries/assign/freeze)、`number_math`(parseInt/parseFloat/Number.isInteger/Math.max/Math.min/Math.round/Math.floor/Math.random)、`json`(parse/stringify)、`promise`(all/race/resolve/then/catch/finally)、`map_set`(Map.get/Map.set/Map.has/Set.add/Set.has)、`dom`(querySelector/querySelectorAll/addEventListener/createElement/classList.add)、`bom_web`(fetch/setTimeout/setInterval/localStorage.setItem/localStorage.getItem/encodeURIComponent)、`node`(join/readFileSync/writeFileSync/existsSync),每域 ≥ 8 张(一个 API 可出 1-2 张不同语境的卡)

- [ ] **Step 2: 写语料 schema 测试**

```typescript
// tests/programmingBasicsContent.test.ts
import { describe, expect, test } from "bun:test";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
  type ProgrammingBasicsKind,
} from "../src/content/programmingBasics";

const SYMBOL_TOPICS = new Set(["declaration", "call", "control", "index", "literal", "string"]);
const KINDS: ProgrammingBasicsKind[] = ["symbols_numbers", "builtin_api"];

describe("programming basics corpus", () => {
  const languages = listProgrammingBasicsLanguages();

  test("index lists at least one language", () => {
    expect(languages.length).toBeGreaterThanOrEqual(1);
  });

  for (const language of languages) {
    for (const kind of KINDS) {
      test(`${language}/${kind} cards are valid`, () => {
        const cards = loadProgrammingBasicsCards(kind, language);
        expect(cards.length).toBeGreaterThanOrEqual(80);
        const seen = new Set<string>();
        const topicCounts = new Map<string, number>();
        for (const card of cards) {
          expect(card.text.length).toBeGreaterThan(0);
          expect(card.text.length).toBeLessThanOrEqual(90);
          expect(card.text).not.toInclude("\n");
          expect(card.text).toMatch(/^[\x20-\x7e]+$/);
          expect(card.source_id.length).toBeGreaterThan(0);
          expect(seen.has(card.text)).toBe(false);
          seen.add(card.text);
          if (kind === "symbols_numbers") {
            expect(SYMBOL_TOPICS.has(card.topic)).toBe(true);
          } else {
            expect(card.topic).toMatch(/^[a-z][a-z0-9_]*$/);
            expect(card.api ?? "").not.toBe("");
          }
          topicCounts.set(card.topic, (topicCounts.get(card.topic) ?? 0) + 1);
        }
        for (const [topic, count] of topicCounts) {
          expect(count, `${language}/${kind}/${topic}`).toBeGreaterThanOrEqual(8);
        }
        if (kind === "builtin_api") {
          const apis = new Set(cards.map((card) => card.api));
          expect(apis.size).toBeGreaterThanOrEqual(40);
        }
      });
    }
  }
});
```

- [ ] **Step 3: 运行确认失败**

Run: `bun test tests/programmingBasicsContent.test.ts`
Expected: FAIL(index.json 不存在)

- [ ] **Step 4: 实现生成脚本 `src/tools/buildProgrammingBasicsContent.ts`**

参照 `src/tools/buildEverydayWordsContent.ts` 的结构模式(CLI 参数解析、校验、写文件、统计输出、`if (import.meta.main)` 入口)。核心逻辑:

```typescript
// src/tools/buildProgrammingBasicsContent.ts(核心逻辑,完整文件需含 CLI 入口)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

interface IdentifierSet {
  collection: string;
  element: string;
  field: string;
  value: string;
}

interface CardTemplate {
  topic: string;
  template: string;
  focus: string[];
  note_zh: string;
}

interface StaticCard {
  topic: string;
  text: string;
  focus?: string[];
  api?: string;
  note_zh: string;
}

interface Seed {
  language: string;
  source_id: string;
  identifier_sets: IdentifierSet[];
  symbols_numbers_templates: CardTemplate[];
  symbols_numbers_static: StaticCard[];
  builtin_api_cards: StaticCard[];
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function expandTemplate(template: string, ids: IdentifierSet): string {
  return template
    .replaceAll("{collection}", ids.collection)
    .replaceAll("{element}", ids.element)
    .replaceAll("{Element}", capitalize(ids.element))
    .replaceAll("{field}", ids.field)
    .replaceAll("{value}", ids.value);
}

function validateCardText(text: string, seedPath: string): void {
  if (text.length === 0 || text.length > 90) {
    throw new Error(`card text length out of range in ${seedPath}: ${text}`);
  }
  if (text.includes("\n") || !/^[\x20-\x7e]+$/.test(text)) {
    throw new Error(`card text must be single-line ascii in ${seedPath}: ${text}`);
  }
}

export function buildLanguageCorpus(seed: Seed, seedPath: string): {
  symbolsNumbers: object[];
  builtinApi: object[];
} {
  const symbolsNumbers: object[] = [];
  const seenSymbols = new Set<string>();
  for (const template of seed.symbols_numbers_templates) {
    for (const ids of seed.identifier_sets) {
      const text = expandTemplate(template.template, ids);
      if (seenSymbols.has(text)) continue;
      validateCardText(text, seedPath);
      seenSymbols.add(text);
      symbolsNumbers.push({
        text,
        topic: template.topic,
        focus: template.focus,
        note_zh: template.note_zh,
        source_id: seed.source_id,
      });
    }
  }
  for (const card of seed.symbols_numbers_static) {
    if (seenSymbols.has(card.text)) continue;
    validateCardText(card.text, seedPath);
    seenSymbols.add(card.text);
    symbolsNumbers.push({ ...card, source_id: seed.source_id });
  }

  const builtinApi: object[] = [];
  const seenApi = new Set<string>();
  for (const card of seed.builtin_api_cards) {
    if (seenApi.has(card.text)) continue;
    validateCardText(card.text, seedPath);
    if (!card.api) throw new Error(`builtin_api card missing api in ${seedPath}: ${card.text}`);
    seenApi.add(card.text);
    builtinApi.push({ ...card, source_id: seed.source_id });
  }
  return { symbolsNumbers, builtinApi };
}
```

main 流程:遍历 `contents/programming_basics/seeds/*.json` → 每个种子 `buildLanguageCorpus` → 写 `contents/programming_basics/symbols_numbers/<lang>.jsonl` 与 `builtin_api/<lang>.jsonl`(每行一个 JSON)→ 重写 `contents/programming_basics/index.json`(schema、schema_version: 1、languages 按字母序)→ 打印每语言张数统计。同时在脚本内做最低数量断言(symbols ≥ 80、api ≥ 80、api 种数 ≥ 40、各 topic ≥ 8),不达标直接 throw,让数量问题在生成期暴露而不是测试期。

- [ ] **Step 5: 在 package.json 注册脚本**

`"content:build-programming-basics": "bun src/tools/buildProgrammingBasicsContent.ts"`

- [ ] **Step 6: 运行生成 + 测试**

Run: `bun run content:build-programming-basics && bun test tests/programmingBasicsContent.test.ts tests/programmingBasics.test.ts`
Expected: 生成统计打印 typescript 两类各 ≥80;测试 PASS

- [ ] **Step 7: 追加 source_catalog 条目**

在 `contents/source_catalog.json` 数组追加:

```json
{
  "source_id": "keyloop:programming-basics:seeds",
  "repo": "keyloop",
  "repo_url": "https://github.com/keyloop/keyloop",
  "license_spdx": "MIT",
  "retrieved_at": "2026-06-11",
  "languages": ["typescript", "javascript", "python", "go", "java", "rust", "csharp", "cpp", "c", "php", "ruby", "kotlin", "swift"],
  "frameworks": [],
  "notes": "Hand-curated programming basics seed cards (symbols-in-context and builtin API drills), expanded by buildProgrammingBasicsContent.ts."
}
```

执行时先看现有条目的实际字段名,保持一致;`repo_url` 按本仓库真实地址填。每语言种子的 `source_id` 统一指向 `keyloop:programming-basics:seeds`(把种子里 source_id 改为这个值,Task 2 Step 1 的范例同步修正)。

Run: `bun run smoke:sources`
Expected: 退出码 0

- [ ] **Step 8: 提交**

```bash
git add src/tools/buildProgrammingBasicsContent.ts contents/programming_basics tests/programmingBasicsContent.test.ts contents/source_catalog.json package.json
git commit -m "feat: programming basics content pipeline with typescript corpus"
```

---

### Task 3: JavaScript 种子

**Files:**
- Create: `contents/programming_basics/seeds/javascript.json`

- [ ] **Step 1: 写 JavaScript 种子**

格式与 Task 2 的 TypeScript 种子完全一致,差异点:

- 模板去掉类型注解(`let selectedItem = null;` 而非 `: string | null`)
- `declaration` 增加 `var`/解构/箭头函数赋值形式:`const getUser = (id) => users.find((user) => user.id === id);`
- `builtin_api_cards` 域与 TypeScript 相同(array/string/object/number_math/json/promise/map_set/dom/bom_web/node),但卡片代码全部无类型注解;数量要求相同(≥80 张、≥40 API、每域 ≥8)
- identifier_sets 可复制 TypeScript 的(命名惯例相同)

- [ ] **Step 2: 生成 + 测试**

Run: `bun run content:build-programming-basics && bun test tests/programmingBasicsContent.test.ts`
Expected: PASS,languages 含 javascript

- [ ] **Step 3: 提交**

```bash
git add contents/programming_basics
git commit -m "feat: javascript programming basics corpus"
```

---

### Task 4: Python 与 Go 种子

**Files:**
- Create: `contents/programming_basics/seeds/python.json`
- Create: `contents/programming_basics/seeds/go.json`

- [ ] **Step 1: 写 Python 种子**

标识符用 snake_case(`selected_item`、`user_names`)。模板示例(按此风格补全到与 TS 同量):

```json
{ "topic": "declaration", "template": "{collection} = []", "focus": ["="], "note_zh": "列表声明" }
{ "topic": "declaration", "template": "def get_{element}({element}_id: int):", "focus": ["()", ":"], "note_zh": "函数定义" }
{ "topic": "declaration", "template": "class {Element}Service:", "focus": [":"], "note_zh": "类定义" }
{ "topic": "call", "template": "[{element}.{field} for {element} in {collection}]", "focus": ["[]", "."], "note_zh": "列表推导" }
{ "topic": "control", "template": "if {element}.{field} is not None:", "focus": [":"], "note_zh": "判空" }
{ "topic": "control", "template": "for {element} in {collection}:", "focus": [":"], "note_zh": "for 循环" }
{ "topic": "index", "template": "first = {collection}[0]", "focus": ["[]"], "note_zh": "取首元素" }
```

static 含 f-string(`name = f"{user}_{index}"`)、路径、十六进制、端口。`builtin_api_cards` 域:`builtins`(len/range/enumerate/zip/sorted/isinstance/print/sum/min/max)、`str`(split/join/strip/replace/startswith/lower/format)、`list_dict`(append/extend/pop/get/items/keys/values/setdefault)、`os_path`(os.path.join/os.getenv/pathlib.Path/Path.exists)、`json`(loads/dumps)、`re`(match/search/findall/sub)、`collections`(defaultdict/Counter/namedtuple/deque)、`file`(open/read/write/with)。每域 ≥8、共 ≥80 张 ≥40 API。

- [ ] **Step 2: 写 Go 种子**

标识符用 camelCase 短名。模板示例:

```json
{ "topic": "declaration", "template": "{collection} := make([]{Element}, 0)", "focus": [":=", "[]"], "note_zh": "切片声明" }
{ "topic": "declaration", "template": "func Get{Element}(id int) (*{Element}, error) {", "focus": ["()", "*", "{"], "note_zh": "函数声明" }
{ "topic": "declaration", "template": "type {Element} struct {", "focus": ["{"], "note_zh": "结构体定义" }
{ "topic": "control", "template": "if err != nil {", "focus": ["!=", "{"], "note_zh": "错误检查" }
{ "topic": "control", "template": "for _, {element} := range {collection} {", "focus": [":=", "{"], "note_zh": "range 循环" }
```

`builtin_api_cards` 域:`builtins`(make/append/len/cap/copy/delete/new)、`fmt`(Println/Printf/Sprintf/Errorf)、`strings`(Split/Join/Contains/TrimSpace/Replace/HasPrefix)、`strconv`(Atoi/Itoa/ParseFloat/FormatInt)、`time`(Now/Since/Sleep/Parse/Format)、`errors`(New/Is/As/Unwrap/wrapped %w)、`slices_maps`(slices.Contains/slices.Sort/maps.Keys)、`os_io`(os.Open/os.ReadFile/os.Getenv/io.Copy)。数量要求同上。

- [ ] **Step 3: 生成 + 测试 + 提交**

Run: `bun run content:build-programming-basics && bun test tests/programmingBasicsContent.test.ts`
Expected: PASS

```bash
git add contents/programming_basics
git commit -m "feat: python and go programming basics corpora"
```

---

### Task 5: Java、C#、Kotlin 种子

**Files:**
- Create: `contents/programming_basics/seeds/java.json`、`csharp.json`、`kotlin.json`

- [ ] **Step 1: 写三门语言种子**

同一格式,语言要点(每门均须满足全局数量要求):

- **Java**:声明 `List<Item> items = new ArrayList<>();`、`public Item getItem(long id) {`;API 域 `string`(substring/contains/format/strip)、`list_map`(add/get/put/containsKey/getOrDefault)、`stream`(stream().map/filter/collect/Collectors.toList/anyMatch)、`optional`(of/ofNullable/orElse/map/isPresent)、`objects_util`(Objects.equals/requireNonNull/Collections.sort/List.of/Map.of)、`math_number`(Integer.parseInt/Long.valueOf/Math.max)
- **C#**:声明 `var items = new List<Item>();`、`public Item GetItem(long id) {`;API 域 `string`(Split/Join/Contains/Trim/Format)、`collections`(Add/TryGetValue/ContainsKey/Count)、`linq`(Select/Where/FirstOrDefault/Any/OrderBy/ToList)、`task`(Task.WhenAll/await/Task.Run/Task.Delay)、`convert_math`(int.Parse/Convert.ToInt32/Math.Max)、`json`(JsonSerializer.Serialize/Deserialize)
- **Kotlin**:声明 `val items = mutableListOf<Item>()`、`fun getItem(id: Long): Item? {`;API 域 `collections`(map/filter/firstOrNull/any/groupBy/associateBy/sortedBy)、`string`(split/trim/replace/startsWith/uppercase)、`scope`(let/apply/also/run/takeIf)、`null_safety`(?./?:/!!/requireNotNull)、`builtins`(listOf/mapOf/setOf/buildList/lazy)、`text_number`(toInt/toIntOrNull/toString/format)

- [ ] **Step 2: 生成 + 测试 + 提交**

Run: `bun run content:build-programming-basics && bun test tests/programmingBasicsContent.test.ts`
Expected: PASS

```bash
git add contents/programming_basics
git commit -m "feat: java, csharp, kotlin programming basics corpora"
```

---

### Task 6: Rust、C、C++ 种子

**Files:**
- Create: `contents/programming_basics/seeds/rust.json`、`c.json`、`cpp.json`

- [ ] **Step 1: 写三门语言种子**

- **Rust**:标识符 snake_case;声明 `let mut items: Vec<Item> = Vec::new();`、`fn get_item(id: u64) -> Option<Item> {`、`struct Item {`;control 含 `match`、`if let Some(item) = found {`;API 域 `vec`(push/iter/collect/len/contains/sort/retain)、`iterator`(map/filter/find/any/fold/enumerate/zip)、`option_result`(unwrap_or/ok_or/map/and_then/is_some/?)、`string`(to_string/push_str/split/trim/replace/parse)、`std_misc`(println!/format!/HashMap::new/insert/get/std::fs::read_to_string)
- **C**:声明 `int counts[16] = {0};`、`static int get_count(const char *name) {`、`struct node {`;control 含指针判空 `if (node == NULL) {`;API 域 `stdio`(printf/fprintf/snprintf/scanf/fopen/fclose/fgets)、`stdlib`(malloc/calloc/free/atoi/strtol/qsort/exit)、`string_h`(strlen/strcpy/strncpy/strcmp/strcat/strstr/memset/memcpy)、`math_h`(abs/pow/sqrt/ceil/floor)
- **C++**:声明 `std::vector<Item> items;`、`auto getItem(int id) -> std::optional<Item> {`、`class ItemService {`;API 域 `vector`(push_back/emplace_back/size/at/clear/reserve)、`string`(substr/find/append/empty/c_str/std::to_string)、`algorithm`(std::sort/std::find/std::count_if/std::transform/std::max_element)、`map_set`(insert/find/count/contains/operator[])、`iostream_misc`(std::cout/std::cerr/std::getline/std::make_unique/std::move)

- [ ] **Step 2: 生成 + 测试 + 提交**

Run: `bun run content:build-programming-basics && bun test tests/programmingBasicsContent.test.ts`
Expected: PASS

```bash
git add contents/programming_basics
git commit -m "feat: rust, c, cpp programming basics corpora"
```

---

### Task 7: PHP、Ruby、Swift 种子

**Files:**
- Create: `contents/programming_basics/seeds/php.json`、`ruby.json`、`swift.json`

- [ ] **Step 1: 写三门语言种子**

- **PHP**:标识符带 `$` 前缀;声明 `$items = [];`、`function getItem(int $id): ?Item {`、`class ItemService {`;API 域 `array`(array_map/array_filter/array_merge/array_keys/in_array/count/usort)、`string`(str_replace/strpos/substr/trim/explode/implode/sprintf)、`json`(json_encode/json_decode)、`preg`(preg_match/preg_replace/preg_split)、`misc`(isset/empty/array_key_exists/intval/htmlspecialchars)
- **Ruby**:标识符 snake_case;声明 `items = []`、`def get_item(id)`、`class ItemService`;control 用 `end` 风格(`if item.nil?`);API 域 `array`(map/select/reject/find/each/reduce/include?/sort_by/first)、`hash`(fetch/dig/key?/each_pair/transform_values)、`string`(split/strip/gsub/start_with?/upcase/to_sym)、`enumerable`(group_by/min_by/max_by/sum/tally/zip)、`misc`(puts/require/raise/File.read/JSON.parse)
- **Swift**:声明 `var items: [Item] = []`、`func getItem(id: Int) -> Item? {`、`struct Item {`;control 含 `guard let item = found else {`;API 域 `array`(map/filter/first/compactMap/reduce/contains/sorted/append)、`string`(split/hasPrefix/lowercased/trimmingCharacters/replacingOccurrences)、`optional`(?? / if let / guard let / optional chaining)、`dictionary`(updateValue/removeValue/keys/values/default)、`misc`(print/String(describing:)/JSONDecoder().decode/URL(string:))

- [ ] **Step 2: 生成 + 测试 + 提交**

Run: `bun run content:build-programming-basics && bun test tests/programmingBasicsContent.test.ts`
Expected: PASS(13 门语言全部就位)

```bash
git add contents/programming_basics
git commit -m "feat: php, ruby, swift programming basics corpora"
```

---

### Task 8: 词库重建(常用词 / 长词 / 命名派生)

**Files:**
- Create: `src/tools/buildProgrammingWordsContent.ts`
- Modify: `contents/programming_words.json`(整体替换)
- Modify: `contents/long_words.json`(整体替换)

- [ ] **Step 1: 实现词频统计工具**

```typescript
// src/tools/buildProgrammingWordsContent.ts(核心逻辑;完整文件含 CLI 入口与输出)
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "have", "not", "are",
  "was", "you", "all", "can", "will", "one", "two", "new", "use", "get", "set",
]);

function* walkJsonl(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkJsonl(full);
    else if (entry.endsWith(".jsonl")) yield full;
  }
}

export function countIdentifierWords(snippetsRoot: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of walkJsonl(snippetsRoot)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.trim().length === 0) continue;
      const text = String((JSON.parse(line) as { text?: unknown }).text ?? "");
      for (const identifier of text.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []) {
        const parts = identifier
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .split(/[_\s]+/);
        for (const part of parts) {
          const word = part.toLowerCase();
          if (word.length < 3 || word.length > 14) continue;
          if (!/^[a-z]+$/.test(word)) continue;
          if (STOP_WORDS.has(word)) continue;
          counts.set(word, (counts.get(word) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}
```

main:对 `contents/code/snippets` 统计 → 频次降序取前 600 → 打印预览;`--output contents/programming_words.json --limit 400` 写出前 400(JSON 字符串数组,字母序)。注册 `"content:build-programming-words"` 脚本。

- [ ] **Step 2: 生成并人工筛选**

Run: `bun run content:build-programming-words`

执行者审查输出文件:删除明显的非词(如 truncated 词根、专名缩写),保持 ≥ 300 词。这是"真实语料词频 + 人工筛选"的落实。

- [ ] **Step 3: 重建 long_words.json**

整体替换为 50–60 个精选技术长词,保持 `LongWordEntry` 结构(word/parts/aliases?/domain/tier/source_id/note_zh,见 `src/training/vocabulary.ts:3-11`)。规则:≥ 11 字符、真实高频技术词、parts 为有意义拆分、domain 全部 `"programming"`、`source_id: "keyloop:long-words:curated-v2"`、tier 按词频 1–3。起步条目(按此风格补全):

```json
[
  { "word": "internationalization", "parts": ["international", "ization"], "aliases": ["i18n"], "domain": "programming", "tier": 3, "source_id": "keyloop:long-words:curated-v2", "note_zh": "国际化" },
  { "word": "authentication", "parts": ["authentic", "ation"], "aliases": ["auth"], "domain": "programming", "tier": 1, "source_id": "keyloop:long-words:curated-v2", "note_zh": "认证" },
  { "word": "authorization", "parts": ["authorize", "ation"], "domain": "programming", "tier": 1, "source_id": "keyloop:long-words:curated-v2", "note_zh": "授权" },
  { "word": "configuration", "parts": ["configure", "ation"], "aliases": ["config"], "domain": "programming", "tier": 1, "source_id": "keyloop:long-words:curated-v2", "note_zh": "配置" },
  { "word": "initialization", "parts": ["initialize", "ation"], "aliases": ["init"], "domain": "programming", "tier": 1, "source_id": "keyloop:long-words:curated-v2", "note_zh": "初始化" },
  { "word": "serialization", "parts": ["serialize", "ation"], "domain": "programming", "tier": 2, "source_id": "keyloop:long-words:curated-v2", "note_zh": "序列化" },
  { "word": "implementation", "parts": ["implement", "ation"], "aliases": ["impl"], "domain": "programming", "tier": 1, "source_id": "keyloop:long-words:curated-v2", "note_zh": "实现" },
  { "word": "compatibility", "parts": ["compatible", "ity"], "domain": "programming", "tier": 2, "source_id": "keyloop:long-words:curated-v2", "note_zh": "兼容性" },
  { "word": "synchronization", "parts": ["synchronize", "ation"], "aliases": ["sync"], "domain": "programming", "tier": 2, "source_id": "keyloop:long-words:curated-v2", "note_zh": "同步" },
  { "word": "representation", "parts": ["represent", "ation"], "aliases": ["repr"], "domain": "programming", "tier": 2, "source_id": "keyloop:long-words:curated-v2", "note_zh": "表示" }
]
```

注意:`technical_long_words` 走 `buildLongWordBreakdownPracticeTarget`(`appModel.ts:837-848`,domain "programming"),只消费 `library.long_words`,逻辑不改,换数据即可。

- [ ] **Step 4: 运行受影响测试**

Run: `bun test tests/targets.test.ts tests/vocabulary.test.ts 2>/dev/null; bun test tests`
Expected: 涉及旧词表具体词面的用例可能失败——记录失败清单,凡断言旧词面/旧词数的用例,更新断言为结构性检查(非空、来自新词库);此处只修词库数据导致的失败,不动编程基础组别逻辑(那是 Task 11/12 的事)

- [ ] **Step 5: 提交**

```bash
git add src/tools/buildProgrammingWordsContent.ts contents/programming_words.json contents/long_words.json package.json tests
git commit -m "feat: rebuild programming words and long words corpora"
```

---

### Task 9: 语言解析与两类组卷逻辑

**Files:**
- Create: `src/training/programmingBasicsTargets.ts`
- Test: `tests/programmingBasics.test.ts`(追加)

- [ ] **Step 1: 写失败测试(追加到 tests/programmingBasics.test.ts)**

```typescript
import {
  resolveProgrammingBasicsLanguage,
  buildSymbolsNumbersTarget,
  buildBuiltinApiTarget,
} from "../src/training/programmingBasicsTargets";

describe("programming basics language resolution", () => {
  const available = ["typescript", "python", "go"];

  test("uses selected language when corpus exists", () => {
    const language = resolveProgrammingBasicsLanguage(
      { languages: ["python"] },
      available,
      () => 0,
    );
    expect(language).toBe("python");
  });

  test("rotates among multiple selected languages", () => {
    expect(
      resolveProgrammingBasicsLanguage({ languages: ["python", "go"] }, available, () => 0),
    ).toBe("python");
    expect(
      resolveProgrammingBasicsLanguage({ languages: ["python", "go"] }, available, () => 0.9),
    ).toBe("go");
  });

  test("falls back to all languages when none selected", () => {
    expect(resolveProgrammingBasicsLanguage({ languages: [] }, available, () => 0)).toBe(
      "typescript",
    );
  });

  test("falls back to all languages when selection has no corpus", () => {
    expect(
      resolveProgrammingBasicsLanguage({ languages: ["solidity"] }, available, () => 0),
    ).toBe("typescript");
  });
});

describe("symbols numbers target", () => {
  test("builds single-language code-mode target from cards", () => {
    const contentRoot = makeFixtureRootWithManyCards(); // fixture:typescript 12 张卡,覆盖 2 个 topic
    const target = buildSymbolsNumbersTarget(
      { records: [], plan: emptyPlan(), library: minimalLibrary(), codeConfig: { languages: ["typescript"] }, random: () => 0 },
      { contentRoot },
    );
    expect(target.mode).toBe("code");
    expect(target.source).toBe("keyloop:module:programming-basics:symbols-numbers:typescript");
    const lines = target.text.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(new Set(lines).size).toBe(lines.length);
    expect(target.code_blocks?.[0]?.language).toBe("typescript");
  });

  test("avoids lines used in recent records", () => {
    const contentRoot = makeFixtureRootWithManyCards();
    const context = { records: [], plan: emptyPlan(), library: minimalLibrary(), codeConfig: { languages: ["typescript"] }, random: () => 0 };
    const first = buildSymbolsNumbersTarget(context, { contentRoot });
    const records = [recordWithTargetText(first.text, "symbols_numbers")];
    const second = buildSymbolsNumbersTarget({ ...context, records }, { contentRoot });
    const firstLines = new Set(first.text.split("\n"));
    const overlap = second.text.split("\n").filter((line) => firstLines.has(line));
    expect(overlap.length).toBeLessThan(second.text.split("\n").length);
  });
});
```

fixture 辅助(`makeFixtureRootWithManyCards`/`emptyPlan`/`minimalLibrary`/`recordWithTargetText`)写在本测试文件内:fixture 卡片 ≥ 24 张、2 个 topic;`emptyPlan()` 返回 `focus_words: []`、`focus_symbols: []` 等空计划(完整字段对照 `PracticePlan` 类型,见 `src/domain/model.ts:309` 附近);`minimalLibrary()` 用 `loadContentLibrary` 太重,构造最小对象并 `as ContentLibrary`;`recordWithTargetText(text, category)` 返回带 `target_text`、`module: "programming_basics"`、`category` 的最小 `SessionRecord`(完整字段对照现有 `tests/targets.test.ts` 中 SessionRecord 构造方式,直接复制其工厂函数)。`buildBuiltinApiTarget` 的测试同样写一组(source 为 `keyloop:module:programming-basics:builtin-api:<语言>`,断言 api 卡 topic 均衡:取出的卡覆盖 ≥ 2 个 topic)。

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/programmingBasics.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

```typescript
// src/training/programmingBasicsTargets.ts
import type { CodePracticeConfig, PracticeTarget, SessionRecord } from "../domain/model";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
  type ProgrammingBasicsCard,
  type ProgrammingBasicsKind,
  type ProgrammingBasicsOptions,
} from "../content/programmingBasics";
import type { BuildTargetContext } from "./targets";

const CARDS_PER_LESSON_MIN = 8;
const CARDS_PER_LESSON_MAX = 10;
const RECENT_RECORDS_FOR_DEDUP = 10;

export function resolveProgrammingBasicsLanguage(
  codeConfig: Pick<CodePracticeConfig, "languages"> | undefined,
  available: string[],
  random: () => number,
): string {
  if (available.length === 0) {
    throw new Error("programming basics corpus is missing");
  }
  const selected = (codeConfig?.languages ?? []).filter((language) =>
    available.includes(language),
  );
  const pool = selected.length > 0 ? selected : available;
  return pool[Math.floor(random() * pool.length)] ?? pool[0]!;
}

function recentBasicsLines(records: SessionRecord[]): Set<string> {
  const lines = new Set<string>();
  const basics = records
    .filter((record) => record.module === "programming_basics")
    .slice(-RECENT_RECORDS_FOR_DEDUP);
  for (const record of basics) {
    for (const line of record.target_text.split("\n")) {
      if (line.trim().length > 0) lines.add(line);
    }
  }
  return lines;
}

function pickBalancedCards(
  cards: ProgrammingBasicsCard[],
  used: Set<string>,
  random: () => number,
): ProgrammingBasicsCard[] {
  const buckets = new Map<string, ProgrammingBasicsCard[]>();
  for (const card of cards) {
    const bucket = buckets.get(card.topic) ?? [];
    bucket.push(card);
    buckets.set(card.topic, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort(() => random() - 0.5);
    // 未用过的排前面;同一桶内保持随机序
    bucket.sort((a, b) => Number(used.has(a.text)) - Number(used.has(b.text)));
  }
  const topics = [...buckets.keys()].sort(() => random() - 0.5);
  const picked: ProgrammingBasicsCard[] = [];
  const seen = new Set<string>();
  let round = 0;
  while (picked.length < CARDS_PER_LESSON_MAX && round < 32) {
    let advanced = false;
    for (const topic of topics) {
      if (picked.length >= CARDS_PER_LESSON_MAX) break;
      const card = buckets.get(topic)?.[round];
      if (card === undefined || seen.has(card.text)) continue;
      seen.add(card.text);
      picked.push(card);
      advanced = true;
    }
    if (!advanced) break;
    round += 1;
  }
  return picked.slice(0, Math.max(CARDS_PER_LESSON_MIN, Math.min(picked.length, CARDS_PER_LESSON_MAX)));
}

function basicsTarget(
  kind: ProgrammingBasicsKind,
  sourceSlug: string,
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
): PracticeTarget {
  const random = context.random ?? Math.random;
  const available = listProgrammingBasicsLanguages(options);
  const language = resolveProgrammingBasicsLanguage(context.codeConfig, available, random);
  const cards = loadProgrammingBasicsCards(kind, language, options);
  const picked = pickBalancedCards(cards, recentBasicsLines(context.records), random);
  const text = picked.map((card) => card.text).join("\n");
  return {
    mode: "code",
    text,
    source: `keyloop:module:programming-basics:${sourceSlug}:${language}`,
    code_blocks: [
      {
        start_line: 0,
        line_count: picked.length,
        language,
        framework: "",
        project: "keyloop-programming-basics",
        source: `keyloop:programming-basics:${language}`,
      },
    ],
  };
}

export function buildSymbolsNumbersTarget(
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
): PracticeTarget {
  return basicsTarget("symbols_numbers", "symbols-numbers", context, options);
}

export function buildBuiltinApiTarget(
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
): PracticeTarget {
  return basicsTarget("builtin_api", "builtin-api", context, options);
}
```

实现时核实两点并按实际调整:(1) `code_blocks.start_line` 的基准——`grep -n "start_line" src/training/targets.ts src/ui` 看 `codeBlocksFromSnippets` 用 0 还是 1 基,保持一致;(2) `SessionRecord` 的字段名(`module`/`target_text`)以 `src/domain/model.ts` 实际定义为准。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/programmingBasics.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/training/programmingBasicsTargets.ts tests/programmingBasics.test.ts
git commit -m "feat: programming basics language resolution and card lesson builders"
```

---

### Task 10: 基础综合(mix)拼卷

**Files:**
- Modify: `src/training/programmingBasicsTargets.ts`
- Test: `tests/programmingBasics.test.ts`(追加)

- [ ] **Step 1: 写失败测试**

```typescript
describe("programming basics mix target", () => {
  test("combines cards, naming and words with single language", () => {
    const contentRoot = makeFixtureRootWithManyCards();
    const target = buildNewProgrammingBasicsMixTarget(
      { records: [], plan: emptyPlan(), library: mixLibrary(), codeConfig: { languages: ["typescript"] }, random: () => 0 },
      { contentRoot },
    );
    expect(target.mode).toBe("code");
    expect(target.source).toBe("keyloop:module:programming-basics-mix:typescript");
    const lines = target.text.split("\n").filter((line) => line.trim().length > 0);
    // 2-3 符号卡 + 2-3 API 卡 + 1-2 命名行 + 1-2 词汇行
    expect(lines.length).toBeGreaterThanOrEqual(6);
    expect(lines.length).toBeLessThanOrEqual(10);
  });
});
```

`mixLibrary()` 在 `minimalLibrary()` 基础上给 `programming_words` 一组真实词(["filter", "select", "update", "remove", "create", "config", "request", "response"])。

- [ ] **Step 2: 运行确认失败**

Run: `bun test tests/programmingBasics.test.ts`
Expected: FAIL(函数不存在)

- [ ] **Step 3: 实现(追加到 programmingBasicsTargets.ts)**

```typescript
import { chunkWords, recentFeedbackTerms } from "./targets"; // 若未导出则在 targets.ts 补 export

function namingLinesFromWords(words: string[], random: () => number, count: number): string[] {
  const pool = [...words].sort(() => random() - 0.5);
  const lines: string[] = [];
  for (const word of pool.slice(0, count)) {
    const pascal = word.charAt(0).toUpperCase() + word.slice(1);
    lines.push(`${word} get${pascal} ${pascal}Config ${word.toUpperCase()}_LIMIT`);
  }
  return lines;
}

export function buildNewProgrammingBasicsMixTarget(
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
): PracticeTarget {
  const random = context.random ?? Math.random;
  const available = listProgrammingBasicsLanguages(options);
  const language = resolveProgrammingBasicsLanguage(context.codeConfig, available, random);
  const used = recentBasicsLines(context.records);

  const symbolCards = pickBalancedCards(
    loadProgrammingBasicsCards("symbols_numbers", language, options), used, random,
  ).slice(0, 3);
  const apiCards = pickBalancedCards(
    loadProgrammingBasicsCards("builtin_api", language, options), used, random,
  ).slice(0, 3);

  const lines: string[] = [];
  const feedback = recentFeedbackTerms(context.records);
  if (feedback.length > 0) lines.push(chunkWords(feedback.slice(0, 8), 4).join("\n"));
  lines.push(...symbolCards.map((card) => card.text));
  lines.push(...apiCards.map((card) => card.text));
  lines.push(...namingLinesFromWords(context.library.programming_words, random, 2));
  const words = [...context.library.programming_words].sort(() => random() - 0.5).slice(0, 8);
  if (words.length > 0) lines.push(chunkWords(words, 4).join("\n"));

  const cardCount = symbolCards.length + apiCards.length;
  return {
    mode: "code",
    text: lines.join("\n"),
    source: `keyloop:module:programming-basics-mix:${language}`,
    code_blocks: [
      {
        start_line: 0,
        line_count: cardCount,
        language,
        framework: "",
        project: "keyloop-programming-basics",
        source: `keyloop:programming-basics:${language}`,
      },
    ],
  };
}
```

命名为 `buildNewProgrammingBasicsMixTarget` 是为了在 Task 12 删除 targets.ts 旧同名函数前不冲突;Task 12 删除旧函数后,把它重命名为 `buildProgrammingBasicsMixTarget` 并同步更新 appModel 引用。`recentFeedbackTerms`/`chunkWords` 若是 targets.ts 私有函数,补 `export`。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/programmingBasics.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/training/programmingBasicsTargets.ts src/training/targets.ts tests/programmingBasics.test.ts
git commit -m "feat: programming basics mix lesson assembled from new corpora"
```

---

### Task 11: 模型、CLI、菜单、appModel 接线

**Files:**
- Modify: `src/domain/model.ts`(TrainingCategory 类型 + trainingCategories 数组)
- Modify: `src/cli.ts:1002-1031`
- Modify: `src/ui/opentui/menuItems.ts:219-231` 与 programming hint
- Modify: `src/ui/opentui/appModel.ts:869-900`
- Modify: `tests/opentuiApp.test.ts`、`tests/storage.test.ts` 等受影响测试

- [ ] **Step 1: 更新失败测试(菜单)**

`tests/opentuiApp.test.ts` 中 programming 菜单激活测试(行 345-362 附近)改为新 6 项断言:子菜单依次为 `symbols_numbers`、`programming_terms`、`naming_styles`、`technical_long_words`、`builtin_api`、`programming_basics_mix`,且不含 `operators_brackets_quotes`。新增两条激活用例(选中 `symbols_numbers`/`builtin_api` 后进入 running 且 `module === "programming_basics"`),写法复制现有 `programming_terms` 激活用例的结构。

Run: `bun test tests/opentuiApp.test.ts`
Expected: FAIL

- [ ] **Step 2: model.ts 变更**

- `TrainingCategory`(行 48 附近):删除 `"operators_brackets_quotes"`,加入 `"symbols_numbers"` 和 `"builtin_api"`
- `trainingCategories` 数组(行 356 附近):同样替换
- 检查行 458 附近 `literalIfPresent(object.category, ...)` 的 fallback 仍是合法值(`"programming_terms"` 仍合法,无需改)

- [ ] **Step 3: cli.ts 映射变更(行 1002-1031)**

```typescript
case "symbols_numbers":
  return {
    kind: "code_block",
    module: "programming_basics",
    category: "symbols_numbers",
  };
// programming_terms / naming_styles / technical_long_words 三个 case 不动
case "builtin_api":
  return {
    kind: "code_block",
    module: "programming_basics",
    category: "builtin_api",
  };
case "programming_basics_mix":
  return {
    kind: "code_block",
    module: "programming_basics",
    category: "programming_basics_mix",
  };
```

删除 `case "operators_brackets_quotes"` 分支。

- [ ] **Step 4: menuItems.ts 菜单与提示**

```typescript
case "programming":
  return [
    item("symbols_numbers", "符号与数字", "Symbols and numbers", language),
    item("programming_terms", "编程常用词", "Programming terms", language),
    item("naming_styles", "命名形式", "Naming styles", language),
    item("technical_long_words", "技术长词", "Technical long words", language),
    item("builtin_api", "内置 API", "Built-in APIs", language),
    item("programming_basics_mix", "编程基础综合", "Programming basics mix", language),
  ];
```

programming 的 hint 文本(menuItems.ts:450 附近与 517 附近)更新为:中文 `"按当前语言练符号数字语境、编程词汇、命名和内置 API。"`,英文对应翻译;具体哪几处要改,先 `grep -n "编程词" src/ui/opentui/menuItems.ts` 全部更新。

- [ ] **Step 5: appModel.ts 接线(行 869-900)**

```typescript
case "symbols_numbers":
  return runningState(
    state.language,
    itemId,
    buildSymbolsNumbersTarget(effectiveContext),
    undefined,
    stateOptions(state),
  );
case "builtin_api":
  return runningState(
    state.language,
    itemId,
    buildBuiltinApiTarget(effectiveContext),
    undefined,
    stateOptions(state),
  );
case "programming_terms":  // 保持现状
case "naming_styles":      // 保持现状
case "programming_basics_mix":
  return runningState(
    state.language,
    itemId,
    buildNewProgrammingBasicsMixTarget(effectiveContext),
    undefined,
    stateOptions(state),
  );
```

import 改为从 `../../training/programmingBasicsTargets` 引入三个新函数;删除 `operators_brackets_quotes` case 与旧 `buildProgrammingBasicsMixTarget` import。`effectiveContext` 需含 `codeConfig`:检查该 case 所在函数中 `effectiveContext` 的构造(`grep -n "effectiveContext" src/ui/opentui/appModel.ts`),若 programming 分支未注入 `codeConfig: openTuiCodeConfig(state)`,补上(code 分支已有现成写法可参照)。

- [ ] **Step 6: 修复受影响测试**

Run: `bun test tests`
Expected: 多个文件失败。逐一处理:

- `tests/storage.test.ts:270` category 白名单断言:替换 `operators_brackets_quotes` 为 `symbols_numbers`、补 `builtin_api`
- `tests/targets.test.ts` 行 842-862 的 operators 用例:删除(新逻辑已在 tests/programmingBasics.test.ts 覆盖);`buildProgrammingBasicsPracticeTarget("programming_terms")`/mix 相关用例改调新函数或保留(programming_terms 路径未变)
- `tests/opentuiRenderer.test.ts`、`tests/opentuiStartRunner.test.ts`、`tests/liveSession.test.ts`、`tests/cli.test.ts`、`tests/stats.test.ts`、`tests/model.test.ts` 中使用 `category: "operators_brackets_quotes"` 的构造数据改为 `"symbols_numbers"`;mix 渲染断言若依赖旧文本结构(symbols 模式),按新 code 模式输出更新

Expected(修完): PASS

- [ ] **Step 7: 提交**

```bash
git add src tests
git commit -m "feat: wire new programming basics groups into menu, cli and app model"
```

---

### Task 12: 删除旧代码与旧语料

**Files:**
- Modify: `src/training/targets.ts`、`src/content/library.ts`
- Delete: `contents/symbols.json`、`contents/number_drills.json`、`contents/naming.json`、`contents/language_symbols.json`

- [ ] **Step 1: 删除 targets.ts 旧路径**

删除以下函数与其私有依赖(删除前逐一 `grep -rn "<函数名>" src/ tests/` 确认无存活引用;有引用先迁移):

- `programmingOperatorsTarget`(行 1443-1454 附近)
- `buildLessonSymbols`(行 1941-1948)
- `buildLessonNaming`(行 1950-1958)——`naming_styles` 仍用它!改造而非删除:去掉 `fillFrom(lines, library.naming, 5, random)`,改为用 `namingLinesFromWords(library.programming_words, random, 5 - lines.length)` 补足(从 programmingBasicsTargets.ts 导出该函数)
- `languageSymbolItems`(行 1037 附近)
- 旧 `buildProgrammingBasicsMixTarget`(行 394-419)与 `ProgrammingBasicsPracticeTargetKind` 中的 `"operators_brackets_quotes"`、`"mix"` 分支(`buildProgrammingBasicsPracticeTarget` 收缩为 `programming_terms`/`naming_styles` 两个 case,或整体由 appModel 直呼具体函数后删除——以改完后 `grep` 无引用为准)
- 删除后把 `buildNewProgrammingBasicsMixTarget` 重命名为 `buildProgrammingBasicsMixTarget`(更新 appModel 与测试中的引用)

- [ ] **Step 2: library.ts 与语料文件**

- `ContentLibrary` 接口删除 `symbols`、`number_drills`、`naming`、`language_symbols` 四个字段,`loadContentLibrary` 删除对应四行加载
- `git rm contents/symbols.json contents/number_drills.json contents/naming.json contents/language_symbols.json`
- `grep -rn "language_symbols\|number_drills\|\"symbols\.json\"\|naming\.json" src/ tests/` 确认零引用;`LanguageSymbolSet` 类型若无人用一并删

- [ ] **Step 3: typecheck + 全量测试**

Run: `bun run typecheck && bun test tests`
Expected: PASS(编译错误暴露的残留引用逐一清掉;测试里引用被删字段的 fixture 同步删字段)

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: remove legacy programming basics paths and corpora"
```

---

### Task 13: 全量回归与真机验证

- [ ] **Step 1: 全量验证**

Run: `bun run typecheck && bun test tests && bun run build && bun run smoke`
Expected: 全部通过、退出码 0

- [ ] **Step 2: TUI 真机冒烟**

用临时 HOME 启动 TUI,人工(或驱动脚本)依次进入编程基础 6 个组别确认能开始练习且文本符合预期:

Run: `KEYLOOP_HOME=$(mktemp -d) bun src/main.ts`

检查点:菜单 6 项文案正确;`符号与数字`/`内置 API` 出卡为单行代码且与实战语言设置联动(在代码实战筛选里选 python 后回来,出卡应为 python);`基础综合` 含代码卡与词行;退出无报错。

- [ ] **Step 3: 更新 ROADMAP 文档**

`docs/ROADMAP.md` 中编程基础的组别描述(行 27-28、69、155 附近)更新为新 6 项;`docs/ROADMAP.en.md` 同步。

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "docs: update roadmap for programming basics redesign"
```

---

## Self-Review 记录

- **Spec 覆盖**:6 项菜单(Task 11)、卡片语料与 13 门语言(Task 2-7)、内置 API 三层定义与域规划(Task 2-7 的 API 域清单)、词库重建(Task 8)、语言规则三条(Task 9 测试逐条覆盖)、mix 新拼卷(Task 10)、全删重写(Task 12)、测试策略六条(分布于各任务 + Task 13)、Non-goals 未越界 ✓
- **占位符扫描**:无 TBD;两处"执行时核实"(start_line 基准、effectiveContext 的 codeConfig 注入)均给出了精确的 grep 指令与决策规则 ✓
- **类型一致性**:`ProgrammingBasicsCard`/`ProgrammingBasicsKind`/`ProgrammingBasicsOptions` 贯穿 Task 1/2/9/10;`buildNewProgrammingBasicsMixTarget` 的临时命名与 Task 12 的重命名步骤呼应;`resolveProgrammingBasicsLanguage(codeConfig, available, random)` 签名在 Task 9 测试与实现一致 ✓
