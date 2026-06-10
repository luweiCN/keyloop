import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EverydayCorpusSource, EverydayWordsCorpus } from "../content/library";
import {
  buildReadingVocabularyProfile,
  passesReadingVocabularyLevel,
  readingVocabularyCoverage,
  type ReadingVocabularyProfile,
} from "../content/readingVocabulary";
import type { EverydayLevel, EverydaySentenceLength } from "../domain/model";

type ReadingLength = Exclude<EverydaySentenceLength, "mixed">;

interface SourcePlan {
  ebookId: number;
  title: string;
  level: EverydayLevel;
  length: ReadingLength;
  offset: number;
}

interface ReadingSeed {
  sources: EverydayCorpusSource[];
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

interface SourceText {
  ebookId: number;
  title: string;
  text: string;
}

const defaultOutput = fileURLToPath(
  new URL("../../content/everyday_reading_seed.json", import.meta.url),
);
const defaultEverydayWordsPath = fileURLToPath(
  new URL("../../content/everyday_words.json", import.meta.url),
);

const sourceCatalog = new Map<number, { title: string; levelHint: EverydayLevel }>([
  [19994, { title: "The Aesop for Children", levelHint: "high_school" }],
  [11, { title: "Alice's Adventures in Wonderland", levelHint: "high_school" }],
  [113, { title: "The Secret Garden", levelHint: "high_school" }],
  [45, { title: "Anne of Green Gables", levelHint: "cet4" }],
  [514, { title: "Little Women", levelHint: "cet4" }],
  [103, { title: "Around the World in Eighty Days", levelHint: "cet4" }],
  [120, { title: "Treasure Island", levelHint: "cet4" }],
  [1661, { title: "The Adventures of Sherlock Holmes", levelHint: "cet6" }],
  [1342, { title: "Pride and Prejudice", levelHint: "cet6" }],
  [35, { title: "The Time Machine", levelHint: "cet6" }],
  [76, { title: "Adventures of Huckleberry Finn", levelHint: "cet6" }],
  [1404, { title: "The Federalist Papers", levelHint: "postgraduate" }],
  [2680, { title: "Meditations", levelHint: "postgraduate" }],
  [1228, { title: "On the Origin of Species", levelHint: "postgraduate" }],
  [16792, { title: "Scientific American Supplement, No. 508", levelHint: "toefl_ielts" }],
]);

const plans: SourcePlan[] = [
  { ebookId: 19994, title: "Aesop Passage A", level: "high_school", length: "short", offset: 0 },
  { ebookId: 11, title: "Alice Passage A", level: "high_school", length: "short", offset: 4 },
  { ebookId: 11, title: "Alice Passage B", level: "high_school", length: "medium", offset: 10 },
  { ebookId: 113, title: "Secret Garden Passage A", level: "high_school", length: "medium", offset: 16 },
  { ebookId: 113, title: "Secret Garden Passage B", level: "high_school", length: "long", offset: 22 },
  { ebookId: 45, title: "Anne Passage A", level: "high_school", length: "long", offset: 28 },

  { ebookId: 514, title: "Little Women Passage A", level: "cet4", length: "short", offset: 2 },
  { ebookId: 103, title: "Around the World Passage A", level: "cet4", length: "short", offset: 8 },
  { ebookId: 45, title: "Anne Passage B", level: "cet4", length: "medium", offset: 18 },
  { ebookId: 514, title: "Little Women Passage B", level: "cet4", length: "medium", offset: 24 },
  { ebookId: 103, title: "Around the World Passage B", level: "cet4", length: "long", offset: 30 },
  { ebookId: 120, title: "Treasure Island Passage A", level: "cet4", length: "long", offset: 36 },

  { ebookId: 1661, title: "Sherlock Passage A", level: "cet6", length: "short", offset: 4 },
  { ebookId: 1342, title: "Pride and Prejudice Passage A", level: "cet6", length: "short", offset: 12 },
  { ebookId: 1661, title: "Sherlock Passage B", level: "cet6", length: "medium", offset: 20 },
  { ebookId: 1342, title: "Pride and Prejudice Passage B", level: "cet6", length: "medium", offset: 28 },
  { ebookId: 35, title: "Time Machine Passage A", level: "cet6", length: "long", offset: 34 },
  { ebookId: 76, title: "Huckleberry Finn Passage A", level: "cet6", length: "long", offset: 40 },

  { ebookId: 1404, title: "Federalist Passage A", level: "postgraduate", length: "short", offset: 5 },
  { ebookId: 2680, title: "Meditations Passage A", level: "postgraduate", length: "short", offset: 15 },
  { ebookId: 1404, title: "Federalist Passage B", level: "postgraduate", length: "medium", offset: 25 },
  { ebookId: 2680, title: "Meditations Passage B", level: "postgraduate", length: "medium", offset: 35 },
  { ebookId: 1228, title: "Origin of Species Passage A", level: "postgraduate", length: "long", offset: 45 },
  { ebookId: 1404, title: "Federalist Passage C", level: "postgraduate", length: "long", offset: 55 },

  { ebookId: 16792, title: "Scientific American Passage A", level: "toefl_ielts", length: "short", offset: 6 },
  { ebookId: 35, title: "Time Machine Passage B", level: "toefl_ielts", length: "short", offset: 16 },
  { ebookId: 16792, title: "Scientific American Passage B", level: "toefl_ielts", length: "medium", offset: 26 },
  { ebookId: 1228, title: "Origin of Species Passage B", level: "toefl_ielts", length: "medium", offset: 36 },
  { ebookId: 16792, title: "Scientific American Passage C", level: "toefl_ielts", length: "long", offset: 46 },
  { ebookId: 1228, title: "Origin of Species Passage C", level: "toefl_ielts", length: "long", offset: 56 },
];

const lengthRanges: Record<ReadingLength, readonly [number, number]> = {
  short: [90, 140],
  medium: [195, 280],
  long: [405, 600],
};

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function main(): Promise<void> {
  const output = resolve(optionValue("--output") ?? defaultOutput);
  const everydayWordsPath = resolve(optionValue("--everyday-words") ?? defaultEverydayWordsPath);
  const rawTexts = await loadSources();
  const vocabulary = await loadReadingVocabulary(everydayWordsPath);
  const articles: ReadingArticleSeed[] = [];

  for (const plan of plans) {
    console.log(`Collecting ${plan.level}/${plan.length}: ${plan.title}`);
    const source = rawTexts.get(plan.ebookId);
    if (source === undefined) {
      throw new Error(`missing downloaded source: ${plan.ebookId}`);
    }
    const article = await collectArticle(plan, source, vocabulary);
    articles.push(article);
  }

  const seed: ReadingSeed = {
    sources: [...new Set(plans.map((plan) => plan.ebookId))]
      .map((ebookId) => sourceForEbook(ebookId)),
    articles,
  };

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`Collected articles: ${seed.articles.length} | Output: ${output}`);
}

async function loadSources(): Promise<Map<number, SourceText>> {
  const sourceIds = [...new Set(plans.map((plan) => plan.ebookId))];
  const entries: Array<[number, SourceText]> = [];
  for (const ebookId of sourceIds) {
    const meta = sourceCatalog.get(ebookId);
    if (meta === undefined) {
      throw new Error(`unknown source metadata: ${ebookId}`);
    }
    console.log(`Fetching Project Gutenberg ${ebookId}: ${meta.title}`);
    const response = await fetch(gutenbergTextUrl(ebookId));
    if (!response.ok) {
      throw new Error(`fetch Gutenberg source ${ebookId} failed: ${response.status}`);
    }
    entries.push([ebookId, { ebookId, title: meta.title, text: await response.text() }]);
  }
  return new Map(entries);
}

async function loadReadingVocabulary(path: string): Promise<ReadingVocabularyProfile> {
  const corpus = JSON.parse(await readFile(path, "utf8")) as EverydayWordsCorpus;
  return buildReadingVocabularyProfile(corpus.entries);
}

async function collectArticle(
  plan: SourcePlan,
  source: SourceText,
  vocabulary: ReadingVocabularyProfile,
): Promise<ReadingArticleSeed> {
  const paragraphs = cleanParagraphs(source.text);
  const passage = choosePassage(paragraphs, plan, vocabulary);
  const articleParagraphs: ReadingParagraphSeed[] = [];
  for (const paragraph of passage) {
    const sentences = splitSentences(paragraph);
    const translated: ReadingSentenceSeed[] = [];
    for (const text of sentences) {
      translated.push({
        text,
        translation_zh: await translateToChinese(text),
      });
    }
    articleParagraphs.push({ sentences: translated });
  }
  return {
    title: `${source.title}: ${plan.title}`,
    level: plan.level,
    length: plan.length,
    source_id: sourceId(source.ebookId),
    paragraphs: articleParagraphs,
  };
}

function choosePassage(
  paragraphs: readonly string[],
  plan: SourcePlan,
  vocabulary: ReadingVocabularyProfile,
): string[] {
  const candidates: string[][] = [];
  const [min, max] = lengthRanges[plan.length];
  for (let start = 0; start < paragraphs.length; start += 1) {
    const selected: string[] = [];
    for (let index = start; index < paragraphs.length; index += 1) {
      const paragraph = paragraphs[index]!;
      selected.push(paragraph);
      const text = articleTextFromParagraphs(selected);
      const words = wordCount(text);
      if (words > max) {
        break;
      }
      if (
        words >= min &&
        sentenceCount(text) >= 3 &&
        passesReadingVocabularyLevel(text, plan.level, vocabulary)
      ) {
        candidates.push([...selected]);
      }
    }
  }
  if (candidates.length === 0) {
    throw new Error(`no ${plan.level}/${plan.length} passage found for ${plan.title}`);
  }
  const chosen = candidates[plan.offset % candidates.length]!;
  const coverage = readingVocabularyCoverage(chosen.join(" "), plan.level, vocabulary);
  console.log(
    `  vocabulary ${coverage.coverage.toFixed(2)}/${coverage.uniqueCoverage.toFixed(2)}`,
  );
  return chosen;
}

function articleTextFromParagraphs(paragraphs: readonly string[]): string {
  return paragraphs.flatMap((paragraph) => splitSentences(paragraph)).join(" ");
}

function cleanParagraphs(raw: string): string[] {
  const text = stripGutenbergBoilerplate(raw)
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
  return text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/gu, " ").replace(/\s+/gu, " ").trim())
    .filter(isUsefulParagraph);
}

function stripGutenbergBoilerplate(text: string): string {
  const startMatch = /\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK .+ \*\*\*/u.exec(text);
  const endMatch = /\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK .+ \*\*\*/u.exec(text);
  const startIndex =
    startMatch === null ? 0 : startMatch.index + startMatch[0].length;
  const endIndex = endMatch === null ? text.length : endMatch.index;
  return text.slice(startIndex, endIndex);
}

function isUsefulParagraph(paragraph: string): boolean {
  const words = wordCount(paragraph);
  if (words < 28 || words > 170) {
    return false;
  }
  if (sentenceCount(paragraph) < 2) {
    return false;
  }
  if (/[中国，。！？；：“”‘’（）【】]/u.test(paragraph)) {
    return false;
  }
  if (/project gutenberg|chapter|illustration|contents|footnote|copyright/iu.test(paragraph)) {
    return false;
  }
  if (/[_*#<>{}|\\]/u.test(paragraph)) {
    return false;
  }
  const letters = paragraph.match(/[A-Za-z]/gu)?.length ?? 0;
  if (letters < paragraph.length * 0.55) {
    return false;
  }
  const upperWords = paragraph.match(/\b[A-Z]{3,}\b/gu)?.length ?? 0;
  if (upperWords > 3) {
    return false;
  }
  return !hasAdjacentDuplicateWords(paragraph);
}

function splitSentences(paragraph: string): string[] {
  const protectedParagraph = protectSentenceAbbreviations(paragraph);
  return protectedParagraph
    .match(/[^.!?]+[.!?]+(?:["')\]]+)?/gu)
    ?.map((sentence) =>
      restoreSentenceAbbreviations(sentence).replace(/\s+/gu, " ").trim(),
    )
    .filter((sentence) => wordCount(sentence) > 0) ?? [];
}

function protectSentenceAbbreviations(text: string): string {
  return text.replace(
    /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|Capt|Col|Gen|Hon|Rev)\./gu,
    (abbreviation) => abbreviation.replace(".", "<DOT>"),
  );
}

function restoreSentenceAbbreviations(text: string): string {
  return text.replace(/<DOT>/gu, ".");
}

async function translateToChinese(text: string): Promise<string> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "zh-CN");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`translation failed: ${response.status}`);
  }
  const payload = await response.json() as Array<Array<Array<string>>>;
  const translated = payload[0]?.map((part) => part[0]).join("").trim();
  if (translated === undefined || translated.length === 0) {
    throw new Error(`blank translation: ${text}`);
  }
  await sleep(25);
  return translated;
}

function sourceForEbook(ebookId: number): EverydayCorpusSource {
  const source = sourceCatalog.get(ebookId);
  if (source === undefined) {
    throw new Error(`unknown source: ${ebookId}`);
  }
  return {
    source_id: sourceId(ebookId),
    source_name: `Project Gutenberg: ${source.title}`,
    source_url: gutenbergTextUrl(ebookId),
    license: "Public domain in the USA",
    retrieved_at: "2026-06-10",
    generation_script: "ts/src/tools/collectEverydayReadingSeed.ts",
    included_fields: [
      "text",
      "translation_zh",
      "level",
      "length",
      "source_id",
      "source_title",
      "paragraphs",
    ],
    notes:
      `English passages collected from Project Gutenberg public-domain text. ` +
      `Passages are filtered by length and cumulative vocabulary coverage ` +
      `against everyday_words.json. Chinese translations are machine generated ` +
      `after collection. Level hint: ${source.levelHint}.`,
  };
}

function sourceId(ebookId: number): string {
  return `gutenberg:${ebookId}`;
}

function gutenbergTextUrl(ebookId: number): string {
  return `https://www.gutenberg.org/cache/epub/${ebookId}/pg${ebookId}.txt`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter((word) => /[A-Za-z0-9]/u.test(word)).length;
}

function sentenceCount(text: string): number {
  return text.split(/[.!?]+(?:\s+|$)/u).filter((sentence) => sentence.trim().length > 0).length;
}

function hasAdjacentDuplicateWords(text: string): boolean {
  const words = text.match(/[A-Za-z]+/gu) ?? [];
  for (let index = 1; index < words.length; index += 1) {
    if (words[index - 1]!.toLowerCase() === words[index]!.toLowerCase()) {
      return true;
    }
  }
  return false;
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
