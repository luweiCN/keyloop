import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EverydayCorpusSource } from "../content/library";
import { readingLevelOrder } from "../content/readingVocabulary";
import type { EverydayLevel, EverydaySentenceLength } from "../domain/model";

type ReadingLength = Exclude<EverydaySentenceLength, "mixed">;

interface CandidateCorpus {
  sources: EverydayCorpusSource[];
  sentences: CandidateSentence[];
  articles: CandidateArticle[];
}

interface CandidateSentence {
  text: string;
  text_hash: string;
  level: EverydayLevel;
  length: ReadingLength;
  source_id: string;
  source_title: string;
  source_url: string;
  word_count: number;
}

interface CandidateArticle {
  title: string;
  text_hash: string;
  level: EverydayLevel;
  length: ReadingLength;
  source_id: string;
  source_title: string;
  source_url: string;
  paragraphs: string[];
  word_count: number;
}

interface TranslatedBatch {
  level: EverydayLevel;
  sources: EverydayCorpusSource[];
  sentences: Array<CandidateSentence & { translation_zh?: string; reject_reason?: string }>;
  articles: Array<{
    title: string;
    text_hash: string;
    level: EverydayLevel;
    length: ReadingLength;
    source_id: string;
    source_title: string;
    source_url: string;
    paragraphs: Array<{ text: string; translation_zh?: string; reject_reason?: string }>;
    reject_reason?: string;
  }>;
}

interface SupplementBatch {
  instructions: string[];
  sources: EverydayCorpusSource[];
  sentences: SupplementSentence[];
  articles: SupplementArticle[];
}

interface SupplementSentence extends CandidateSentence {
  id: string;
  translation_zh: "";
}

interface SupplementArticle extends Omit<CandidateArticle, "paragraphs"> {
  id: string;
  paragraphs: Array<{ id: string; text: string; translation_zh: "" }>;
}

const defaultCandidatesPath = fileURLToPath(
  new URL("../../content/everyday_reading_candidates.json", import.meta.url),
);
const defaultTranslatedDir = fileURLToPath(
  new URL("../../content/everyday_reading_translated", import.meta.url),
);
const defaultOutputPath = fileURLToPath(
  new URL("../../content/everyday_reading_translation_batches/supplement.json", import.meta.url),
);

const targetSentencesPerCell = 100;
const targetArticlesPerCell = 50;
const sentenceBuffer = 8;
const articleBuffer = 12;
const readingLengthOrder: ReadingLength[] = ["short", "medium", "long"];

async function main(): Promise<void> {
  const candidatesPath = resolve(optionValue("--candidates") ?? defaultCandidatesPath);
  const translatedDir = resolve(optionValue("--translated-dir") ?? defaultTranslatedDir);
  const outputPath = resolve(optionValue("--output") ?? defaultOutputPath);
  const candidates = JSON.parse(await readFile(candidatesPath, "utf8")) as CandidateCorpus;
  const translated = await loadTranslatedBatches(translatedDir, optionValue("--existing-supplement"));
  const batch = buildSupplementBatch(candidates, translated);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(batch, null, 2)}\n`);
  console.log(
    [
      `Sentences: ${batch.sentences.length}`,
      `Articles: ${batch.articles.length}`,
      `Output: ${outputPath}`,
    ].join(" | "),
  );
}

function buildSupplementBatch(
  candidates: CandidateCorpus,
  translated: readonly TranslatedBatch[],
): SupplementBatch {
  const current = currentTranslatedState(translated);
  const sentences = selectSupplementSentences(candidates, current);
  const articles = selectSupplementArticles(candidates, current);
  const sourceIds = new Set([
    ...sentences.map((sentence) => sentence.source_id),
    ...articles.map((article) => article.source_id),
  ]);
  return {
    instructions: [
      "Translate every English text into concise, natural Simplified Chinese.",
      "This is a supplemental batch. Keep ids and English source text unchanged.",
      "If a text is clipped, incoherent, or source boilerplate, leave translation_zh blank and add reject_reason.",
      "Return the same JSON shape.",
    ],
    sources: candidates.sources.filter((source) => sourceIds.has(source.source_id)),
    sentences,
    articles,
  };
}

function selectSupplementSentences(
  candidates: CandidateCorpus,
  current: CurrentTranslatedState,
): SupplementSentence[] {
  const selected: SupplementSentence[] = [];
  for (const level of readingLevelOrder) {
    for (const length of readingLengthOrder) {
      const key = `${level}:${length}`;
      const accepted = current.acceptedSentences.get(key) ?? 0;
      const needed = Math.max(0, targetSentencesPerCell - accepted);
      if (needed === 0) {
        continue;
      }
      const seen = current.seenSentenceHashes.get(key) ?? new Set<string>();
      const extras = candidates.sentences
        .filter((sentence) =>
          sentence.level === level &&
          sentence.length === length &&
          !seen.has(sentence.text_hash),
        )
        .slice(0, needed + sentenceBuffer);
      selected.push(
        ...extras.map((sentence, index) => ({
          ...sentence,
          id: `supplement:sentence:${key}:${index + 1}:${sentence.text_hash}`,
          translation_zh: "" as const,
        })),
      );
    }
  }
  return selected;
}

function selectSupplementArticles(
  candidates: CandidateCorpus,
  current: CurrentTranslatedState,
): SupplementArticle[] {
  const selected: SupplementArticle[] = [];
  for (const level of readingLevelOrder) {
    for (const length of readingLengthOrder) {
      const key = `${level}:${length}`;
      const accepted = current.acceptedArticles.get(key) ?? 0;
      const needed = Math.max(0, targetArticlesPerCell - accepted);
      if (needed === 0) {
        continue;
      }
      const seen = current.seenArticleHashes.get(key) ?? new Set<string>();
      const extras = candidates.articles
        .filter((article) =>
          article.level === level &&
          article.length === length &&
          !seen.has(article.text_hash),
        )
        .slice(0, needed + articleBuffer);
      selected.push(
        ...extras.map((article, index) => ({
          ...article,
          id: `supplement:article:${key}:${index + 1}:${article.text_hash}`,
          paragraphs: article.paragraphs.map((paragraph, paragraphIndex) => ({
            id: `supplement:article:${key}:${index + 1}:${article.text_hash}:p${paragraphIndex + 1}`,
            text: paragraph,
            translation_zh: "" as const,
          })),
        })),
      );
    }
  }
  return selected;
}

interface CurrentTranslatedState {
  acceptedSentences: Map<string, number>;
  acceptedArticles: Map<string, number>;
  seenSentenceHashes: Map<string, Set<string>>;
  seenArticleHashes: Map<string, Set<string>>;
}

function currentTranslatedState(batches: readonly TranslatedBatch[]): CurrentTranslatedState {
  const acceptedSentences = new Map<string, number>();
  const acceptedArticles = new Map<string, number>();
  const seenSentenceHashes = new Map<string, Set<string>>();
  const seenArticleHashes = new Map<string, Set<string>>();
  for (const batch of batches) {
    for (const sentence of batch.sentences) {
      const key = `${sentence.level}:${sentence.length}`;
      addSeen(seenSentenceHashes, key, sentence.text_hash);
      if (sentence.reject_reason === undefined && (sentence.translation_zh ?? "").trim().length > 0) {
        acceptedSentences.set(key, (acceptedSentences.get(key) ?? 0) + 1);
      }
    }
    for (const article of batch.articles) {
      const key = `${article.level}:${article.length}`;
      addSeen(seenArticleHashes, key, article.text_hash);
      if (article.reject_reason !== undefined) {
        continue;
      }
      if (
        article.paragraphs.length > 0 &&
        article.paragraphs.every((paragraph) =>
          paragraph.reject_reason === undefined &&
          (paragraph.translation_zh ?? "").trim().length > 0,
        )
      ) {
        acceptedArticles.set(key, (acceptedArticles.get(key) ?? 0) + 1);
      }
    }
  }
  return { acceptedSentences, acceptedArticles, seenSentenceHashes, seenArticleHashes };
}

function addSeen(map: Map<string, Set<string>>, key: string, hash: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(hash);
  map.set(key, set);
}

async function loadTranslatedBatches(
  path: string,
  existingSupplementPath: string | undefined,
): Promise<TranslatedBatch[]> {
  const batches = await Promise.all(
    readingLevelOrder.map(async (level) =>
      JSON.parse(await readFile(`${path}/${level}.json`, "utf8")) as TranslatedBatch,
    ),
  );
  if (existingSupplementPath !== undefined) {
    batches.push(JSON.parse(await readFile(resolve(existingSupplementPath), "utf8")) as TranslatedBatch);
  }
  return batches;
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
