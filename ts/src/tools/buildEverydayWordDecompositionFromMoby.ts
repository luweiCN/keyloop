import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  EverydayCorpusSource,
  EverydayWordDecompositionCorpus,
  EverydayWordDecompositionEntry,
  EverydayWordsCorpus,
} from "../content/library";

const defaultHyphenationSource = "https://www.gutenberg.org/files/3204/files/mhyph.txt";
const defaultWordsCorpus = "ts/content/everyday_words.json";
const defaultOutput = "ts/content/everyday_word_decomposition.json";
const defaultLimit = 2000;

interface BuildMobyOptions {
  limit: number;
  retrievedAt: string;
}

interface BuildMobyResult {
  corpus: EverydayWordDecompositionCorpus;
  stats: {
    explicitSplits: number;
    matchedTranslations: number;
    kept: number;
  };
}

async function main(): Promise<void> {
  const hyphenationSource = optionValue("--hyphenation-source") ?? defaultHyphenationSource;
  const wordsCorpusPath = resolve(optionValue("--words-corpus") ?? defaultWordsCorpus);
  const output = resolve(optionValue("--output") ?? defaultOutput);
  const limit = numericOptionValue("--limit") ?? defaultLimit;
  const retrievedAt = optionValue("--retrieved-at") ?? new Date().toISOString().slice(0, 10);

  const hyphenationRaw = await readBinarySource(hyphenationSource);
  const wordsCorpus = JSON.parse(await readFile(wordsCorpusPath, "utf8")) as EverydayWordsCorpus;
  const result = buildEverydayWordDecompositionFromMoby(
    hyphenationRaw,
    wordsCorpus,
    { limit, retrievedAt },
  );

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result.corpus, null, 2)}\n`);
  console.log(
    [
      `Output: ${output}`,
      `explicit splits ${result.stats.explicitSplits}`,
      `matched translations ${result.stats.matchedTranslations}`,
      `kept ${result.stats.kept}`,
    ].join(" | "),
  );
}

export function buildEverydayWordDecompositionFromMoby(
  raw: Uint8Array,
  wordsCorpus: EverydayWordsCorpus,
  options: BuildMobyOptions,
): BuildMobyResult {
  const translated = new Map(
    wordsCorpus.entries.map((entry) => [entry.word.toLowerCase(), entry]),
  );
  const explicit = mobySplits(raw);
  const entries: EverydayWordDecompositionEntry[] = [];
  let matchedTranslations = 0;

  for (const split of explicit) {
    const wordEntry = translated.get(split.word);
    if (wordEntry === undefined) {
      continue;
    }
    matchedTranslations += 1;
    entries.push({
      word: split.word,
      parts: split.parts,
      translation_zh: wordEntry.translation_zh,
      level: wordEntry.level,
      source_id: "gutenberg:moby-hyphenation+ecdict",
    });
  }

  entries.sort((left, right) => {
    const leftRank = translated.get(left.word)?.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = translated.get(right.word)?.rank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.word.localeCompare(right.word);
  });

  return {
    corpus: {
      sources: [
        source(options.retrievedAt),
        ...wordsCorpus.sources.filter(
          (item) => item.source_id === "monkeytype:english_10k+ecdict",
        ),
      ],
      entries: entries.slice(0, options.limit),
    },
    stats: {
      explicitSplits: explicit.length,
      matchedTranslations,
      kept: Math.min(entries.length, options.limit),
    },
  };
}

function mobySplits(raw: Uint8Array): Array<{ word: string; parts: string[] }> {
  const text = Buffer.from(raw).toString("latin1");
  const splits: Array<{ word: string; parts: string[] }> = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.includes("\xa5")) {
      continue;
    }
    const parts = trimmed
      .split("\xa5")
      .map((part) => part.trim().toLowerCase());
    if (parts.length < 2 || !parts.every((part) => /^[a-z]+$/u.test(part))) {
      continue;
    }
    const word = parts.join("");
    if (word.length < 5 || seen.has(word)) {
      continue;
    }
    seen.add(word);
    splits.push({ word, parts });
  }
  return splits;
}

function source(retrievedAt: string): EverydayCorpusSource {
  return {
    source_id: "gutenberg:moby-hyphenation+ecdict",
    source_name: "Moby Hyphenation List with ECDICT translations",
    source_url: "https://www.gutenberg.org/ebooks/3204",
    license: "Public domain in the USA + CC-BY-SA-4.0 + MIT",
    retrieved_at: retrievedAt,
    generation_script: "ts/src/tools/buildEverydayWordDecompositionFromMoby.ts",
    included_fields: ["word", "parts", "translation_zh", "level", "source_id"],
    notes: "Word parts come from the explicit Moby Hyphenation List. The builder validates and filters; it does not infer or generate missing splits.",
  };
}

async function readBinarySource(pathOrUrl: string): Promise<Uint8Array> {
  if (/^https?:\/\//u.test(pathOrUrl)) {
    const response = await fetch(pathOrUrl);
    if (!response.ok) {
      throw new Error(`fetch failed ${response.status}: ${pathOrUrl}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return readFile(resolve(pathOrUrl));
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function numericOptionValue(name: string): number | undefined {
  const value = optionValue(name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

if (import.meta.main) {
  await main();
}
