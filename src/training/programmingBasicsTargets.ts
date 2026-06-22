import type { PracticeTarget } from "../domain/model";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
  type ProgrammingBasicsCard,
  type ProgrammingBasicsKind,
  type ProgrammingBasicsOptions,
} from "../content/programmingBasics";
import { recentFeedbackTerms } from "./feedback";
import { chunkWords, type BuildTargetContext } from "./targets";

const CARDS_PER_LESSON_MIN = 8;
const CARDS_PER_LESSON_MAX = 10;

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

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// 纯随机均衡组卷：每个 topic 桶内随机打乱后按 topic 轮流取卡（保证 topic 覆盖均衡）。
// 不再"偏好/排除最近练过的卡"——那会造成确定性轮转（今天 ABC、明天 DEF、循环回 ABC 顺序还一样）；
// 改为每次独立随机，靠卡池规模自然降低跨天重复（见 ADR-0002 跨天去重 follow-up）。
function pickBalancedCards(
  cards: ProgrammingBasicsCard[],
  random: () => number,
): ProgrammingBasicsCard[] {
  const buckets = new Map<string, ProgrammingBasicsCard[]>();
  for (const card of cards) {
    const bucket = buckets.get(card.topic) ?? [];
    bucket.push(card);
    buckets.set(card.topic, bucket);
  }
  for (const [topic, bucket] of buckets) {
    buckets.set(topic, shuffled(bucket, random));
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

// 代码基础三形态组装：value 卡按空格聚合成行，statement 卡一行一张，
// block 卡保留多行且块间以空行分隔（与代码实战一致的输入体验）。
const VALUES_PER_LINE = 4;

function symbolsNumbersText(cards: ProgrammingBasicsCard[]): string {
  const values = cards.filter((card) => card.form === "value");
  const statements = cards.filter((card) => card.form !== "value" && card.form !== "block");
  const blocks = cards.filter((card) => card.form === "block");
  const singleLines: string[] = [];
  for (let index = 0; index < values.length; index += VALUES_PER_LINE) {
    singleLines.push(
      values
        .slice(index, index + VALUES_PER_LINE)
        .map((card) => card.text)
        .join(" "),
    );
  }
  singleLines.push(...statements.map((card) => card.text));
  const sections = singleLines.length > 0 ? [singleLines.join("\n")] : [];
  sections.push(...blocks.map((card) => card.text));
  return sections.join("\n\n");
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
  const picked = pickBalancedCards(cards, random);
  const text =
    kind === "symbols_numbers"
      ? symbolsNumbersText(picked)
      : picked.map((card) => card.text).join("\n");
  return {
    mode: "code",
    text,
    source: `keyloop:module:programming-basics:${sourceSlug}:${language}`,
    code_blocks: [basicsCodeBlock(language, text.split("\n").length)],
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

export function namingLinesFromWords(
  words: string[],
  random: () => number,
  count: number,
): string[] {
  const pool = shuffled(
    words.filter((word) => /^[a-z]+$/.test(word)),
    random,
  );
  const lines: string[] = [];
  for (const word of pool.slice(0, Math.max(0, count))) {
    const pascal = word.charAt(0).toUpperCase() + word.slice(1);
    lines.push(`${word} get${pascal} ${pascal}Config ${word.toUpperCase()}_LIMIT`);
  }
  return lines;
}

export function buildProgrammingBasicsMixTarget(
  context: BuildTargetContext,
  options: ProgrammingBasicsOptions = {},
): PracticeTarget {
  const random = context.random ?? Math.random;
  const available = listProgrammingBasicsLanguages(options);
  const language = resolveProgrammingBasicsLanguage(context.codeConfig, available, random);
  const symbolCards = pickBalancedCards(
    loadProgrammingBasicsCards("symbols_numbers", language, options).filter(
      (card) => card.form !== "block",
    ),
    random,
  ).slice(0, 3);
  const apiCards = pickBalancedCards(
    loadProgrammingBasicsCards("builtin_api", language, options),
    random,
  ).slice(0, 3);

  const lines: string[] = [];
  const feedback = recentFeedbackTerms(context.records);
  if (feedback.length > 0) {
    lines.push(...chunkWords(feedback.slice(0, 8), 4));
  }
  lines.push(...symbolCards.map((card) => card.text));
  lines.push(...apiCards.map((card) => card.text));
  const wordPool = context.library.programming_words.map((entry) => entry.word);
  lines.push(...namingLinesFromWords(wordPool, random, 2));
  const words = shuffled(wordPool, random).slice(0, 8);
  if (words.length > 0) {
    lines.push(...chunkWords(words, 4));
  }

  const text = lines.join("\n");
  return {
    mode: "code",
    text,
    source: `keyloop:module:programming-basics-mix:${language}`,
    code_blocks: [basicsCodeBlock(language, text.split("\n").length)],
  };
}
