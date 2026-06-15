import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  EverydayArticlesCorpus,
  EverydayCorpusSource,
  EverydaySentencesCorpus,
} from "../content/library";
import type { EverydayLevel, EverydaySentenceLength } from "../domain/model";

type ReadingLength = Exclude<EverydaySentenceLength, "mixed">;

interface ReadingSeed {
  sources: EverydayCorpusSource[];
  sentences?: ReadingStandaloneSentenceSeed[];
  articles: ReadingArticleSeed[];
}

interface ReadingStandaloneSentenceSeed {
  text: string;
  translation_zh: string;
  level: EverydayLevel;
  source_id: string;
  source_title: string;
}

interface ReadingArticleSeed {
  title: string;
  level: EverydayLevel;
  length: ReadingLength;
  source_id: string;
  paragraphs: { sentences: { text: string; translation_zh: string }[] }[];
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function isModern(sourceId: string): boolean {
  return !sourceId.startsWith("gutenberg:");
}

async function main(): Promise<void> {
  const seedPath = resolve(
    optionValue("--seed") ?? `${repoRoot}contents/everyday_reading_seed.json`,
  );
  const articlesPath = resolve(
    optionValue("--articles") ?? `${repoRoot}contents/everyday_articles.json`,
  );
  const sentencesPath = resolve(
    optionValue("--sentences") ?? `${repoRoot}contents/everyday_sentences.json`,
  );
  const outputPath = resolve(optionValue("--output") ?? "/tmp/merged_reading_seed.json");

  const seed = JSON.parse(await readFile(seedPath, "utf8")) as ReadingSeed;
  const finalArticles = JSON.parse(await readFile(articlesPath, "utf8")) as EverydayArticlesCorpus;
  const finalSentences = JSON.parse(
    await readFile(sentencesPath, "utf8"),
  ) as EverydaySentencesCorpus;

  // Reverse modern articles (final shape -> seed shape). Each final paragraph
  // { text, translation_zh } becomes one seed sentence; the build re-joins them
  // back to identical paragraph text/translation, so this round-trip is lossless.
  const modernArticles: ReadingArticleSeed[] = finalArticles.entries
    .filter((entry) => isModern(entry.source_id))
    .map((entry) => ({
      title: entry.title,
      level: entry.level,
      length: asReadingLength(entry.length),
      source_id: entry.source_id,
      paragraphs: entry.paragraphs.map((paragraph) => ({
        sentences: [{ text: paragraph.text, translation_zh: paragraph.translation_zh }],
      })),
    }));

  // Reverse modern standalone sentences (drop the precomputed length; the build
  // recomputes it from word count).
  const modernSentences: ReadingStandaloneSentenceSeed[] = finalSentences.entries
    .filter((entry) => isModern(entry.source_id))
    .map((entry) => ({
      text: entry.text,
      translation_zh: entry.translation_zh,
      level: entry.level,
      source_id: entry.source_id,
      source_title: entry.source_title,
    }));

  // Collect modern source records referenced by the modern entries, pulling the
  // full source metadata (license/url) from the final corpora.
  const neededSourceIds = new Set<string>([
    ...modernArticles.map((article) => article.source_id),
    ...modernSentences.map((sentence) => sentence.source_id),
  ]);
  const finalSourceById = new Map<string, EverydayCorpusSource>();
  for (const source of [...finalArticles.sources, ...finalSentences.sources]) {
    finalSourceById.set(source.source_id, source);
  }
  const mergedSources: EverydayCorpusSource[] = [...seed.sources];
  const seedSourceIds = new Set(seed.sources.map((source) => source.source_id));
  const missingSources: string[] = [];
  for (const sourceId of neededSourceIds) {
    if (seedSourceIds.has(sourceId)) {
      continue;
    }
    const source = finalSourceById.get(sourceId);
    if (source === undefined) {
      missingSources.push(sourceId);
      continue;
    }
    mergedSources.push(source);
    seedSourceIds.add(sourceId);
  }
  if (missingSources.length > 0) {
    throw new Error(`modern source metadata missing for: ${missingSources.join(", ")}`);
  }

  // Modern content goes to the FRONT so limitEntriesByCell / the 100-per-cell
  // sentence cap keep it preferentially over gutenberg fill.
  const mergedSeed: ReadingSeed = {
    sources: mergedSources,
    sentences: [...modernSentences, ...(seed.sentences ?? [])],
    articles: [...modernArticles, ...seed.articles],
  };

  await writeFile(outputPath, `${JSON.stringify(mergedSeed, null, 2)}\n`);
  console.log(
    [
      `modern articles prepended: ${modernArticles.length}`,
      `modern sentences prepended: ${modernSentences.length}`,
      `sources: ${seed.sources.length} -> ${mergedSources.length}`,
      `total articles: ${mergedSeed.articles.length}`,
      `total sentences: ${mergedSeed.sentences?.length}`,
      `output: ${outputPath}`,
    ].join(" | "),
  );
}

function asReadingLength(length: EverydaySentenceLength): ReadingLength {
  if (length === "mixed") {
    throw new Error("daily reading content must not use mixed length");
  }
  return length;
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
