import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  codeCorpusPracticeOptions,
  loadContentLibrary,
  mergeEverydayCorpus,
  resolveContentRoot,
  sourceCatalog,
  type EverydayEnglishCorpus,
} from "../src/index";
import {
  buildReadingVocabularyProfile,
  readingVocabularyCoverage,
  readingVocabularyThreshold,
} from "../src/content/readingVocabulary";
import {
  isCompleteReadingArticleText,
  isCompleteReadingSentence,
  readingSentenceQualityIssues,
} from "../src/content/readingTextQuality";

describe("content library", () => {
  test("built-in json content loads with Rust-compatible counts", async () => {
    const library = await loadContentLibrary();

    expect(library.foundation_drills.length).toBeGreaterThanOrEqual(12);
    expect(library.foundation_drills.length).toBeGreaterThanOrEqual(16);
    expect(
      library.foundation_drills.reduce((sum, drill) => sum + drill.items.length, 0),
    ).toBeGreaterThanOrEqual(1200);
    expect(library.warmup.length).toBeGreaterThanOrEqual(180);
    expect(library.common_words.length).toBeGreaterThanOrEqual(400);
    expect(library.word_chunks.length).toBeGreaterThanOrEqual(300);
    expect(library.programming_words.length).toBeGreaterThanOrEqual(800);
    expect(library.symbols.length).toBeGreaterThanOrEqual(200);
    expect(library.language_symbols.length).toBeGreaterThanOrEqual(8);
    expect(library.number_drills.length).toBeGreaterThanOrEqual(80);
    expect(library.naming.length).toBeGreaterThanOrEqual(300);
    expect(library.code_corpus?.index.stats.kept).toBeGreaterThanOrEqual(1000);
    expect(library.long_words.map((entry) => entry.word)).toContain(
      "internationalization",
    );
    const longWordDomains = new Set(
      library.long_words.map((entry) => entry.domain),
    );
    expect(longWordDomains.has("programming")).toBe(true);
    expect(
      library.long_words.some(
        (entry) => entry.domain === "everyday" || entry.domain === "workplace",
      ),
    ).toBe(true);
  });

  test("foundation drills keep beginner material focused on key skills", async () => {
    const library = await loadContentLibrary();
    const byId = new Map(library.foundation_drills.map((drill) => [drill.id, drill]));
    const englishTransitions = byId.get("english-transitions");

    expect(byId.get("home-row")?.items).toEqual(
      expect.arrayContaining([
        expect.stringContaining("asdf ;lkj asdf ;lkj"),
        expect.stringContaining("Dad adds a salad"),
      ]),
    );
    expect(englishTransitions?.items.length).toBeGreaterThanOrEqual(280);
    expect(englishTransitions?.items).toEqual(
      expect.arrayContaining([
        expect.stringContaining("tion tion tion"),
        expect.stringContaining("ing ing ing"),
        expect.stringContaining("th th th"),
      ]),
    );
    const beginnerText = (englishTransitions?.items ?? []).join("\n");
    expect(beginnerText).not.toMatch(
      /\b(?:fjjf|jfj|infecund|quadriplegics|masturbates|gallimaufry|defenestrating|orthorhombic)\b/u,
    );
    expect(byId.has("basic-words")).toBe(false);
    expect(byId.has("classic-qwerty")).toBe(false);
    expect(byId.get("number-row")?.items).toEqual(
      expect.arrayContaining([expect.stringContaining("10 11 12 13")]),
    );
  });

  test("number row and punctuation drills cover everyday symbols evenly", async () => {
    const library = await loadContentLibrary();
    const byId = new Map(library.foundation_drills.map((drill) => [drill.id, drill]));
    const numberText = byId.get("number-row")?.items.join("\n") ?? "";
    const punctuationText = byId.get("punctuation-edges")?.items.join("\n") ?? "";

    expect(byId.get("number-row")?.items.length).toBeGreaterThanOrEqual(220);
    expect(countChar(numberText, "9")).toBeGreaterThanOrEqual(180);
    expect(countChar(numberText, "0")).toBeGreaterThanOrEqual(180);
    expect(countChar(numberText, "!")).toBeGreaterThanOrEqual(20);
    expect(numberText).toContain("The meeting starts at 9:00 and ends at 10:00.");
    expect(numberText).toContain("Wow! Go! Stop! Wait! Yes! No! Again!");

    expect(byId.get("punctuation-edges")?.items.length).toBeGreaterThanOrEqual(280);
    for (const symbol of ["(", ")", "[", "]", "{", "}", ":", "'", "\"", "?", "!"]) {
      expect(countChar(punctuationText, symbol)).toBeGreaterThanOrEqual(9);
    }
    expect(punctuationText).toContain("Are you ready? Yes, I am ready.");
    expect(punctuationText).toContain('He asked, "are you ready?" I said, "yes."');
    expect(punctuationText).not.toMatch(/[，。？！；：“”‘’（）【】]/u);
  });

  test("programming words include common non-keyword state terms", async () => {
    const library = await loadContentLibrary();

    expect(library.programming_words).toEqual(
      expect.arrayContaining([
        "enabled",
        "pending",
        "selected",
        "visible",
        "archived",
        "configuration",
        "preference",
        "performance",
      ]),
    );
  });

  test("code snippets use the generated code content index", async () => {
    const library = await loadContentLibrary();
    const shardPaths = library.code_corpus?.index.shards.map((shard) => shard.path) ?? [];
    const languages = new Set(
      library.code_corpus?.index.shards.map((shard) => shard.language) ?? [],
    );

    expect(library.code_snippets).toEqual([]);
    expect(library.code_corpus?.index.stats.kept).toBeGreaterThanOrEqual(7000);
    expect(shardPaths.some((path) => path.endsWith(".jsonl"))).toBe(true);
    for (const language of ["typescript", "rust", "go", "python", "java"]) {
      expect(languages.has(language)).toBe(true);
    }
    expect(
      library.code_corpus?.index.shards.every((shard) => Object.keys(shard.projects).length === 0),
    ).toBe(true);
    const options =
      library.code_corpus === undefined ? [] : codeCorpusPracticeOptions(library.code_corpus);
    const frameworkValues = new Set(
      options
        .filter((option) => option.facet === "framework")
        .map((option) => option.value),
    );
    for (const projectOrLanguage of [
      "yarn",
      "pnpm",
      "typescript",
      "rust",
      "go",
      "html",
      "less",
      "sass",
      "scss",
      "vscode-languageserver",
    ]) {
      expect(frameworkValues.has(projectOrLanguage)).toBe(false);
    }
    for (const framework of ["react", "nextjs", "nestjs", "vue"]) {
      expect(frameworkValues.has(framework)).toBe(true);
    }
  });

  test("everyday entries reference existing sources", async () => {
    const library = await loadContentLibrary();
    const sourceIds = new Set(
      library.everyday_english.sources.map((source) => source.source_id),
    );

    expect(library.everyday_english.entries.length).toBeGreaterThanOrEqual(80);
    for (const entry of library.everyday_english.entries) {
      expect(entry.text.trim().length).toBeGreaterThan(0);
      expect(sourceIds.has(entry.source_id)).toBe(true);
    }
  });

  test("new daily English corpora load with translations and explicit splits", async () => {
    const library = await loadContentLibrary();

    expect(library.everyday_words.entries.length).toBeGreaterThanOrEqual(9000);
    expect(library.everyday_sentences.entries.length).toBeGreaterThanOrEqual(150);
    expect(library.everyday_articles.entries.length).toBeGreaterThanOrEqual(30);
    expect(library.everyday_word_decomposition.entries.length).toBeGreaterThanOrEqual(1000);
    const readingVocabulary = buildReadingVocabularyProfile(library.everyday_words.entries);

    for (const entry of library.everyday_words.entries) {
      expect(entry.word.trim()).not.toBe("");
      expect(entry.translation_zh.trim()).not.toBe("");
    }
    for (const entry of library.everyday_sentences.entries) {
      expect(entry.text.trim()).not.toBe("");
      expect(entry.translation_zh.trim()).not.toBe("");
      expectReadingSentenceQuality(entry.text);
      expect(readingWordCount(entry.text)).toBeGreaterThanOrEqual(
        sentenceWordRange(entry.length)[0],
      );
      expect(readingWordCount(entry.text)).toBeLessThanOrEqual(sentenceWordRange(entry.length)[1]);
      expectReadingVocabularyLevel(entry.text, entry.level, readingVocabulary);
    }
    for (const article of library.everyday_articles.entries) {
      expect(article.paragraphs.length).toBeGreaterThan(0);
      const articleText = article.paragraphs.map((paragraph) => paragraph.text).join(" ");
      expect(readingWordCount(articleText)).toBeGreaterThanOrEqual(
        articleWordRange(article.length)[0],
      );
      expect(readingWordCount(articleText)).toBeLessThanOrEqual(articleWordRange(article.length)[1]);
      expect(readingSentenceCount(articleText)).toBeGreaterThanOrEqual(3);
      expectReadingVocabularyLevel(articleText, article.level, readingVocabulary);
      for (const paragraph of article.paragraphs) {
        expect(paragraph.text.trim()).not.toBe("");
        expect(paragraph.translation_zh.trim()).not.toBe("");
      }
    }
    for (const entry of library.everyday_word_decomposition.entries) {
      expect(entry.source_id).not.toBe("algorithmic");
      expect(entry.parts.join("")).toBe(entry.word);
      expect(entry.translation_zh.trim()).not.toBe("");
    }

    for (const level of ["high_school", "cet4", "cet6", "postgraduate", "toefl_ielts"]) {
      expect(library.everyday_sentences.entries.some((entry) => entry.level === level)).toBe(true);
      expect(library.everyday_articles.entries.some((entry) => entry.level === level)).toBe(true);
      expect(
        library.everyday_articles.entries.filter((entry) => entry.level === level).length,
      ).toBeGreaterThanOrEqual(6);
    }
  });

  test("reading sentence quality rejects clipped fragments and source residue", () => {
    expect(isCompleteReadingSentence("\"Well, dearies, how have you got on today?")).toBe(false);
    expect(isCompleteReadingSentence("; or else the twenty thousand pounds will belong to you."))
      .toBe(false);
    expect(isCompleteReadingSentence("\"That's you, Bill,\" returned Black Dog, \"you're right."))
      .toBe(false);
    expect(isCompleteReadingSentence("(Marred is a Yorkshire word and means spoiled.")).toBe(false);
    expect(isCompleteReadingSentence("and then the room became quiet.")).toBe(false);
    expect(isCompleteReadingSentence("CHAPTER I.")).toBe(false);
    expect(isCompleteReadingSentence("Project Gutenberg offers free ebooks.")).toBe(false);
    expect(isCompleteReadingSentence("=Future of the New York Canals.")).toBe(false);
    expect(isCompleteReadingSentence("New York: Library of Liberal Classics.")).toBe(false);
    expect(isCompleteReadingSentence("(Published by the author, New York.)")).toBe(false);
    expect(isCompleteReadingSentence("It is edited by _George E.")).toBe(false);
    expect(isCompleteReadingSentence("--New York Academy of Sciences: Annals.")).toBe(false);
    expect(isCompleteReadingSentence("This English sentence should not contain 中文。")).toBe(false);
    expect(readingSentenceQualityIssues("Stop this moment, I tell you!\"")).toContain(
      "unbalanced_quotes",
    );
    expect(isCompleteReadingSentence("But if you have big ideas, you need big words.")).toBe(true);
    expect(isCompleteReadingSentence("\"Stop this moment, I tell you!\"")).toBe(true);
  });

  test("reading article quality rejects broken passages", () => {
    expect(
      isCompleteReadingArticleText(
        [
          "Project Gutenberg offers free ebooks to many readers.",
          "This is not an article body.",
          "It should be rejected before translation.",
        ].join(" "),
      ),
    ).toBe(false);
    expect(
      isCompleteReadingArticleText(
        [
          "; then the story continues without a beginning.",
          "The paragraph has enough words to look like content.",
          "But the first sentence is clearly clipped.",
        ].join(" "),
      ),
    ).toBe(false);
    expect(
      isCompleteReadingArticleText(
        [
          "The rain stopped just before the children reached the gate.",
          "They looked back at the road and laughed at their muddy shoes.",
          "By the time they came home, the whole kitchen was bright with afternoon sun.",
        ].join(" "),
      ),
    ).toBe(true);
  });

  test("everyday corpus merge deduplicates sources and entries", () => {
    const base: EverydayEnglishCorpus = {
      sources: [
        {
          source_id: "keyloop:base",
          source_name: "Base corpus",
          source_url: "keyloop://base",
          license: "MIT",
          retrieved_at: "2026-06-01",
          generation_script: "manual-curation",
          included_fields: ["text", "source_id"],
          notes: "Base corpus.",
        },
      ],
      entries: [
        {
          text: "today",
          kind: "word",
          tier: 1,
          length: null,
          domain: "everyday",
          source_id: "keyloop:base",
        },
      ],
    };
    const extra: EverydayEnglishCorpus = {
      sources: [
        base.sources[0]!,
        {
          source_id: "user:daily",
          source_name: "User daily English",
          source_url: "file:///tmp/daily.json",
          license: "user-provided",
          retrieved_at: "2026-06-01",
          generation_script: "user-local-json",
          included_fields: ["text", "kind"],
          notes: "Local user corpus.",
        },
      ],
      entries: [
        base.entries[0]!,
        {
          text: "standup summary",
          kind: "phrase",
          tier: 2,
          length: null,
          domain: "workplace",
          source_id: "user:daily",
        },
      ],
    };

    const merged = mergeEverydayCorpus(base, extra);

    expect(merged.sources.map((source) => source.source_id)).toEqual([
      "keyloop:base",
      "user:daily",
    ]);
    expect(merged.entries.map((entry) => entry.text)).toEqual([
      "today",
      "standup summary",
    ]);
  });

  test("source catalog includes everyday corpus source metadata", async () => {
    const catalog = await sourceCatalog();

    expect(
      catalog.some(
        (source) =>
          source.corpus === "everyday_english" &&
          source.languages.includes("english") &&
          source.frameworks.includes("workplace"),
      ),
    ).toBe(true);
    expect(
      catalog.some(
        (source) =>
          source.corpus === "everyday_words" &&
          source.source_id === "monkeytype:english_10k+ecdict" &&
          source.included_fields.includes("translation_zh"),
      ),
    ).toBe(true);
    expect(
      catalog.some(
        (source) =>
          source.corpus === "everyday_sentences" &&
          source.source_id.startsWith("gutenberg:") &&
          source.included_fields.includes("translation_zh"),
      ),
    ).toBe(true);
    expect(
      catalog.some(
        (source) =>
          source.corpus === "everyday_articles" &&
          source.source_id.startsWith("gutenberg:") &&
          source.license_spdx === "Public domain in the USA" &&
          source.included_fields.includes("paragraphs"),
      ),
    ).toBe(true);
    expect(
      catalog.some(
        (source) =>
          source.corpus === "everyday_word_decomposition" &&
          source.source_id === "gutenberg:moby-hyphenation+ecdict" &&
          source.notes.includes("does not infer"),
      ),
    ).toBe(true);
    expect(
      catalog.some(
        (source) =>
          source.repo === "vitejs/vite" &&
          source.license_spdx === "MIT" &&
          source.repo_url.startsWith("https://github.com/"),
      ),
    ).toBe(true);
  });

  test("content root resolver falls back to binary-adjacent ts content", async () => {
    const expectedRoot = "/Users/luwei/code/ai/keyloop/ts/content";
    const checkedPaths: string[] = [];

    const resolvedRoot = await resolveContentRoot({
      moduleUrl: "file:///Users/luwei/code/ai/keyloop/ts/src/content/library.js",
      execPath: "/Users/luwei/code/ai/keyloop/dist/keyloop-ts",
      argv1: "/Users/luwei/code/ai/keyloop/dist/keyloop-ts",
      env: {},
      exists: async (path) => {
        checkedPaths.push(path);
        return path === expectedRoot;
      },
    });

    expect(resolvedRoot).toBe(expectedRoot);
    expect(checkedPaths).toContain(expectedRoot);
  });

  test("generated TypeScript content snapshot is not used", () => {
    expect(
      existsSync(
        "/Users/luwei/code/ai/keyloop/ts/src/content/generated/codeCorpusV2.ts",
      ),
    ).toBe(false);
  });
});

function countChar(text: string, char: string): number {
  return [...text].filter((item) => item === char).length;
}

function readingWordCount(text: string): number {
  return text.trim().split(/\s+/u).filter((word) => /[A-Za-z0-9]/u.test(word)).length;
}

function readingSentenceCount(text: string): number {
  return text.split(/[.!?]+(?:\s+|$)/u).filter((sentence) => sentence.trim().length > 0).length;
}

function sentenceWordRange(length: "short" | "medium" | "long" | "mixed"): [number, number] {
  switch (length) {
    case "short":
      return [6, 12];
    case "medium":
      return [13, 22];
    case "long":
      return [23, 35];
    case "mixed":
      throw new Error("daily reading sentences must not use mixed length");
  }
}

function articleWordRange(length: "short" | "medium" | "long" | "mixed"): [number, number] {
  switch (length) {
    case "short":
      return [80, 140];
    case "medium":
      return [180, 280];
    case "long":
      return [380, 600];
    case "mixed":
      throw new Error("daily reading articles must not use mixed length");
  }
}

function expectReadingVocabularyLevel(
  text: string,
  level: Parameters<typeof readingVocabularyCoverage>[1],
  profile: Parameters<typeof readingVocabularyCoverage>[2],
): void {
  const coverage = readingVocabularyCoverage(text, level, profile);
  const threshold = readingVocabularyThreshold(level);
  expect(coverage.coverage).toBeGreaterThanOrEqual(threshold.minCoverage);
  expect(coverage.uniqueCoverage).toBeGreaterThanOrEqual(threshold.minUniqueCoverage);
}

function expectReadingSentenceQuality(text: string): void {
  expect(isCompleteReadingSentence(text)).toBe(true);
}
