import type { ContentLibrary } from "../content/library";
import type {
  PersonalArticleEntry,
  PersonalSentenceEntry,
} from "./personalCorpus";
import { pickCodeCorpusSnippetsExcludingByDifficulty } from "../content/codeCorpus";
import { formatCodeSnippetsForPractice } from "../content/codeFormatter";
import {
  pickBuiltinCodeExcludingByDifficulty,
  pickCodeSnippetsExcludingByDifficulty,
  codeSnippetExclusionKey,
  type CodeSnippet,
} from "../content/snippets";
import { defaultCodePracticeConfig } from "../domain/model";
import type {
  CodePracticeConfig,
  CodeStyleSettings,
  DailyPracticePlan,
  EverydayEnglishSettings,
  LessonKind,
  MixProfile,
  PracticeLesson,
  PracticePlan,
  PracticeTarget,
  PracticeTargetAnnotation,
  PracticeTargetCodeBlock,
  SessionRecord,
  TrainingCategory,
  TrainingModule,
  UserPreferences,
} from "../domain/model";
import { recentFeedbackTerms } from "./feedback";
import { PLAN_HISTORY_DAYS } from "./plan";
import {
  type LongWordEntry,
  rankPersonalVocabulary,
  type PersonalVocabularyEntry,
} from "./vocabulary";

export interface BuildTargetContext {
  records: SessionRecord[];
  plan: PracticePlan;
  library: ContentLibrary;
  codeConfig?: Partial<CodePracticeConfig>;
  codeStyle?: CodeStyleSettings;
  localCodeSnippets?: CodeSnippet[];
  localCodeSource?: string;
  localCodeScanError?: string;
  everydaySettings?: Partial<EverydayEnglishSettings>;
  wordBreakdownSettings?: UserPreferences["word_breakdown"];
  personalVocabulary?: PersonalVocabularyEntry[];
  personalSentences?: PersonalSentenceEntry[];
  personalArticles?: PersonalArticleEntry[];
  personalVocabularyLimit?: number;
  random?: () => number;
  now?: Date;
}

export interface BuildLongWordBreakdownPracticeOptions {
  profile: MixProfile;
  domain?: LongWordEntry["domain"];
  domains?: LongWordEntry["domain"][];
  maxItems: number;
}

export interface BuildPersonalVocabularyPracticeOptions {
  maxItems: number;
  now?: Date;
  tag?: string | undefined;
}

export type EverydayPracticeTargetKind =
  | "common_500"
  | "common_1000"
  | "common_5000"
  | "words"
  | "phrases"
  | "sentences"
  | "articles"
  | "word_decomposition"
  | "mix";

export type ProgrammingBasicsPracticeTargetKind =
  | "operators_brackets_quotes"
  | "programming_terms"
  | "naming_styles"
  | "mix";

export type FoundationPracticeTargetKind =
  | "home-row"
  | "top-row"
  | "bottom-row"
  | "number-row"
  | "punctuation-edges"
  | "left-hand"
  | "right-hand"
  | "index-fingers"
  | "middle-fingers"
  | "ring-fingers"
  | "pinky-fingers"
  | "horizontal-rolls"
  | "vertical-ladders"
  | "diagonal-crossovers"
  | "english-transitions"
  | "capitalization";

interface FoundationDrillSelectionLimits {
  minLines: number;
  maxLines: number;
  targetChars: number;
}

interface WeightedFoundationDrill {
  id: string;
  weight: number;
}

interface BreakdownCandidate {
  word: string;
  parts: string[];
  aliases: string[];
  identifierForms: boolean;
  domain: LongWordEntry["domain"];
}

type ComprehensiveTrainingModule = Extract<
  TrainingModule,
  "foundation_input" | "everyday_english" | "programming_basics" | "code_practice"
>;

const maxComprehensiveBreakdownItems = 6;

interface ModuleSequenceItem {
  kind: LessonKind;
  module: ComprehensiveTrainingModule;
  category: TrainingCategory;
}

interface ModuleReadiness {
  stableModules: Set<TrainingModule>;
  weakModules: Set<TrainingModule>;
}

interface ModulePerformance {
  samples: number;
  completedSamples: number;
  typedLen: number;
  correctChars: number;
  errors: number;
  backspaces: number;
}

interface EverydayWordScope {
  tierLimit: number;
  sourceSlug?: string;
}

const fallbackLongWords: LongWordEntry[] = [
  {
    word: "internationalization",
    parts: ["international", "ization"],
    aliases: ["i18n"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "accessibility",
    parts: ["access", "ibility"],
    aliases: ["a11y"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "authentication",
    parts: ["authentic", "ation"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "authorization",
    parts: ["author", "ization"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "configuration",
    parts: ["config", "uration"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "initialization",
    parts: ["initial", "ization"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "serialization",
    parts: ["serial", "ization"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "synchronization",
    parts: ["synchron", "ization"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "compatibility",
    parts: ["compat", "ibility"],
    domain: "programming",
    tier: 3,
    source_id: "keyloop:long-words:fallback",
  },
  {
    word: "performance",
    parts: ["perform", "ance"],
    domain: "programming",
    tier: 2,
    source_id: "keyloop:long-words:fallback",
  },
];

const everydayMeaningsZh: Record<string, string> = {
  about: "关于",
  after: "在之后",
  again: "再次",
  always: "总是",
  around: "周围",
  before: "在之前",
  better: "更好",
  between: "在之间",
  change: "改变",
  during: "在期间",
  enough: "足够",
  family: "家庭",
  friend: "朋友",
  garden: "花园",
  happen: "发生",
  inside: "里面",
  listen: "听",
  market: "市场",
  morning: "早晨",
  outside: "外面",
  practice: "练习",
  question: "问题",
  really: "确实",
  simple: "简单",
  today: "今天",
  tomorrow: "明天",
  together: "一起",
  usually: "通常",
  weather: "天气",
  without: "没有",
  already: "已经",
  another: "另一个",
  careful: "小心的",
  compare: "比较",
  deliver: "交付",
  discuss: "讨论",
  explain: "解释",
  follow: "跟随",
  improve: "改进",
  prepare: "准备",
  request: "请求",
  schedule: "安排",
  support: "支持",
  update: "更新",
  confirm: "确认",
  deadline: "截止时间",
  feedback: "反馈",
  priority: "优先级",
  progress: "进展",
  proposal: "提案",
  review: "复盘/审查",
  timeline: "时间线",
};

export function everydayWordMeaning(word: string): string | undefined {
  return everydayMeaningsZh[word.toLowerCase()];
}

export function everydayMeaningLines(text: string, maxWords: number): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const rawWord of text.split(/[^A-Za-z]+/u)) {
    if (lines.length >= maxWords) {
      break;
    }
    if (rawWord.length === 0) {
      continue;
    }
    const word = rawWord.toLowerCase();
    if (seen.has(word)) {
      continue;
    }
    const meaning = everydayWordMeaning(word);
    if (meaning === undefined) {
      continue;
    }
    seen.add(word);
    lines.push(`${word}: ${meaning}`);
  }

  return lines;
}

export function identifierParts(value: string): string[] {
  const chars = Array.from(value);
  const parts: string[] = [];
  let current = "";

  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index];
    if (ch === undefined) {
      continue;
    }
    if (!isAsciiAlphanumeric(ch)) {
      pushIdentifierPart(parts, current);
      current = "";
      continue;
    }
    if (current.length > 0 && startsIdentifierBoundary(chars, index)) {
      pushIdentifierPart(parts, current);
      current = "";
    }
    current += ch.toLowerCase();
  }
  pushIdentifierPart(parts, current);
  return parts;
}

export function focusNamingLines(words: string[]): string[] {
  const lines: string[] = [];
  for (const word of words.slice(0, 4)) {
    const original = word.trim();
    const parts = identifierParts(original);
    if (parts.length === 0 || parts.join("").length < 4) {
      continue;
    }
    const camel = camelCase(parts);
    const pascal = pascalCase(parts);
    const constant = parts.map((part) => part.toUpperCase()).join("_");
    lines.push(
      uniqueLineItems([
        original,
        camel,
        pascal,
        `get${pascal}`,
        constant,
      ]),
    );
  }
  return lines;
}

function focusWordChunkLines(words: string[]): string[] {
  const lines: string[] = [];
  for (const word of words.slice(0, 5)) {
    const original = word.trim();
    const parts = identifierParts(original);
    if (parts.length >= 2) {
      lines.push(uniqueLineItems([parts.slice(0, 5).join(" "), original]));
      continue;
    }

    const [part] = parts;
    if (part === undefined || Array.from(part).length < 4) {
      continue;
    }
    const chars = Array.from(part);
    const prefix = chars.slice(0, 3).join("");
    const suffix = chars.slice(-3).join("");
    lines.push(`${prefix} ${suffix} ${part} ${part}`);
  }
  return lines;
}

function buildLessonWordChunks(
  plan: PracticePlan,
  library: Pick<ContentLibrary, "word_chunks">,
  random: () => number = Math.random,
): string {
  const chunks = focusWordChunkLines(plan.focus_words);
  appendFrom(chunks, library.word_chunks, Math.max(0, 10 - chunks.length), random);
  return chunks.slice(0, 10).join("\n");
}

export function buildLessonWords(
  plan: PracticePlan,
  library: Pick<ContentLibrary, "programming_words">,
  random: () => number = Math.random,
): string {
  const chosen = uniqueFocus(plan.focus_words);
  fillFrom(chosen, library.programming_words, 16, random);
  return chunkWords(chosen.slice(0, 16), 4).join("\n");
}

export function buildProgrammingBasicsMixTarget(
  context: BuildTargetContext,
  profile: MixProfile = "standalone",
): PracticeTarget {
  const random = context.random ?? Math.random;
  const lines: string[] = [];
  const feedbackTerms = recentFeedbackTerms(context.records);
  if (feedbackTerms.length > 0) {
    lines.push(chunkWords(feedbackTerms, 4).join("\n"));
  }

  const breakdownLines = longWordBreakdownLines(context, feedbackTerms, profile);
  if (breakdownLines.length > 0) {
    lines.push(breakdownLines.join("\n"));
  }

  lines.push(buildLessonSymbols(context));
  lines.push(buildLessonNaming(context.plan, context.library, random));
  lines.push(buildLessonWords(context.plan, context.library, random));

  return {
    mode: "symbols",
    text: lines.join("\n"),
    source: "keyloop:module:programming-basics-mix",
  };
}

export function buildFoundationMixPracticeTarget(
  context: BuildTargetContext,
): PracticeTarget {
  return foundationMixTarget(context);
}

export function buildFoundationPracticeTarget(
  context: BuildTargetContext,
  drillId: FoundationPracticeTargetKind,
): PracticeTarget {
  const target = foundationDrillTarget(context, drillId);
  return {
    mode: "chars",
    text: target.items.join("\n"),
    source: `keyloop:foundation:${target.drillId}`,
  };
}

export function buildEverydayPracticeTarget(
  context: BuildTargetContext,
  kind: EverydayPracticeTargetKind,
): PracticeTarget {
  switch (kind) {
    case "common_500":
      return everydayWordsTarget(context, { tierLimit: 2, sourceSlug: "common-500" });
    case "common_1000":
      return everydayWordsTarget(context, { tierLimit: 3, sourceSlug: "common-1000" });
    case "common_5000":
      return everydayWordsTarget(context, { tierLimit: 5, sourceSlug: "common-5000" });
    case "words":
      return everydayWordsTarget(context);
    case "phrases":
      return everydayPhrasesTarget(context);
    case "sentences":
      return everydaySentencesTarget(context);
    case "articles":
      return everydayArticlesTarget(context);
    case "word_decomposition":
      return everydayWordDecompositionTarget(context);
    case "mix":
      return everydayMixTarget(context, "standalone");
  }
}

export function buildProgrammingBasicsPracticeTarget(
  context: BuildTargetContext,
  kind: ProgrammingBasicsPracticeTargetKind,
): PracticeTarget {
  switch (kind) {
    case "operators_brackets_quotes":
      return programmingOperatorsTarget(context);
    case "programming_terms":
      return {
        mode: "words",
        text: buildLessonWords(context.plan, context.library, context.random ?? Math.random),
        source: "keyloop:module:programming-basics:technical-terms",
      };
    case "naming_styles":
      return {
        mode: "case",
        text: buildLessonNaming(context.plan, context.library, context.random ?? Math.random),
        source: "keyloop:module:programming-basics:naming",
      };
    case "mix":
      return buildProgrammingBasicsMixTarget(context);
  }
}

export function buildCodeMixPracticeTarget(
  context: BuildTargetContext,
  count?: number,
): PracticeTarget {
  return codeMixTarget(context, count);
}

export function buildCodeSpecialistPracticeTarget(
  context: BuildTargetContext,
  count = 4,
): PracticeTarget {
  const codeConfig = context.codeConfig ?? {};
  const excludedTexts = usedCodeSnippetTexts(context.records);
  const difficulty = codeDifficultyForContext(context);
  let picked = pickLibraryCodeSnippetsExcludingByDifficulty(
    context.library,
    [],
    codeConfig,
    count,
    excludedTexts,
    difficulty,
    codePickerOptions(context.random),
  );

  if (picked.length < count) {
    const fallback = pickLibraryCodeSnippetsExcludingByDifficulty(
      context.library,
      [],
      codeConfig,
      count - picked.length,
      new Set(),
      undefined,
      codePickerOptions(context.random),
    );
    picked = [
      ...picked,
      ...fallback.filter((snippet) => !picked.some((item) => item.text === snippet.text)),
    ].slice(0, count);
  }

  const formatted = formatCodeSnippetsForContext(picked, context);
  return {
    mode: "code",
    text: formatted.map((snippet) => snippet.text).join("\n\n"),
    source: codeSpecialistSource(codeConfig, formatted.length),
    code_blocks: codeBlocksFromSnippets(formatted),
  };
}

export function refreshModuleMixTarget(
  lesson: PracticeLesson,
  context: BuildTargetContext,
): PracticeTarget {
  switch (lesson.module) {
    case "foundation_input":
      return foundationMixTarget(context);
    case "everyday_english":
      return everydayMixTarget(context, lesson.mix_profile);
    case "programming_basics":
      return buildProgrammingBasicsMixTarget(context, lesson.mix_profile);
    case "code_practice":
      return codeMixTarget(context);
    default:
      return lesson.target;
  }
}

export function buildLongWordBreakdownPracticeTarget(
  context: BuildTargetContext,
  options: BuildLongWordBreakdownPracticeOptions,
): PracticeTarget {
  const candidates = standaloneLongWordCandidates(context, options);
  const firstWord = candidates[0]?.word ?? "none";
  return {
    mode: "words",
    text: candidates.flatMap(breakdownCandidateLines).join("\n"),
    source: `keyloop:module:word-breakdown:${firstWord}`,
  };
}

export function buildPersonalVocabularyPracticeTarget(
  entries: PersonalVocabularyEntry[],
  records: SessionRecord[],
  options: BuildPersonalVocabularyPracticeOptions,
): PracticeTarget {
  const maxItems = normalizedMaxItems(options.maxItems);
  const pool =
    options.tag === undefined
      ? entries
      : entries.filter((entry) => entry.tags.includes(options.tag as string));
  const ranked = rankPersonalVocabulary(pool, records, {
    limit: maxItems,
    ...(options.now === undefined ? {} : { now: options.now }),
  }).map((item) => item.entry);

  return {
    mode: "words",
    text: ranked.flatMap(personalVocabularyStandaloneLines).join("\n"),
    source:
      options.tag === undefined
        ? "keyloop:module:personal-vocabulary"
        : `keyloop:custom:${options.tag}`,
  };
}

export function buildDailyPracticePlan(context: BuildTargetContext): DailyPracticePlan {
  const now = context.now ?? new Date();
  const readiness = moduleReadinessFromRecords(context.records, now);
  const occurrenceCounts = new Map<LessonKind, number>();
  const lessons = comprehensiveModuleSequence(readiness, context.plan).map((item) =>
    buildModuleMixLesson(
      nextLessonId(item.kind, occurrenceCounts),
      item.kind,
      item.module,
      item.category,
      buildModuleMixTarget(context, item.module),
      readiness,
    ),
  );

  return {
    run_id: "",
    run_number: 0,
    target_minutes: 20,
    completed_ms: completedMsForDate(context.records, now),
    lessons,
  };
}

function buildModuleMixLesson(
  id: string,
  kind: LessonKind,
  module: TrainingModule,
  category: TrainingCategory,
  target: PracticeTarget,
  readiness: ModuleReadiness,
): PracticeLesson {
  return {
    id,
    kind,
    module,
    category,
    mix_profile: "comprehensive",
    estimated_minutes: moduleEstimatedMinutes(module, readiness),
    target,
    reason_zh: moduleReasonZh(module, readiness),
    reason_en: moduleReasonEn(module, readiness),
  };
}

function buildModuleMixTarget(
  context: BuildTargetContext,
  module: ComprehensiveTrainingModule,
): PracticeTarget {
  switch (module) {
    case "foundation_input":
      return foundationMixTarget(context);
    case "everyday_english":
      return everydayMixTarget(context, "comprehensive");
    case "programming_basics":
      return buildProgrammingBasicsMixTarget(context, "comprehensive");
    case "code_practice":
      return codeMixTarget(context);
  }
}

function foundationMixTarget(context: BuildTargetContext): PracticeTarget {
  const random = context.random ?? Math.random;
  const drillId = weightedFoundationDrillId(context, random);
  const target = foundationDrillTarget(context, drillId);
  const warmup = repeatPool(context.library.warmup, 4, random);
  return {
    mode: "chars",
    text: [...warmup, ...target.items].join("\n"),
    source: `keyloop:module:foundation-mix:${target.drillId}`,
  };
}

function weightedFoundationDrillId(
  context: BuildTargetContext,
  random: () => number,
): string {
  const drillIds = context.library.foundation_drills.map((drill) => drill.id);
  if (drillIds.length === 0) {
    return "home-row";
  }
  const recentDrillIds = recentFoundationDrillIds(context.records, 6);
  const availableDrillIds = drillIds.filter((drillId) => !recentDrillIds.has(drillId));
  const pool = availableDrillIds.length > 0 ? availableDrillIds : drillIds;
  const focusWeights = foundationDrillFocusWeights(context.plan.focus_keys);
  const weightedPool = pool.map((id): WeightedFoundationDrill => ({
    id,
    weight: 1 + (focusWeights.get(id) ?? 0),
  }));
  return pickWeightedFoundationDrill(weightedPool, random) ?? "home-row";
}

function foundationDrillFocusWeights(keys: string[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const rawKey of keys) {
    const key = rawKey.toLowerCase();
    if (/^[0-9]$/u.test(key)) {
      addFoundationDrillWeight(weights, "number-row");
      continue;
    }
    if ([";", "'", "/", ",", ".", "`", "-", "=", "[", "]", "\\"].includes(key)) {
      addFoundationDrillWeight(weights, "punctuation-edges");
    }
    if (["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"].includes(key)) {
      addFoundationDrillWeight(weights, "top-row");
    }
    if (["z", "x", "c", "v", "b", "n", "m"].includes(key)) {
      addFoundationDrillWeight(weights, "bottom-row");
    }
    if (["f", "g", "h", "j", "r", "t", "y", "u", "v", "b", "n", "m"].includes(key)) {
      addFoundationDrillWeight(weights, "index-fingers");
    }
    if (["a", "q", "z", "p", "[", "]", "\\"].includes(key)) {
      addFoundationDrillWeight(weights, "pinky-fingers");
    }
    if (["q", "w", "e", "r", "t", "a", "s", "d", "f", "g", "z", "x", "c", "v", "b"].includes(key)) {
      addFoundationDrillWeight(weights, "left-hand");
    }
    if (["y", "u", "i", "o", "p", "h", "j", "k", "l", ";", "n", "m", ",", ".", "/"].includes(key)) {
      addFoundationDrillWeight(weights, "right-hand");
    }
  }
  return weights;
}

function addFoundationDrillWeight(
  weights: Map<string, number>,
  drillId: string,
): void {
  weights.set(drillId, (weights.get(drillId) ?? 0) + 4);
}

function pickWeightedFoundationDrill(
  drills: WeightedFoundationDrill[],
  random: () => number,
): string | undefined {
  const totalWeight = drills.reduce((sum, drill) => sum + drill.weight, 0);
  if (totalWeight <= 0) {
    return drills[0]?.id;
  }
  let cursor = random() * totalWeight;
  for (const drill of drills) {
    if (cursor < drill.weight) {
      return drill.id;
    }
    cursor -= drill.weight;
  }
  return drills.at(-1)?.id;
}

function recentFoundationDrillIds(
  records: SessionRecord[],
  limit: number,
): Set<string> {
  const drillIds = new Set<string>();
  for (let index = records.length - 1; index >= 0 && drillIds.size < limit; index -= 1) {
    const source = records[index]?.source;
    const match = source?.match(/^keyloop:(?:foundation|module:foundation-mix):([^:]+)$/u);
    if (match?.[1] !== undefined) {
      drillIds.add(match[1]);
    }
  }
  return drillIds;
}

function foundationDrillTarget(
  context: BuildTargetContext,
  drillId: string,
): { drillId: string; items: string[] } {
  const random = context.random ?? Math.random;
  const drill =
    context.library.foundation_drills.find((item) => item.id === drillId) ??
    context.library.foundation_drills[0];
  const resolvedDrillId = drill?.id ?? "fallback";
  const refillThreshold = context.plan.has_recent_history ? 8 : 6;
  const usedLines = usedFoundationLines(context.records, resolvedDrillId);
  let items = drill?.items.filter((item) => !usedLines.has(item)) ?? [];
  if (drill !== undefined && items.length < refillThreshold) {
    items = [...drill.items];
  }
  shuffleInPlace(items, random);
  return {
    drillId: resolvedDrillId,
    items: selectFoundationDrillItems(
      items,
      foundationDrillSelectionLimits(resolvedDrillId, context.plan.has_recent_history),
    ),
  };
}

function foundationDrillSelectionLimits(
  drillId: string,
  hasRecentHistory: boolean,
): FoundationDrillSelectionLimits {
  if (
    [
      "left-hand",
      "right-hand",
      "index-fingers",
      "middle-fingers",
      "ring-fingers",
      "pinky-fingers",
      "horizontal-rolls",
      "vertical-ladders",
      "diagonal-crossovers",
    ].includes(drillId)
  ) {
    return {
      minLines: 4,
      maxLines: 7,
      targetChars: hasRecentHistory ? 140 : 110,
    };
  }
  if (["english-transitions", "capitalization"].includes(drillId)) {
    return {
      minLines: 2,
      maxLines: 4,
      targetChars: hasRecentHistory ? 200 : 160,
    };
  }
  return {
    minLines: 2,
    maxLines: 4,
    targetChars: hasRecentHistory ? 180 : 140,
  };
}

function selectFoundationDrillItems(
  items: string[],
  limits: FoundationDrillSelectionLimits,
): string[] {
  const selected: string[] = [];
  let textLength = 0;
  for (const item of items) {
    if (selected.length >= limits.maxLines) {
      break;
    }
    const nextLength = textLength + item.length + (selected.length === 0 ? 0 : 1);
    if (selected.length >= limits.minLines && nextLength > limits.targetChars) {
      break;
    }
    selected.push(item);
    textLength = nextLength;
  }
  return selected.length > 0 ? selected : items.slice(0, 1);
}

function usedFoundationLines(
  records: SessionRecord[],
  drillId: string | undefined,
): Set<string> {
  if (drillId === undefined) {
    return new Set();
  }
  const sources = new Set([
    `keyloop:foundation:${drillId}`,
    `keyloop:module:foundation-mix:${drillId}`,
  ]);
  const used = new Set<string>();
  for (const record of records) {
    if (!sources.has(record.source)) {
      continue;
    }
    for (const line of record.target_text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        used.add(trimmed);
      }
    }
  }
  return used;
}

function everydaySettings(context: BuildTargetContext): EverydayEnglishSettings {
  return {
    word_range: "1000",
    word_count: 20,
    sentence_level: "cet4",
    sentence_length: "mixed",
    sentence_count: 5,
    article_level: "cet4",
    article_length: "short",
    decomposition_level: "cet4",
    decomposition_word_count: 10,
    decomposition_part_repeats: 3,
    decomposition_word_repeats: 3,
    include_phrases: true,
    ...context.everydaySettings,
  };
}

function everydayWordItems(context: BuildTargetContext, tierLimit: number): string[] {
  return context.library.everyday_english.entries
    .filter(hasEverydaySource)
    .filter((entry) => entry.kind === "word")
    .filter((entry) => entry.domain === "everyday" || entry.domain === "workplace")
    .filter((entry) => (entry.tier ?? Number.MAX_SAFE_INTEGER) <= tierLimit)
    .map((entry) => entry.text);
}

function hasEverydaySource(
  entry: ContentLibrary["everyday_english"]["entries"][number],
): boolean {
  return entry.source_id.trim().length > 0;
}

function matchesEverydaySentenceLength(
  value: EverydayEnglishSettings["sentence_length"] | null,
  expected: EverydayEnglishSettings["sentence_length"],
): boolean {
  return expected === "mixed" || value === expected;
}

function hasEverydayEntrySource(entry: { source_id: string }): boolean {
  return entry.source_id.trim().length > 0;
}

function excludeRecentEverydayWords<T extends { word: string }>(
  entries: T[],
  records: SessionRecord[],
  targetCount: number,
): T[] {
  const recentWords = recentEverydayWords(records);
  if (recentWords.size === 0) {
    return entries;
  }
  const fresh = entries.filter((entry) => !recentWords.has(entry.word.toLowerCase()));
  return fresh.length >= targetCount ? fresh : entries;
}

function recentEverydayWords(records: SessionRecord[]): Set<string> {
  const recent = new Set<string>();
  for (const record of records.slice(-12)) {
    if (!record.source.includes("everyday-english")) {
      continue;
    }
    for (const word of record.target_text.split(/[^A-Za-z]+/u)) {
      if (word.length > 0) {
        recent.add(word.toLowerCase());
      }
    }
  }
  return recent;
}

interface AnnotationTextItem {
  text: string;
  translation_zh: string;
  source_title?: string;
  display?: PracticeTargetAnnotation["display"];
}

interface AnnotatedTargetText {
  text: string;
  annotations: PracticeTargetAnnotation[];
}

function annotatedTokenText(items: AnnotationTextItem[]): AnnotatedTargetText {
  let text = "";
  const annotations: NonNullable<PracticeTarget["annotations"]> = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    if (index > 0) {
      text += " ";
    }
    const start = text.length;
    text += item.text;
    annotations.push(annotationForItem(start, text.length, item));
  }
  return { text, annotations };
}

function annotatedLineText(
  items: AnnotationTextItem[],
): AnnotatedTargetText {
  let text = "";
  const annotations: NonNullable<PracticeTarget["annotations"]> = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    if (index > 0) {
      text += "\n";
    }
    const start = text.length;
    text += item.text;
    annotations.push(annotationForItem(start, text.length, item));
  }
  return { text, annotations };
}

function combineAnnotatedBlocks(
  blocks: AnnotatedTargetText[],
  separator = "\n",
): AnnotatedTargetText {
  let text = "";
  const annotations: PracticeTargetAnnotation[] = [];
  for (const block of blocks) {
    if (block.text.length === 0) {
      continue;
    }
    if (text.length > 0) {
      text += separator;
    }
    const offset = text.length;
    text += block.text;
    annotations.push(
      ...block.annotations.map((annotation) => ({
        ...annotation,
        start: annotation.start + offset,
        end: annotation.end + offset,
      })),
    );
  }
  return { text, annotations };
}

function annotationForItem(
  start: number,
  end: number,
  item: AnnotationTextItem,
): NonNullable<PracticeTarget["annotations"]>[number] {
  return {
    start,
    end,
    translation_zh: item.translation_zh,
    ...(item.source_title === undefined ? {} : { source_title: item.source_title }),
    ...(item.display === undefined ? {} : { display: item.display }),
  };
}

function conciseChineseMeaning(value: string, maxParts = 1): string {
  const normalized = value
    .replace(/\s+/gu, " ")
    .replace(/[；;，,、]+/gu, "；")
    .trim();
  const parts = normalized
    .split("；")
    .map(cleanChineseMeaningPart)
    .filter((part) => part.length > 0)
    .slice(0, maxParts);
  const joined = parts.length === 0 ? normalized : parts.join("；");
  return joined.length <= 18 ? joined : `${joined.slice(0, 17)}…`;
}

function cleanChineseMeaningPart(value: string): string {
  return value
    .replace(/^\s*(?:n|v|vt|vi|adj|adv|a|prep|conj|pron|art|abbr|num|int|aux|modal|pl|pref|suf)\.\s*/iu, "")
    .replace(/^\s*(?:\[[^\]]+\]|\([^)]*\))\s*/u, "")
    .replace(/^[A-Za-z][A-Za-z -]*\s+(?=\p{Script=Han})/u, "")
    .replace(/^[：:，,；;\s]+/u, "")
    .trim();
}

function slugifySourcePart(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return slug.length > 0 ? slug : "untitled";
}

function languageSymbolItems(context: BuildTargetContext): string[] {
  const codeConfig = context.codeConfig ?? {};
  if (
    codeConfig.language === undefined &&
    codeConfig.framework === undefined &&
    (codeConfig.languages?.length ?? 0) === 0 &&
    (codeConfig.frameworks?.length ?? 0) === 0
  ) {
    return [];
  }

  return context.library.language_symbols
    .filter(
      (set) =>
        symbolSetMatches(set.language, codeConfig.language, codeConfig.languages) ||
        symbolSetMatches(set.framework, codeConfig.framework, codeConfig.frameworks),
    )
    .flatMap((set) => set.items);
}

function symbolSetMatches(
  value: string | null,
  single: string | undefined,
  many: string[] | undefined,
): boolean {
  if (value === null) {
    return false;
  }
  return (
    (single !== undefined && value.toLowerCase() === single.toLowerCase()) ||
    (many ?? []).some((expected) => value.toLowerCase() === expected.toLowerCase())
  );
}

function everydayMixTarget(
  context: BuildTargetContext,
  profile: MixProfile,
): PracticeTarget {
  if (
    context.library.everyday_words.entries.length > 0 ||
    context.library.everyday_sentences.entries.length > 0
  ) {
    return everydayTranslatedMixTarget(context, profile);
  }
  return everydayLegacyMixTarget(context, profile);
}

function everydayTranslatedMixTarget(
  context: BuildTargetContext,
  profile: MixProfile,
): PracticeTarget {
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const wordCandidates = context.library.everyday_words.entries
    .filter(hasEverydayEntrySource)
    .filter((entry) => entry.translation_zh.trim().length > 0)
    .filter((entry) => entry.rank <= Number(settings.word_range));
  const byWord = new Map(wordCandidates.map((entry) => [entry.word.toLowerCase(), entry]));
  const selectedWords = uniqueFocus(context.plan.focus_words)
    .map((word) => byWord.get(word.toLowerCase()))
    .filter((entry): entry is (typeof wordCandidates)[number] => entry !== undefined);
  const fillWords = wordCandidates.filter(
    (entry) =>
      !selectedWords.some(
        (selected) => selected.word.toLowerCase() === entry.word.toLowerCase(),
      ),
  );
  shuffleInPlace(fillWords, random);
  selectedWords.push(...fillWords.slice(0, Math.max(settings.word_count - selectedWords.length, 0)));

  const sentenceCandidates = context.library.everyday_sentences.entries
    .filter(hasEverydayEntrySource)
    .filter((entry) => entry.translation_zh.trim().length > 0)
    .filter((entry) => entry.level === settings.sentence_level)
    .filter((entry) =>
      matchesEverydaySentenceLength(entry.length, settings.sentence_length),
    );
  const sentencePool =
    sentenceCandidates.length > 0
      ? sentenceCandidates
      : context.library.everyday_sentences.entries
          .filter(hasEverydayEntrySource)
          .filter((entry) => entry.translation_zh.trim().length > 0);
  const selectedSentences = [...sentencePool];
  shuffleInPlace(selectedSentences, random);

  const wordsBlock = annotatedTokenText(
    selectedWords.slice(0, settings.word_count).map((entry) => ({
      text: entry.word,
      translation_zh: conciseChineseMeaning(entry.translation_zh),
      display: "word",
    })),
  );
  const sentencesBlock = annotatedLineText(
    selectedSentences.slice(0, everydayMixSentenceCount(profile)).map((entry) => ({
      text: entry.text,
      translation_zh: entry.translation_zh,
      source_title: entry.source_title,
      display: "line",
    })),
  );
  const combined = combineAnnotatedBlocks([wordsBlock, sentencesBlock]);
  return {
    mode: "words",
    text: combined.text,
    source: `keyloop:module:everyday-english:mix:words-${settings.word_range}:count-${Math.min(
      selectedWords.length,
      settings.word_count,
    )}:sentences-${settings.sentence_level}:${settings.sentence_length}:count-${Math.min(
      selectedSentences.length,
      everydayMixSentenceCount(profile),
    )}`,
    annotations: combined.annotations,
  };
}

function everydayLegacyMixTarget(
  context: BuildTargetContext,
  profile: MixProfile,
): PracticeTarget {
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const corpusWords = everydayWordItems(context, 3);
  const common = new Set([...corpusWords, ...context.library.common_words]);
  const chosen = context.plan.focus_words
    .map((word) => word.toLowerCase())
    .filter((word) => common.has(word));
  fillFrom(
    chosen,
    corpusWords.length > 0 ? corpusWords : context.library.common_words,
    settings.word_count,
    random,
  );
  const perLine = everydayMixWordsPerLine(profile);
  const lines = chunkWords(chosen.slice(0, settings.word_count), perLine);
  const breakdownLines = everydayLongWordBreakdownLines(context, profile);
  if (breakdownLines.length > 0) {
    lines.push(...breakdownLines);
  }
  if (settings.include_phrases) {
    const phrases = everydayPhraseItems(context);
    if (phrases.length > 0) {
      lines.push(...chunkWords(phrases, 3).slice(0, 2));
    } else {
      lines.push(buildLessonWordChunks(context.plan, context.library, random));
    }
  }
  lines.push(
    ...everydaySentenceItems(context, settings.sentence_length).slice(
      0,
      everydayMixSentenceCount(profile),
    ),
  );
  return {
    mode: "words",
    text: lines.join("\n"),
    source: `keyloop:module:everyday-english:words-${settings.word_count}:sentences-${settings.sentence_length}`,
  };
}

function everydayMixWordsPerLine(profile: MixProfile): number {
  switch (profile) {
    case "comprehensive":
      return 8;
    case "standalone":
      return 10;
    case "review":
      return 6;
  }
}

function everydayMixSentenceCount(profile: MixProfile): number {
  switch (profile) {
    case "comprehensive":
      return 3;
    case "standalone":
      return 5;
    case "review":
      return 2;
  }
}

function everydayPhraseItems(context: BuildTargetContext): string[] {
  return context.library.everyday_english.entries
    .filter(hasEverydaySource)
    .filter((entry) => entry.kind === "phrase")
    .filter((entry) => entry.domain === "everyday" || entry.domain === "workplace")
    .map((entry) => entry.text);
}

function everydaySentenceItems(
  context: BuildTargetContext,
  sentenceLength: EverydayEnglishSettings["sentence_length"],
): string[] {
  return context.library.everyday_english.entries
    .filter(hasEverydaySource)
    .filter((entry) => entry.kind === "sentence")
    .filter((entry) => entry.domain === "everyday" || entry.domain === "workplace")
    .filter((entry) => matchesEverydaySentenceLength(entry.length, sentenceLength))
    .map((entry) => entry.text);
}

function everydayWordsTarget(
  context: BuildTargetContext,
  scope: EverydayWordScope = { tierLimit: 3 },
): PracticeTarget {
  if (scope.sourceSlug === undefined && context.library.everyday_words.entries.length > 0) {
    return everydayTranslatedWordsTarget(context);
  }
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const words = everydayWordItems(context, scope.tierLimit);
  fillFrom(words, context.library.common_words, settings.word_count);
  shuffleInPlace(words, random);
  const sourcePrefix =
    scope.sourceSlug === undefined
      ? "keyloop:module:everyday-english"
      : `keyloop:module:everyday-english:${scope.sourceSlug}`;
  return {
    mode: "words",
    text: chunkWords(words.slice(0, settings.word_count), 8).join("\n"),
    source: `${sourcePrefix}:words-${settings.word_count}`,
  };
}

function everydayTranslatedWordsTarget(context: BuildTargetContext): PracticeTarget {
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const candidates = context.library.everyday_words.entries
    .filter(hasEverydayEntrySource)
    .filter((entry) => entry.translation_zh.trim().length > 0)
    .filter((entry) => entry.rank <= Number(settings.word_range));
  const available = excludeRecentEverydayWords(candidates, context.records, settings.word_count);
  const selected = [...available];
  shuffleInPlace(selected, random);
  const picked = selected.slice(0, settings.word_count);
  const annotated = annotatedTokenText(
    picked.map((entry) => ({
      text: entry.word,
      translation_zh: conciseChineseMeaning(entry.translation_zh),
      display: "word",
    })),
  );
  return {
    mode: "words",
    text: annotated.text,
    source: `keyloop:module:everyday-english:words-${settings.word_range}:count-${picked.length}`,
    annotations: annotated.annotations,
  };
}

function everydayPhrasesTarget(context: BuildTargetContext): PracticeTarget {
  const settings = everydaySettings(context);
  const phrases = everydayPhraseItems(context);
  fillFrom(phrases, context.library.word_chunks, Math.min(settings.word_count, 20));
  return {
    mode: "words",
    text: phrases.slice(0, Math.min(settings.word_count, 20)).join("\n"),
    source: `keyloop:module:everyday-english:phrases-${Math.min(
      settings.word_count,
      20,
    )}`,
  };
}

function everydaySentencesTarget(context: BuildTargetContext): PracticeTarget {
  if (context.library.everyday_sentences.entries.length > 0) {
    return everydayTranslatedSentencesTarget(context);
  }
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const sentences = everydaySentenceItems(context, settings.sentence_length);
  const allSentences = everydaySentenceItems(context, "mixed");
  fillFrom(sentences, allSentences, 6);
  fillFrom(sentences, chunkWords(context.library.common_words, 6), 6);
  shuffleInPlace(sentences, random);
  return {
    mode: "words",
    text: sentences.slice(0, 6).join("\n"),
    source: `keyloop:module:everyday-english:sentences-${settings.sentence_length}`,
  };
}

function everydayTranslatedSentencesTarget(context: BuildTargetContext): PracticeTarget {
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const matching = context.library.everyday_sentences.entries
    .filter(hasEverydayEntrySource)
    .filter((entry) => entry.translation_zh.trim().length > 0)
    .filter((entry) => entry.level === settings.sentence_level)
    .filter((entry) =>
      matchesEverydaySentenceLength(entry.length, settings.sentence_length),
    );
  const pool =
    matching.length > 0
      ? matching
      : context.library.everyday_sentences.entries
          .filter(hasEverydayEntrySource)
          .filter((entry) => entry.translation_zh.trim().length > 0);
  const selected = [...pool];
  shuffleInPlace(selected, random);
  const picked = selected.slice(0, settings.sentence_count);
  const annotated = annotatedLineText(
    picked.map((entry) => ({
      text: entry.text,
      translation_zh: entry.translation_zh,
      source_title: entry.source_title,
      display: "line",
    })),
  );
  return {
    mode: "words",
    text: annotated.text,
    source: `keyloop:module:everyday-english:sentences-${settings.sentence_level}:${settings.sentence_length}:count-${picked.length}`,
    annotations: annotated.annotations,
  };
}

function everydayArticlesTarget(context: BuildTargetContext): PracticeTarget {
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const matching = context.library.everyday_articles.entries
    .filter(hasEverydayEntrySource)
    .filter((entry) => entry.level === settings.article_level)
    .filter((entry) => matchesEverydaySentenceLength(entry.length, settings.article_length));
  const pool =
    matching.length > 0
      ? matching
      : context.library.everyday_articles.entries.filter(hasEverydayEntrySource);
  const candidates = [...pool];
  shuffleInPlace(candidates, random);
  const article = candidates[0];
  if (article === undefined) {
    return everydaySentencesTarget(context);
  }
  const paragraphs = article.paragraphs.filter(
    (paragraph) =>
      paragraph.text.trim().length > 0 && paragraph.translation_zh.trim().length > 0,
  );
  const text = paragraphs.map((paragraph) => paragraph.text.trim()).join("\n");
  const translation = paragraphs.map((paragraph) => paragraph.translation_zh.trim()).join("\n");
  return {
    mode: "words",
    text,
    source: `keyloop:module:everyday-english:articles-${settings.article_level}:${settings.article_length}:${slugifySourcePart(article.title)}`,
    annotations: [
      {
        start: 0,
        end: text.length,
        translation_zh: translation,
        source_title: article.title,
        display: "article",
      },
    ],
  };
}

function everydayWordDecompositionTarget(context: BuildTargetContext): PracticeTarget {
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const matching = context.library.everyday_word_decomposition.entries
    .filter(hasEverydayEntrySource)
    .filter((entry) => entry.level === settings.decomposition_level)
    .filter((entry) => entry.translation_zh.trim().length > 0)
    .filter((entry) => entry.parts.join("") === entry.word);
  const pool =
    matching.length > 0
      ? matching
      : context.library.everyday_word_decomposition.entries
          .filter(hasEverydayEntrySource)
          .filter((entry) => entry.translation_zh.trim().length > 0)
          .filter((entry) => entry.parts.join("") === entry.word);
  const selected = [...pool];
  shuffleInPlace(selected, random);
  const picked = selected.slice(0, settings.decomposition_word_count);
  let text = "";
  const annotations: PracticeTargetAnnotation[] = [];
  for (const entry of picked) {
    if (text.length > 0) {
      text += "\n";
    }
    const start = text.length;
    const partTokens = entry.parts.flatMap((part) =>
      Array.from({ length: settings.decomposition_part_repeats }, () => part),
    );
    const wordTokens = Array.from(
      { length: settings.decomposition_word_repeats },
      () => entry.word,
    );
    text += [entry.word, ...partTokens, ...wordTokens].join(" ");
    annotations.push({
      start,
      end: start + entry.word.length,
      translation_zh: entry.translation_zh.trim(),
      display: "line",
    });
  }
  return {
    mode: "words",
    text,
    source: `keyloop:module:everyday-english:word-decomposition-${settings.decomposition_level}:words-${picked.length}:parts-${settings.decomposition_part_repeats}:whole-${settings.decomposition_word_repeats}`,
    annotations,
  };
}

function programmingOperatorsTarget(context: BuildTargetContext): PracticeTarget {
  const random = context.random ?? Math.random;
  const items = uniqueFocus(context.plan.focus_symbols);
  fillFrom(items, languageSymbolItems(context), 8, random);
  fillFrom(items, context.library.symbols, 18, random);
  fillFrom(items, context.library.number_drills, 20, random);
  return {
    mode: "symbols",
    text: chunkWords(items.slice(0, 20), 6).join("\n"),
    source: "keyloop:module:programming-basics:operators-brackets-quotes",
  };
}

function codeMixTarget(context: BuildTargetContext, count?: number): PracticeTarget {
  const codeConfig = context.codeConfig ?? {};
  const excludedTexts = usedCodeSnippetTexts(context.records);
  const difficulty = codeDifficultyForContext(context);
  const targetCount = count ?? ((context.localCodeSnippets?.length ?? 0) > 0 ? 3 : 4);
  const localSnippets =
    context.localCodeSnippets === undefined
      ? []
      : pickCodeSnippetsExcludingByDifficulty(
          context.localCodeSnippets,
          context.plan.focus_code,
          codeConfig,
          targetCount,
          excludedTexts,
          difficulty,
        );
  for (const snippet of localSnippets) {
    excludedTexts.add(snippet.text);
  }
  const builtinSnippets = pickLibraryCodeSnippetsExcludingByDifficulty(
    context.library,
    context.plan.focus_code,
    codeConfig,
    Math.max(0, targetCount - localSnippets.length),
    excludedTexts,
    difficulty,
    codePickerOptions(context.random),
  );
  const snippets = formatCodeSnippetsForContext([...localSnippets, ...builtinSnippets], context);
  const source = codeMixSource(
    context.localCodeSource,
    context.localCodeScanError,
    localSnippets.length,
    snippets.length,
  );
  return {
    mode: "code",
    text: snippets.map((snippet) => snippet.text).join("\n\n"),
    source,
    code_blocks: codeBlocksFromSnippets(snippets),
  };
}

function formatCodeSnippetsForContext(
  snippets: CodeSnippet[],
  context: BuildTargetContext,
): CodeSnippet[] {
  return formatCodeSnippetsForPractice(snippets, context.codeStyle);
}

function codeBlocksFromSnippets(snippets: CodeSnippet[]): PracticeTargetCodeBlock[] {
  let startLine = 0;
  return snippets.map((snippet) => {
    const lineCount = snippet.text.split("\n").length;
    const difficulty = codeBlockDifficulty(snippet.difficulty);
    const block: PracticeTargetCodeBlock = {
      start_line: startLine,
      line_count: lineCount,
      language: snippet.syntax_language ?? snippet.language,
      framework: snippet.framework,
      project: snippet.project,
      source: snippet.source,
      ...(difficulty === undefined ? {} : { difficulty }),
      size: codeBlockSize(snippet.text),
    };
    startLine += lineCount + 1;
    return block;
  });
}

function codeBlockDifficulty(
  value: string | undefined,
): PracticeTargetCodeBlock["difficulty"] | undefined {
  return value === "easy" || value === "medium" || value === "hard" ? value : undefined;
}

function codeBlockSize(text: string): "short" | "medium" | "long" {
  const lineCount = text.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
  const charCount = Array.from(text).length;
  if (lineCount <= 5 && charCount <= 240) {
    return "short";
  }
  if (lineCount <= 14 && charCount <= 720) {
    return "medium";
  }
  return "long";
}

function pickLibraryCodeSnippetsExcludingByDifficulty(
  library: ContentLibrary,
  planFocus: string[],
  codeConfig: Partial<CodePracticeConfig>,
  count: number,
  excludedTexts: Set<string>,
  difficulty?: string,
  options: { random?: () => number } = {},
): CodeSnippet[] {
  if (library.code_corpus !== undefined) {
    return pickCodeCorpusSnippetsExcludingByDifficulty(
      library.code_corpus,
      planFocus,
      codeConfig,
      count,
      excludedTexts,
      difficulty,
      options,
    ).map((snippet) => ({
      ...snippet,
      difficulty: snippet.difficulty ?? "medium",
      score: snippet.score ?? 0,
    }));
  }
  return pickBuiltinCodeExcludingByDifficulty(
    library.code_snippets,
    planFocus,
    codeConfig,
    count,
    excludedTexts,
    difficulty,
    options,
  );
}

function codePickerOptions(random: (() => number) | undefined): { random?: () => number } {
  return random === undefined ? {} : { random };
}

function codeMixSource(
  localCodeSource: string | undefined,
  localCodeScanError: string | undefined,
  localSnippetCount: number,
  pickedCount: number,
): string {
  if (localSnippetCount === 0) {
    return localCodeScanError === undefined
      ? "keyloop:code-corpus"
      : `keyloop:code-corpus (repo scan failed: ${localCodeScanError})`;
  }
  const source = localCodeSource ?? "keyloop:local-code";
  return localSnippetCount === pickedCount
    ? source
    : `${source} + keyloop:fallback-code`;
}

function codeDifficultyForRecords(records: SessionRecord[]): string | undefined {
  const codeRecords = records.filter((record) => record.mode === "code" && record.typed_len > 0);
  if (codeRecords.length === 0) {
    return undefined;
  }

  const totalTyped = codeRecords.reduce(
    (sum, record) => sum + Math.max(record.typed_len, record.target_len),
    0,
  );
  const totalErrors = codeRecords.reduce((sum, record) => sum + record.error_count, 0);
  const accuracyWeight = codeRecords.reduce(
    (sum, record) => sum + Math.max(record.typed_len, 1),
    0,
  );
  const weightedAccuracy =
    codeRecords.reduce(
      (sum, record) => sum + record.accuracy * Math.max(record.typed_len, 1),
      0,
    ) / accuracyWeight;
  const wpmWeight = codeRecords.reduce(
    (sum, record) => sum + Math.max(record.duration_ms, 1),
    0,
  );
  const weightedWpm =
    codeRecords.reduce(
      (sum, record) => sum + record.wpm * Math.max(record.duration_ms, 1),
      0,
    ) / wpmWeight;
  const errorRate = totalTyped === 0 ? 0 : (totalErrors / totalTyped) * 100;

  if (weightedAccuracy >= 97 && weightedWpm >= 24 && errorRate <= 3) {
    return "hard";
  }
  if (weightedAccuracy >= 94 && weightedWpm >= 16 && errorRate <= 6) {
    return "medium";
  }
  return "easy";
}

function codeDifficultyForContext(context: BuildTargetContext): string | undefined {
  const difficulty = context.codeConfig?.difficulty;
  switch (difficulty) {
    case "easy":
    case "medium":
    case "hard":
      return difficulty;
    case "all":
      return undefined;
    case "adaptive":
    case undefined:
      return codeDifficultyForRecords(context.records);
  }
}

function usedCodeSnippetTexts(records: SessionRecord[]): Set<string> {
  const used = new Set<string>();
  for (const record of records) {
    if (record.mode !== "code") {
      continue;
    }
    for (const snippet of record.target_text.split("\n\n")) {
      const trimmed = snippet.trim();
      if (trimmed.length > 0) {
        used.add(trimmed);
        used.add(codeSnippetExclusionKey(trimmed));
      }
    }
  }
  return used;
}

function codeSpecialistSource(
  codeConfig: Partial<CodePracticeConfig>,
  pickedCount: number,
): string {
  const config = defaultCodePracticeConfig(codeConfig);
  const parts = [`level=${codeLevelSlug(config.level)}`];
  appendFilterLabel(parts, "lang", config.languages);
  appendFilterLabel(parts, "framework", config.frameworks);
  appendFilterLabel(parts, "project", config.projects);
  return `keyloop:code-specialist:${parts.join("+")}:${pickedCount}`;
}

function appendFilterLabel(parts: string[], label: string, values: string[]): void {
  if (values.length > 0) {
    parts.push(`${label}=${values.join(",")}`);
  }
}

function codeLevelSlug(level: CodePracticeConfig["level"]): string {
  switch (level) {
    case "block":
      return "block";
    case "function":
      return "function";
    case "file":
      return "file";
    default:
      return "mixed";
  }
}

function longWordBreakdownLines(
  context: BuildTargetContext,
  feedbackTerms: string[],
  profile: MixProfile,
): string[] {
  const maxEntries = wordBreakdownMaxItems(context, profile);
  if (maxEntries === 0) {
    return [];
  }
  const personalEntries = rankedPersonalVocabularyForProgramming(context).slice(0, maxEntries);
  const personalLines = personalEntries.flatMap(personalVocabularyBreakdownLines);
  const usedWords = new Set(personalEntries.map((entry) => entry.text.toLowerCase()));
  const focusCandidates: BreakdownCandidate[] = [];
  for (const word of context.plan.focus_words) {
    if (focusCandidates.length >= maxEntries - personalEntries.length) {
      break;
    }
    const candidate = breakdownCandidateFromFocusWord(word, "programming");
    if (candidate === null) {
      continue;
    }
    const key = candidate.word.toLowerCase();
    if (usedWords.has(key)) {
      continue;
    }
    usedWords.add(key);
    focusCandidates.push(candidate);
  }
  const focusLines = focusCandidates.flatMap(breakdownCandidateLines);
  const dueWords = new Set([
    ...context.plan.focus_words.map((word) => word.toLowerCase()),
    ...feedbackTerms.map((word) => word.toLowerCase()),
  ]);
  const remainingBuiltInCount = Math.max(
    0,
    maxEntries - personalEntries.length - focusCandidates.length,
  );
  const builtInLines = context.library.long_words
    .filter(isProgrammingLongWordEntry)
    .filter((entry) => dueWords.has(entry.word.toLowerCase()))
    .filter((entry) => !usedWords.has(entry.word.toLowerCase()))
    .slice(0, remainingBuiltInCount)
    .flatMap((entry) => breakdownCandidateLines(breakdownCandidateFromLongWord(entry)));
  return [...personalLines, ...focusLines, ...builtInLines];
}

function everydayLongWordBreakdownLines(
  context: BuildTargetContext,
  profile: MixProfile,
): string[] {
  if (profile !== "comprehensive") {
    return [];
  }
  const maxEntries = wordBreakdownMaxItems(context, profile);
  if (maxEntries === 0) {
    return [];
  }
  const personalEntries = rankedPersonalVocabularyForEveryday(context).slice(0, maxEntries);
  const personalLines = personalEntries.flatMap(personalVocabularyBreakdownLines);
  const usedWords = new Set(personalEntries.map((entry) => entry.text.toLowerCase()));
  const dueWords = new Set([
    ...context.plan.focus_words.map((word) => word.toLowerCase()),
    ...recentFeedbackTerms(context.records).map((word) => word.toLowerCase()),
  ]);
  const remainingBuiltInCount = Math.max(0, maxEntries - personalEntries.length);
  const builtInLines = context.library.long_words
    .filter(isEverydayLongWordEntry)
    .filter((entry) => dueWords.has(entry.word.toLowerCase()))
    .filter((entry) => !usedWords.has(entry.word.toLowerCase()))
    .slice(0, remainingBuiltInCount)
    .flatMap((entry) => breakdownCandidateLines(breakdownCandidateFromLongWord(entry)));
  return [...personalLines, ...builtInLines];
}

function wordBreakdownMaxItems(
  context: BuildTargetContext,
  profile: MixProfile,
): number {
  if (profile !== "comprehensive") {
    return 6;
  }
  const settings =
    context.wordBreakdownSettings ?? {
      enabled_in_comprehensive: true,
      max_items_per_group: 6,
    };
  return settings.enabled_in_comprehensive
    ? Math.min(
        normalizedMaxItems(settings.max_items_per_group),
        maxComprehensiveBreakdownItems,
      )
    : 0;
}

function standaloneLongWordCandidates(
  context: BuildTargetContext,
  options: BuildLongWordBreakdownPracticeOptions,
): BreakdownCandidate[] {
  const maxItems = normalizedMaxItems(options.maxItems);
  if (maxItems === 0) {
    return [];
  }

  const selected: BreakdownCandidate[] = [];
  const seen = new Set<string>();
  const addCandidate = (candidate: BreakdownCandidate): void => {
    if (selected.length >= maxItems) {
      return;
    }
    if (!matchesBreakdownDomain(candidate, options)) {
      return;
    }
    const key = candidate.word.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      selected.push(candidate);
    }
  };

  for (const entry of rankedPersonalVocabularyForStandalone(context, options)) {
    const candidate = breakdownCandidateFromPersonalVocabulary(entry);
    if (candidate !== null) {
      addCandidate(candidate);
    }
  }
  for (const word of context.plan.focus_words) {
    const candidate = breakdownCandidateFromFocusWord(
      word,
      primaryBreakdownDomain(options),
    );
    if (candidate !== null) {
      addCandidate(candidate);
    }
  }
  for (const entry of context.library.long_words) {
    addCandidate(breakdownCandidateFromLongWord(entry));
  }
  for (const entry of fallbackLongWords) {
    addCandidate(breakdownCandidateFromLongWord(entry));
  }

  return selected;
}

function rankedPersonalVocabularyForStandalone(
  context: BuildTargetContext,
  options: BuildLongWordBreakdownPracticeOptions,
): PersonalVocabularyEntry[] {
  const entries = (context.personalVocabulary ?? []).filter(hasPersonalVocabularyParts);
  if (entries.length === 0) {
    return [];
  }
  return rankPersonalVocabulary(entries, context.records, {
    limit: entries.length,
    ...(context.now === undefined ? {} : { now: context.now }),
  })
    .map((item) => item.entry)
    .filter((entry) => matchesPersonalVocabularyDomain(entry, options));
}

function breakdownCandidateFromPersonalVocabulary(
  entry: PersonalVocabularyEntry,
): BreakdownCandidate | null {
  const parts = entry.parts?.map((part) => part.trim()).filter((part) => part.length > 0) ?? [];
  if (parts.length === 0) {
    return null;
  }
  return {
    word: entry.text,
    parts,
    aliases: entry.aliases ?? [],
    identifierForms: entry.kind === "identifier",
    domain: inferredVocabularyDomain(entry),
  };
}

function breakdownCandidateFromFocusWord(
  word: string,
  domain: LongWordEntry["domain"] | undefined,
): BreakdownCandidate | null {
  const normalized = word.trim();
  const parts = identifierParts(normalized);
  if (normalized.length === 0 || parts.length < 2) {
    return null;
  }
  return {
    word: normalized,
    parts,
    aliases: [],
    identifierForms: true,
    domain: domain ?? "programming",
  };
}

function breakdownCandidateFromLongWord(entry: LongWordEntry): BreakdownCandidate {
  return {
    word: entry.word,
    parts: entry.parts,
    aliases: entry.aliases ?? [],
    identifierForms: false,
    domain: entry.domain,
  };
}

function breakdownCandidateLines(candidate: BreakdownCandidate): string[] {
  const lines = [
    candidate.parts.length === 0 ? candidate.word : candidate.parts.join(" "),
    `${candidate.word} ${candidate.word}`,
  ];
  const alias = firstTrimmedAlias(candidate.aliases);
  if (alias !== undefined) {
    lines.push(`${alias} ${candidate.word}`);
  }
  if (candidate.identifierForms) {
    const pascal = pascalCase(candidate.parts);
    lines.push(
      uniqueLineItems([
        candidate.word,
        pascal,
        `load${pascal}`,
        `${candidate.word}Config`,
      ]),
    );
  }
  return lines;
}

function personalVocabularyStandaloneLines(entry: PersonalVocabularyEntry): string[] {
  const candidate = breakdownCandidateFromPersonalVocabulary(entry);
  return candidate === null ? [`${entry.text} ${entry.text}`] : breakdownCandidateLines(candidate);
}

function rankedPersonalVocabularyForProgramming(
  context: BuildTargetContext,
): PersonalVocabularyEntry[] {
  const entries = (context.personalVocabulary ?? []).filter(hasPersonalVocabularyParts);
  const limit = context.personalVocabularyLimit ?? 8;
  if (entries.length === 0 || limit <= 0) {
    return [];
  }

  return rankPersonalVocabulary(entries, context.records, {
    limit,
    ...(context.now === undefined ? {} : { now: context.now }),
  })
    .map((item) => item.entry)
    .filter(isProgrammingVocabularyEntry)
    .slice(0, Math.min(limit, 6));
}

function rankedPersonalVocabularyForEveryday(
  context: BuildTargetContext,
): PersonalVocabularyEntry[] {
  const entries = (context.personalVocabulary ?? []).filter(hasPersonalVocabularyParts);
  const limit = context.personalVocabularyLimit ?? 8;
  if (entries.length === 0 || limit <= 0) {
    return [];
  }

  return rankPersonalVocabulary(entries, context.records, {
    limit,
    ...(context.now === undefined ? {} : { now: context.now }),
  })
    .map((item) => item.entry)
    .filter(isEverydayVocabularyEntry)
    .slice(0, Math.min(limit, 6));
}

function hasPersonalVocabularyParts(entry: PersonalVocabularyEntry): boolean {
  return entry.parts?.some((part) => part.trim().length > 0) ?? false;
}

function personalVocabularyBreakdownLines(entry: PersonalVocabularyEntry): string[] {
  const candidate = breakdownCandidateFromPersonalVocabulary(entry);
  return candidate === null ? [] : breakdownCandidateLines(candidate);
}

function firstTrimmedAlias(aliases: string[] | undefined): string | undefined {
  return aliases?.map((value) => value.trim()).find((value) => value.length > 0);
}

function matchesBreakdownDomain(
  candidate: BreakdownCandidate,
  options: Pick<BuildLongWordBreakdownPracticeOptions, "domain" | "domains">,
): boolean {
  return matchesAllowedDomain(candidate.domain, options);
}

function matchesPersonalVocabularyDomain(
  entry: PersonalVocabularyEntry,
  options: Pick<BuildLongWordBreakdownPracticeOptions, "domain" | "domains">,
): boolean {
  return matchesAllowedDomain(inferredVocabularyDomain(entry), options);
}

function matchesAllowedDomain(
  candidateDomain: LongWordEntry["domain"],
  options: Pick<BuildLongWordBreakdownPracticeOptions, "domain" | "domains">,
): boolean {
  const domains =
    options.domains ?? (options.domain === undefined ? undefined : [options.domain]);
  return domains === undefined || domains.includes(candidateDomain);
}

function primaryBreakdownDomain(
  options: Pick<BuildLongWordBreakdownPracticeOptions, "domain" | "domains">,
): LongWordEntry["domain"] | undefined {
  return options.domain ?? options.domains?.[0];
}

function isEverydayLongWordEntry(entry: LongWordEntry): boolean {
  return entry.domain === "everyday" || entry.domain === "workplace";
}

function isProgrammingLongWordEntry(entry: LongWordEntry): boolean {
  return entry.domain === "programming" || entry.domain === "web3";
}

function isEverydayVocabularyEntry(entry: PersonalVocabularyEntry): boolean {
  const domain = inferredVocabularyDomain(entry);
  return domain === "everyday" || domain === "workplace";
}

function inferredVocabularyDomain(entry: PersonalVocabularyEntry): LongWordEntry["domain"] {
  const tags = new Set(entry.tags.map((tag) => tag.toLowerCase()));
  if (tags.has("web3")) {
    return "web3";
  }
  if (tags.has("workplace")) {
    return "workplace";
  }
  if (tags.has("everyday")) {
    return "everyday";
  }
  if (isProgrammingVocabularyEntry(entry)) {
    return "programming";
  }
  return "everyday";
}

function normalizedMaxItems(value: number): number {
  return Math.max(0, Math.floor(value));
}

function isProgrammingVocabularyEntry(entry: PersonalVocabularyEntry): boolean {
  const tags = new Set(entry.tags.map((tag) => tag.toLowerCase()));
  return (
    entry.kind === "identifier" ||
    entry.kind === "code_term" ||
    tags.has("programming") ||
    tags.has("code") ||
    tags.has("web3")
  );
}

function buildLessonSymbols(context: BuildTargetContext): string {
  const random = context.random ?? Math.random;
  const chosen = uniqueFocus(context.plan.focus_symbols);
  appendFrom(chosen, languageSymbolItems(context), 6, random);
  fillFrom(chosen, context.library.symbols, 18, random);
  appendFrom(chosen, context.library.number_drills, 2, random);
  return chunkWords(chosen.slice(0, 26), 5).join("\n");
}

function buildLessonNaming(
  plan: PracticePlan,
  library: Pick<ContentLibrary, "naming">,
  random?: () => number,
): string {
  const lines = focusNamingLines(plan.focus_words);
  fillFrom(lines, library.naming, 5, random);
  return lines.slice(0, 5).join("\n");
}

function uniqueFocus(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (normalized.length > 0 && !seen.has(key)) {
      seen.add(key);
      output.push(normalized);
    }
  }
  return output;
}

function fillFrom(
  chosen: string[],
  source: string[],
  targetLen: number,
  random?: () => number,
): void {
  const pool = [...source];
  if (random !== undefined) {
    shuffleInPlace(pool, random);
  }
  for (const item of pool) {
    if (chosen.length >= targetLen) {
      break;
    }
    if (!chosen.some((existing) => existing === item)) {
      chosen.push(item);
    }
  }
}

function appendFrom(
  chosen: string[],
  source: string[],
  maxItems: number,
  random?: () => number,
): void {
  let added = 0;
  const pool = [...source];
  if (random !== undefined) {
    shuffleInPlace(pool, random);
  }
  for (const item of pool) {
    if (added >= maxItems) {
      break;
    }
    if (!chosen.some((existing) => existing === item)) {
      chosen.push(item);
      added += 1;
    }
  }
}

function repeatPool(
  source: string[],
  targetLen: number,
  random: () => number = Math.random,
): string[] {
  if (source.length === 0) {
    return [];
  }
  const output: string[] = [];
  while (output.length < targetLen) {
    const pool = [...source];
    shuffleInPlace(pool, random);
    output.push(...pool);
  }
  return output.slice(0, targetLen);
}

function chunkWords(items: string[], chunkSize: number): string[] {
  const lines: string[] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    lines.push(items.slice(index, index + chunkSize).join(" "));
  }
  return lines;
}

function shuffleInPlace<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(clamp(random(), 0, 0.999999999) * (index + 1));
    const current = items[index];
    const replacement = items[swapIndex];
    if (current === undefined || replacement === undefined) {
      continue;
    }
    items[index] = replacement;
    items[swapIndex] = current;
  }
}

function startsIdentifierBoundary(chars: string[], index: number): boolean {
  if (index === 0) {
    return false;
  }
  const ch = chars[index];
  const previous = chars[index - 1];
  if (ch === undefined || previous === undefined || !isAsciiAlphanumeric(previous)) {
    return false;
  }
  if (isAsciiDigit(ch)) {
    return !isAsciiDigit(previous);
  }
  if (isAsciiDigit(previous)) {
    return true;
  }
  if (isAsciiUppercase(ch) && isAsciiLowercase(previous)) {
    return true;
  }
  const next = chars[index + 1];
  return (
    isAsciiUppercase(ch) &&
    isAsciiUppercase(previous) &&
    next !== undefined &&
    isAsciiLowercase(next)
  );
}

function pushIdentifierPart(parts: string[], value: string): void {
  if (value.length > 0) {
    parts.push(value);
  }
}

function camelCase(parts: string[]): string {
  const [first, ...rest] = parts;
  if (first === undefined) {
    return "";
  }
  return `${first}${rest.map(capitalizeAscii).join("")}`;
}

function pascalCase(parts: string[]): string {
  return parts.map(capitalizeAscii).join("");
}

function capitalizeAscii(value: string): string {
  const first = value[0];
  if (first === undefined) {
    return "";
  }
  return `${first.toUpperCase()}${value.slice(1)}`;
}

function uniqueLineItems(items: string[]): string {
  return uniqueFocus(items).join(" ");
}

function isAsciiAlphanumeric(value: string): boolean {
  return /^[A-Za-z0-9]$/u.test(value);
}

function isAsciiDigit(value: string): boolean {
  return /^[0-9]$/u.test(value);
}

function isAsciiUppercase(value: string): boolean {
  return /^[A-Z]$/u.test(value);
}

function isAsciiLowercase(value: string): boolean {
  return /^[a-z]$/u.test(value);
}

function completedMsForDate(records: SessionRecord[], now: Date): number {
  const today = localDateString(now.toISOString());
  return records
    .filter((record) => localDateString(record.started_at) === today)
    .reduce((sum, record) => sum + record.duration_ms, 0);
}

function moduleReadinessFromRecords(
  records: SessionRecord[],
  now: Date = new Date(),
): ModuleReadiness {
  const recentCutoffMs = now.getTime() - PLAN_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const stats = new Map<TrainingModule, ModulePerformance>();

  for (const record of records) {
    const startedMs = new Date(record.started_at).getTime();
    if (
      Number.isNaN(startedMs) ||
      startedMs < recentCutoffMs ||
      !isAdaptiveModule(record.module)
    ) {
      continue;
    }

    const typedLen = effectiveModuleTypedLen(record);
    if (typedLen === 0 && record.target_len === 0) {
      continue;
    }

    const performance = stats.get(record.module) ?? emptyModulePerformance();
    addModulePerformance(performance, record, typedLen);
    stats.set(record.module, performance);
  }

  const readiness: ModuleReadiness = {
    stableModules: new Set(),
    weakModules: new Set(),
  };
  for (const [module, performance] of stats) {
    if (modulePerformanceIsWeak(performance)) {
      readiness.weakModules.add(module);
    } else if (modulePerformanceIsStable(performance)) {
      readiness.stableModules.add(module);
    }
  }

  return readiness;
}

function emptyModulePerformance(): ModulePerformance {
  return {
    samples: 0,
    completedSamples: 0,
    typedLen: 0,
    correctChars: 0,
    errors: 0,
    backspaces: 0,
  };
}

function addModulePerformance(
  performance: ModulePerformance,
  record: SessionRecord,
  typedLen: number,
): void {
  performance.samples += 1;
  if (record.completion_state === "completed") {
    performance.completedSamples += 1;
  }
  performance.typedLen += typedLen;
  performance.correctChars += Math.max(
    record.correct_chars,
    Math.round((clamp(record.accuracy, 0, 100) / 100) * typedLen),
  );
  performance.errors += record.error_count;
  performance.backspaces += record.backspace_count;
}

function modulePerformanceAccuracy(performance: ModulePerformance): number {
  if (performance.typedLen === 0) {
    return 0;
  }
  return (performance.correctChars / performance.typedLen) * 100;
}

function modulePerformanceErrorRate(performance: ModulePerformance): number {
  if (performance.typedLen === 0) {
    return 0;
  }
  return (performance.errors / performance.typedLen) * 100;
}

function modulePerformanceIsStable(performance: ModulePerformance): boolean {
  return (
    performance.completedSamples >= 3 &&
    performance.typedLen >= 180 &&
    modulePerformanceAccuracy(performance) >= 97 &&
    modulePerformanceErrorRate(performance) <= 2.5 &&
    performance.backspaces <= performance.samples * 4
  );
}

function modulePerformanceIsWeak(performance: ModulePerformance): boolean {
  return (
    performance.samples >= 1 &&
    performance.typedLen >= 20 &&
    (modulePerformanceAccuracy(performance) < 92 ||
      modulePerformanceErrorRate(performance) >= 8 ||
      performance.backspaces >= performance.samples * 12)
  );
}

function comprehensiveModuleSequence(
  readiness: ModuleReadiness,
  plan: PracticePlan,
): ModuleSequenceItem[] {
  const base: ModuleSequenceItem[] = [
    {
      kind: "foundation",
      module: "foundation_input",
      category: "foundation_mix",
    },
    {
      kind: "common_words",
      module: "everyday_english",
      category: "everyday_mix",
    },
    {
      kind: "symbols",
      module: "programming_basics",
      category: "programming_basics_mix",
    },
    {
      kind: "code_block",
      module: "code_practice",
      category: "code_mix",
    },
  ];
  const filtered = base.filter(
    (item) => !shouldSkipModule(item.module, readiness, plan),
  );

  return filtered.length >= 3 ? filtered : base;
}

function shouldSkipModule(
  module: TrainingModule,
  readiness: ModuleReadiness,
  plan: PracticePlan,
): boolean {
  return (
    module !== "code_practice" &&
    readiness.stableModules.has(module) &&
    !readiness.weakModules.has(module) &&
    !moduleHasCurrentFocus(module, plan)
  );
}

function moduleHasCurrentFocus(module: TrainingModule, plan: PracticePlan): boolean {
  switch (module) {
    case "foundation_input":
      return plan.focus_keys.length > 0;
    case "everyday_english":
      return plan.focus_words.length > 0;
    case "programming_basics":
      return plan.focus_symbols.length > 0 || plan.focus_words.length > 0;
    case "code_practice":
      return plan.focus_code.length > 0;
    default:
      return false;
  }
}

function isAdaptiveModule(module: TrainingModule): boolean {
  return (
    module === "foundation_input" ||
    module === "everyday_english" ||
    module === "programming_basics" ||
    module === "code_practice"
  );
}

function effectiveModuleTypedLen(record: SessionRecord): number {
  if (record.typed_len > 0) {
    return record.typed_len;
  }
  return Math.max([...record.user_input].length, record.correct_chars);
}

function moduleEstimatedMinutes(
  module: TrainingModule,
  readiness: ModuleReadiness,
): number {
  if (module === "code_practice" && readiness.stableModules.has(module)) {
    return 3;
  }
  return 4;
}

function nextLessonId(
  kind: LessonKind,
  occurrenceCounts: Map<LessonKind, number>,
): string {
  const count = (occurrenceCounts.get(kind) ?? 0) + 1;
  occurrenceCounts.set(kind, count);
  return `daily:${lessonKindSlug(kind)}:${count}`;
}

function lessonKindSlug(kind: LessonKind): string {
  switch (kind) {
    case "foundation":
      return "foundation";
    case "warmup":
      return "warmup";
    case "chunks":
      return "chunks";
    case "common_words":
      return "common-words";
    case "words":
      return "words";
    case "symbols":
      return "symbols";
    case "naming":
      return "naming";
    case "code_block":
      return "code-block";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function localDateString(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function moduleReasonZh(module: TrainingModule, readiness: ModuleReadiness): string {
  let reason = "";
  switch (module) {
    case "foundation_input":
      reason = "基础输入综合：覆盖 home/top/bottom row，并加重最近弱键。";
      break;
    case "everyday_english":
      reason = "日常英语综合：常见词、词块和自然英文输入。";
      break;
    case "programming_basics":
      reason = "编程基础综合：数字、符号、命名和技术词。";
      break;
    case "code_practice":
      reason = "代码实战综合：把前面的弱点放回完整代码里。";
      break;
    default:
      break;
  }
  if (readiness.weakModules.has(module)) {
    return `${reason} 短复习：根据最近错项/慢项加权。`;
  }
  if (readiness.stableModules.has(module)) {
    return `${reason} 已稳定：本轮降频或缩短。`;
  }
  return reason;
}

function moduleReasonEn(module: TrainingModule, readiness: ModuleReadiness): string {
  let reason = "";
  switch (module) {
    case "foundation_input":
      reason = "Foundation mix: cover rows and increase recent weak keys.";
      break;
    case "everyday_english":
      reason = "Everyday English mix: common words, chunks, and natural English.";
      break;
    case "programming_basics":
      reason = "Programming basics mix: numbers, symbols, naming, and technical terms.";
      break;
    case "code_practice":
      reason = "Code practice mix: move weak items back into complete code.";
      break;
    default:
      break;
  }
  if (readiness.weakModules.has(module)) {
    return `${reason} Short review: weighted by recent errors and slow items.`;
  }
  if (readiness.stableModules.has(module)) {
    return `${reason} Stable: reduced or shortened this round.`;
  }
  return reason;
}
