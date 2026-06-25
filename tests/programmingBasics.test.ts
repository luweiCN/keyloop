import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
  type ProgrammingBasicsOptions,
} from "../src/content/programmingBasics";
import {
  buildBuiltinApiTarget,
  buildProgrammingBasicsMixTarget,
  buildSymbolsNumbersTarget,
  resolveProgrammingBasicsLanguage,
} from "../src/training/programmingBasicsTargets";
import { defaultSessionRecord } from "../src/domain/model";
import type { ContentLibrary } from "../src/content/library";
import type {
  KeyEventRecord,
  PracticePlan,
  SessionRecord,
  TrainingCategory,
} from "../src/domain/model";
import type { BuildTargetContext } from "../src/training/targets";
import { menuItemDescription, submenuItems } from "../src/ui/opentui/menuItems";

function emptyPlan(): PracticePlan {
  return {
    focus_words: [],
    focus_symbols: [],
    focus_code: [],
    focus_keys: [],
    advice: [],
    recommended_mode: "words",
    has_recent_history: false,
  };
}

function basicsContext(
  records: SessionRecord[],
  languages: string[],
  random: () => number = () => 0,
): BuildTargetContext {
  return {
    records,
    plan: emptyPlan(),
    library: {} as ContentLibrary,
    codeConfig: { languages } as NonNullable<BuildTargetContext["codeConfig"]>,
    random,
  };
}

function keysAt(
  key: string,
  count: number,
  startMs: number,
  intervalMs: number,
  correct = true,
): KeyEventRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    at_ms: startMs + i * intervalMs,
    action: "insert" as const,
    position: i,
    expected: key,
    input: correct ? key : "?",
    correct,
  }));
}

/** 可重复随机源（LCG），每 trial 独立；预热避免小种子首个输出极小。 */
function lcg(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rand = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5; i += 1) rand();
  return rand;
}

/**
 * 弱键靶向 fixture：4 张含罕见符号键 @ # $ 的卡 + 26 张不含的普通卡，全部**同 topic**
 * （避免 pickBalancedCards 的 topic 均衡偏向独立 topic 的弱键卡，干扰靶向 vs 随机的对比）。
 */
function makeFixtureRootForWeakKeyTargeting(): string {
  const root = mkdtempSync(join(tmpdir(), "keyloop-basics-weak-"));
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
  const cards: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    cards.push(
      JSON.stringify({ text: `f${i}@g#h$k`, topic: "x", source_id: "keyloop:programming-basics:seeds" }),
    );
  }
  for (let i = 0; i < 26; i += 1) {
    cards.push(
      JSON.stringify({
        text: `let value${i} be alpha`,
        topic: "x",
        source_id: "keyloop:programming-basics:seeds",
      }),
    );
  }
  writeFileSync(join(base, "symbols_numbers", "typescript.jsonl"), cards.join("\n") + "\n");
  writeFileSync(
    join(base, "builtin_api", "typescript.jsonl"),
    JSON.stringify({
      text: "items.map(fn)",
      topic: "array",
      api: "Array.map",
      source_id: "keyloop:programming-basics:seeds",
    }) + "\n",
  );
  return root;
}

function makeFixtureRootWithManyCards(): string {
  const root = mkdtempSync(join(tmpdir(), "keyloop-basics-many-"));
  const base = join(root, "programming_basics");
  mkdirSync(join(base, "symbols_numbers"), { recursive: true });
  mkdirSync(join(base, "builtin_api"), { recursive: true });
  writeFileSync(
    join(base, "index.json"),
    JSON.stringify({
      schema: "keyloop.programming_basics",
      schema_version: 1,
      languages: ["typescript", "python"],
    }),
  );
  for (const language of ["typescript", "python"]) {
    const symbolCards = Array.from({ length: 24 }, (_, i) =>
      JSON.stringify({
        text: `const value${i} = compute${language}(${i});`,
        topic: i % 2 === 0 ? "declaration" : "call",
        note_zh: "测试卡",
        source_id: "keyloop:programming-basics:seeds",
      }),
    );
    writeFileSync(
      join(base, "symbols_numbers", `${language}.jsonl`),
      symbolCards.join("\n") + "\n",
    );
    const apiCards = Array.from({ length: 24 }, (_, i) =>
      JSON.stringify({
        text: `items.helper${i}((item) => item.field${i});`,
        topic: i % 2 === 0 ? "array" : "string",
        api: `Helper.fn${i}`,
        note_zh: "测试卡",
        source_id: "keyloop:programming-basics:seeds",
      }),
    );
    writeFileSync(join(base, "builtin_api", `${language}.jsonl`), apiCards.join("\n") + "\n");
  }
  return root;
}

function makeFixtureRootWithValueCards(): string {
  const root = mkdtempSync(join(tmpdir(), "keyloop-basics-val-"));
  const base = join(root, "programming_basics");
  mkdirSync(join(base, "symbols_numbers"), { recursive: true });
  mkdirSync(join(base, "builtin_api"), { recursive: true });
  writeFileSync(
    join(base, "index.json"),
    JSON.stringify({
      schema: "keyloop.programming_basics",
      schema_version: 2,
      languages: ["typescript"],
    }),
  );
  const cards: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    cards.push(
      JSON.stringify({
        text: `10.0.0.${i}`,
        topic: "string",
        form: "value",
        note_zh: "ip",
        source_id: "keyloop:programming-basics:seeds",
      }),
    );
    cards.push(
      JSON.stringify({
        text: `const value${i} = compute(${i});`,
        topic: "declaration",
        form: "statement",
        note_zh: "stmt",
        source_id: "keyloop:programming-basics:seeds",
      }),
    );
  }
  writeFileSync(join(base, "symbols_numbers", "typescript.jsonl"), cards.join("\n") + "\n");
  writeFileSync(
    join(base, "builtin_api", "typescript.jsonl"),
    JSON.stringify({
      text: "items.map((item) => item.id);",
      topic: "array",
      api: "Array.map",
      note_zh: "",
      source_id: "keyloop:programming-basics:seeds",
    }) + "\n",
  );
  return root;
}

function fixtureOptions(root: string): ProgrammingBasicsOptions {
  return { env: { KEYLOOP_TS_CONTENT_ROOT: root }, exists: () => true };
}

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
        source_id: "keyloop:programming-basics:seeds",
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
        source_id: "keyloop:programming-basics:seeds",
      }),
    ].join("\n") + "\n",
  );
  return root;
}

describe("programming basics content loader", () => {
  test("lists languages from index.json", () => {
    const root = makeFixtureRoot();
    expect(listProgrammingBasicsLanguages(fixtureOptions(root))).toEqual(["typescript"]);
  });

  test("loads symbols_numbers cards with fields", () => {
    const root = makeFixtureRoot();
    const cards = loadProgrammingBasicsCards(
      "symbols_numbers",
      "typescript",
      fixtureOptions(root),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.text).toBe("const items = [];");
    expect(cards[0]?.topic).toBe("declaration");
    expect(cards[0]?.focus).toEqual(["=", "[]", ";"]);
  });

  test("loads builtin_api cards with api field", () => {
    const root = makeFixtureRoot();
    const cards = loadProgrammingBasicsCards("builtin_api", "typescript", fixtureOptions(root));
    expect(cards[0]?.api).toBe("Array.map");
  });

  test("throws on missing language file", () => {
    const root = makeFixtureRoot();
    expect(() =>
      loadProgrammingBasicsCards("symbols_numbers", "python", fixtureOptions(root)),
    ).toThrow();
  });
});

describe("programming basics language resolution", () => {
  const available = ["typescript", "python", "go"];

  test("uses selected language when corpus exists", () => {
    expect(
      resolveProgrammingBasicsLanguage({ languages: ["python"] }, available, () => 0),
    ).toBe("python");
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
    expect(resolveProgrammingBasicsLanguage(undefined, available, () => 0)).toBe("typescript");
  });

  test("falls back to all languages when selection has no corpus", () => {
    expect(
      resolveProgrammingBasicsLanguage({ languages: ["solidity"] }, available, () => 0),
    ).toBe("typescript");
  });

  test("throws when no corpus languages exist", () => {
    expect(() => resolveProgrammingBasicsLanguage({ languages: [] }, [], () => 0)).toThrow();
  });
});

describe("symbols numbers target", () => {
  test("builds single-language code-mode target from cards", () => {
    const contentRoot = makeFixtureRootWithManyCards();
    const options = { env: { KEYLOOP_TS_CONTENT_ROOT: contentRoot }, exists: () => true };
    const target = buildSymbolsNumbersTarget(basicsContext([], ["typescript"]), options);
    expect(target.mode).toBe("code");
    expect(target.source).toBe("keyloop:module:programming-basics:symbols-numbers:typescript");
    const lines = target.text.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(new Set(lines).size).toBe(lines.length);
    expect(target.code_blocks?.[0]?.language).toBe("typescript");
    expect(target.code_blocks?.[0]?.line_count).toBe(lines.length);
  });

  test("covers multiple topics in one lesson", () => {
    const contentRoot = makeFixtureRootWithManyCards();
    const options = { env: { KEYLOOP_TS_CONTENT_ROOT: contentRoot }, exists: () => true };
    const target = buildSymbolsNumbersTarget(
      basicsContext([], ["typescript"], () => 0.4),
      options,
    );
    const declarationLines = target.text
      .split("\n")
      .filter((line) => line.includes("compute"));
    expect(declarationLines.length).toBe(target.text.split("\n").length);
  });

  test("symbols selection is purely random and unaffected by recent records", () => {
    const contentRoot = makeFixtureRootWithManyCards();
    const options = { env: { KEYLOOP_TS_CONTENT_ROOT: contentRoot }, exists: () => true };
    const fresh = buildSymbolsNumbersTarget(basicsContext([], ["typescript"], () => 0.42), options);
    const records = [
      defaultSessionRecord({
        module: "programming_basics",
        category: "symbols_numbers" as TrainingCategory,
        target_text: fresh.text,
      }),
    ];
    const withHistory = buildSymbolsNumbersTarget(
      basicsContext(records, ["typescript"], () => 0.42),
      options,
    );
    // 纯随机：相同 rng 下历史记录不改变选择（去掉"偏好/硬排除已练卡"，靠随机+大池降低重复，
    // 而非确定性轮转导致"今天三句明天又这三句、顺序还一样"）。
    expect(withHistory.text).toBe(fresh.text);
  });

  test("value 行排在高亮块之外（裸值不做语法高亮，问题3）", () => {
    const root = makeFixtureRootWithValueCards();
    const target = buildSymbolsNumbersTarget(basicsContext([], ["typescript"]), fixtureOptions(root));
    expect(target.code_blocks).toHaveLength(1);
    const block = target.code_blocks![0]!;
    const lines = target.text.split("\n");
    // 有 value 卡 → 高亮块从 value 之后开始，并覆盖到末尾
    expect(block.start_line).toBeGreaterThan(0);
    expect(block.start_line + block.line_count).toBe(lines.length);
    // 块外是裸值(IP)、块内是 statement(compute)
    const outside = lines.slice(0, block.start_line).join("\n");
    const inside = lines.slice(block.start_line, block.start_line + block.line_count).join("\n");
    expect(outside).toContain("10.0.0.");
    expect(inside).toContain("compute");
  });
});

describe("symbols numbers 弱键靶向（阶段3）", () => {
  // @ # $ 三个罕见符号键又慢又错 → 弱键；6 快字母键做基线把中位数分位拉到快键区
  function recordsWeakSymbols(): SessionRecord[] {
    const fast = ["a", "e", "t", "o", "i", "n"].flatMap((k, idx) =>
      keysAt(k, 6, idx * 20_000, 100),
    );
    const slow = ["@", "#", "$"].flatMap((k, idx) =>
      keysAt(k, 8, 200_000 + idx * 100_000, 600, false),
    );
    return [defaultSessionRecord({ key_events: [...fast, ...slow] })];
  }

  test("有弱符号键时，含该键的真实卡出现率显著升高", () => {
    const options = fixtureOptions(makeFixtureRootForWeakKeyTargeting());
    const trials = 40;
    const countWeakKeyHits = (records: SessionRecord[]): number => {
      let total = 0;
      for (let i = 0; i < trials; i += 1) {
        const target = buildSymbolsNumbersTarget(
          basicsContext(records, ["typescript"], lcg(i + 1)),
          options,
        );
        total += (target.text.match(/@/gu) ?? []).length; // 每张弱键卡含 1 个 @
      }
      return total;
    };
    const targeted = countWeakKeyHits(recordsWeakSymbols());
    const control = countWeakKeyHits([]); // 无弱键 → 回退纯随机
    expect(targeted).toBeGreaterThan(control + trials * 0.5);
  });

  test("无记录时回退均衡随机：组装正常、非空", () => {
    const target = buildSymbolsNumbersTarget(
      basicsContext([], ["typescript"], lcg(1)),
      fixtureOptions(makeFixtureRootForWeakKeyTargeting()),
    );
    expect(target.text.trim().length).toBeGreaterThan(0);
    expect(target.mode).toBe("code");
  });
});

describe("builtin api target", () => {
  test("builds api lesson with balanced topics", () => {
    const contentRoot = makeFixtureRootWithManyCards();
    const options = { env: { KEYLOOP_TS_CONTENT_ROOT: contentRoot }, exists: () => true };
    const target = buildBuiltinApiTarget(basicsContext([], ["python"]), options);
    expect(target.mode).toBe("code");
    expect(target.source).toBe("keyloop:module:programming-basics:builtin-api:python");
    const lines = target.text.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(target.code_blocks?.[0]?.language).toBe("python");
  });
});

describe("programming basics mix target", () => {
  test("combines cards, naming and words with single language", () => {
    const contentRoot = makeFixtureRootWithManyCards();
    const options = { env: { KEYLOOP_TS_CONTENT_ROOT: contentRoot }, exists: () => true };
    const context = basicsContext([], ["typescript"]);
    context.library = {
      programming_words: [
        "filter", "select", "update", "remove", "create", "config", "request", "response",
      ].map((word) => ({ word, note_zh: "" })),
    } as ContentLibrary;
    const target = buildProgrammingBasicsMixTarget(context, options);
    expect(target.mode).toBe("code");
    expect(target.source).toBe("keyloop:module:programming-basics-mix:typescript");
    const lines = target.text.split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(6);
    expect(lines.length).toBeLessThanOrEqual(10);
    const namingLines = lines.filter((line) => line.includes("_LIMIT"));
    expect(namingLines.length).toBe(2);
    const cardLines = lines.filter((line) => line.includes(";"));
    expect(cardLines.length).toBeGreaterThanOrEqual(4);
  });
});

describe("programming submenu", () => {
  test("lists exactly the six redesigned groups", () => {
    const items = submenuItems("programming", "zh");
    expect(items.map((entry) => entry.id)).toEqual([
      "symbols_numbers",
      "programming_terms",
      "naming_styles",
      "technical_long_words",
      "builtin_api",
      "programming_basics_mix",
    ]);
    expect(items[0]?.label).toBe("代码基础");
    expect(items[4]?.label).toBe("内置 API");
    expect(menuItemDescription({ id: "symbols_numbers" })).toBe(
      "练字面值、单行语句和小代码块里的符号、数字、标点与配对结构；API 调用在内置 API 中练。",
    );
    expect(menuItemDescription({ id: "programming_terms" })).toBe(
      "练 selected、pending、enabled 等高频编程词，显示人工维护的编程语境释义。",
    );
  });
});

/** 形式覆盖 fixture：24 张 value 卡覆盖 8 种 format（每种 3 张）+ 20 张 statement。 */
function makeFixtureRootWithFormats(): string {
  const root = mkdtempSync(join(tmpdir(), "keyloop-fmts-"));
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
  const cards: string[] = [];
  const fmts = ["ip", "date", "money", "version", "time", "url", "email", "port"];
  for (const f of fmts)
    for (let i = 0; i < 3; i += 1)
      cards.push(
        JSON.stringify({ text: `${f}${i}val`, topic: "x", form: "value", format: f, note_zh: "", source_id: "s" }),
      );
  for (let i = 0; i < 20; i += 1)
    cards.push(
      JSON.stringify({ text: `const v${i} = run(${i});`, topic: "x", form: "statement", note_zh: "", source_id: "s" }),
    );
  writeFileSync(join(base, "symbols_numbers", "typescript.jsonl"), cards.join("\n") + "\n");
  writeFileSync(
    join(base, "builtin_api", "typescript.jsonl"),
    JSON.stringify({ text: "x.y()", topic: "array", api: "A.b", note_zh: "", source_id: "s" }) + "\n",
  );
  return root;
}

describe("symbols 专项形式覆盖（默认 6）", () => {
  test("专项产出含 ≥6 种不同形式的 value 行", () => {
    const target = buildSymbolsNumbersTarget(
      basicsContext([], ["typescript"], lcg(1)),
      fixtureOptions(makeFixtureRootWithFormats()),
    );
    const formats = new Set<string>();
    for (const m of target.text.matchAll(/\b(ip|date|money|version|time|url|email|port)\d/gu))
      formats.add(m[1]!);
    expect(formats.size).toBeGreaterThanOrEqual(6);
  });
});
