import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EverydayCorpusSource } from "../content/library";
import { readingLevelOrder } from "../content/readingVocabulary";
import type { EverydayLevel, EverydaySentenceLength } from "../domain/model";

type ReadingLength = Exclude<EverydaySentenceLength, "mixed">;

interface TranslatedBatch {
  level?: EverydayLevel;
  sources: EverydayCorpusSource[];
  sentences: TranslatedSentence[];
  articles: TranslatedArticle[];
}

interface TranslatedSentence {
  text: string;
  translation_zh: string;
  level: EverydayLevel;
  length: ReadingLength;
  source_id: string;
  source_title: string;
  reject_reason?: string;
}

interface TranslatedArticle {
  title: string;
  level: EverydayLevel;
  length: ReadingLength;
  source_id: string;
  paragraphs: TranslatedParagraph[];
  reject_reason?: string;
}

interface TranslatedParagraph {
  text: string;
  translation_zh: string;
  reject_reason?: string;
}

interface ReadingSeed {
  sources: EverydayCorpusSource[];
  sentences: ReadingStandaloneSentenceSeed[];
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
  paragraphs: ReadingParagraphSeed[];
}

interface ReadingParagraphSeed {
  sentences: ReadingSentenceSeed[];
}

interface ReadingSentenceSeed {
  text: string;
  translation_zh: string;
}

const defaultInputDir = fileURLToPath(
  new URL("../../content/everyday_reading_translated", import.meta.url),
);
const defaultOutputPath = fileURLToPath(
  new URL("../../content/everyday_reading_seed.json", import.meta.url),
);

async function main(): Promise<void> {
  const inputDir = resolve(optionValue("--input-dir") ?? defaultInputDir);
  const outputPath = resolve(optionValue("--output") ?? defaultOutputPath);
  const supplementPaths = optionValues("--supplement");
  const batches = await loadTranslatedBatches(inputDir, supplementPaths);
  const seed = mergeTranslatedBatches(batches);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(
    [
      `Sources: ${seed.sources.length}`,
      `Sentences: ${seed.sentences.length}`,
      `Articles: ${seed.articles.length}`,
      `Output: ${outputPath}`,
    ].join(" | "),
  );
}

async function loadTranslatedBatches(
  inputDir: string,
  supplementPaths: readonly string[],
): Promise<TranslatedBatch[]> {
  const batches = await Promise.all(
    readingLevelOrder.map(async (level) =>
      JSON.parse(await readFile(`${inputDir}/${level}.json`, "utf8")) as TranslatedBatch,
    ),
  );
  for (const supplementPath of supplementPaths) {
    batches.push(JSON.parse(await readFile(resolve(supplementPath), "utf8")) as TranslatedBatch);
  }
  return batches;
}

export function mergeTranslatedBatches(batches: readonly TranslatedBatch[]): ReadingSeed {
  const sources = new Map<string, EverydayCorpusSource>();
  const sentences: ReadingStandaloneSentenceSeed[] = [];
  const articles: ReadingArticleSeed[] = [];
  for (const batch of batches) {
    for (const source of batch.sources) {
      sources.set(source.source_id, source);
    }
    for (const sentence of batch.sentences) {
      if (sentence.reject_reason !== undefined || sentence.translation_zh.trim().length === 0) {
        continue;
      }
      sentences.push({
        text: sentence.text,
        translation_zh: sentence.translation_zh.trim(),
        level: sentence.level,
        source_id: sentence.source_id,
        source_title: sentence.source_title,
      });
    }
    for (const article of batch.articles) {
      if (article.reject_reason !== undefined) {
        continue;
      }
      const paragraphs = article.paragraphs
        .filter((paragraph) =>
          paragraph.reject_reason === undefined && paragraph.translation_zh.trim().length > 0,
        )
        .map((paragraph) => ({
          sentences: [{
            text: paragraph.text,
            translation_zh: paragraph.translation_zh.trim(),
          }],
        }));
      if (paragraphs.length !== article.paragraphs.length || paragraphs.length === 0) {
        continue;
      }
      articles.push({
        title: article.title,
        level: article.level,
        length: article.length,
        source_id: article.source_id,
        paragraphs,
      });
    }
  }
  return {
    sources: [...sources.values()].map(translatedSource),
    sentences,
    articles,
  };
}

function translatedSource(source: EverydayCorpusSource): EverydayCorpusSource {
  const fields = new Set([
    ...source.included_fields,
    "translation_zh",
  ]);
  return {
    ...source,
    generation_script:
      "ts/src/tools/collectEverydayReadingCandidates.ts + GPT-5.4 translation batches",
    included_fields: [...fields],
    notes:
      `${source.notes} Chinese translations are filled and quality-checked by GPT-5.4 translation batches before merge.`,
  };
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function optionValues(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1] !== undefined) {
      values.push(process.argv[index + 1]!);
    }
  }
  return values;
}

if (import.meta.main) {
  await main();
}
