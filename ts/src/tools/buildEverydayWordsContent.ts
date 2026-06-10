import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  EverydayCorpusSource,
  EverydayWordEntry,
  EverydayWordsCorpus,
} from "../content/library";
import type { EverydayLevel, EverydayWordRange } from "../domain/model";

interface MonkeyTypeWordList {
  name?: unknown;
  words?: unknown;
}

interface BuildWordsOptions {
  sourceId: string;
  retrievedAt: string;
  limit: number;
}

interface BuildWordsResult {
  corpus: EverydayWordsCorpus;
  stats: {
    words: number;
    kept: number;
    missingTranslations: number;
  };
}

const defaultWordsSource =
  "https://raw.githubusercontent.com/monkeytypegame/monkeytype/master/frontend/static/languages/english_10k.json";
const defaultDictionarySource =
  "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";
const defaultOutput = "ts/content/everyday_words.json";

async function main(): Promise<void> {
  const wordsSource = optionValue("--words-source") ?? defaultWordsSource;
  const dictionarySource = optionValue("--dictionary-source") ?? defaultDictionarySource;
  const output = resolve(optionValue("--output") ?? defaultOutput);
  const limit = numericOptionValue("--limit") ?? 10000;
  const retrievedAt = optionValue("--retrieved-at") ?? new Date().toISOString().slice(0, 10);

  const wordsRaw = await readTextSource(wordsSource);
  const dictionaryRaw = await readTextSource(dictionarySource);
  const result = buildEverydayWordsCorpus(wordsRaw, dictionaryRaw, {
    sourceId: "monkeytype:english_10k+ecdict",
    retrievedAt,
    limit,
  });

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result.corpus, null, 2)}\n`);
  console.log(
    [
      `Output: ${output}`,
      `words ${result.stats.words}`,
      `kept ${result.stats.kept}`,
      `missing translations ${result.stats.missingTranslations}`,
    ].join(" | "),
  );
}

export function buildEverydayWordsCorpus(
  monkeyTypeJson: string,
  dictionaryCsv: string,
  options: BuildWordsOptions,
): BuildWordsResult {
  const words = monkeyTypeWords(monkeyTypeJson).slice(0, options.limit);
  const translations = ecdictTranslations(dictionaryCsv, new Set(words));
  const entries: EverydayWordEntry[] = [];
  let missingTranslations = 0;

  words.forEach((word, index) => {
    const translation = translations.get(word);
    if (translation === undefined) {
      missingTranslations += 1;
      return;
    }
    const rank = index + 1;
    entries.push({
      word,
      rank,
      range: everydayRange(rank),
      level: everydayLevel(rank),
      translation_zh: translation,
      source_id: options.sourceId,
    });
  });

  return {
    corpus: {
      sources: [
        source(
          options.sourceId,
          "MonkeyType English 10k with ECDICT Chinese translations",
          `${defaultWordsSource} + ${defaultDictionarySource}`,
          options.retrievedAt,
        ),
      ],
      entries,
    },
    stats: {
      words: words.length,
      kept: entries.length,
      missingTranslations,
    },
  };
}

function monkeyTypeWords(raw: string): string[] {
  const parsed = JSON.parse(raw) as MonkeyTypeWordList;
  if (!Array.isArray(parsed.words)) {
    throw new Error("MonkeyType word source must contain a words array");
  }
  const seen = new Set<string>();
  const words: string[] = [];
  for (const item of parsed.words) {
    if (typeof item !== "string") {
      continue;
    }
    const word = item.trim().toLowerCase();
    if (!/^[a-z]+$/u.test(word) || seen.has(word)) {
      continue;
    }
    seen.add(word);
    words.push(word);
  }
  return words;
}

function ecdictTranslations(raw: string, wanted: Set<string>): Map<string, string> {
  const rows = parseCsvRows(raw);
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const wordIndex = header.indexOf("word");
  const translationIndex = header.indexOf("translation");
  if (wordIndex < 0 || translationIndex < 0) {
    throw new Error("ECDICT CSV must include word and translation columns");
  }
  const translations = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const word = (row[wordIndex] ?? "").trim().toLowerCase();
    if (!wanted.has(word) || translations.has(word)) {
      continue;
    }
    const translation = cleanTranslation(row[translationIndex] ?? "");
    if (translation !== undefined) {
      translations.set(word, translation);
    }
  }
  return translations;
}

function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] ?? "";
    const next = raw[index + 1] ?? "";
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function cleanTranslation(value: string): string | undefined {
  const parts = value
    .replace(/\\n/gu, "\n")
    .split(/\n|;/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 3);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("；");
}

function everydayRange(rank: number): EverydayWordRange {
  if (rank <= 200) {
    return "200";
  }
  if (rank <= 1000) {
    return "1000";
  }
  if (rank <= 5000) {
    return "5000";
  }
  return "10000";
}

function everydayLevel(rank: number): EverydayLevel {
  if (rank <= 3500) {
    return "high_school";
  }
  if (rank <= 4500) {
    return "cet4";
  }
  if (rank <= 6000) {
    return "cet6";
  }
  if (rank <= 7000) {
    return "postgraduate";
  }
  return "toefl_ielts";
}

function source(
  sourceId: string,
  sourceName: string,
  sourceUrl: string,
  retrievedAt: string,
): EverydayCorpusSource {
  return {
    source_id: sourceId,
    source_name: sourceName,
    source_url: sourceUrl,
    license: "CC-BY-SA-4.0 + MIT",
    retrieved_at: retrievedAt,
    generation_script: "ts/src/tools/buildEverydayWordsContent.ts",
    included_fields: ["word", "rank", "range", "level", "translation_zh", "source_id"],
    notes: "Words keep MonkeyType frequency order. Chinese translations are imported from ECDICT when present.",
  };
}

async function readTextSource(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//u.test(pathOrUrl)) {
    const response = await fetch(pathOrUrl);
    if (!response.ok) {
      throw new Error(`fetch failed ${response.status}: ${pathOrUrl}`);
    }
    return response.text();
  }
  return readFile(resolve(pathOrUrl), "utf8");
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function numericOptionValue(name: string): number | undefined {
  const value = optionValue(name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

if (import.meta.main) {
  await main();
}
