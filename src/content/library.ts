import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  EverydayLevel,
  EverydaySentenceLength,
  EverydayWordRange,
} from "../domain/model";
import type { CodePracticeOption } from "../domain/model";
import { codePracticeOptions, type BuiltinCodeSnippet } from "./snippets";
import type { LongWordEntry } from "../training/vocabulary";
import {
  codeCorpusPracticeOptions,
  loadCodeCorpus,
  type CodeCorpus,
} from "./codeCorpus";

export interface ContentLibrary {
  warmup: string[];
  foundation_drills: FoundationDrill[];
  word_chunks: string[];
  common_words: string[];
  everyday_english: EverydayEnglishCorpus;
  everyday_words: EverydayWordsCorpus;
  everyday_sentences: EverydaySentencesCorpus;
  everyday_articles: EverydayArticlesCorpus;
  everyday_word_decomposition: EverydayWordDecompositionCorpus;
  programming_words: ProgrammingWordEntry[];
  code_corpus?: CodeCorpus;
  code_snippets: BuiltinCodeSnippet[];
  long_words: LongWordEntry[];
}

export interface ProgrammingWordEntry {
  word: string;
  note_zh: string;
}

export interface FoundationDrill {
  id: string;
  title_zh: string;
  title_en: string;
  hint_zh: string;
  hint_en: string;
  items: string[];
}

export interface SourceCatalogEntry {
  source_id: string;
  repo: string;
  repo_url: string;
  license_spdx: string;
  retrieved_at: string;
  languages: string[];
  frameworks: string[];
  notes: string;
  source_name: string;
  source_url: string;
  corpus: string;
  generation_script: string;
  included_fields: string[];
}

export interface EverydayEnglishCorpus {
  sources: EverydayCorpusSource[];
  entries: EverydayCorpusEntry[];
}

export interface EverydayCorpusSource {
  source_id: string;
  source_name: string;
  source_url: string;
  license: string;
  retrieved_at: string;
  generation_script: string;
  included_fields: string[];
  notes: string;
}

export interface EverydayCorpusEntry {
  text: string;
  kind: "word" | "phrase" | "sentence";
  tier: number | null;
  length: EverydaySentenceLength | null;
  domain: "everyday" | "workplace";
  source_id: string;
}

export interface EverydayWordsCorpus {
  sources: EverydayCorpusSource[];
  entries: EverydayWordEntry[];
}

export interface EverydayWordEntry {
  word: string;
  rank: number;
  range: EverydayWordRange;
  level: EverydayLevel;
  translation_zh: string;
  source_id: string;
}

export interface EverydaySentencesCorpus {
  sources: EverydayCorpusSource[];
  entries: EverydaySentenceEntry[];
}

export interface EverydaySentenceEntry {
  text: string;
  translation_zh: string;
  level: EverydayLevel;
  length: EverydaySentenceLength;
  source_id: string;
  source_title: string;
}

export interface EverydayArticlesCorpus {
  sources: EverydayCorpusSource[];
  entries: EverydayArticleEntry[];
}

export interface EverydayArticleEntry {
  title: string;
  level: EverydayLevel;
  length: EverydaySentenceLength;
  source_id: string;
  paragraphs: EverydayArticleParagraph[];
}

export interface EverydayArticleParagraph {
  text: string;
  translation_zh: string;
}

export interface EverydayWordDecompositionCorpus {
  sources: EverydayCorpusSource[];
  entries: EverydayWordDecompositionEntry[];
}

export interface EverydayWordDecompositionEntry {
  word: string;
  parts: string[];
  translation_zh: string;
  level: EverydayLevel;
  source_id: string;
}

const contentMarkerFile = "everyday_english.json";
export async function loadContentLibrary(options: {
  userEverydayCorpusPath?: string;
} = {}): Promise<ContentLibrary> {
  const everydayEnglish = await loadEverydayEnglishCorpus(options.userEverydayCorpusPath);
  const codeCorpus = loadCodeCorpus();

  return {
    warmup: await loadJsonFile<string[]>("warmup.json"),
    foundation_drills: await loadJsonFile<FoundationDrill[]>("foundation_drills.json"),
    word_chunks: await loadJsonFile<string[]>("word_chunks.json"),
    common_words: await loadJsonFile<string[]>("common_words.json"),
    everyday_english: everydayEnglish,
    everyday_words: await loadJsonFile<EverydayWordsCorpus>("everyday_words.json"),
    everyday_sentences: await loadJsonFile<EverydaySentencesCorpus>("everyday_sentences.json"),
    everyday_articles: await loadJsonFile<EverydayArticlesCorpus>("everyday_articles.json"),
    everyday_word_decomposition: await loadJsonFile<EverydayWordDecompositionCorpus>(
      "everyday_word_decomposition.json",
    ),
    programming_words: await loadJsonFile<ProgrammingWordEntry[]>("programming_words.json"),
    code_corpus: codeCorpus,
    code_snippets: [],
    long_words: await loadJsonFile<LongWordEntry[]>("long_words.json"),
  };
}

export function codePracticeOptionsForLibrary(
  library: ContentLibrary,
): CodePracticeOption[] {
  if (library.code_corpus !== undefined) {
    return codeCorpusPracticeOptions(library.code_corpus);
  }
  return codePracticeOptions(library.code_snippets);
}

export async function sourceCatalog(options: {
  userEverydayCorpusPath?: string;
} = {}): Promise<SourceCatalogEntry[]> {
  const sources = await loadJsonFile<SourceCatalogEntry[]>("source_catalog.json");
  const everyday = await loadEverydayEnglishCorpus(options.userEverydayCorpusPath);
  const everydayWords = await loadJsonFile<EverydayWordsCorpus>("everyday_words.json");
  const everydaySentences = await loadJsonFile<EverydaySentencesCorpus>(
    "everyday_sentences.json",
  );
  const everydayArticles = await loadJsonFile<EverydayArticlesCorpus>(
    "everyday_articles.json",
  );
  const everydayWordDecomposition =
    await loadJsonFile<EverydayWordDecompositionCorpus>(
      "everyday_word_decomposition.json",
    );
  return [
    ...sources.map(normalizeSourceCatalogEntry),
    ...everyday.sources.map((source) =>
      everydaySourceToCatalogEntry(source, "everyday_english"),
    ),
    ...everydayWords.sources.map((source) =>
      everydaySourceToCatalogEntry(source, "everyday_words"),
    ),
    ...everydaySentences.sources.map((source) =>
      everydaySourceToCatalogEntry(source, "everyday_sentences"),
    ),
    ...everydayArticles.sources.map((source) =>
      everydaySourceToCatalogEntry(source, "everyday_articles"),
    ),
    ...everydayWordDecomposition.sources.map((source) =>
      everydaySourceToCatalogEntry(source, "everyday_word_decomposition"),
    ),
  ];
}

export interface ResolveContentRootOptions {
  moduleUrl?: string;
  execPath?: string;
  argv1?: string;
  env?: Record<string, string | undefined>;
  exists?: (path: string) => Promise<boolean>;
}

export async function resolveContentRoot(
  options: ResolveContentRootOptions = {},
): Promise<string> {
  const candidates = contentRootCandidates(options);
  const exists = options.exists ?? contentRootExists;
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? join(process.cwd(), "contents");
}

export function mergeEverydayCorpus(
  base: EverydayEnglishCorpus,
  extra: EverydayEnglishCorpus,
): EverydayEnglishCorpus {
  const sources = [...base.sources];
  const sourceIds = new Set(sources.map((source) => source.source_id));
  for (const source of extra.sources) {
    if (!sourceIds.has(source.source_id)) {
      sourceIds.add(source.source_id);
      sources.push(source);
    }
  }

  const entries = [...base.entries];
  const entryKeys = new Set(
    entries.map((entry) => `${entry.source_id}\u0000${entry.kind}\u0000${entry.text}`),
  );
  for (const entry of extra.entries) {
    const key = `${entry.source_id}\u0000${entry.kind}\u0000${entry.text}`;
    if (!entryKeys.has(key)) {
      entryKeys.add(key);
      entries.push(entry);
    }
  }

  return { sources, entries };
}

async function loadEverydayEnglishCorpus(
  userEverydayCorpusPath?: string,
): Promise<EverydayEnglishCorpus> {
  let corpus = await loadJsonFile<EverydayEnglishCorpus>("everyday_english.json");
  const path = userEverydayCorpusPath ?? process.env.KEYLOOP_EVERYDAY_CORPUS?.trim();
  if (path !== undefined && path.length > 0) {
    corpus = mergeEverydayCorpus(corpus, await loadJsonPath<EverydayEnglishCorpus>(path));
  }
  return corpus;
}

function everydaySourceToCatalogEntry(
  source: EverydayCorpusSource,
  corpus: string,
): SourceCatalogEntry {
  return {
    source_id: source.source_id,
    repo: source.source_name,
    repo_url: source.source_url,
    license_spdx: source.license,
    retrieved_at: source.retrieved_at,
    languages: ["english"],
    frameworks: ["everyday", "workplace"],
    notes: source.notes,
    source_name: source.source_name,
    source_url: source.source_url,
    corpus,
    generation_script: source.generation_script,
    included_fields: source.included_fields,
  };
}

function normalizeSourceCatalogEntry(source: SourceCatalogEntry): SourceCatalogEntry {
  return {
    source_id: source.source_id,
    repo: source.repo,
    repo_url: source.repo_url,
    license_spdx: source.license_spdx,
    retrieved_at: source.retrieved_at,
    languages: source.languages,
    frameworks: source.frameworks,
    notes: source.notes,
    source_name: source.source_name ?? "",
    source_url: source.source_url ?? "",
    corpus: source.corpus ?? "",
    generation_script: source.generation_script ?? "",
    included_fields: source.included_fields ?? [],
  };
}

async function loadJsonFile<T>(relativePath: string): Promise<T> {
  const contentRoot = await resolveContentRoot();
  return loadJsonPath<T>(join(contentRoot, relativePath));
}

async function loadJsonPath<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function contentRootCandidates(options: ResolveContentRootOptions): string[] {
  const env = options.env ?? process.env;
  const candidates: string[] = [];
  const tsEnvRoot = env.KEYLOOP_TS_CONTENT_ROOT?.trim();
  if (tsEnvRoot !== undefined && tsEnvRoot.length > 0) {
    candidates.push(resolve(tsEnvRoot));
  }
  const envRoot = env.KEYLOOP_CONTENT_ROOT?.trim();
  if (envRoot !== undefined && envRoot.length > 0) {
    candidates.push(resolve(envRoot));
  }

  const moduleUrl = options.moduleUrl ?? import.meta.url;
  try {
    candidates.push(
      join(
        dirname(dirname(dirname(fileURLToPath(moduleUrl)))),
        "contents",
      ),
    );
  } catch {
    // Non-file module URLs cannot identify the repository root.
  }

  addPathAdjacentContentCandidates(candidates, options.argv1 ?? process.argv[1]);
  addPathAdjacentContentCandidates(candidates, options.execPath ?? process.execPath);
  candidates.push(join(process.cwd(), "contents"));

  return [...new Set(candidates)];
}

function addPathAdjacentContentCandidates(
  candidates: string[],
  path: string | undefined,
): void {
  if (path === undefined || path.length === 0) {
    return;
  }
  const base = dirname(resolve(path));
  candidates.push(join(base, "contents"));
  candidates.push(join(base, "..", "contents"));
  candidates.push(join(base, "..", "..", "contents"));
  candidates.push(join(base, "..", "..", "..", "contents"));
}

async function contentRootExists(path: string): Promise<boolean> {
  try {
    await access(join(path, contentMarkerFile));
    return true;
  } catch {
    return false;
  }
}
