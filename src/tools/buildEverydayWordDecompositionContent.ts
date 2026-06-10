import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import type {
  EverydayCorpusSource,
  EverydayWordDecompositionCorpus,
  EverydayWordDecompositionEntry,
} from "../content/library";
import type { EverydayLevel } from "../domain/model";

interface RawDecompositionRecord {
  word?: unknown;
  parts?: unknown;
  translation_zh?: unknown;
  translation?: unknown;
  zh?: unknown;
  level?: unknown;
  source_id?: unknown;
}

interface RawDecompositionCorpus {
  sources?: unknown;
  entries?: unknown;
}

interface BuildOptions {
  fallbackSource: EverydayCorpusSource;
}

interface BuildResult {
  corpus: EverydayWordDecompositionCorpus;
  stats: {
    read: number;
    kept: number;
    duplicate: number;
  };
}

const defaultInput = "raw/everyday-word-decomposition";
const defaultOutput = "contents/everyday_word_decomposition.json";
const levels = [
  "high_school",
  "cet4",
  "cet6",
  "postgraduate",
  "toefl_ielts",
] as const satisfies readonly EverydayLevel[];

async function main(): Promise<void> {
  const input = resolve(optionValue("--input") ?? defaultInput);
  const output = resolve(optionValue("--output") ?? defaultOutput);
  const fallbackSource = fallbackSourceFromOptions();
  const raw = await readInputRecords(input);
  const result = buildEverydayWordDecompositionCorpus(raw, { fallbackSource });

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result.corpus, null, 2)}\n`);
  console.log(
    [
      `Output: ${output}`,
      `read ${result.stats.read}`,
      `kept ${result.stats.kept}`,
      `duplicate ${result.stats.duplicate}`,
    ].join(" | "),
  );
}

export function buildEverydayWordDecompositionCorpus(
  raw: unknown[],
  options: BuildOptions,
): BuildResult {
  const sources = new Map<string, EverydayCorpusSource>();
  const entries: EverydayWordDecompositionEntry[] = [];
  const seen = new Set<string>();
  let duplicate = 0;

  addSource(sources, options.fallbackSource);
  for (const item of raw) {
    const corpus = asRawCorpus(item);
    if (corpus !== undefined) {
      for (const source of rawSources(corpus.sources)) {
        addSource(sources, source);
      }
      for (const entry of rawEntries(corpus.entries)) {
        const normalized = normalizeEntry(entry, options.fallbackSource.source_id);
        const key = `${normalized.word}\u0000${normalized.parts.join("\u0001")}`;
        if (seen.has(key)) {
          duplicate += 1;
          continue;
        }
        seen.add(key);
        entries.push(normalized);
      }
      continue;
    }

    const normalized = normalizeEntry(item, options.fallbackSource.source_id);
    const key = `${normalized.word}\u0000${normalized.parts.join("\u0001")}`;
    if (seen.has(key)) {
      duplicate += 1;
      continue;
    }
    seen.add(key);
    entries.push(normalized);
  }

  return {
    corpus: {
      sources: Array.from(sources.values()).sort((left, right) =>
        left.source_id.localeCompare(right.source_id),
      ),
      entries: entries.sort((left, right) => {
        const levelCompare = levelIndex(left.level) - levelIndex(right.level);
        return levelCompare === 0 ? left.word.localeCompare(right.word) : levelCompare;
      }),
    },
    stats: {
      read: raw.length,
      kept: entries.length,
      duplicate,
    },
  };
}

async function readInputRecords(path: string): Promise<unknown[]> {
  const info = await stat(path);
  if (!info.isDirectory()) {
    return readInputFile(path);
  }

  const records: unknown[] = [];
  for (const file of await inputFiles(path)) {
    records.push(...await readInputFile(file));
  }
  return records;
}

async function inputFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await inputFiles(path));
    } else if (entry.isFile() && isSupportedInput(path)) {
      files.push(path);
    }
  }
  return files;
}

function isSupportedInput(path: string): boolean {
  return [".json", ".jsonl", ".tsv", ".csv"].includes(extname(path).toLowerCase());
}

async function readInputFile(path: string): Promise<unknown[]> {
  const raw = await readFile(path, "utf8");
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".json":
      return readJsonInput(raw);
    case ".jsonl":
      return readJsonlInput(raw);
    case ".tsv":
      return readDelimitedInput(raw, "\t");
    case ".csv":
      return readDelimitedInput(raw, ",");
    default:
      throw new Error(`unsupported input file: ${path}`);
  }
}

function readJsonInput(raw: string): unknown[] {
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function readJsonlInput(raw: string): unknown[] {
  const records: unknown[] = [];
  for (const line of raw.split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }
    records.push(JSON.parse(line) as unknown);
  }
  return records;
}

function readDelimitedInput(raw: string, delimiter: "," | "\t"): unknown[] {
  const rows = raw.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const header = splitDelimitedRow(rows[0] ?? "", delimiter).map((cell) => cell.trim());
  if (!header.includes("word") || !header.includes("parts")) {
    throw new Error("word decomposition delimited input must include word and parts headers");
  }
  return rows.slice(1).map((row) => {
    const cells = splitDelimitedRow(row, delimiter);
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = cells[index] ?? "";
    });
    return record;
  });
}

function splitDelimitedRow(row: string, delimiter: "," | "\t"): string[] {
  if (delimiter === "\t") {
    return row.split("\t");
  }
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index] ?? "";
    const next = row[index + 1] ?? "";
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function asRawCorpus(value: unknown): RawDecompositionCorpus | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Array.isArray(value.entries) ? value as RawDecompositionCorpus : undefined;
}

function rawSources(value: unknown): EverydayCorpusSource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeSource);
}

function rawEntries(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
}

function normalizeSource(value: unknown): EverydayCorpusSource {
  if (!isRecord(value)) {
    throw new Error("word decomposition source must be an object");
  }
  const source = {
    source_id: requiredString(value.source_id, "source.source_id"),
    source_name: requiredString(value.source_name, "source.source_name"),
    source_url: requiredString(value.source_url, "source.source_url"),
    license: optionalString(value.license) ?? "private",
    retrieved_at: optionalString(value.retrieved_at) ?? new Date().toISOString().slice(0, 10),
    generation_script: optionalString(value.generation_script) ?? "manual-import",
    included_fields: stringArray(value.included_fields, [
      "word",
      "parts",
      "translation_zh",
      "level",
      "source_id",
    ]),
    notes: optionalString(value.notes) ?? "Explicit human-authored word splits.",
  };
  assertExplicitSource(source);
  return source;
}

function normalizeEntry(
  value: unknown,
  fallbackSourceId: string,
): EverydayWordDecompositionEntry {
  if (!isRecord(value)) {
    throw new Error("word decomposition entry must be an object");
  }
  const word = normalizedToken(requiredString(value.word, "entry.word"), "entry.word");
  const parts = explicitParts(value.parts);
  const translation =
    optionalString(value.translation_zh) ??
    optionalString(value.translation) ??
    optionalString(value.zh);
  const level = optionalLevel(value.level) ?? "cet4";
  const sourceId = optionalString(value.source_id) ?? fallbackSourceId;

  assertExplicitSourceId(sourceId, `entry.source_id for ${word}`);
  if (parts.join("") !== word) {
    throw new Error(
      `word decomposition parts must join to the word: ${word} !== ${parts.join("")}`,
    );
  }
  if (translation === undefined || translation.trim().length === 0) {
    throw new Error(`word decomposition entry is missing translation_zh: ${word}`);
  }
  return {
    word,
    parts,
    translation_zh: translation.trim(),
    level,
    source_id: sourceId,
  };
}

function explicitParts(value: unknown): string[] {
  if (value === undefined) {
    throw new Error("word decomposition entry is missing explicit parts");
  }
  const rawParts = Array.isArray(value)
    ? value.map((part) => requiredString(part, "entry.parts[]"))
    : requiredString(value, "entry.parts").split(/[,\s+\/|·-]+/u);
  const parts = rawParts
    .map((part) => normalizedToken(part, "entry.parts[]"))
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    throw new Error("word decomposition entry must include at least two explicit parts");
  }
  return parts;
}

function normalizedToken(value: string, field: string): string {
  const token = value.trim().toLowerCase();
  if (token.length === 0) {
    throw new Error(`${field} must not be blank`);
  }
  if (!/^[a-z]+$/u.test(token)) {
    throw new Error(`${field} must contain only English letters: ${value}`);
  }
  return token;
}

function optionalLevel(value: unknown): EverydayLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return levels.includes(value as EverydayLevel) ? value as EverydayLevel : undefined;
}

function addSource(
  sources: Map<string, EverydayCorpusSource>,
  source: EverydayCorpusSource,
): void {
  assertExplicitSource(source);
  if (!sources.has(source.source_id)) {
    sources.set(source.source_id, source);
  }
}

function assertExplicitSource(source: EverydayCorpusSource): void {
  assertExplicitSourceId(source.source_id, "source.source_id");
  if (isSyntheticSplitSource(source.generation_script)) {
    throw new Error(
      `word decomposition source must not use inferred or generated splits: ${source.source_id}`,
    );
  }
}

function assertExplicitSourceId(sourceId: string, field: string): void {
  if (sourceId.trim().length === 0) {
    throw new Error(`${field} must not be blank`);
  }
  if (isSyntheticSplitSource(sourceId)) {
    throw new Error(`${field} must identify an explicit human-authored source`);
  }
}

function isSyntheticSplitSource(value: string): boolean {
  return /\b(?:algorithmic|algorithm|auto[-_ ]?split|generated[-_ ]?splits?|guessed?|heuristic|inferred?|synthetic|llm)\b/iu
    .test(value.trim());
}

function fallbackSourceFromOptions(): EverydayCorpusSource {
  return normalizeSource({
    source_id: optionValue("--source-id") ?? "user:word-decomposition",
    source_name: optionValue("--source-name") ?? "User word decomposition source",
    source_url: optionValue("--source-url") ?? "file://local-word-decomposition",
    license: optionValue("--license") ?? "private-user-provided",
    retrieved_at: optionValue("--retrieved-at") ?? new Date().toISOString().slice(0, 10),
    generation_script: "manual-import",
    included_fields: ["word", "parts", "translation_zh", "level", "source_id"],
    notes: "Explicit human-authored word splits imported from local source data.",
  });
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function levelIndex(level: EverydayLevel): number {
  const index = levels.findIndex((candidate) => candidate === level);
  return index === -1 ? levels.length : index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

if (import.meta.main) {
  await main();
}
