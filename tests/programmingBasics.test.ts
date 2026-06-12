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
import type { PracticePlan, SessionRecord, TrainingCategory } from "../src/domain/model";
import type { BuildTargetContext } from "../src/training/targets";
import { submenuItems } from "../src/ui/opentui/menuItems";

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

  test("avoids lines used in recent records", () => {
    const contentRoot = makeFixtureRootWithManyCards();
    const options = { env: { KEYLOOP_TS_CONTENT_ROOT: contentRoot }, exists: () => true };
    const first = buildSymbolsNumbersTarget(basicsContext([], ["typescript"]), options);
    const records = [
      defaultSessionRecord({
        module: "programming_basics",
        category: "symbols_numbers" as TrainingCategory,
        target_text: first.text,
      }),
    ];
    const second = buildSymbolsNumbersTarget(basicsContext(records, ["typescript"]), options);
    const firstLines = new Set(first.text.split("\n"));
    const overlap = second.text.split("\n").filter((line) => firstLines.has(line));
    expect(overlap.length).toBe(0);
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
    expect(items[0]?.label).toBe("符号与数字");
    expect(items[4]?.label).toBe("内置 API");
  });
});
