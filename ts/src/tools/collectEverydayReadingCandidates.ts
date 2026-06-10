import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EverydayCorpusSource, EverydayWordsCorpus } from "../content/library";
import {
  buildReadingVocabularyProfile,
  passesReadingVocabularyLevel,
  readingLevelOrder,
  type ReadingVocabularyProfile,
} from "../content/readingVocabulary";
import {
  isCompleteReadingArticleText,
  isCompleteReadingSentence,
} from "../content/readingTextQuality";
import type { EverydayLevel, EverydaySentenceLength } from "../domain/model";

type ReadingLength = Exclude<EverydaySentenceLength, "mixed">;

interface ReadingSourcePlan {
  source_kind: "gutenberg" | "wikinews" | "wikipedia";
  source_id: string;
  source_name: string;
  source_url: string;
  license: string;
  level_hint: EverydayLevel;
}

interface GutenbergSourcePlan extends ReadingSourcePlan {
  source_kind: "gutenberg";
  ebook_id: number;
}

interface WikinewsSourcePlan extends ReadingSourcePlan {
  source_kind: "wikinews";
}

interface WikipediaSourcePlan extends ReadingSourcePlan {
  source_kind: "wikipedia";
  api_url: string;
}

interface ReadingArticleCandidate {
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

interface ReadingSentenceCandidate {
  text: string;
  text_hash: string;
  level: EverydayLevel;
  length: ReadingLength;
  source_id: string;
  source_title: string;
  source_url: string;
  word_count: number;
}

interface ReadingCandidateCorpus {
  sources: EverydayCorpusSource[];
  sentences: ReadingSentenceCandidate[];
  articles: ReadingArticleCandidate[];
  stats: {
    sentence_target_per_cell: number;
    article_target_per_cell: number;
    sentence_counts: Record<string, number>;
    article_counts: Record<string, number>;
    missing_sentence_cells: string[];
    missing_article_cells: string[];
  };
}

interface TextSection {
  title: string;
  source_title: string;
  source_url: string;
  source: ReadingSourcePlan;
  paragraphs: string[];
}

const defaultOutput = fileURLToPath(
  new URL("../../content/everyday_reading_candidates.json", import.meta.url),
);
const defaultEverydayWordsPath = fileURLToPath(
  new URL("../../content/everyday_words.json", import.meta.url),
);

const sentenceTargetPerCell = 100;
const articleTargetPerCell = 50;

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

const wikinewsSource: WikinewsSourcePlan = {
  source_kind: "wikinews",
  source_id: "wikinews:en",
  source_name: "English Wikinews complete articles",
  source_url: "https://en.wikinews.org/",
  license: "Creative Commons Attribution 2.5",
  level_hint: "cet6",
};

const wikipediaSource: WikipediaSourcePlan = {
  source_kind: "wikipedia",
  api_url: "https://en.wikipedia.org/w/api.php",
  source_id: "wikipedia:en",
  source_name: "English Wikipedia article lead summaries",
  source_url: "https://en.wikipedia.org/",
  license: "Creative Commons Attribution-ShareAlike 4.0",
  level_hint: "cet6",
};

const gutenbergSources: GutenbergSourcePlan[] = [
  gutenberg(14640, "McGuffey's First Eclectic Reader", "high_school"),
  gutenberg(14668, "McGuffey's Second Eclectic Reader", "high_school"),
  gutenberg(14766, "McGuffey's Third Eclectic Reader", "high_school"),
  gutenberg(14880, "McGuffey's Fourth Eclectic Reader", "cet4"),
  gutenberg(15040, "McGuffey's Fifth Eclectic Reader", "cet6"),
  gutenberg(16751, "McGuffey's Sixth Eclectic Reader", "postgraduate"),
  gutenberg(1490, "The New McGuffey Fourth Reader", "cet6"),
  gutenberg(15825, "New National Fourth Reader", "cet6"),
  gutenberg(9078, "Sanders' Union Fourth Reader", "cet6"),
  gutenberg(9106, "The Ontario Readers: Third Book", "high_school"),
  gutenberg(18702, "The Ontario Readers: Fourth Book", "cet4"),
  gutenberg(15659, "The Ontario Readers: Fifth Book", "cet6"),
  gutenberg(18561, "The Ontario Readers: The High School Reader", "postgraduate"),
  gutenberg(19923, "The Ontario Readers: The High School Reader, 1886", "postgraduate"),
  gutenberg(22795, "The Ontario High School Reader", "toefl_ielts"),
  gutenberg(40369, "The Silent Readers: Sixth Reader", "toefl_ielts"),
  gutenberg(51975, "Fourth Reader: The Alexandra Readers", "postgraduate"),
  gutenberg(25545, "The Beacon Second Reader", "high_school"),
  gutenberg(19994, "The Aesop for Children", "high_school"),
  gutenberg(43336, "The Pig Brother, and Other Fables and Stories", "high_school"),
  gutenberg(6168, "Fifty Famous People", "cet4"),
  gutenberg(18442, "Fifty Famous Stories Retold", "cet4"),
  gutenberg(7439, "English Fairy Tales", "cet4"),
  gutenberg(14241, "The Blue Fairy Book", "cet4"),
  gutenberg(3152, "The Yellow Fairy Book", "cet6"),
  gutenberg(473, "Stories to Tell to Children", "high_school"),
  gutenberg(474, "How to Tell Stories to Children", "cet4"),
  gutenberg(55786, "For the Children's Hour", "high_school"),
  gutenberg(70702, "The Children's Hour, Volume 3", "cet4"),
  gutenberg(71774, "The Children's Hour, Volume 7", "cet6"),
  gutenberg(63067, "Stories from English History", "cet6"),
  gutenberg(1232, "The Prince", "postgraduate"),
  gutenberg(1404, "The Federalist Papers", "postgraduate"),
  gutenberg(16792, "Scientific American Supplement, No. 508", "toefl_ielts"),
  gutenberg(15051, "Scientific American Supplement, No. 829", "toefl_ielts"),
  gutenberg(11344, "Scientific American Supplement, No. 415", "toefl_ielts"),
  gutenberg(13399, "Scientific American Supplement, No. 530", "toefl_ielts"),
  gutenberg(13443, "Scientific American Supplement, No. 795", "toefl_ielts"),
  gutenberg(14041, "Scientific American Supplement, No. 470", "toefl_ielts"),
  gutenberg(11498, "Scientific American Supplement, No. 601", "toefl_ielts"),
  gutenberg(11662, "Scientific American Supplement, No. 598", "toefl_ielts"),
  gutenberg(17755, "Scientific American Supplement, No. 717", "toefl_ielts"),
  gutenberg(45938, "Appletons' Popular Science Monthly, August 1899", "toefl_ielts"),
  gutenberg(47183, "Appletons' Popular Science Monthly, April 1900", "toefl_ielts"),
  gutenberg(47238, "The Popular Science Monthly, July 1900", "toefl_ielts"),
  gutenberg(44880, "Appletons' Popular Science Monthly, May 1899", "toefl_ielts"),
  gutenberg(43391, "Appletons' Popular Science Monthly, December 1898", "toefl_ielts"),
  gutenberg(18477, "The Science of Human Nature", "toefl_ielts"),
  gutenberg(16643, "Essays by Ralph Waldo Emerson", "toefl_ielts"),
  gutenberg(10609, "The Story of Evolution", "toefl_ielts"),
  gutenberg(2801, "Essays of Michel de Montaigne", "postgraduate"),
  gutenberg(4363, "Beyond Good and Evil", "toefl_ielts"),
];

async function main(): Promise<void> {
  const output = resolve(optionValue("--output") ?? defaultOutput);
  const everydayWordsPath = resolve(optionValue("--everyday-words") ?? defaultEverydayWordsPath);
  const wikinewsPages = Number(optionValue("--wikinews-pages") ?? "900");
  const wikipediaPages = Number(optionValue("--wikipedia-pages") ?? "0");
  const vocabulary = await loadReadingVocabulary(everydayWordsPath);
  const sections = [
    ...await collectGutenbergSections(),
    ...await collectWikinewsSections(wikinewsPages),
    ...await collectWikipediaSections(wikipediaPages),
  ];
  const candidates = buildCandidateCorpus(sections, vocabulary);

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(candidates, null, 2)}\n`);
  console.log(
    [
      `Sentences: ${candidates.sentences.length}`,
      `Articles: ${candidates.articles.length}`,
      `Missing sentence cells: ${candidates.stats.missing_sentence_cells.length}`,
      `Missing article cells: ${candidates.stats.missing_article_cells.length}`,
      `Output: ${output}`,
    ].join(" | "),
  );
}

async function loadReadingVocabulary(path: string): Promise<ReadingVocabularyProfile> {
  const corpus = JSON.parse(await readFile(path, "utf8")) as EverydayWordsCorpus;
  return buildReadingVocabularyProfile(corpus.entries);
}

async function collectGutenbergSections(): Promise<TextSection[]> {
  const sections: TextSection[] = [];
  for (const source of gutenbergSources) {
    console.log(`Fetching Gutenberg ${source.ebook_id}: ${source.source_name}`);
    const raw = await requestText(gutenbergTextUrl(source.ebook_id));
    sections.push(...gutenbergSections(raw, source));
  }
  return sections;
}

async function collectWikipediaSections(maxPages: number): Promise<TextSection[]> {
  if (maxPages <= 0) {
    return [];
  }
  const sections: TextSection[] = [];
  const seenTitles = new Set<string>();
  while (seenTitles.size < maxPages) {
    console.log(`Fetching Wikipedia random extracts ${seenTitles.size + 1}-${Math.min(seenTitles.size + 50, maxPages)}`);
    let pages: Awaited<ReturnType<typeof wikipediaRandomExtracts>>;
    try {
      pages = await wikipediaRandomExtracts(Math.min(50, maxPages - seenTitles.size));
    } catch (error) {
      console.warn(`Skipping Wikipedia batch at ${seenTitles.size + 1}: ${error}`);
      const skippedFrom = seenTitles.size;
      for (let skipped = 0; skipped < 50 && seenTitles.size < maxPages; skipped += 1) {
        seenTitles.add(`skipped:${skippedFrom + skipped + 1}`);
      }
      await sleep(10_000);
      continue;
    }
    for (const page of pages) {
      if (seenTitles.has(page.title)) {
        continue;
      }
      seenTitles.add(page.title);
      const section = wikipediaSection(page);
      if (section !== undefined) {
        sections.push(section);
      }
    }
    await sleep(500);
  }
  return sections;
}

async function collectWikinewsSections(maxPages: number): Promise<TextSection[]> {
  const sections: TextSection[] = [];
  const titles = await wikinewsTitles(maxPages);
  const batchSize = 10;
  for (let index = 0; index < titles.length; index += batchSize) {
    const batch = titles.slice(index, index + batchSize);
    console.log(`Fetching Wikinews extracts ${index + 1}-${index + batch.length}`);
    let pages: Awaited<ReturnType<typeof wikinewsExtracts>>;
    try {
      pages = await wikinewsExtracts(batch);
    } catch (error) {
      console.warn(`Skipping Wikinews batch ${index + 1}-${index + batch.length}: ${error}`);
      await sleep(10_000);
      continue;
    }
    for (const page of pages) {
      const section = wikinewsSection(page);
      if (section !== undefined) {
        sections.push(section);
      }
    }
    await sleep(500);
  }
  return sections;
}

function buildCandidateCorpus(
  sections: readonly TextSection[],
  vocabulary: ReadingVocabularyProfile,
): ReadingCandidateCorpus {
  const sources = readingSources([...gutenbergSources, wikinewsSource, wikipediaSource]);
  const articles = selectByCell(
    sections.flatMap((section) => articleCandidate(section, vocabulary) ?? []),
    articleTargetPerCell,
  );
  const sentences = selectByCell(
    sections.flatMap((section) => sentenceCandidates(section, vocabulary)),
    sentenceTargetPerCell,
  );
  const articleCounts = cellCounts(articles);
  const sentenceCounts = cellCounts(sentences);
  return {
    sources,
    sentences,
    articles,
    stats: {
      sentence_target_per_cell: sentenceTargetPerCell,
      article_target_per_cell: articleTargetPerCell,
      sentence_counts: sentenceCounts,
      article_counts: articleCounts,
      missing_sentence_cells: missingCells(sentenceCounts, sentenceTargetPerCell),
      missing_article_cells: missingCells(articleCounts, articleTargetPerCell),
    },
  };
}

function articleCandidate(
  section: TextSection,
  vocabulary: ReadingVocabularyProfile,
): ReadingArticleCandidate[] {
  const paragraphs = section.paragraphs.map(cleanBodyText).filter((text) => text.length > 0);
  const text = paragraphs.join(" ");
  if (!isCompleteReadingArticleText(text)) {
    return [];
  }
  const length = lengthForWordCount(wordCount(text), articleRanges);
  if (length === undefined) {
    return [];
  }
  const levels = levelsForText(text, vocabulary);
  return levels.map((level) => ({
    title: section.title,
    text_hash: stableTextHash(text),
    level,
    length,
    source_id: section.source.source_id,
    source_title: section.source_title,
    source_url: section.source_url,
    paragraphs,
    word_count: wordCount(text),
  }));
}

function sentenceCandidates(
  section: TextSection,
  vocabulary: ReadingVocabularyProfile,
): ReadingSentenceCandidate[] {
  return splitSentences(section.paragraphs.join(" "))
    .flatMap((text) => {
      if (!isCompleteReadingSentence(text)) {
        return [];
      }
      const length = lengthForWordCount(wordCount(text), sentenceRanges);
      if (length === undefined) {
        return [];
      }
      return levelsForText(text, vocabulary).map((level) => ({
        text,
        text_hash: stableTextHash(text),
        level,
        length,
        source_id: section.source.source_id,
        source_title: section.source_title,
        source_url: section.source_url,
        word_count: wordCount(text),
      }));
    });
}

function levelsForText(
  text: string,
  vocabulary: ReadingVocabularyProfile,
): EverydayLevel[] {
  return readingLevelOrder.filter((level) =>
    passesReadingVocabularyLevel(text, level, vocabulary),
  );
}

function selectByCell<
  Candidate extends {
    text_hash: string;
    level: EverydayLevel;
    length: ReadingLength;
    word_count: number;
    source_title: string;
  },
>(candidates: Candidate[], targetPerCell: number): Candidate[] {
  const seenByCell = new Map<string, Set<string>>();
  const selected: Candidate[] = [];
  for (const candidate of candidates.sort(candidateSort)) {
    const key = `${candidate.level}:${candidate.length}`;
    const seen = seenByCell.get(key) ?? new Set<string>();
    seenByCell.set(key, seen);
    if (seen.has(candidate.text_hash) || selected.filter((item) => cellKey(item) === key).length >= targetPerCell) {
      continue;
    }
    seen.add(candidate.text_hash);
    selected.push(candidate);
  }
  return selected;
}

function candidateSort(
  left: { level: EverydayLevel; length: ReadingLength; word_count: number; source_title: string },
  right: { level: EverydayLevel; length: ReadingLength; word_count: number; source_title: string },
): number {
  return (
    readingLevelOrder.indexOf(left.level) - readingLevelOrder.indexOf(right.level) ||
    readingLengthOrder.indexOf(left.length) - readingLengthOrder.indexOf(right.length) ||
    left.word_count - right.word_count ||
    left.source_title.localeCompare(right.source_title)
  );
}

const readingLengthOrder: ReadingLength[] = ["short", "medium", "long"];

function cellCounts(items: readonly { level: EverydayLevel; length: ReadingLength }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[cellKey(item)] = (counts[cellKey(item)] ?? 0) + 1;
  }
  return counts;
}

function missingCells(counts: Record<string, number>, target: number): string[] {
  return readingLevelOrder.flatMap((level) =>
    readingLengthOrder
      .map((length) => `${level}:${length}`)
      .filter((key) => (counts[key] ?? 0) < target),
  );
}

function cellKey(item: { level: EverydayLevel; length: ReadingLength }): string {
  return `${item.level}:${item.length}`;
}

function gutenbergSections(raw: string, source: GutenbergSourcePlan): TextSection[] {
  const blocks = stripGutenbergBoilerplate(raw)
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/gu, "\"")
    .replace(/[‘’]/gu, "'")
    .split(/\n{2,}/u)
    .map((block) => cleanBodyText(block.replace(/\s*\n\s*/gu, " ")))
    .filter((block) => block.length > 0);
  const sections: TextSection[] = [];
  let title = source.source_name;
  let paragraphs: string[] = [];
  for (const block of blocks) {
    if (isSectionHeading(block)) {
      pushSection(sections, source, title, source.source_url, paragraphs);
      title = `${source.source_name}: ${block}`;
      paragraphs = [];
      continue;
    }
    if (wordCount(block) >= 18) {
      paragraphs.push(block);
    }
  }
  pushSection(sections, source, title, source.source_url, paragraphs);
  return sections;
}

function pushSection(
  sections: TextSection[],
  source: ReadingSourcePlan,
  title: string,
  sourceUrl: string,
  paragraphs: readonly string[],
): void {
  const useful = paragraphs.filter((paragraph) => wordCount(paragraph) >= 18);
  if (useful.length === 0) {
    return;
  }
  sections.push({
    title,
    source_title: title,
    source_url: sourceUrl,
    source,
    paragraphs: [...useful],
  });
}

async function wikinewsTitles(maxPages: number): Promise<string[]> {
  const titles: string[] = [];
  let apcontinue: string | undefined;
  while (titles.length < maxPages) {
    const url = new URL("https://en.wikinews.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("list", "allpages");
    url.searchParams.set("apnamespace", "0");
    url.searchParams.set("aplimit", "500");
    if (apcontinue !== undefined) {
      url.searchParams.set("apcontinue", apcontinue);
    }
    const payload = await requestJson(url.toString()) as {
      continue?: { apcontinue?: string };
      query?: { allpages?: Array<{ title: string }> };
    };
    titles.push(...(payload.query?.allpages ?? []).map((page) => page.title));
    apcontinue = payload.continue?.apcontinue;
    if (apcontinue === undefined) {
      break;
    }
  }
  return titles.slice(0, maxPages);
}

async function wikinewsExtracts(titles: readonly string[]): Promise<Array<{
  title: string;
  extract?: string;
  fullurl?: string;
}>> {
  const url = new URL("https://en.wikinews.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", titles.join("|"));
  url.searchParams.set("prop", "extracts|info");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("exlimit", "max");
  url.searchParams.set("inprop", "url");
  const payload = await requestJson(url.toString()) as {
    query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> };
  };
  return Object.values(payload.query?.pages ?? {});
}

function wikinewsSection(page: { title: string; extract?: string; fullurl?: string }): TextSection | undefined {
  const extract = page.extract?.trim();
  if (extract === undefined || extract.length === 0 || page.fullurl === undefined) {
    return undefined;
  }
  const body = stripWikinewsTail(extract)
    .split(/\n{2,}/u)
    .flatMap((paragraph) => paragraph.split(/\n/u))
    .map(cleanBodyText)
    .filter((paragraph) => wordCount(paragraph) >= 18);
  if (body.length === 0) {
    return undefined;
  }
  return {
    title: `Wikinews: ${page.title}`,
    source_title: page.title,
    source_url: page.fullurl,
    source: wikinewsSource,
    paragraphs: body,
  };
}

async function wikipediaRandomExtracts(limit: number): Promise<Array<{
  title: string;
  extract?: string;
  fullurl?: string;
}>> {
  const url = new URL(wikipediaSource.api_url);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "random");
  url.searchParams.set("grnnamespace", "0");
  url.searchParams.set("grnlimit", String(limit));
  url.searchParams.set("prop", "extracts|info");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("exlimit", "max");
  url.searchParams.set("inprop", "url");
  const payload = await requestJson(url.toString()) as {
    query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> };
  };
  return Object.values(payload.query?.pages ?? {});
}

function wikipediaSection(page: { title: string; extract?: string; fullurl?: string }): TextSection | undefined {
  const extract = page.extract?.trim();
  if (extract === undefined || extract.length === 0 || page.fullurl === undefined) {
    return undefined;
  }
  const body = stripWikipediaTail(extract)
    .split(/\n{2,}/u)
    .flatMap((paragraph) => paragraph.split(/\n/u))
    .map(cleanBodyText)
    .filter((paragraph) => wordCount(paragraph) >= 18);
  if (body.length === 0) {
    return undefined;
  }
  return {
    title: `Wikipedia: ${page.title}`,
    source_title: page.title,
    source_url: page.fullurl,
    source: wikipediaSource,
    paragraphs: body,
  };
}

function stripWikipediaTail(text: string): string {
  return text.split(/\n\s*==\s*(?:References|Sources?|External links|Further reading|See also|Notes)\s*==/iu)[0]?.trim() ?? text.trim();
}

function stripWikinewsTail(text: string): string {
  const withoutTail = text.split(/\n\s*==\s*(?:Sources?|External links?|Related news|Sister links|Have your say|Comments)\s*==/iu)[0] ?? text;
  return withoutTail
    .replace(/^\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s*/u, "")
    .trim();
}

async function requestText(url: string): Promise<string> {
  const response = await request(url);
  return response.text();
}

async function requestJson(url: string): Promise<unknown> {
  const response = await request(url);
  return response.json();
}

async function request(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "KeyLoop corpus builder (local personal use)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}: ${url}`);
      if (response.status === 429) {
        await sleep(5_000 * (attempt + 1));
        continue;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(750 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error(`request failed: ${url}`);
}

function stripGutenbergBoilerplate(text: string): string {
  const startMatch = /\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK .+ \*\*\*/iu.exec(text);
  const endMatch = /\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK .+ \*\*\*/iu.exec(text);
  const startIndex =
    startMatch === null ? 0 : startMatch.index + startMatch[0].length;
  const endIndex = endMatch === null ? text.length : endMatch.index;
  return text.slice(startIndex, endIndex);
}

function isSectionHeading(block: string): boolean {
  if (block.length < 3 || block.length > 100 || /[.!?,;:]$/u.test(block)) {
    return false;
  }
  const words = wordCount(block);
  if (words < 1 || words > 14) {
    return false;
  }
  if (/^(contents|preface|introduction|notes?|source|references?|index|footnotes?|vocabulary|phonics|lesson|bibliography)$/iu.test(block)) {
    return false;
  }
  const letters = block.match(/[A-Za-z]/gu)?.length ?? 0;
  if (letters < block.length * 0.55) {
    return false;
  }
  const lower = block.match(/[a-z]/gu)?.length ?? 0;
  const upper = block.match(/[A-Z]/gu)?.length ?? 0;
  return upper >= lower * 0.4 || /^[A-Z][A-Za-z' -]+$/u.test(block);
}

function splitSentences(text: string): string[] {
  const protectedText = protectSentenceAbbreviations(cleanBodyText(text));
  return protectedText.match(/[^.!?]+[.!?]+(?:["')\]]+)?/gu)
    ?.map((sentence) => restoreSentenceAbbreviations(sentence).trim())
    .filter((sentence) => sentence.length > 0) ?? [];
}

function protectSentenceAbbreviations(text: string): string {
  return text.replace(
    /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|Capt|Col|Gen|Hon|Rev|No|Mt)\./gu,
    (abbreviation) => abbreviation.replace(".", "<DOT>"),
  );
}

function restoreSentenceAbbreviations(text: string): string {
  return text.replace(/<DOT>/gu, ".");
}

function cleanBodyText(text: string): string {
  return text
    .replace(/[“”]/gu, "\"")
    .replace(/[‘’]/gu, "'")
    .replace(/\[[^\]]+\]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function lengthForWordCount(
  count: number,
  ranges: Record<ReadingLength, readonly [number, number]>,
): ReadingLength | undefined {
  for (const length of readingLengthOrder) {
    const [min, max] = ranges[length];
    if (count >= min && count <= max) {
      return length;
    }
  }
  return undefined;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter((word) => /[A-Za-z0-9]/u.test(word)).length;
}

function stableTextHash(text: string): string {
  let hash = 2166136261;
  for (const char of text.toLowerCase().replace(/\s+/gu, " ")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function readingSources(sources: readonly ReadingSourcePlan[]): EverydayCorpusSource[] {
  return sources.map((source) => ({
    source_id: source.source_id,
    source_name: source.source_name,
    source_url: source.source_url,
    license: source.license,
    retrieved_at: "2026-06-10",
    generation_script: "ts/src/tools/collectEverydayReadingCandidates.ts",
    included_fields: [
      "text",
      "level",
      "length",
      "source_id",
      "source_title",
      "paragraphs",
      "word_count",
    ],
    notes:
      `English-only reading candidates collected as complete titled sections, complete news articles, or article lead summaries. ` +
      `Chinese translations are intentionally not generated by this script; GPT translation batches should fill them after quality review.`,
  }));
}

function gutenberg(
  ebookId: number,
  title: string,
  levelHint: EverydayLevel,
): GutenbergSourcePlan {
  return {
    source_kind: "gutenberg",
    ebook_id: ebookId,
    source_id: `gutenberg:${ebookId}`,
    source_name: `Project Gutenberg: ${title}`,
    source_url: gutenbergTextUrl(ebookId),
    license: "Public domain in the USA",
    level_hint: levelHint,
  };
}

function gutenbergTextUrl(ebookId: number): string {
  return `https://www.gutenberg.org/cache/epub/${ebookId}/pg${ebookId}.txt`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
