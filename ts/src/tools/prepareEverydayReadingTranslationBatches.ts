import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EverydayCorpusSource } from "../content/library";
import {
  readingArticleTextQualityIssues,
  readingSentenceQualityIssues,
} from "../content/readingTextQuality";
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

interface TranslationBatch {
  level: EverydayLevel;
  instructions: string[];
  sources: EverydayCorpusSource[];
  sentences: TranslationSentence[];
  articles: TranslationArticle[];
}

interface TranslationSentence extends CandidateSentence {
  id: string;
  translation_zh: "";
}

interface TranslationArticle extends Omit<CandidateArticle, "paragraphs"> {
  id: string;
  paragraphs: TranslationParagraph[];
}

interface TranslationParagraph {
  id: string;
  text: string;
  translation_zh: "";
}

interface TranslationManifest {
  generated_at: string;
  candidate_input: string;
  output_dir: string;
  levels: Array<{
    level: EverydayLevel;
    file: string;
    sentence_count: number;
    article_count: number;
    article_paragraph_count: number;
  }>;
  legacy_audit: LegacyAudit;
}

interface LegacyAudit {
  sentence_rejections: Array<{ text: string; issues: string[] }>;
  article_rejections: Array<{ title: string; issues: string[] }>;
}

const defaultCandidatesPath = fileURLToPath(
  new URL("../../content/everyday_reading_candidates.json", import.meta.url),
);
const defaultOutputDir = fileURLToPath(
  new URL("../../content/everyday_reading_translation_batches", import.meta.url),
);
const defaultLegacySentencesPath = fileURLToPath(
  new URL("../../content/everyday_sentences.json", import.meta.url),
);
const defaultLegacyArticlesPath = fileURLToPath(
  new URL("../../content/everyday_articles.json", import.meta.url),
);

async function main(): Promise<void> {
  const candidatesPath = resolve(optionValue("--candidates") ?? defaultCandidatesPath);
  const outputDir = resolve(optionValue("--output-dir") ?? defaultOutputDir);
  const legacySentencesPath = resolve(optionValue("--legacy-sentences") ?? defaultLegacySentencesPath);
  const legacyArticlesPath = resolve(optionValue("--legacy-articles") ?? defaultLegacyArticlesPath);
  const candidates = JSON.parse(await readFile(candidatesPath, "utf8")) as CandidateCorpus;
  const legacyAudit = await auditLegacyReadingContent(legacySentencesPath, legacyArticlesPath);
  const manifest: TranslationManifest = {
    generated_at: "2026-06-10",
    candidate_input: candidatesPath,
    output_dir: outputDir,
    levels: [],
    legacy_audit: legacyAudit,
  };

  await mkdir(outputDir, { recursive: true });
  for (const level of readingLevelOrder) {
    const batch = translationBatchForLevel(candidates, level);
    const filename = `${level}.json`;
    await writeFile(`${outputDir}/${filename}`, `${JSON.stringify(batch, null, 2)}\n`);
    manifest.levels.push({
      level,
      file: filename,
      sentence_count: batch.sentences.length,
      article_count: batch.articles.length,
      article_paragraph_count: batch.articles.reduce(
        (sum, article) => sum + article.paragraphs.length,
        0,
      ),
    });
  }
  await writeFile(`${outputDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    [
      `Batches: ${manifest.levels.length}`,
      `Output: ${outputDir}`,
      `Legacy sentence rejects: ${legacyAudit.sentence_rejections.length}`,
      `Legacy article rejects: ${legacyAudit.article_rejections.length}`,
    ].join(" | "),
  );
}

function translationBatchForLevel(
  candidates: CandidateCorpus,
  level: EverydayLevel,
): TranslationBatch {
  const sentences = candidates.sentences
    .filter((sentence) => sentence.level === level)
    .map((sentence, index) => ({
      ...sentence,
      id: `sentence:${level}:${sentence.length}:${index + 1}:${sentence.text_hash}`,
      translation_zh: "" as const,
    }));
  const articles = candidates.articles
    .filter((article) => article.level === level)
    .map((article, index) => ({
      ...article,
      id: `article:${level}:${article.length}:${index + 1}:${article.text_hash}`,
      paragraphs: article.paragraphs.map((paragraph, paragraphIndex) => ({
        id: `article:${level}:${article.length}:${index + 1}:${article.text_hash}:p${paragraphIndex + 1}`,
        text: paragraph,
        translation_zh: "" as const,
      })),
    }));
  const sourceIds = new Set([
    ...sentences.map((sentence) => sentence.source_id),
    ...articles.map((article) => article.source_id),
  ]);
  return {
    level,
    instructions: [
      "Translate every English text into concise, natural Simplified Chinese.",
      "Do not rewrite, summarize, or change the English source text.",
      "Keep translation_zh one or two Chinese sentences when the source is short; preserve paragraph meaning for article paragraphs.",
      "If a source text is clipped, incoherent, or has source boilerplate, leave translation_zh blank and add a reject_reason field next to that item.",
      "Return the same JSON shape with all ids and English text unchanged.",
    ],
    sources: candidates.sources.filter((source) => sourceIds.has(source.source_id)),
    sentences,
    articles,
  };
}

async function auditLegacyReadingContent(
  sentencesPath: string,
  articlesPath: string,
): Promise<LegacyAudit> {
  const sentences = JSON.parse(await readFile(sentencesPath, "utf8")) as {
    entries: Array<{ text: string }>;
  };
  const articles = JSON.parse(await readFile(articlesPath, "utf8")) as {
    entries: Array<{ title: string; paragraphs: Array<{ text: string }> }>;
  };
  return {
    sentence_rejections: sentences.entries.flatMap((entry) => {
      const issues = readingSentenceQualityIssues(entry.text);
      return issues.length === 0 ? [] : [{ text: entry.text, issues }];
    }),
    article_rejections: articles.entries.flatMap((entry) => {
      const text = entry.paragraphs.map((paragraph) => paragraph.text).join(" ");
      const issues = readingArticleTextQualityIssues(text);
      return issues.length === 0 ? [] : [{ title: entry.title, issues }];
    }),
  };
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
