import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EverydayCorpusSource, EverydaySentencesCorpus } from "../content/library";
import { readingLevelOrder } from "../content/readingVocabulary";
import type { EverydayLevel, EverydaySentenceLength } from "../domain/model";

type ReadingLength = Exclude<EverydaySentenceLength, "mixed">;

interface CandidateCorpus {
  sources: EverydayCorpusSource[];
  sentences: CandidateSentence[];
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

interface TranslatedBatch {
  sentences: Array<CandidateSentence & { translation_zh?: string; reject_reason?: string }>;
}

interface SupplementSentence extends CandidateSentence {
  id: string;
  translation_zh: "";
}

interface SupplementBatch {
  instructions: string[];
  sources: EverydayCorpusSource[];
  sentences: SupplementSentence[];
  articles: [];
}

const defaultCandidatesPath = fileURLToPath(
  new URL("../../contents/everyday_reading_candidates.json", import.meta.url),
);
const defaultCurrentSentencesPath = fileURLToPath(
  new URL("../../contents/everyday_sentences.json", import.meta.url),
);
const defaultTranslatedDir = fileURLToPath(
  new URL("../../contents/everyday_reading_translated", import.meta.url),
);
const defaultOutputPath = fileURLToPath(
  new URL("../../contents/everyday_reading_translation_batches/final_sentence_supplement.json", import.meta.url),
);

const targetPerCell = 100;
const bufferPerCell = 18;
const readingLengthOrder: ReadingLength[] = ["short", "medium", "long"];

async function main(): Promise<void> {
  const candidatesPath = resolve(optionValue("--candidates") ?? defaultCandidatesPath);
  const currentSentencesPath = resolve(optionValue("--current-sentences") ?? defaultCurrentSentencesPath);
  const translatedDir = resolve(optionValue("--translated-dir") ?? defaultTranslatedDir);
  const outputPath = resolve(optionValue("--output") ?? defaultOutputPath);
  const candidates = JSON.parse(await readFile(candidatesPath, "utf8")) as CandidateCorpus;
  const current = JSON.parse(await readFile(currentSentencesPath, "utf8")) as EverydaySentencesCorpus;
  const translated = await loadTranslatedBatches(translatedDir, optionValues("--supplement"));
  const batch = buildFinalSentenceSupplement(candidates, current, translated);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(batch, null, 2)}\n`);
  console.log(
    [
      `Sentences: ${batch.sentences.length}`,
      `Output: ${outputPath}`,
    ].join(" | "),
  );
}

function buildFinalSentenceSupplement(
  candidates: CandidateCorpus,
  current: EverydaySentencesCorpus,
  translated: readonly TranslatedBatch[],
): SupplementBatch {
  const acceptedCounts = sentenceCounts(current.entries);
  const seen = seenTranslatedHashes(translated);
  const sentences: SupplementSentence[] = [];
  for (const level of readingLevelOrder) {
    for (const length of readingLengthOrder) {
      const key = `${level}:${length}`;
      const needed = Math.max(0, targetPerCell - (acceptedCounts.get(key) ?? 0));
      if (needed === 0) {
        continue;
      }
      const extras = candidates.sentences
        .filter((sentence) =>
          sentence.level === level &&
          sentence.length === length &&
          !seen.has(sentenceKey(sentence)),
        )
        .slice(0, needed + bufferPerCell);
      sentences.push(
        ...extras.map((sentence, index) => ({
          ...sentence,
          id: `final-supplement:sentence:${key}:${index + 1}:${sentence.text_hash}`,
          translation_zh: "" as const,
        })),
      );
    }
  }
  const sourceIds = new Set(sentences.map((sentence) => sentence.source_id));
  return {
    instructions: [
      "Translate every English sentence into concise, natural Simplified Chinese.",
      "This is a final sentence-only supplement. The articles array is intentionally empty.",
      "Keep ids and English source text unchanged.",
      "If a sentence is clipped, incoherent, or source boilerplate, leave translation_zh blank and add reject_reason.",
      "Return the same JSON shape.",
    ],
    sources: candidates.sources.filter((source) => sourceIds.has(source.source_id)),
    sentences,
    articles: [],
  };
}

function sentenceCounts(entries: EverydaySentencesCorpus["entries"]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.level}:${entry.length}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function seenTranslatedHashes(batches: readonly TranslatedBatch[]): Set<string> {
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const sentence of batch.sentences ?? []) {
      seen.add(sentenceKey(sentence));
    }
  }
  return seen;
}

function sentenceKey(sentence: Pick<CandidateSentence, "level" | "length" | "text_hash">): string {
  return `${sentence.level}:${sentence.length}:${sentence.text_hash}`;
}

async function loadTranslatedBatches(
  path: string,
  supplementPaths: readonly string[],
): Promise<TranslatedBatch[]> {
  const batches = await Promise.all(
    readingLevelOrder.map(async (level) =>
      JSON.parse(await readFile(`${path}/${level}.json`, "utf8")) as TranslatedBatch,
    ),
  );
  for (const supplementPath of supplementPaths) {
    batches.push(JSON.parse(await readFile(resolve(supplementPath), "utf8")) as TranslatedBatch);
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
