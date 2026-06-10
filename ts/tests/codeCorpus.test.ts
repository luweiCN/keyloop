import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCodeCorpusSnapshot,
  codeCorpusPracticeOptions,
  codeSnippetExclusionKey,
  codeSnippetFromBuiltin,
  pickCodeCorpusSnippetsExcludingByDifficulty,
} from "../src/index";

describe("code corpus snapshot builder", () => {
  const functionShortText = (index: number): string =>
    [
      `export function selectedValue${index}(id: string) {`,
      "  const value = values.get(id);",
      "  const backup = fallbackValues.get(id);",
      "  const label = labels.get(id);",
      "  const summary = summaries.get(id);",
      "  const selected = value || backup;",
      "  const named = selected || label;",
      "  const finalValue = named || summary;",
      "  return finalValue || null;",
      "}",
    ].join("\n");

  test("keeps accepted corpus records as runtime snippets", () => {
    const result = buildCodeCorpusSnapshot([
      {
        id: "github:repo/project:src/example.ts:10-14",
        repo: "repo/project",
        source_url: "https://github.com/repo/project/blob/main/src/example.ts#L10-L14",
        file_path: "src/example.ts",
        technology_domain: "react",
        domain: "react",
        language: "WrongLanguage",
        framework: "wrong-framework",
        level: "function",
        size: "long",
        text: functionShortText(1),
      },
    ]);

    expect(result.stats.kept).toBe(1);
    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0]).toMatchObject({
      source: "github:repo/project:src/example.ts:10-14",
      language: "react",
      framework: "react",
      project: "keyloop-corpus",
      level: "function",
      difficulty: "easy",
      syntax_language: "typescript",
    });
    expect(codeSnippetFromBuiltin(result.snippets[0]!).difficulty).toBe("easy");
    expect(result.index.shards).toEqual([
      {
        path: "snippets/react/function/easy/short.jsonl",
        language: "react",
        level: "function",
        difficulty: "easy",
        size: "short",
        count: 1,
        frameworks: { react: 1 },
        projects: {},
      },
    ]);
    const firstSnippet = result.snippets[0];
    expect(firstSnippet).toBeDefined();
    if (firstSnippet === undefined) {
      throw new Error("expected first snippet");
    }
    expect(result.shards.get("snippets/react/function/easy/short.jsonl")).toEqual([
      firstSnippet,
    ]);
    expect(codeCorpusPracticeOptions({ root: "", index: result.index })).toEqual([
      { facet: "framework", value: "react", count: 1 },
    ]);
  });

  test("rejects noisy records dedupes text and caps each coverage cell", () => {
    const records = [
      {
        id: "license",
        technology_domain: "react",
        language: "typescript",
        framework: "react",
        repo: "repo/project",
        level: "block",
        size: "short",
        text: "/**\n * @license\n * Copyright Example\n */",
      },
      {
        id: "duplicate-a",
        technology_domain: "react",
        language: "typescript",
        framework: "react",
        repo: "repo/project",
        level: "function",
        size: "short",
        text: functionShortText(1),
      },
      {
        id: "duplicate-b",
        technology_domain: "react",
        language: "typescript",
        framework: "react",
        repo: "repo/project",
        level: "function",
        size: "short",
        text: functionShortText(1),
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `capped-${index}`,
        technology_domain: "react",
        language: "typescript",
        framework: "react",
        repo: "repo/project",
        level: "function",
        size: "short",
        text: functionShortText(index + 2),
      })),
    ];

    const result = buildCodeCorpusSnapshot(records, { cellLimit: 2 });

    expect(result.stats.rejected).toBe(1);
    expect(result.stats.duplicate).toBe(1);
    expect(result.stats.capped).toBe(3);
    expect(result.snippets.map((snippet) => snippet.source)).toEqual([
      "duplicate-a",
      "capped-0",
    ]);
    expect(result.index.stats.kept).toBe(2);
    expect(result.index.shards[0]?.count).toBe(2);
  });

  test("uses corpus v4 fallback source ids when records omit source metadata", () => {
    const result = buildCodeCorpusSnapshot([
      {
        domain: "typescript",
        language: "WrongLanguage",
        framework: "wrong-framework",
        repo: "repo/project",
        level: "function",
        size: "short",
        text: functionShortText(1),
      },
    ]);

    expect(result.snippets[0]?.source).toBe("keyloop:corpus-v4:1");
  });

  test("keeps project and tool names out of framework picker options", () => {
    const result = buildCodeCorpusSnapshot([
      {
        id: "tooling-yarn",
        technology_domain: "typescript",
        domain: "typescript",
        language: "WrongLanguage",
        framework: "yarn",
        repo: "yarnpkg/berry",
        file_path: "packages/plugin-github/sources/GithubFetcher.ts",
        level: "function",
        size: "short",
        text: functionShortText(1),
      },
      {
        id: "framework-react",
        technology_domain: "react",
        domain: "react",
        language: "WrongLanguage",
        framework: "wrong-framework",
        repo: "facebook/react",
        file_path: "compiler/packages/babel-plugin-react-compiler/src/TypeInference/InferTypes.ts",
        level: "function",
        size: "short",
        text: functionShortText(2),
      },
    ]);

    expect(result.snippets.map((snippet) => snippet.language)).toEqual([
      "typescript",
      "react",
    ]);
    expect(result.snippets.map((snippet) => snippet.framework)).toEqual([
      "general",
      "react",
    ]);
    expect(result.snippets.map((snippet) => snippet.syntax_language)).toEqual([
      "typescript",
      "typescript",
    ]);
    expect(result.index.shards.find((shard) => shard.language === "typescript")?.frameworks).toEqual(
      {},
    );
    expect(codeCorpusPracticeOptions({ root: "", index: result.index })).toEqual([
      { facet: "language", value: "typescript", count: 1 },
      { facet: "framework", value: "react", count: 1 },
    ]);
  });

  test("picker broadens difficulty before reusing excluded corpus snippets", () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-code-corpus-"));
    try {
      const easyPath = "snippets/javascript/block/easy/short.jsonl";
      const mediumPath = "snippets/javascript/block/medium/short.jsonl";
      mkdirSync(join(root, "snippets/javascript/block/easy"), { recursive: true });
      mkdirSync(join(root, "snippets/javascript/block/medium"), { recursive: true });
      writeFileSync(
        join(root, easyPath),
        `${JSON.stringify(corpusSnippet("js-used", "easy", 'if (used) { return "used"; }'))}\n`,
      );
      writeFileSync(
        join(root, mediumPath),
        `${JSON.stringify(corpusSnippet("js-fresh", "medium", 'if (fresh) { return "fresh"; }'))}\n`,
      );

      const picked = pickCodeCorpusSnippetsExcludingByDifficulty(
        {
          root,
          index: {
            schema: "keyloop.code_corpus",
            schema_version: 1,
            cell_limit: 30,
            stats: emptyCorpusStats(2),
            shards: [
              corpusShard(easyPath, "easy"),
              corpusShard(mediumPath, "medium"),
            ],
          },
        },
        [],
        {
          languages: ["javascript"],
          frameworks: [],
          projects: [],
          level: "block",
          match_any: true,
        },
        1,
        new Set([
          'if (used) {\n  return "used";\n}',
          codeSnippetExclusionKey('if (used) {\n  return "used";\n}'),
        ]),
        "easy",
        { random: () => 0.99 },
      );

      expect(picked.map((snippet) => snippet.source)).toEqual(["js-fresh"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("picker honors configured code length shards", () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-code-corpus-"));
    try {
      const shortPath = "snippets/javascript/block/easy/short.jsonl";
      const longPath = "snippets/javascript/block/easy/long.jsonl";
      mkdirSync(join(root, "snippets/javascript/block/easy"), { recursive: true });
      writeFileSync(
        join(root, shortPath),
        `${JSON.stringify(corpusSnippet("js-short", "easy", 'if (short) { return "short"; }'))}\n`,
      );
      writeFileSync(
        join(root, longPath),
        `${JSON.stringify(corpusSnippet("js-long", "easy", 'if (long) { return "long"; }'))}\n`,
      );

      const picked = pickCodeCorpusSnippetsExcludingByDifficulty(
        {
          root,
          index: {
            schema: "keyloop.code_corpus",
            schema_version: 1,
            cell_limit: 30,
            stats: emptyCorpusStats(2),
            shards: [
              corpusShard(shortPath, "easy", "short"),
              corpusShard(longPath, "easy", "long"),
            ],
          },
        },
        [],
        {
          languages: ["javascript"],
          frameworks: [],
          projects: [],
          level: "block",
          size: "long",
          match_any: true,
        },
        1,
        new Set(),
        "easy",
      );

      expect(picked.map((snippet) => snippet.source)).toEqual(["js-long"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function corpusSnippet(source: string, difficulty: "easy" | "medium", text: string) {
  return {
    source,
    text,
    language: "javascript",
    framework: "none",
    project: "test",
    level: "block",
    difficulty,
    score: difficulty === "easy" ? 1 : 5,
  };
}

function corpusShard(path: string, difficulty: "easy" | "medium", size: "short" | "long" = "short") {
  return {
    path,
    language: "javascript",
    level: "block" as const,
    difficulty,
    size,
    count: 1,
    frameworks: { none: 1 },
    projects: { test: 1 },
  };
}

function emptyCorpusStats(total: number) {
  return {
    total,
    accepted: total,
    review: 0,
    rejected: 0,
    duplicate: 0,
    capped: 0,
    invalidMetadata: 0,
    kept: total,
  };
}
