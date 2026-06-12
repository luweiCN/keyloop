import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

describe("build code corpus snapshot CLI", () => {
  test("builds a runtime snapshot from a corpus v4 directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-corpus-v4-snapshot-"));
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const input = join(root, "input");
    const output = join(root, "output");
    try {
      writeCorpusDirectory(input);

      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "src/tools/buildCodeCorpusSnapshot.ts",
          "--input",
          input,
          "--output",
          output,
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        throw new Error(new TextDecoder().decode(result.stderr));
      }
      const index = await Bun.file(join(output, "index.json")).json() as {
        stats: { kept: number };
        shards: Array<{ language: string; count: number }>;
      };
      expect(index.stats.kept).toBe(2);
      expect(index.shards.map((shard) => [shard.language, shard.count])).toEqual([
        ["javascript", 1],
        ["typescript", 1],
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("analyze corpus typing difficulty CLI", () => {
  test("analyzes records from a corpus v4 directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-corpus-v4-analysis-"));
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const input = join(root, "input");
    const output = join(root, "report.json");
    try {
      writeCorpusDirectory(input);

      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "src/tools/analyzeCorpusTypingDifficulty.ts",
          "--input",
          input,
          "--output",
          output,
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        throw new Error(new TextDecoder().decode(result.stderr));
      }
      const report = await Bun.file(output).json() as {
        total_lines: number;
        parsed_records: number;
      };
      expect(report.total_lines).toBe(2);
      expect(report.parsed_records).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("build everyday word decomposition content CLI", () => {
  test("imports only explicit word splits from local TSV", async () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-word-decomposition-"));
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const input = join(root, "input.tsv");
    const output = join(root, "everyday_word_decomposition.json");
    try {
      writeFileSync(
        input,
        [
          "word\tparts\ttranslation_zh\tlevel\tsource_id",
          "information\tin for ma tion\t信息；资料\tcet4\tuser:book",
          "remember\tre mem ber\t记得\thigh_school\tuser:book",
          "",
        ].join("\n"),
      );

      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "src/tools/buildEverydayWordDecompositionContent.ts",
          "--input",
          input,
          "--output",
          output,
          "--source-id",
          "user:book",
          "--source-name",
          "User vocabulary book",
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        throw new Error(new TextDecoder().decode(result.stderr));
      }
      const corpus = await Bun.file(output).json() as {
        entries: Array<{ word: string; parts: string[]; source_id: string }>;
      };
      expect(corpus.entries.map(({ word, parts, source_id }) => ({
        word,
        parts,
        source_id,
      }))).toEqual([
        { word: "remember", parts: ["re", "mem", "ber"], source_id: "user:book" },
        {
          word: "information",
          parts: ["in", "for", "ma", "tion"],
          source_id: "user:book",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects records without explicit parts", () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-word-decomposition-invalid-"));
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const input = join(root, "input.json");
    const output = join(root, "everyday_word_decomposition.json");
    try {
      writeFileSync(
        input,
        JSON.stringify([
          {
            word: "information",
            translation_zh: "信息；资料",
            level: "cet4",
            source_id: "user:book",
          },
        ]),
      );

      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "src/tools/buildEverydayWordDecompositionContent.ts",
          "--input",
          input,
          "--output",
          output,
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(result.exitCode).not.toBe(0);
      expect(new TextDecoder().decode(result.stderr)).toContain("missing explicit parts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects inferred or generated split sources", () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-word-decomposition-generated-"));
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const input = join(root, "input.json");
    const output = join(root, "everyday_word_decomposition.json");
    try {
      writeFileSync(
        input,
        JSON.stringify({
          sources: [
            {
              source_id: "llm:auto-split",
              source_name: "Generated splits",
              source_url: "file://generated",
              license: "private",
              retrieved_at: "2026-06-10",
              generation_script: "infer-syllables.ts",
              included_fields: ["word", "parts", "translation_zh", "level", "source_id"],
              notes: "Generated by a heuristic splitter.",
            },
          ],
          entries: [
            {
              word: "information",
              parts: ["in", "for", "ma", "tion"],
              translation_zh: "信息；资料",
              level: "cet4",
              source_id: "llm:auto-split",
            },
          ],
        }),
      );

      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "src/tools/buildEverydayWordDecompositionContent.ts",
          "--input",
          input,
          "--output",
          output,
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(result.exitCode).not.toBe(0);
      expect(new TextDecoder().decode(result.stderr)).toContain("explicit human-authored source");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("build everyday words content CLI", () => {
  test("joins MonkeyType word order with dictionary translations", async () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-everyday-words-"));
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const words = join(root, "words.json");
    const dictionary = join(root, "ecdict.csv");
    const output = join(root, "everyday_words.json");
    try {
      writeFileSync(
        words,
        JSON.stringify({ name: "english_test", words: ["The", "people", "missing"] }),
      );
      writeFileSync(
        dictionary,
        [
          "word,phonetic,definition,translation",
          "the,,,这个；那个",
          "people,,,人们",
          "",
        ].join("\n"),
      );

      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "src/tools/buildEverydayWordsContent.ts",
          "--words-source",
          words,
          "--dictionary-source",
          dictionary,
          "--output",
          output,
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        throw new Error(new TextDecoder().decode(result.stderr));
      }
      const corpus = await Bun.file(output).json() as {
        entries: Array<{ word: string; rank: number; translation_zh: string }>;
      };
      expect(corpus.entries.map(({ word, rank, translation_zh }) => ({
        word,
        rank,
        translation_zh,
      }))).toEqual([
        { word: "the", rank: 1, translation_zh: "这个；那个" },
        { word: "people", rank: 2, translation_zh: "人们" },
      ]);
      expect(new TextDecoder().decode(result.stdout)).toContain("missing translations 1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("build everyday reading content CLI", () => {
  test("writes sourced sentence and article corpora", async () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-everyday-reading-"));
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const seed = join(root, "everyday_reading_seed.json");
    const sentences = join(root, "everyday_sentences.json");
    const articles = join(root, "everyday_articles.json");
    try {
      writeFileSync(seed, `${JSON.stringify(readingSeedFixture(), null, 2)}\n`);

      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "src/tools/buildEverydayReadingContent.ts",
          "--seed",
          seed,
          "--sentences-output",
          sentences,
          "--articles-output",
          articles,
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        throw new Error(new TextDecoder().decode(result.stderr));
      }
      const sentenceCorpus = await Bun.file(sentences).json() as {
        sources: Array<{ source_id: string; license: string }>;
        entries: Array<{
          text: string;
          translation_zh: string;
          source_id: string;
          length: "short" | "medium" | "long";
        }>;
      };
      const articleCorpus = await Bun.file(articles).json() as {
        sources: Array<{ source_id: string; license: string }>;
        entries: Array<{
          title: string;
          level: string;
          length: "short" | "medium" | "long";
          paragraphs: Array<{ text: string; translation_zh: string }>;
        }>;
      };

      expect(sentenceCorpus.entries.length).toBeGreaterThanOrEqual(1);
      expect(articleCorpus.entries).toHaveLength(1);
      expect(sentenceCorpus.sources.map((source) => source.source_id)).toEqual([
        "gutenberg:test-reading",
      ]);
      expect(articleCorpus.sources.map((source) => source.license)).toContain(
        "Public domain in the USA",
      );
      expect(sentenceCorpus.entries.map((entry) => entry.text)).toContain(
        "Every morning, the small team shares notes before work begins.",
      );
      expect(sentenceCorpus.entries.every((entry) => entry.translation_zh.trim().length > 0)).toBe(
        true,
      );
      expect(
        sentenceCorpus.entries.every((entry) => {
          const [min, max] = readingSentenceWordRange(entry.length);
          const count = readingWordCount(entry.text);
          return count >= min && count <= max;
        }),
      ).toBe(true);
      expect(
        articleCorpus.entries.every((entry) =>
          entry.paragraphs.every((paragraph) => paragraph.translation_zh.trim().length > 0),
        ),
      ).toBe(true);
      expect(
        articleCorpus.entries.every((entry) => {
          const articleText = entry.paragraphs.map((paragraph) => paragraph.text).join(" ");
          const [min, max] = readingArticleWordRange(entry.length);
          const count = readingWordCount(articleText);
          return (
            count >= min &&
            count <= max &&
            readingSentenceCount(articleText) >= 2
          );
        }),
      ).toBe(true);
      expect(articleCorpus.entries[0]?.level).toBe("high_school");
      expect(articleCorpus.entries[0]?.length).toBe("short");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("build Moby word decomposition content CLI", () => {
  test("builds translated explicit splits from Moby hyphenation data", async () => {
    const root = mkdtempSync(join(tmpdir(), "keyloop-moby-decomposition-"));
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const hyphenation = join(root, "mhyph.txt");
    const words = join(root, "everyday_words.json");
    const output = join(root, "everyday_word_decomposition.json");
    try {
      writeFileSync(
        hyphenation,
        Buffer.from(["in\xa5for\xa5ma\xa5tion", "peo\xa5ple", "single", ""].join("\r\n"), "latin1"),
      );
      writeFileSync(
        words,
        JSON.stringify({
          sources: [
            {
              source_id: "monkeytype:english_10k+ecdict",
              source_name: "Test translated words",
              source_url: "file://words",
              license: "test",
              retrieved_at: "2026-06-10",
              generation_script: "test",
              included_fields: ["word"],
              notes: "test",
            },
          ],
          entries: [
            {
              word: "information",
              rank: 2,
              range: "1000",
              level: "cet4",
              translation_zh: "信息；资料",
              source_id: "test",
            },
            {
              word: "people",
              rank: 1,
              range: "200",
              level: "high_school",
              translation_zh: "人们",
              source_id: "test",
            },
          ],
        }),
      );

      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "src/tools/buildEverydayWordDecompositionFromMoby.ts",
          "--hyphenation-source",
          hyphenation,
          "--words-corpus",
          words,
          "--output",
          output,
          "--limit",
          "10",
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        throw new Error(new TextDecoder().decode(result.stderr));
      }
      const corpus = await Bun.file(output).json() as {
        entries: Array<{ word: string; parts: string[]; translation_zh: string }>;
      };
      expect(corpus.entries.map(({ word, parts, translation_zh }) => ({
        word,
        parts,
        translation_zh,
      }))).toEqual([
        { word: "people", parts: ["peo", "ple"], translation_zh: "人们" },
        {
          word: "information",
          parts: ["in", "for", "ma", "tion"],
          translation_zh: "信息；资料",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function readingSeedFixture() {
  return {
    sources: [
      {
        source_id: "gutenberg:test-reading",
        source_name: "Project Gutenberg: Test Reading Fixture",
        source_url: "https://www.gutenberg.org/",
        license: "Public domain in the USA",
        retrieved_at: "2026-06-12",
        generation_script: "tests/buildCodeCorpusSnapshotCli.test.ts",
        included_fields: [
          "text",
          "translation_zh",
          "level",
          "length",
          "source_id",
          "source_title",
          "paragraphs",
        ],
        notes: "Small deterministic fixture for the reading content CLI.",
      },
    ],
    sentences: [
      {
        text: "Every morning, the small team shares notes before work begins.",
        translation_zh: "每天早上，这个小团队都会在工作开始前分享笔记。",
        level: "high_school",
        source_id: "gutenberg:test-reading",
        source_title: "Test Reading Fixture",
      },
    ],
    articles: [
      {
        title: "A Simple Team Plan",
        level: "high_school",
        length: "short",
        source_id: "gutenberg:test-reading",
        paragraphs: [
          {
            sentences: [
              {
                text: "The team met early to plan the week before customers arrived.",
                translation_zh: "团队很早开会，在客户到来前规划这一周。",
              },
              {
                text: "Each person named one risk and one small action for today.",
                translation_zh: "每个人都说出一个风险和今天的一个小行动。",
              },
              {
                text: "After lunch, they checked the notes and updated the shared board.",
                translation_zh: "午饭后，他们检查笔记并更新共享看板。",
              },
              {
                text: "The manager asked clear questions so every quiet issue became visible.",
                translation_zh: "经理提出清楚的问题，让每个隐藏的问题都被看见。",
              },
              {
                text: "By evening, the group had finished the report without rushing.",
                translation_zh: "到晚上，小组已经不慌不忙地完成了报告。",
              },
              {
                text: "They saved the draft, reviewed the numbers, and sent it.",
                translation_zh: "他们保存草稿，复核数字，然后发送出去。",
              },
              {
                text: "The next morning, everyone understood why the simple plan worked.",
                translation_zh: "第二天早上，大家都明白这个简单计划为什么有效。",
              },
              {
                text: "Good habits made the work easier when new problems appeared.",
                translation_zh: "当新问题出现时，良好的习惯让工作更轻松。",
              },
            ],
          },
        ],
      },
    ],
  };
}

function writeCorpusDirectory(input: string): void {
  mkdirSync(join(input, "typescript"), { recursive: true });
  mkdirSync(join(input, "javascript"), { recursive: true });
  writeFileSync(
    join(input, "typescript", "repo-a.jsonl"),
    `${JSON.stringify(corpusRecord("typescript-a", "TypeScript", "typescript", 1))}\n`,
  );
  writeFileSync(
    join(input, "javascript", "repo-b.jsonl"),
    `${JSON.stringify(corpusRecord("javascript-b", "JavaScript", "javascript", 2))}\n`,
  );
}

function corpusRecord(
  id: string,
  language: string,
  framework: string,
  index: number,
) {
  const text = [
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
  return {
    id,
    repo: `owner/${framework}`,
    technology_domain: framework,
    language,
    framework,
    level: "function",
    size: "short",
    text,
  };
}

function readingWordCount(text: string): number {
  return text.trim().split(/\s+/u).filter((word) => /[A-Za-z0-9]/u.test(word)).length;
}

function readingSentenceCount(text: string): number {
  return text.split(/[.!?]+(?:\s+|$)/u).filter((sentence) => sentence.trim().length > 0).length;
}

function readingSentenceWordRange(length: "short" | "medium" | "long"): [number, number] {
  switch (length) {
    case "short":
      return [6, 12];
    case "medium":
      return [13, 22];
    case "long":
      return [23, 35];
  }
}

function readingArticleWordRange(length: "short" | "medium" | "long"): [number, number] {
  switch (length) {
    case "short":
      return [80, 140];
    case "medium":
      return [180, 280];
    case "long":
      return [380, 600];
  }
}
