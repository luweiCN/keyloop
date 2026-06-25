import type { PracticeTarget, SessionRecord } from "../domain/model";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
  type ProgrammingBasicsCard,
  type ProgrammingBasicsKind,
  type ProgrammingBasicsOptions,
} from "../content/programmingBasics";
import { recentFeedbackTerms } from "./feedback";
import { chunkWords, type BuildTargetContext } from "./targets";
import { weakKeyWeights, weightedSampleWithoutReplacement, wordKeyWeight } from "./wordTargeting";

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

/**
 * 符号专项弱键账本：从统一 per-key 弱键里只取「数字 / 符号键」（滤掉 a-zA-Z 字母键），
 * 这样符号专项靶向只被你弱的符号/数字键驱动，不因卡里恰好含某个弱字母（如 items 的 i）跑偏。
 */
export function symbolWeakKeyWeights(records: readonly SessionRecord[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, weight] of weakKeyWeights(records)) {
    if (!/[a-zA-Z]/u.test(key)) {
      out.set(key, weight);
    }
  }
  return out;
}

/**
 * 偏重「含弱符号/数字键」的真实卡：按弱键覆盖分加权无放回抽样。
 * 保底权重 1 让普通卡也掺入（避免怪卷，仿阶段二单词靶向）；绝不改写卡内容——只筛选。
 * weakWeights 为空（无弱键/无记录）时全卡权重 1，退化为均匀随机。
 */
export function pickWeakKeyTargetedCards(
  cards: ProgrammingBasicsCard[],
  weakWeights: ReadonlyMap<string, number>,
  count: number,
  random: () => number,
): ProgrammingBasicsCard[] {
  return weightedSampleWithoutReplacement(
    cards,
    (card) => 1 + wordKeyWeight(card.text, weakWeights),
    count,
    random,
  );
}

/**
 * value 卡形式覆盖选材：按 format 分组，round-robin 跨形式逐张取（组内用弱键加权抽样），
 * 保证选出的卡尽量覆盖不同形式。count 超形式种数时各组继续取下一张、不重复。绝不改写卡。
 */
export function pickFormCoveredValueCards(
  valueCards: ProgrammingBasicsCard[],
  weakWeights: ReadonlyMap<string, number>,
  count: number,
  random: () => number,
): ProgrammingBasicsCard[] {
  const groups = new Map<string, ProgrammingBasicsCard[]>();
  for (const card of valueCards) {
    const key = card.format ?? "other";
    const bucket = groups.get(key) ?? [];
    bucket.push(card);
    groups.set(key, bucket);
  }
  // 组内按弱键加权排好序（无放回抽样得到顺序），每组当作一个队列，round-robin 跨形式取
  const queues = [...groups.values()].map((bucket) =>
    weightedSampleWithoutReplacement(
      bucket,
      (card) => 1 + wordKeyWeight(card.text, weakWeights),
      bucket.length,
      random,
    ),
  );
  const picked: ProgrammingBasicsCard[] = [];
  let round = 0;
  while (picked.length < count) {
    let advanced = false;
    for (const queue of queues) {
      if (picked.length >= count) break;
      const card = queue[round];
      if (card === undefined) continue;
      picked.push(card);
      advanced = true;
    }
    if (!advanced) break; // 所有组耗尽
    round += 1;
  }
  return picked;
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

function basicsCodeBlock(language: string, startLine: number, lineCount: number) {
  return {
    start_line: startLine,
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

export function symbolsNumbersText(cards: ProgrammingBasicsCard[]): {
  text: string;
  highlightFromLine: number;
} {
  const values = cards.filter((card) => card.form === "value");
  const statements = cards.filter((card) => card.form !== "value" && card.form !== "block");
  const blocks = cards.filter((card) => card.form === "block");
  const valueLines: string[] = [];
  for (let index = 0; index < values.length; index += VALUES_PER_LINE) {
    valueLines.push(
      values
        .slice(index, index + VALUES_PER_LINE)
        .map((card) => card.text)
        .join(" "),
    );
  }
  const singleLines = [...valueLines, ...statements.map((card) => card.text)];
  const sections = singleLines.length > 0 ? [singleLines.join("\n")] : [];
  sections.push(...blocks.map((card) => card.text));
  // value 行排在最前、不做代码高亮（裸值统一普通色）；从 statement 行起才高亮。
  return { text: sections.join("\n\n"), highlightFromLine: valueLines.length };
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
  // 符号/数字专项：有弱符号/数字键 → 偏重含弱键的真实卡（阶段3靶向）；
  // 无弱键（无记录/全达标）→ 回退 topic 均衡随机，行为不变。其余 kind 不变。
  const picked = ((): ProgrammingBasicsCard[] => {
    if (kind === "symbols_numbers") {
      const weak = symbolWeakKeyWeights(context.records ?? []);
      if (weak.size > 0) {
        return pickWeakKeyTargetedCards(cards, weak, CARDS_PER_LESSON_MAX, random);
      }
    }
    return pickBalancedCards(cards, random);
  })();
  const built =
    kind === "symbols_numbers"
      ? symbolsNumbersText(picked)
      : { text: picked.map((card) => card.text).join("\n"), highlightFromLine: 0 };
  const totalLines = built.text.split("\n").length;
  return {
    mode: "code",
    text: built.text,
    source: `keyloop:module:programming-basics:${sourceSlug}:${language}`,
    // 只高亮 value 之后的 statement/block 行；value 行落在块外 → 渲染层按普通色显示。
    // 始终保留一个 declared block(即便 line_count=0)，以走"按声明块高亮"而非整体推断高亮。
    code_blocks: [
      basicsCodeBlock(
        language,
        built.highlightFromLine,
        Math.max(0, totalLines - built.highlightFromLine),
      ),
    ],
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
    code_blocks: [basicsCodeBlock(language, 0, text.split("\n").length)],
  };
}
