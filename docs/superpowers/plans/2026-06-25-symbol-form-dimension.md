# 符号专项「形式维度」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐任务实现。步骤用 checkbox(`- [ ]`)跟踪。

**Goal:** 给 value 裸值卡标 `format`，符号专项选材保证覆盖多种真实形式（专项固定 6 种 / 综合按时长伸缩），与阶段三字符靶向叠加。绝不改写卡内容。

**Architecture:** 编译时 `inferValueFormat(text,note_zh)` 半自动推断 format 写入卡 → `pickFormCoveredValueCards` 按 format round-robin + 弱键加权选 value → `basicsTarget` 拆 value 路/非 value 路合并 → 综合训练 `symbolsStageTarget` 按 `char_budget` 算 value 配额。复用阶段二/三的 `weakKeyWeights`/`weightedSampleWithoutReplacement`/`pickWeakKeyTargetedCards`。

**Tech Stack:** TypeScript, bun test, TDD。

**设计依据:** `docs/superpowers/specs/2026-06-25-symbol-form-dimension-design.md`（用户已批准）。

---

## Task 1: `inferValueFormat` —— 从 text+note_zh 推断 format

**Files:** Modify `src/tools/buildProgrammingBasicsContent.ts`、Test `tests/programmingBasicsContent.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { inferValueFormat } from "../src/tools/buildProgrammingBasicsContent";

describe("inferValueFormat", () => {
  test("text 强模式优先识别", () => {
    expect(inferValueFormat("10.0.0.1", "IP 地址")).toBe("ip");
    expect(inferValueFormat("2026-12-31", "日期串")).toBe("date");
    expect(inferValueFormat("2026-06-22T23:59:59Z", "ISO 时间戳")).toBe("datetime");
    expect(inferValueFormat("08:30:00", "时间串")).toBe("time");
    expect(inferValueFormat("3.2.1", "语义化版本")).toBe("version");
    expect(inferValueFormat("dev@example.org", "邮箱")).toBe("email");
    expect(inferValueFormat("https://api.example.com/v2", "接口地址")).toBe("url");
    expect(inferValueFormat("#0ea5e9", "十六进制颜色")).toBe("color");
    expect(inferValueFormat("/^[a-z]+$/", "正则字面量")).toBe("regex");
    expect(inferValueFormat("99.9%", "百分比")).toBe("percent");
    expect(inferValueFormat("$1,299.00", "金额")).toBe("money");
  });

  test("纯数字/歧义靠 note_zh 关键词兜底", () => {
    expect(inferValueFormat("3000", "端口号")).toBe("port");
    expect(inferValueFormat("404", "HTTP 状态")).toBe("http_status");
    expect(inferValueFormat("GET", "HTTP 方法字面量")).toBe("http_method");
    expect(inferValueFormat("application/xml", "MIME 类型")).toBe("mime");
    expect(inferValueFormat("60_000", "毫秒超时")).toBe("number");
  });

  test("都不中归 other", () => {
    expect(inferValueFormat("pending", "状态字面量")).toBe("other");
    expect(inferValueFormat("text-sm", "CSS 类名")).toBe("other");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/programmingBasicsContent.test.ts -t "inferValueFormat"`
Expected: FAIL（not exported）

- [ ] **Step 3: 实现**（buildProgrammingBasicsContent.ts，`bareValueText` 附近）

```typescript
export type ValueFormat =
  | "date" | "time" | "datetime" | "ip" | "port" | "version" | "money"
  | "percent" | "email" | "url" | "path" | "mime" | "color" | "regex"
  | "http_method" | "http_status" | "number" | "other";

/**
 * 推断 value 裸值卡的「形式」：text 强模式优先 → note_zh 中文关键词兜底 → other。
 * 形式覆盖对精度不敏感，个别误判可接受（绝不因此改写卡内容）。
 */
export function inferValueFormat(text: string, noteZh: string): ValueFormat {
  // text 强模式（顺序敏感：datetime 在 date 前、mime 在 path 前）
  if (/^https?:\/\//u.test(text)) return "url";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(text)) return "email";
  if (/^#[0-9a-fA-F]{3,8}$/u.test(text) || /^rgba?\(/u.test(text)) return "color";
  if (/^\/.+\/[gimsuy]*$/u.test(text)) return "regex";
  if (/^\d{1,3}(\.\d{1,3}){3}$/u.test(text)) return "ip";
  if (/^\d{4}-\d{2}-\d{2}T/u.test(text)) return "datetime";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return "date";
  if (/^\d{1,2}:\d{2}(:\d{2})?$/u.test(text)) return "time";
  if (/^[~^]?v?\d+\.\d+\.\d+/u.test(text)) return "version";
  if (/%$/u.test(text)) return "percent";
  if (/^[$€£¥]/u.test(text)) return "money";
  if (/^(application|text|image|audio|video|multipart)\/[\w.+-]+$/u.test(text)) return "mime";
  // note_zh 中文关键词兜底（纯数字/歧义）
  if (noteZh.includes("端口")) return "port";
  if (noteZh.includes("金额") || noteZh.includes("价格")) return "money";
  if (noteZh.includes("状态")) return "http_status";
  if (noteZh.includes("方法")) return "http_method";
  if (noteZh.includes("MIME")) return "mime";
  if (noteZh.includes("超时") || noteZh.includes("毫秒") || noteZh.includes("计数") || noteZh.includes("数量"))
    return "number";
  if (noteZh.includes("百分")) return "percent";
  if (noteZh.includes("颜色")) return "color";
  if (noteZh.includes("版本")) return "version";
  // 光秃数字兜底
  if (/^\d[\d_]*$/u.test(text)) return "number";
  // 路径（含 / 但非上面任何）
  if (/^\.{0,2}\/.*\//u.test(text)) return "path";
  return "other";
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/programmingBasicsContent.test.ts -t "inferValueFormat"`
Expected: PASS（3 tests）。若个别 case 推断顺序错，调整正则顺序（不改测试）。

- [ ] **Step 5: typecheck + commit**

Run: `bun run typecheck`
```bash
git add src/tools/buildProgrammingBasicsContent.ts tests/programmingBasicsContent.test.ts
git commit -m "feat(content): inferValueFormat 半自动推断 value 卡形式(形式维度1)"
```

---

## Task 2: 卡结构加 format + 编译写入 + 重新生成

**Files:** Modify `src/tools/buildProgrammingBasicsContent.ts`、`src/content/programmingBasics.ts`、Test `tests/programmingBasics.test.ts`

- [ ] **Step 1: 写失败测试**（loader 透传 format）

`tests/programmingBasics.test.ts` 的 `makeFixtureRoot` 卡已有 `topic/focus`，给它加 `format` 字段并断言 loader 读出：

```typescript
test("loads value card format field", () => {
  const root = mkdtempSync(join(tmpdir(), "keyloop-fmt-"));
  const base = join(root, "programming_basics");
  mkdirSync(join(base, "symbols_numbers"), { recursive: true });
  mkdirSync(join(base, "builtin_api"), { recursive: true });
  writeFileSync(join(base, "index.json"), JSON.stringify({
    schema: "keyloop.programming_basics", schema_version: 1, languages: ["typescript"],
  }));
  writeFileSync(join(base, "symbols_numbers", "typescript.jsonl"),
    JSON.stringify({ text: "10.0.0.1", topic: "string", form: "value", format: "ip", note_zh: "ip", source_id: "s" }) + "\n");
  writeFileSync(join(base, "builtin_api", "typescript.jsonl"),
    JSON.stringify({ text: "x.y()", topic: "array", api: "A.b", note_zh: "", source_id: "s" }) + "\n");
  const cards = loadProgrammingBasicsCards("symbols_numbers", "typescript", fixtureOptions(root));
  expect(cards[0]?.format).toBe("ip");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/programmingBasics.test.ts -t "format field"`
Expected: FAIL（`ProgrammingBasicsCard` 无 `format`，类型报错或 undefined）

- [ ] **Step 3: 实现**

`content/programmingBasics.ts` 的 `ProgrammingBasicsCard`（line 12）加字段：
```typescript
  format?: string;
```
（loader `JSON.parse` 自动透传，无需改解析逻辑。）

`buildProgrammingBasicsContent.ts` 的 `OutputCard`（line 44）加字段：
```typescript
  format?: string;
```
`buildLanguageCorpus` value 编译（line 156-163）写入 format：
```typescript
    push({
      text: valueText,
      topic: card.topic,
      form: "value",
      format: inferValueFormat(valueText, card.note_zh),
      ...(card.focus !== undefined ? { focus: card.focus } : {}),
      note_zh: card.note_zh,
      source_id: seed.source_id,
    });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/programmingBasics.test.ts -t "format field"`
Expected: PASS

- [ ] **Step 5: `assertCorpusQuality` 加 other 占比软校验**（buildProgrammingBasicsContent.ts:225）

在 `assertCorpusQuality` 末尾加（不抛错，只 `console.warn`）：
```typescript
  const values = symbolsNumbers.filter((c) => c.form === "value");
  const others = values.filter((c) => c.format === "other" || c.format === undefined);
  if (values.length > 0 && others.length / values.length > 0.4) {
    console.warn(
      `[${language}] value 卡 format=other 占比 ${Math.round((others.length / values.length) * 100)}% 偏高，可补推断规则或 note`,
    );
  }
```

- [ ] **Step 6: 重新编译 17 语言**

Run: `bun run src/tools/buildProgrammingBasicsContent.ts`（或 package.json 里对应脚本——先 `grep build.*programming package.json` 确认命令）
Expected: 重生成 `contents/programming_basics/symbols_numbers/*.jsonl`，每张 value 卡含 `format`；观察 other 占比 warn。

- [ ] **Step 7: 抽查 + commit**

Run: `grep '"form":"value"' contents/programming_basics/symbols_numbers/typescript.jsonl | head -5`（确认有 format 字段）
```bash
git add src/tools/buildProgrammingBasicsContent.ts src/content/programmingBasics.ts tests/programmingBasics.test.ts contents/programming_basics/
git commit -m "feat(content): value卡编译写入format+重生成17语言(形式维度2)"
```

---

## Task 3: `pickFormCoveredValueCards` —— format round-robin + 弱键加权

**Files:** Modify `src/training/programmingBasicsTargets.ts`、Test `tests/programmingBasicsTargets.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { pickFormCoveredValueCards } from "../src/training/programmingBasicsTargets";

describe("pickFormCoveredValueCards", () => {
  const cards: ProgrammingBasicsCard[] = [
    { text: "10.0.0.1", topic: "x", form: "value", format: "ip", source_id: "s" },
    { text: "10.0.0.2", topic: "x", form: "value", format: "ip", source_id: "s" },
    { text: "2026-12-31", topic: "x", form: "value", format: "date", source_id: "s" },
    { text: "2026-01-01", topic: "x", form: "value", format: "date", source_id: "s" },
    { text: "$9.99", topic: "x", form: "value", format: "money", source_id: "s" },
    { text: "3.2.1", topic: "x", form: "value", format: "version", source_id: "s" },
  ];

  test("round-robin 覆盖尽量多形式：取4张≈4种不同format", () => {
    const picked = pickFormCoveredValueCards(cards, new Map(), 4, () => 0.42);
    const formats = new Set(picked.map((c) => c.format));
    expect(picked).toHaveLength(4);
    expect(formats.size).toBe(4); // ip/date/money/version 各一，不会同format连取
  });

  test("count 超可用形式时每形式可取多张、不重复卡", () => {
    const picked = pickFormCoveredValueCards(cards, new Map(), 6, () => 0.42);
    expect(picked).toHaveLength(6);
    expect(new Set(picked.map((c) => c.text)).size).toBe(6);
  });

  test("弱键加权：组内偏重含弱键的卡", () => {
    // 两张 ip，10.0.0.1 不含弱键、1.1.1.1 假设... 用 money 组区分更清晰
    const two: ProgrammingBasicsCard[] = [
      { text: "$1=2", topic: "x", form: "value", format: "money", source_id: "s" }, // 含弱键 =
      { text: "$9.99", topic: "x", form: "value", format: "money", source_id: "s" },
    ];
    const weights = new Map([["=", 0.9]]);
    let hits = 0;
    for (let i = 0; i < 60; i += 1) {
      const lcgRand = lcg(i + 1);
      if (pickFormCoveredValueCards(two, weights, 1, lcgRand)[0]?.text === "$1=2") hits += 1;
    }
    expect(hits).toBeGreaterThan(30); // 偏重含 = 的卡（>50%）
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/programmingBasicsTargets.test.ts -t "pickFormCoveredValueCards"`
Expected: FAIL（not exported）

- [ ] **Step 3: 实现**（programmingBasicsTargets.ts，`pickWeakKeyTargetedCards` 附近）

```typescript
/**
 * value 卡形式覆盖选材：按 format 分组，round-robin 跨形式逐张取（组内用弱键加权抽样），
 * 保证选出的卡尽量覆盖不同形式。count 超形式种数时各组继续取下一张、不重复。绝不改写卡。
 */
export function pickFormCoveredValueCards(
  valueCards: ProgrammingBasicsCard[],
  weakWeights: ReadonlyMap<string, number>,
  count: number,
  random: () => number,
): ProgrammingBasicsCard[] {
  const groups = new Map<string, ProgrammingBasicsCard[]>();
  for (const card of valueCards) {
    const key = card.format ?? "other";
    const bucket = groups.get(key) ?? [];
    bucket.push(card);
    groups.set(key, bucket);
  }
  // 组内按弱键加权排好序（无放回抽样得到顺序），每组当作一个队列
  const queues = [...groups.values()].map((bucket) =>
    weightedSampleWithoutReplacement(
      bucket,
      (card) => 1 + wordKeyWeight(card.text, weakWeights),
      bucket.length,
      random,
    ),
  );
  const picked: ProgrammingBasicsCard[] = [];
  let round = 0;
  while (picked.length < count) {
    let advanced = false;
    for (const queue of queues) {
      if (picked.length >= count) break;
      const card = queue[round];
      if (card === undefined) continue;
      picked.push(card);
      advanced = true;
    }
    if (!advanced) break; // 所有组耗尽
    round += 1;
  }
  return picked;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/programmingBasicsTargets.test.ts -t "pickFormCoveredValueCards"`
Expected: PASS（3 tests）

- [ ] **Step 5: typecheck + commit**

Run: `bun run typecheck`
```bash
git add src/training/programmingBasicsTargets.ts tests/programmingBasicsTargets.test.ts
git commit -m "feat(training): pickFormCoveredValueCards 形式覆盖选材(形式维度3)"
```

---

## Task 4: `buildSymbolsNumbersTarget` 加 valueCount + `basicsTarget` 两路合并（专项默认 6）

**Files:** Modify `src/training/programmingBasicsTargets.ts`、Test `tests/programmingBasics.test.ts`

- [ ] **Step 1: 写失败测试**（用 Task 2 验证过的 fixture，含多 format value 卡）

新建 fixture：value 卡覆盖多 format + 若干 statement，断言专项默认产出多形式 value：

```typescript
function makeFixtureRootWithFormats(): string {
  const root = mkdtempSync(join(tmpdir(), "keyloop-fmts-"));
  const base = join(root, "programming_basics");
  mkdirSync(join(base, "symbols_numbers"), { recursive: true });
  mkdirSync(join(base, "builtin_api"), { recursive: true });
  writeFileSync(join(base, "index.json"), JSON.stringify({
    schema: "keyloop.programming_basics", schema_version: 1, languages: ["typescript"],
  }));
  const cards: string[] = [];
  const fmts = ["ip", "date", "money", "version", "time", "url", "email", "port"];
  for (const f of fmts) for (let i = 0; i < 3; i += 1)
    cards.push(JSON.stringify({ text: `${f}${i}val`, topic: "x", form: "value", format: f, note_zh: "", source_id: "s" }));
  for (let i = 0; i < 20; i += 1)
    cards.push(JSON.stringify({ text: `const v${i} = run(${i});`, topic: "x", form: "statement", note_zh: "", source_id: "s" }));
  writeFileSync(join(base, "symbols_numbers", "typescript.jsonl"), cards.join("\n") + "\n");
  writeFileSync(join(base, "builtin_api", "typescript.jsonl"),
    JSON.stringify({ text: "x.y()", topic: "array", api: "A.b", note_zh: "", source_id: "s" }) + "\n");
  return root;
}

describe("symbols 专项形式覆盖（默认6）", () => {
  test("专项产出含 6 种不同形式的 value 行", () => {
    const target = buildSymbolsNumbersTarget(
      basicsContext([], ["typescript"], lcg(1)),
      fixtureOptions(makeFixtureRootWithFormats()),
    );
    // value 卡 text 是 `${format}${i}val`，统计前缀种类
    const formats = new Set<string>();
    for (const m of target.text.matchAll(/\b(ip|date|money|version|time|url|email|port)\d/gu)) formats.add(m[1]!);
    expect(formats.size).toBeGreaterThanOrEqual(6); // 至少 6 种形式
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/programmingBasics.test.ts -t "形式覆盖（默认6）"`
Expected: FAIL（现状混选，formats.size < 6）

- [ ] **Step 3: 实现**

`programmingBasicsTargets.ts` 顶部加常量：
```typescript
const DEFAULT_SYMBOL_VALUE_COUNT = 6;
```
`buildSymbolsNumbersTarget` 签名加可选 `valueCount`，透传给 `basicsTarget`：
```typescript
export function buildSymbolsNumbersTarget(
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
  valueCount?: number,
): PracticeTarget {
  return basicsTarget("symbols_numbers", "symbols-numbers", context, options, valueCount);
}
```
`basicsTarget` 签名加 `valueCount?: number`；把 symbols_numbers 选卡块改为 value 路 + 非 value 路合并：
```typescript
  const picked = ((): ProgrammingBasicsCard[] => {
    if (kind === "symbols_numbers") {
      const weak = symbolWeakKeyWeights(context.records ?? []);
      const valueCards = cards.filter((c) => c.form === "value");
      const restCards = cards.filter((c) => c.form !== "value");
      const nv = valueCount ?? DEFAULT_SYMBOL_VALUE_COUNT;
      const pickedValue = pickFormCoveredValueCards(valueCards, weak, nv, random);
      const pickedRest = pickWeakKeyTargetedCards(
        restCards,
        weak,
        Math.max(0, CARDS_PER_LESSON_MAX - pickedValue.length),
        random,
      );
      return [...pickedValue, ...pickedRest];
    }
    return pickBalancedCards(cards, random);
  })();
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/programmingBasics.test.ts -t "形式覆盖（默认6）"`
Expected: PASS

- [ ] **Step 5: 回归 + typecheck + commit**

Run: `bun test tests/programmingBasics.test.ts tests/programmingBasicsTargets.test.ts`（整文件绿，含阶段三测试）
Run: `bun run typecheck`
```bash
git add src/training/programmingBasicsTargets.ts tests/programmingBasics.test.ts
git commit -m "feat(training): 符号选材拆value路/非value路合并(专项默认6形式覆盖)(形式维度4)"
```

---

## Task 5: 综合训练按 char_budget 算 valueCount + fit 保 value 行

**Files:** Modify `src/training/targets.ts`、Test `tests/programmingBasics.test.ts` 或 `tests/stageTargets.test.ts`

- [ ] **Step 1: 写失败测试**（综合训练 value 数随 char_budget 伸缩）

在 `tests/programmingBasics.test.ts` 加（复用 makeFixtureRootWithFormats）。`symbolsStageTarget` 是私有，经 `buildStageTarget(context, {stage:{form:"symbols",char_budget}})` 入口测：

```typescript
import { buildStageTarget } from "../src/training/targets";

describe("综合训练符号阶段 value 随时长伸缩", () => {
  function stageCtx(root: string, random: () => number): BuildTargetContext {
    return { ...basicsContext([], ["typescript"], random),
      // stageModuleEnabled 需要的 plan/库字段按现有 stageContext 风格补
    } as BuildTargetContext;
  }
  const opts = (budget: number) => ({
    stage: { form: "symbols", char_budget: budget },
    profile: { dimensions: [], form_speeds: [], focus: { words: [], code: [], chars: [] }, daily_active_minutes_7d: 0, generated_at: "" },
    modules: ["programming_basics"],
  }) as never;

  test("大预算比小预算覆盖更多形式", () => {
    const root = makeFixtureRootWithFormats();
    const countFormats = (budget: number): number => {
      const t = buildStageTarget({ ...stageCtx(root, lcg(7)), }, opts(budget));
      const s = new Set<string>();
      for (const m of t.text.matchAll(/\b(ip|date|money|version|time|url|email|port)\d/gu)) s.add(m[1]!);
      return s.size;
    };
    expect(countFormats(600)).toBeGreaterThan(countFormats(150));
  });
});
```

> 注：`buildStageTarget` 入口的 options/context 字段以现有 `tests/stageTargets.test.ts` 的 `stageContext`/`stageOptions` 为准（实现时先读对齐，避免字段缺失）。若 fixture 注入符号卡池路径困难，改为直接测 `symbolsStageTarget` 导出版或抽出 `symbolValueCountForBudget(budget)` 纯函数单测。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/programmingBasics.test.ts -t "value 随时长伸缩"`
Expected: FAIL（现状 buildSymbolsNumbersTarget 不传 valueCount，固定 6，大小预算形式数相同）

- [ ] **Step 3: 实现**（targets.ts）

加常量 + 换算函数：
```typescript
const SYMBOL_VALUE_RATIO = 0.45; // 裸值占符号专项时长比例（裸值与代码语句大致各半、裸值略多）
const SYMBOL_VALUE_AVG_LEN = 14; // value 卡平均字符（IP/日期/金额量级）

/** 综合训练：按符号阶段 char_budget 算该练几张 value（覆盖几种形式），随时长伸缩，下限 2。 */
export function symbolValueCountForBudget(charBudget: number): number {
  return Math.max(2, Math.round((charBudget * SYMBOL_VALUE_RATIO) / SYMBOL_VALUE_AVG_LEN));
}
```
`symbolsStageTarget`（line 3362-3367）把固定调用改为传入算好的 valueCount：
```typescript
  if (stageModuleEnabled(options, "programming_basics")) {
    const valueCount = symbolValueCountForBudget(options.stage.char_budget);
    const target = buildSymbolsNumbersTarget(context, {}, valueCount);
    if (target.text.trim().length > 0) {
      return fitSymbolsTargetToBudget(context, target, options.stage.char_budget);
    }
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/programmingBasics.test.ts -t "value 随时长伸缩"`
Expected: PASS

- [ ] **Step 5: `fitSymbolsTargetToBudget` 裁剪优先保 value 行**

读 `fitSymbolsTargetToBudget`（targets.ts:3389）+ `trimTargetToCharBudget`。当前裁剪可能从尾部砍，value 行在最前（symbolsNumbersText 把 value 排最前）→ 实际裁的是尾部 statement，value 行天然受保护。**先写测试验证假设**：

```typescript
test("综合训练超预算裁剪后仍保留 value 裸值行", () => {
  const root = makeFixtureRootWithFormats();
  const t = buildStageTarget(stageCtx(root, lcg(3)), opts(120)); // 小预算 → 触发裁剪
  expect(/\b(ip|date|money|version)\d/u.test(t.text)).toBe(true); // value 行还在
});
```
若 PASS（value 排最前、裁尾部）→ 无需改 `fitSymbolsTargetToBudget`，仅留此回归测试。若 FAIL → 改 `trimTargetToCharBudget`/`fit` 从「非 value 行」优先裁。

- [ ] **Step 6: 全量回归 + typecheck + commit**

Run: `bun test`（对照 baseline，新增测试全过，5 fail/3 error 预存不变）
Run: `bun run typecheck`
```bash
git add src/training/targets.ts tests/programmingBasics.test.ts
git commit -m "feat(training): 综合训练符号阶段value按char_budget伸缩+裁剪保value行(形式维度5)"
```

---

## 验证清单（全部任务后）

- [ ] value 卡编译期推断出 format，17 语言重生成，other 占比合理（软校验无大量 warn）。
- [ ] 专项训练：每课覆盖 ~6 种不同形式的真实裸值。
- [ ] 综合训练：value 数随 char_budget 伸缩（时长长→多形式、短→少），裁剪不丢 value 行。
- [ ] 字符靶向（阶段三）叠加生效：组内仍偏重含弱键的卡；真实语境层不变。
- [ ] 绝不改写卡内容（只筛选/标注）。
- [ ] typecheck 通过；全量测试无新增失败。

## 已知风险

- **推断误判**：note_zh 自由文本 → 个别 format 错。缓解：other 兜底 + 软校验告警 + 形式覆盖对精度不敏感。
- **VALUE_RATIO/AVG_LEN 拍的常数**：0.45 / 14 是估值，实测符号专项体感偏裸值或偏代码时再调（集中常量，好调）。
- **小语言 value/format 稀少**：round-robin 取满可用即可，绝不伪造形式。
- **重新编译 diff 大**：format 是新增字段，17 个 jsonl 都变；review 时关注 format 值是否合理、text 未被改动。
