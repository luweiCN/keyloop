import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

import {
  codePracticeOptions,
  codeSnippetFromBuiltin,
  extractSnippets,
  isSupportedSourcePath,
  languageFromSource,
  makeSnippet,
  pickBuiltinCodeExcludingByDifficulty,
  pickCodeSnippetsExcludingByDifficulty,
  snippetsFromFile,
  type BuiltinCodeSnippet,
  type CodePracticeConfig,
  type CodeSnippet,
} from "../src/index";

describe("code snippet normalization", () => {
  test("builtin snippets normalize common indent and trailing whitespace", () => {
    const snippet = codeSnippetFromBuiltin({
      text: "    function value() {  \n      return 1;  \n    }  ",
      source: "keyloop:test",
      language: "javascript",
      framework: "web",
      project: "test",
      level: "function",
    });

    expect(snippet.text).toBe("function value() {\n  return 1;\n}");
    expect(snippet.language).toBe("javascript");
    expect(snippet.level).toBe("function");
  });

  test("builtin snippets normalize partially stripped nested block indent", () => {
    const snippet = codeSnippetFromBuiltin({
      text: "if (val === true) {\n    // Support plain true/false\n    return function(){ return true };\n  }",
      source: "github:expressjs/express:lib/utils.js:197-200",
      language: "javascript",
      framework: "express",
      project: "expressjs/express",
      level: "block",
    });

    expect(snippet.text).toBe(
      "if (val === true) {\n  // Support plain true/false\n  return function(){ return true };\n}",
    );
  });

  test("makeSnippet computes score difficulty and language", () => {
    const snippet = makeSnippet("const value = items.map((item) => item.id);", "src/App.tsx:10");

    expect(snippet.score).toBeGreaterThan(0);
    expect(snippet.difficulty).toBe("medium");
    expect(snippet.language).toBe("typescript");
    expect(languageFromSource("contracts/Token.sol:7")).toBe("solidity");
  });

  test("builtin snippets can preserve generated typing difficulty metadata", () => {
    const snippet = codeSnippetFromBuiltin({
      text: "export function selectedValue(id: string) {\n  return values.get(id);\n}",
      source: "keyloop:corpus-v4:test",
      language: "typescript",
      framework: "react",
      project: "repo/project",
      level: "function",
      difficulty: "hard",
      score: 88,
    });

    expect(snippet.difficulty).toBe("hard");
    expect(snippet.score).toBe(88);
  });
});

describe("code snippet extraction", () => {
  test("snippetsFromFile preserves relative indent in captured blocks", () => {
    const snippets = snippetsFromFile("  if (value) {\n    return value;\n  }", "sample.ts");

    expect(snippets.some((snippet) => snippet.text === "if (value) {\n  return value;\n}")).toBe(
      true,
    );
  });

  test("snippetsFromFile skips non-ascii captured blocks and comments", () => {
    const snippets = snippetsFromFile(
      `
// const ignored = true;
function label() {
  return "设置";
}

function value() {
  return "settings";
}
`,
      "sample.ts",
    );

    expect(snippets.some((snippet) => snippet.text.includes("设置"))).toBe(false);
    expect(snippets.some((snippet) => snippet.text.includes("settings"))).toBe(true);
    expect(snippets.some((snippet) => snippet.text.includes("ignored"))).toBe(false);
  });

  test("supported source path rejects lockfiles and minified javascript", () => {
    expect(isSupportedSourcePath("src/index.ts")).toBe(true);
    expect(isSupportedSourcePath("src/app.min.js")).toBe(false);
    expect(isSupportedSourcePath("pnpm-lock.yaml")).toBe(false);
    expect(isSupportedSourcePath("README.md")).toBe(false);
  });
});

describe("code snippet picker", () => {
  test("local picker skips single-line snippets and keeps multi-line blocks", () => {
    const picked = pickCodeSnippetsExcludingByDifficulty(
      [
        snippet("const value = getValue();", "single.ts:1", "easy"),
        snippet("function readValue() {\n  return getValue();\n}", "block.ts:1", "medium"),
      ],
      [],
      {},
      3,
      new Set(),
    );

    expect(picked).toHaveLength(1);
    expect(picked[0]?.text).toContain("\n");
  });

  test("difficulty filter falls back and focus terms are preferred", () => {
    const picked = pickCodeSnippetsExcludingByDifficulty(
      [
        snippet("function selectedValue() {\n  return selected;\n}", "a.ts:1", "easy"),
        snippet("function fallbackValue() {\n  return fallback;\n}", "b.ts:1", "medium"),
      ],
      ["selected"],
      {},
      2,
      new Set(),
      "hard",
    );

    expect(picked.map((item) => item.source)).toEqual(["a.ts:1", "b.ts:1"]);
  });

  test("picker honors configured code length", () => {
    const picked = pickCodeSnippetsExcludingByDifficulty(
      [
        snippet("function shortValue() {\n  return value;\n}", "short.ts:1", "easy"),
        snippet(
          [
            "function mediumValue() {",
            "  const a = 1;",
            "  const b = 2;",
            "  const c = 3;",
            "  const d = 4;",
            "  return a + b + c + d;",
            "}",
          ].join("\n"),
          "medium.ts:1",
          "easy",
        ),
      ],
      [],
      {
        languages: [],
        frameworks: [],
        projects: [],
        match_any: false,
        size: "short",
      },
      2,
      new Set(),
    );

    expect(picked.map((item) => item.source)).toEqual(["short.ts:1"]);
  });

  test("picker shuffles candidates before focus tie sorting", () => {
    const picked = pickCodeSnippetsExcludingByDifficulty(
      [
        snippet("function firstSelected() {\n  return selected;\n}", "a.ts:1", "medium"),
        snippet("function secondSelected() {\n  return selected;\n}", "b.ts:1", "medium"),
        snippet("function fallbackValue() {\n  return fallback;\n}", "c.ts:1", "medium"),
      ],
      ["selected"],
      {},
      2,
      new Set(),
      undefined,
      { random: sequenceRandom([0, 0.99]) },
    );

    expect(picked.map((item) => item.source)).toEqual(["b.ts:1", "a.ts:1"]);
  });

  test("builtin picker honors match_any and options sorting", () => {
    const builtins: BuiltinCodeSnippet[] = [
      builtin("typescript", "react", "app", "function selected() {\n  return value;\n}"),
      builtin("solidity", "foundry", "contracts", "function owner() public {\n  return;\n}"),
      builtin("typescript", "react", "keyloop-generated", "const x = 1;\nreturn x;"),
    ];
    const config: CodePracticeConfig = {
      languages: ["solidity"],
      frameworks: ["react"],
      projects: [],
      match_any: true,
    };

    const picked = pickBuiltinCodeExcludingByDifficulty(
      builtins,
      ["owner"],
      config,
      2,
      new Set(),
    );
    const options = codePracticeOptions(builtins);

    expect(picked.map((item) => item.language).sort()).toEqual(["solidity", "typescript"]);
    expect(options.some((option) => option.facet === "project")).toBe(false);
    expect(options[0]).toMatchObject({ facet: "language", value: "typescript", count: 2 });
  });
});

describe("repo extraction", () => {
  test("extractSnippets reads supported files skips lockfiles large files and dedupes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-ts-snippets-"));
    try {
      await writeFile(
        join(dir, "index.ts"),
        "function selectedValue() {\n  return selected;\n}\n\nfunction selectedValue() {\n  return selected;\n}\n",
      );
      await writeFile(join(dir, "pnpm-lock.yaml"), "function ignored() {\n  return ignored;\n}");
      await writeFile(join(dir, "large.ts"), `${"x".repeat(201_000)}\n`);

      const snippets = await extractSnippets(dir);

      expect(snippets.some((item) => item.text.includes("ignored"))).toBe(false);
      expect(snippets.some((item) => item.source === "large.ts:1")).toBe(false);
      expect(snippets.filter((item) => item.text.includes("selectedValue"))).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("extractSnippets respects git ignore exclude ignore files and hidden sources", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-ts-snippets-ignore-"));
    try {
      await mkdir(join(dir, ".git", "info"), { recursive: true });
      await mkdir(join(dir, "ignored-dir"), { recursive: true });
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(
        join(dir, ".gitignore"),
        "ignored.ts\nignored-dir/\n*.generated.ts\n!keep.generated.ts\n",
      );
      await writeFile(join(dir, ".ignore"), "ignored-by-dotignore.ts\n");
      await writeFile(join(dir, ".git", "info", "exclude"), "excluded-info.ts\n");
      await writeFile(
        join(dir, "ignored.ts"),
        "function ignoredByGitignore() {\n  return ignored;\n}\n",
      );
      await writeFile(
        join(dir, "ignored-dir", "nested.ts"),
        "function ignoredByDirectory() {\n  return ignored;\n}\n",
      );
      await writeFile(
        join(dir, "ignored-by-dotignore.ts"),
        "function ignoredByDotIgnore() {\n  return ignored;\n}\n",
      );
      await writeFile(
        join(dir, "excluded-info.ts"),
        "function ignoredByGitInfoExclude() {\n  return ignored;\n}\n",
      );
      await writeFile(
        join(dir, "drop.generated.ts"),
        "function ignoredByGlob() {\n  return ignored;\n}\n",
      );
      await writeFile(
        join(dir, "keep.generated.ts"),
        "function keepGenerated() {\n  return keep;\n}\n",
      );
      await writeFile(
        join(dir, "src", ".hidden.ts"),
        "function visibleHidden() {\n  return hidden;\n}\n",
      );

      const snippets = await extractSnippets(dir);
      const text = snippets.map((snippet) => snippet.text).join("\n");

      expect(text).not.toContain("ignoredByGitignore");
      expect(text).not.toContain("ignoredByDirectory");
      expect(text).not.toContain("ignoredByDotIgnore");
      expect(text).not.toContain("ignoredByGitInfoExclude");
      expect(text).not.toContain("ignoredByGlob");
      expect(text).toContain("keepGenerated");
      expect(text).toContain("visibleHidden");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("extractSnippets scans supported files in ordinary build directories when not ignored", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-ts-snippets-build-dir-"));
    try {
      await mkdir(join(dir, "dist"), { recursive: true });
      await writeFile(
        join(dir, "dist", "generated.ts"),
        "function visibleBuildOutput() {\n  return generated;\n}\n",
      );

      const snippets = await extractSnippets(dir);
      const text = snippets.map((snippet) => snippet.text).join("\n");

      expect(text).toContain("visibleBuildOutput");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("extractSnippets skips non-UTF8 files entirely", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-ts-snippets-encoding-"));
    try {
      await writeFile(
        join(dir, "valid.ts"),
        "function validEncoding() {\n  return value;\n}\n",
      );
      await writeFile(
        join(dir, "invalid.ts"),
        Buffer.from([
          ...Buffer.from("function invalidEncoding() {\n  return value;\n}\n"),
          0xff,
        ]),
      );

      const snippets = await extractSnippets(dir);
      const text = snippets.map((snippet) => snippet.text).join("\n");

      expect(text).toContain("validEncoding");
      expect(text).not.toContain("invalidEncoding");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function snippet(text: string, source: string, difficulty: string): CodeSnippet {
  return {
    text,
    source,
    difficulty,
    score: 10,
    language: "typescript",
    framework: "local",
    project: "local-repo",
    level: "function",
  };
}

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0.5;
}

function builtin(
  language: string,
  framework: string,
  project: string,
  text: string,
): BuiltinCodeSnippet {
  return {
    language,
    framework,
    project,
    level: "function",
    source: `${language}:${framework}`,
    text,
  };
}
