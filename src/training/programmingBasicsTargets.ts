import type { PracticeTarget, SessionRecord } from "../domain/model";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
  type ProgrammingBasicsCard,
  type ProgrammingBasicsKind,
  type ProgrammingBasicsOptions,
} from "../content/programmingBasics";
import type { BuildTargetContext } from "./targets";

const CARDS_PER_LESSON_MIN = 8;
const CARDS_PER_LESSON_MAX = 10;
const RECENT_RECORDS_FOR_DEDUP = 10;

export function resolveProgrammingBasicsLanguage(
  codeConfig: { languages?: string[] } | undefined,
  available: string[],
  random: () => number,
): string {
  if (available.length === 0) {
    throw new Error("programming basics corpus is missing");
  }
  const selected = (codeConfig?.languages ?? []).filter((language) =>
    available.includes(language),
  );
  const pool = selected.length > 0 ? selected : available;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? pool[0]!;
}

function recentBasicsLines(records: SessionRecord[]): Set<string> {
  const lines = new Set<string>();
  const basics = records
    .filter((record) => record.module === "programming_basics")
    .slice(-RECENT_RECORDS_FOR_DEDUP);
  for (const record of basics) {
    for (const line of record.target_text.split("\n")) {
      if (line.trim().length > 0) {
        lines.add(line);
      }
    }
  }
  return lines;
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function pickBalancedCards(
  cards: ProgrammingBasicsCard[],
  used: Set<string>,
  random: () => number,
): ProgrammingBasicsCard[] {
  const buckets = new Map<string, ProgrammingBasicsCard[]>();
  for (const card of cards) {
    const bucket = buckets.get(card.topic) ?? [];
    bucket.push(card);
    buckets.set(card.topic, bucket);
  }
  for (const [topic, bucket] of buckets) {
    const randomized = shuffled(bucket, random);
    randomized.sort((a, b) => Number(used.has(a.text)) - Number(used.has(b.text)));
    buckets.set(topic, randomized);
  }
  const topics = shuffled([...buckets.keys()], random);
  const picked: ProgrammingBasicsCard[] = [];
  const seen = new Set<string>();
  let round = 0;
  while (picked.length < CARDS_PER_LESSON_MAX && round < 64) {
    let advanced = false;
    for (const topic of topics) {
      if (picked.length >= CARDS_PER_LESSON_MAX) break;
      const card = buckets.get(topic)?.[round];
      if (card === undefined || seen.has(card.text)) continue;
      seen.add(card.text);
      picked.push(card);
      advanced = true;
    }
    if (!advanced) break;
    round += 1;
  }
  return picked.slice(0, Math.min(picked.length, CARDS_PER_LESSON_MAX));
}

function basicsCodeBlock(language: string, lineCount: number) {
  return {
    start_line: 0,
    line_count: lineCount,
    language,
    framework: "",
    project: "keyloop-programming-basics",
    source: `keyloop:programming-basics:${language}`,
  };
}

function basicsTarget(
  kind: ProgrammingBasicsKind,
  sourceSlug: string,
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
): PracticeTarget {
  const random = context.random ?? Math.random;
  const available = listProgrammingBasicsLanguages(options);
  const language = resolveProgrammingBasicsLanguage(context.codeConfig, available, random);
  const cards = loadProgrammingBasicsCards(kind, language, options);
  const picked = pickBalancedCards(cards, recentBasicsLines(context.records), random);
  const text = picked.map((card) => card.text).join("\n");
  return {
    mode: "code",
    text,
    source: `keyloop:module:programming-basics:${sourceSlug}:${language}`,
    code_blocks: [basicsCodeBlock(language, picked.length)],
  };
}

export function buildSymbolsNumbersTarget(
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
): PracticeTarget {
  return basicsTarget("symbols_numbers", "symbols-numbers", context, options);
}

export function buildBuiltinApiTarget(
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
): PracticeTarget {
  return basicsTarget("builtin_api", "builtin-api", context, options);
}
