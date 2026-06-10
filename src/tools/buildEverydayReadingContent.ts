import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  EverydayArticlesCorpus,
  EverydayCorpusSource,
  EverydaySentenceEntry,
  EverydaySentencesCorpus,
  EverydayWordsCorpus,
} from "../content/library";
import {
  buildReadingVocabularyProfile,
  passesReadingVocabularyLevel,
  type ReadingVocabularyProfile,
} from "../content/readingVocabulary";
import {
  readingArticleTextQualityIssues,
  readingSentenceQualityIssues,
} from "../content/readingTextQuality";
import type { EverydayLevel, EverydaySentenceLength } from "../domain/model";

type ReadingLength = Exclude<EverydaySentenceLength, "mixed">;

const defaultSentencesOutput = "contents/everyday_sentences.json";
const defaultArticlesOutput = "contents/everyday_articles.json";
const defaultSeedPath = fileURLToPath(
  new URL("../../contents/everyday_reading_seed.json", import.meta.url),
);
const defaultEverydayWordsPath = fileURLToPath(
  new URL("../../contents/everyday_words.json", import.meta.url),
);

const sentenceRanges: Record<ReadingLength, readonly [number, number]> = {
  short: [6, 12],
  medium: [13, 22],
  long: [23, 35],
};

const articleRanges: Record<ReadingLength, readonly [number, number]> = {
  short: [80, 140],
  medium: [180, 280],
  long: [380, 600],
};

const sentenceTargetPerCell = 100;
const articleTargetPerCell = 50;

interface ReadingSeed {
  sources: EverydayCorpusSource[];
  sentences?: ReadingStandaloneSentenceSeed[];
  articles: ReadingArticleSeed[];
}

interface ReadingArticleSeed {
  title: string;
  level: EverydayLevel;
  length: ReadingLength;
  source_id: string;
  paragraphs: ReadingParagraphSeed[];
}

interface ReadingParagraphSeed {
  sentences: ReadingSentenceSeed[];
}

interface ReadingSentenceSeed {
  text: string;
  translation_zh: string;
}

interface ReadingStandaloneSentenceSeed extends ReadingSentenceSeed {
  level: EverydayLevel;
  source_id: string;
  source_title: string;
}

async function main(): Promise<void> {
  const sentencesOutput = resolve(optionValue("--sentences-output") ?? defaultSentencesOutput);
  const articlesOutput = resolve(optionValue("--articles-output") ?? defaultArticlesOutput);
  const seedPath = resolve(optionValue("--seed") ?? defaultSeedPath);
  const everydayWordsPath = resolve(optionValue("--everyday-words") ?? defaultEverydayWordsPath);
  const seed = await loadReadingSeed(seedPath);
  const vocabulary = await loadReadingVocabulary(everydayWordsPath);
  const sentencesCorpus = buildEverydaySentencesCorpus(seed, vocabulary);
  const articlesCorpus = buildEverydayArticlesCorpus(seed);

  await mkdir(dirname(sentencesOutput), { recursive: true });
  await mkdir(dirname(articlesOutput), { recursive: true });
  await writeFile(sentencesOutput, `${JSON.stringify(sentencesCorpus, null, 2)}\n`);
  await writeFile(articlesOutput, `${JSON.stringify(articlesCorpus, null, 2)}\n`);
  console.log(
    [
      `Sentences: ${sentencesCorpus.entries.length}`,
      `Articles: ${articlesCorpus.entries.length}`,
      `Output: ${sentencesOutput}`,
      `Output: ${articlesOutput}`,
    ].join(" | "),
  );
}

export async function loadReadingSeed(path = defaultSeedPath): Promise<ReadingSeed> {
  return JSON.parse(await readFile(path, "utf8")) as ReadingSeed;
}

export async function loadReadingVocabulary(
  path = defaultEverydayWordsPath,
): Promise<ReadingVocabularyProfile> {
  const corpus = JSON.parse(await readFile(path, "utf8")) as EverydayWordsCorpus;
  return buildReadingVocabularyProfile(corpus.entries);
}

export function buildEverydaySentencesCorpus(
  seed: ReadingSeed,
  vocabulary: ReadingVocabularyProfile,
): EverydaySentencesCorpus {
  validateSources(seed.sources);
  const entries = deriveSentences(seed, vocabulary);
  validateSentences(seed.sources, entries);
  return {
    sources: seed.sources,
    entries,
  };
}

export function buildEverydayArticlesCorpus(seed: ReadingSeed): EverydayArticlesCorpus {
  validateSources(seed.sources);
  const entries = limitEntriesByCell(seed.articles, articleTargetPerCell).map((article) => ({
    title: article.title,
    level: article.level,
    length: article.length,
    source_id: article.source_id,
    paragraphs: article.paragraphs.map((paragraph) => ({
      text: paragraph.sentences.map((sentence) => sentence.text.trim()).join(" "),
      translation_zh: paragraph.sentences
        .map((sentence) => sentence.translation_zh.trim())
        .join(""),
    })),
  }));
  validateArticles(seed.sources, entries);
  return {
    sources: seed.sources,
    entries,
  };
}

function deriveSentences(
  seed: ReadingSeed,
  vocabulary: ReadingVocabularyProfile,
): EverydaySentenceEntry[] {
  const entries: EverydaySentenceEntry[] = [];
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const sentence of seed.sentences ?? []) {
    appendSentenceEntry({
      entries,
      seen,
      text: sentence.text,
      translation_zh: sentence.translation_zh,
      level: sentence.level,
      source_id: sentence.source_id,
      source_title: sentence.source_title,
      vocabulary,
      enforceVocabularyLevel: false,
      counts,
    });
  }
  for (const article of seed.articles) {
    for (const paragraph of article.paragraphs) {
      for (const sentence of paragraph.sentences) {
        appendSentenceEntry({
          entries,
          seen,
          text: sentence.text,
          translation_zh: sentence.translation_zh,
          level: article.level,
          source_id: article.source_id,
          source_title: article.title,
          vocabulary,
          enforceVocabularyLevel: true,
          counts,
        });
      }
    }
  }
  return entries;
}

function appendSentenceEntry(options: {
  entries: EverydaySentenceEntry[];
  seen: Set<string>;
  text: string;
  translation_zh: string;
  level: EverydayLevel;
  source_id: string;
  source_title: string;
  vocabulary: ReadingVocabularyProfile;
  enforceVocabularyLevel: boolean;
  counts: Map<string, number>;
}): void {
  const length = sentenceLengthForWordCount(readingWordCount(options.text));
  const text = options.text.trim();
  const seenKey = `${options.level}:${length}:${text}`;
  const cellKey = `${options.level}:${length}`;
  if (
    length === undefined ||
    options.seen.has(seenKey) ||
    (options.counts.get(cellKey) ?? 0) >= sentenceTargetPerCell ||
    readingSentenceQualityIssues(text).length > 0 ||
    (
      options.enforceVocabularyLevel &&
      !passesReadingVocabularyLevel(text, options.level, options.vocabulary)
    )
  ) {
    return;
  }
  options.seen.add(seenKey);
  options.counts.set(cellKey, (options.counts.get(cellKey) ?? 0) + 1);
  options.entries.push({
    text,
    translation_zh: options.translation_zh.trim(),
    level: options.level,
    length,
    source_id: options.source_id,
    source_title: options.source_title,
  });
}

function limitEntriesByCell(
  articles: readonly ReadingArticleSeed[],
  limit: number,
): ReadingArticleSeed[] {
  const counts = new Map<string, number>();
  const selected: ReadingArticleSeed[] = [];
  for (const article of articles) {
    const key = `${article.level}:${article.length}`;
    if ((counts.get(key) ?? 0) >= limit) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
    selected.push(article);
  }
  return selected;
}

function sentenceLengthForWordCount(count: number): ReadingLength | undefined {
  for (const [length, [min, max]] of Object.entries(sentenceRanges)) {
    if (count >= min && count <= max) {
      return length as ReadingLength;
    }
  }
  return undefined;
}

function validateSources(sources: readonly EverydayCorpusSource[]): void {
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.source_id)) {
      throw new Error(`duplicate reading source: ${source.source_id}`);
    }
    seen.add(source.source_id);
    if (source.source_url.trim().length === 0 || source.license.trim().length === 0) {
      throw new Error(`invalid reading source metadata: ${source.source_id}`);
    }
  }
}

function validateSentences(
  sources: readonly EverydayCorpusSource[],
  entries: readonly EverydaySentenceEntry[],
): void {
  const sourceIds = new Set(sources.map((source) => source.source_id));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!sourceIds.has(entry.source_id)) {
      throw new Error(`unknown sentence source: ${entry.source_id}`);
    }
    if (entry.text.trim().length === 0 || entry.translation_zh.trim().length === 0) {
      throw new Error(`blank sentence text or translation: ${entry.text}`);
    }
    const qualityIssues = readingSentenceQualityIssues(entry.text);
    if (qualityIssues.length > 0) {
      throw new Error(`bad sentence quality ${qualityIssues.join(",")}: ${entry.text}`);
    }
    const seenKey = `${entry.level}:${entry.length}:${entry.text}`;
    if (seen.has(seenKey)) {
      throw new Error(`duplicate sentence text: ${seenKey}`);
    }
    seen.add(seenKey);
    const length = asReadingLength(entry.length, `sentence: ${entry.text}`);
    const [min, max] = sentenceRanges[length];
    const count = readingWordCount(entry.text);
    if (count < min || count > max) {
      throw new Error(`sentence length mismatch ${entry.length}: ${count} words: ${entry.text}`);
    }
  }
}

function validateArticles(
  sources: readonly EverydayCorpusSource[],
  entries: EverydayArticlesCorpus["entries"],
): void {
  const sourceIds = new Set(sources.map((source) => source.source_id));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!sourceIds.has(entry.source_id)) {
      throw new Error(`unknown article source: ${entry.source_id}`);
    }
    if (entry.title.trim().length === 0 || entry.paragraphs.length === 0) {
      throw new Error(`invalid article: ${entry.title}`);
    }
    const text = entry.paragraphs.map((paragraph) => paragraph.text).join(" ");
    const articleKey = `${entry.level}:${entry.length}:${normalizeTextKey(text)}`;
    if (seen.has(articleKey)) {
      throw new Error(`duplicate article title: ${articleKey}`);
    }
    seen.add(articleKey);
    const qualityIssues = readingArticleTextQualityIssues(text);
    if (qualityIssues.length > 0) {
      throw new Error(`bad article quality ${qualityIssues.join(",")}: ${entry.title}`);
    }
    const length = asReadingLength(entry.length, `article: ${entry.title}`);
    const [min, max] = articleRanges[length];
    const wordCount = readingWordCount(text);
    if (wordCount < min || wordCount > max) {
      throw new Error(`article length mismatch ${entry.length}: ${wordCount} words: ${entry.title}`);
    }
    if (readingSentenceCount(text) < 2) {
      throw new Error(`article has too few sentences: ${entry.title}`);
    }
    for (const paragraph of entry.paragraphs) {
      if (paragraph.text.trim().length === 0 || paragraph.translation_zh.trim().length === 0) {
        throw new Error(`blank article paragraph: ${entry.title}`);
      }
    }
  }
}

function readingWordCount(text: string): number {
  return text.trim().split(/\s+/u).filter((word) => /[A-Za-z0-9]/u.test(word)).length;
}

function normalizeTextKey(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}

function asReadingLength(length: EverydaySentenceLength, label: string): ReadingLength {
  if (length === "mixed") {
    throw new Error(`daily reading content must not use mixed length: ${label}`);
  }
  return length;
}

function readingSentenceCount(text: string): number {
  return text.split(/[.!?]+(?:\s+|$)/u).filter((sentence) => sentence.trim().length > 0).length;
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

if (import.meta.main) {
  await main();
}
