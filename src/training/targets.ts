import type { ContentLibrary, EverydayArticleEntry, ProgrammingWordEntry } from "../content/library";
import { pickCodeCorpusSnippetsExcludingByDifficulty } from "../content/codeCorpus";
import {
  formatCodeSnippetsForPractice,
  formatCodeSnippetsForPracticeAsync,
} from "../content/codeFormatter";
import {
  weakKeyWeights,
  weightedSampleWithoutReplacement,
  wordKeyWeight,
} from "./wordTargeting";
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
  MainGoal,
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
import {
  buildProgrammingBasicsMixTarget,
  buildSymbolsNumbersTarget,
  namingLinesFromWords,
} from "./programmingBasicsTargets";
import { PLAN_HISTORY_DAYS } from "./plan";
import {
  type LongWordEntry,
} from "./vocabulary";
import {
  buildSkillProfile,
  formForCategory,
  type SkillDimensionId,
  type SkillProfile,
  type TrainingForm,
} from "./diagnosis";
import {
  buildDailyPrescription,
  charBudget,
  estimatedMinutesFromChars,
  type StagePlan,
} from "./prescription";
import type { CustomLibrary } from "./customLibrary";

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
  programmingTermsSettings?: UserPreferences["programming_terms"];
  wordBreakdownSettings?: UserPreferences["word_breakdown"];
  random?: () => number;
  now?: Date;
  /** 综合训练启用的一级模块（来自 preferences.enabled_modules），缺省全启用 */
  enabledModules?: TrainingModule[];
  /** 自建语料库（参与单词/句子形态的语料池） */
  customLibraries?: CustomLibrary[];
  /** 当日已存在且未完成的综合训练计划；诊断屏优先复用，保证所见即所练 */
  todayDailyPlan?: DailyPracticePlan;
  /** 目标驱动训练的主目标（来自 preferences.main_goal）；主攻权重 + 推荐时长用 */
  mainGoal?: MainGoal;
}

export interface BuildLongWordBreakdownPracticeOptions {
  profile: MixProfile;
  domain?: LongWordEntry["domain"];
  domains?: LongWordEntry["domain"][];
  maxItems: number;
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
  | "programming_terms"
  | "naming_styles";

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
  note_zh?: string;
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
  library: Pick<ContentLibrary, "programming_words">,
  random: () => number = Math.random,
): string {
  return chunkWords(
    selectedProgrammingWordEntries(library, random).map((entry) => entry.word),
    4,
  ).join("\n");
}

function programmingTermsTarget(context: BuildTargetContext, random: () => number): PracticeTarget {
  const wordRepeats = programmingTermsWordRepeats(context);
  const annotated = annotatedOptionalTokenText(
    selectedProgrammingWordEntries(context.library, random).map((entry) =>
      programmingWordAnnotationItem(entry, wordRepeats),
    ),
  );
  return {
    mode: "words",
    text: annotated.text,
    source: "keyloop:module:programming-basics:technical-terms",
    ...(annotated.annotations.length === 0 ? {} : { annotations: annotated.annotations }),
  };
}

function selectedProgrammingWordEntries(
  library: Pick<ContentLibrary, "programming_words">,
  random: () => number,
): ProgrammingWordEntry[] {
  const chosen: string[] = [];
  fillFrom(
    chosen,
    library.programming_words.map((entry) => entry.word),
    16,
    random,
  );
  const entriesByWord = new Map(
    library.programming_words.map((entry) => [entry.word, entry] as const),
  );
  return chosen.slice(0, 16).flatMap((word) => {
    const entry = entriesByWord.get(word);
    return entry === undefined ? [] : [entry];
  });
}

function programmingWordAnnotationItem(
  entry: ProgrammingWordEntry,
  wordRepeats: number,
): OptionalAnnotationTextItem {
  const note = entry.note_zh.trim();
  return {
    text: repeatedWordText(entry.word, wordRepeats),
    audio_text: entry.word,
    ...(note.length === 0
      ? {}
      : { translation_zh: note, display: wordAnnotationDisplay(wordRepeats) }),
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
    case "programming_terms":
      return programmingTermsTarget(context, context.random ?? Math.random);
    case "naming_styles":
      return {
        mode: "case",
        text: buildLessonNaming(context.library, context.random ?? Math.random),
        source: "keyloop:module:programming-basics:naming",
      };
  }
}

export function buildCodeMixPracticeTarget(
  context: BuildTargetContext,
  count?: number,
): PracticeTarget {
  return codeMixTarget(context, count);
}

/** 问题4：异步版组卷，供练课时后台预组下一课。 */
export async function buildCodeMixPracticeTargetAsync(
  context: BuildTargetContext,
  count?: number,
): Promise<PracticeTarget> {
  return codeMixTargetAsync(context, count);
}

/**
 * 问题4：练当前课时后台预组下一节阶段课——仅对 code 阶段（组卷慢）异步预组，用异步
 * 格式化不阻塞主线程；非 code 阶段返回 null（它们组卷快、无需预组）。
 */
export async function prebuildStageCodeTargetAsync(
  lesson: PracticeLesson,
  context: BuildTargetContext,
): Promise<PracticeTarget | null> {
  if (stageFormFromLesson(lesson) !== "code") {
    return null;
  }
  const profile = buildSkillProfile(context.records, context.plan, context.now);
  const budget = charBudget("code", lesson.estimated_minutes, profile.form_speeds);
  return codeMixTargetAsync(context, undefined, budget);
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
  const stageForm = stageFormFromLesson(lesson);
  if (stageForm !== null) {
    // 阶段课程：用包含最新记录的 context 重建画像与预算（会话内实时修正）
    const profile = buildSkillProfile(context.records, context.plan, context.now);
    return buildStageTarget(context, {
      stage: {
        form: stageForm,
        char_budget: charBudget(stageForm, lesson.estimated_minutes, profile.form_speeds),
      },
      profile,
      ...(context.enabledModules === undefined
        ? {}
        : { enabledModules: context.enabledModules }),
      ...(context.customLibraries === undefined
        ? {}
        : { customLibraries: context.customLibraries }),
    });
  }
  switch (lesson.module) {
    case "foundation_input":
      return foundationMixTarget(context);
    case "everyday_english":
      return everydayMixTarget(context, lesson.mix_profile);
    case "programming_basics":
      return buildProgrammingBasicsMixTarget(context);
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
  const wordRepeats = wordBreakdownWordRepeats(context);
  const annotated = annotatedOptionalTokenText(
    candidates.flatMap((candidate) => breakdownCandidateTextItems(candidate, wordRepeats)),
  );
  return {
    mode: "words",
    text: annotated.text,
    source: `keyloop:module:word-breakdown:${firstWord}`,
    ...(annotated.annotations.length === 0 ? {} : { annotations: annotated.annotations }),
  };
}


export interface BuildDailyPracticePlanOptions {
  /** 覆盖推荐时长（诊断屏手动调整） */
  targetMinutesOverride?: number;
  /** 惰性组卷：只产时长与待组卷标记，不调 buildStageTarget（切档秒级，组卷推迟到开练） */
  lazy?: boolean;
}

export function buildDailyPracticePlan(
  context: BuildTargetContext,
  options: BuildDailyPracticePlanOptions = {},
): DailyPracticePlan {
  const now = context.now ?? new Date();
  const profile = buildSkillProfile(context.records, context.plan, now);
  const prescription = buildDailyPrescription({
    profile,
    enabledModules: context.enabledModules ?? [
      "foundation_input",
      "everyday_english",
      "programming_basics",
      "code_practice",
    ],
    records: context.records,
    now,
    ...(context.random === undefined ? {} : { random: context.random }),
    ...(options.targetMinutesOverride === undefined
      ? {}
      : { targetMinutesOverride: options.targetMinutesOverride }),
    ...(context.mainGoal === undefined ? {} : { mainGoalForm: context.mainGoal.form }),
  });
  const lessons = prescription.stages.map((stage, index) =>
    stageLessonFromPlan(context, profile, stage, index, options.lazy ?? false),
  );

  return {
    run_id: "",
    run_number: 0,
    target_minutes: prescription.target_minutes,
    completed_ms: completedMsForDate(context.records, now),
    lessons,
  };
}

function stageLessonFromPlan(
  context: BuildTargetContext,
  profile: SkillProfile,
  stage: StagePlan,
  index: number,
  lazy: boolean,
): PracticeLesson {
  const base = {
    id: `stage:${stage.form}:${index + 1}`,
    kind: stageLessonKind(stage.form),
    module: stageLessonModule(stage.form),
    category: stageLessonCategory(stage.form),
    mix_profile: "comprehensive" as const,
    reason_zh: stage.reason_zh,
    reason_en: stage.reason_en,
  };
  if (lazy) {
    // 惰性：用处方分配的计划分钟当 estimated，target 留空待 materializeStageLesson 组卷
    return {
      ...base,
      estimated_minutes: Math.max(1, Math.round(stage.minutes)),
      target: { mode: "words", text: "", source: `keyloop:stage:pending:${stage.form}` },
      pending: { char_budget: stage.char_budget },
    };
  }
  const target = buildStageTarget(context, {
    stage,
    profile,
    ...(context.enabledModules === undefined
      ? {}
      : { enabledModules: context.enabledModules }),
    ...(context.customLibraries === undefined
      ? {}
      : { customLibraries: context.customLibraries }),
  });
  return {
    ...base,
    estimated_minutes: estimatedMinutesFromChars(
      [...target.text].length,
      stage.form,
      profile.form_speeds,
    ),
    target,
  };
}

/** 惰性组卷的开练侧：把 pending lesson 真正组卷成可练 target（仅综合训练阶段课）。 */
export function materializeStageLesson(
  context: BuildTargetContext,
  lesson: PracticeLesson,
): PracticeLesson {
  if (lesson.pending === undefined) {
    return lesson;
  }
  const materialized: PracticeLesson = { ...lesson };
  delete materialized.pending;
  const form = stageFormFromLesson(lesson);
  if (form === null) {
    return materialized;
  }
  const profile = buildSkillProfile(context.records, context.plan, context.now ?? new Date());
  materialized.target = buildStageTarget(context, {
    stage: { form, char_budget: lesson.pending.char_budget },
    profile,
    ...(context.enabledModules === undefined
      ? {}
      : { enabledModules: context.enabledModules }),
    ...(context.customLibraries === undefined
      ? {}
      : { customLibraries: context.customLibraries }),
  });
  materialized.estimated_minutes = estimatedMinutesFromChars(
    [...materialized.target.text].length,
    form,
    profile.form_speeds,
  );
  return materialized;
}

function stageLessonKind(form: TrainingForm): LessonKind {
  switch (form) {
    case "keys":
      return "foundation";
    case "words":
      return "common_words";
    case "symbols":
      return "symbols";
    case "sentences":
    case "articles":
      return "words";
    case "code":
      return "code_block";
  }
}

function stageLessonModule(form: TrainingForm): TrainingModule {
  switch (form) {
    case "keys":
      return "foundation_input";
    case "words":
    case "sentences":
    case "articles":
      return "everyday_english";
    case "symbols":
      return "programming_basics";
    case "code":
      return "code_practice";
  }
}

/** 阶段会话记录的 category 决定它回流到哪个技能形态（formForCategory 闭环） */
function stageLessonCategory(form: TrainingForm): TrainingCategory {
  switch (form) {
    case "keys":
      return "foundation_mix";
    case "words":
      return "everyday_words";
    case "symbols":
      return "symbols_numbers";
    case "sentences":
      return "everyday_sentences";
    case "articles":
      return "everyday_articles";
    case "code":
      return "code_mix";
  }
}

export function stageFormFromLessonId(lessonId: string): TrainingForm | undefined {
  const match = lessonId.match(/^stage:(keys|words|symbols|sentences|articles|code):/u);
  return match?.[1] as TrainingForm | undefined;
}

/**
 * 综合训练阶段课程 → 训练形态。
 * 注意必须用 category 识别而不是 lesson.id：当日计划存盘时
 * assignDailyRunMetadata 会重写 id（丢掉 stage: 前缀），category 不变。
 */
export function stageFormFromLesson(lesson: PracticeLesson): TrainingForm | null {
  if (lesson.mix_profile !== "comprehensive") {
    return null;
  }
  return formForCategory(lesson.category);
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
      return buildProgrammingBasicsMixTarget(context);
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
    word_repeats: 1,
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

/** 精确 level+length 文章档位低于此数时，扩大选取池以避免短期内反复抽到同几篇 */
const ARTICLE_MIN_POOL = 8;

/**
 * 文章选取池：精确 level+length 档位太小（如 CET4+短文仅 3 篇，必然高频重复）时，
 * 回退到该 level 的全部长度，扩大真随机的候选范围。不引入防重复历史算法。
 */
export function everydayArticlePool(
  entries: ContentLibrary["everyday_articles"]["entries"],
  level: ContentLibrary["everyday_articles"]["entries"][number]["level"],
  length: EverydayEnglishSettings["article_length"],
  minPool: number = ARTICLE_MIN_POOL,
): ContentLibrary["everyday_articles"]["entries"] {
  const sourced = entries.filter(hasEverydayEntrySource);
  const exact = sourced.filter(
    (entry) => entry.level === level && matchesEverydaySentenceLength(entry.length, length),
  );
  if (exact.length >= minPool) {
    return exact;
  }
  const byLevel = sourced.filter((entry) => entry.level === level);
  if (byLevel.length > exact.length) {
    return byLevel;
  }
  return exact.length > 0 ? exact : sourced;
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
    if (
      record.category !== "everyday_words" &&
      !record.source.includes("everyday-english")
    ) {
      continue;
    }
    for (const word of record.target_text.split(/[^A-Za-z0-9]+/u)) {
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
  audio_text?: string;
}

interface OptionalAnnotationTextItem {
  text: string;
  translation_zh?: string;
  source_title?: string;
  display?: PracticeTargetAnnotation["display"];
  audio_text?: string;
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

function annotatedOptionalTokenText(items: OptionalAnnotationTextItem[]): AnnotatedTargetText {
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
    if (item.translation_zh !== undefined) {
      annotations.push(annotationForOptionalItem(start, text.length, item, item.translation_zh));
    }
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
    ...(item.audio_text === undefined ? {} : { audio_text: item.audio_text }),
  };
}

function annotationForOptionalItem(
  start: number,
  end: number,
  item: OptionalAnnotationTextItem,
  translation_zh: string,
): NonNullable<PracticeTarget["annotations"]>[number] {
  return {
    start,
    end,
    translation_zh,
    ...(item.source_title === undefined ? {} : { source_title: item.source_title }),
    ...(item.display === undefined ? {} : { display: item.display }),
    ...(item.audio_text === undefined ? {} : { audio_text: item.audio_text }),
  };
}

export function conciseChineseMeaning(value: string, maxParts = 1): string {
  const normalized = value
    .replace(/\s+/gu, " ")
    // 顿号「、」是义项内部的并列号（如「机器、电子设备等的」），不是义项分隔符；
    // 只把分号/逗号归一为分隔符，避免把一条释义从顿号处腰斩。
    .replace(/[；;，,]+/gu, "；")
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
    .replace(/^\s*(?:\[[^\]]+\]|\([^)]*\)|（[^）]*）)\s*/u, "")
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
      audio_text: entry.word,
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
  const wordRepeats = everydayWordRepeats(settings);
  const repeatedWords = words
    .slice(0, settings.word_count)
    .map((word) => repeatedWordText(word, wordRepeats));
  const sourcePrefix =
    scope.sourceSlug === undefined
      ? "keyloop:module:everyday-english"
      : `keyloop:module:everyday-english:${scope.sourceSlug}`;
  return {
    mode: "words",
    text: repeatedWords.join(" "),
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
  const wordRepeats = everydayWordRepeats(settings);
  const annotated = annotatedTokenText(
    picked.map((entry) => ({
      text: repeatedWordText(entry.word, wordRepeats),
      translation_zh: conciseChineseMeaning(entry.translation_zh),
      display: wordAnnotationDisplay(wordRepeats),
      audio_text: entry.word,
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
    space_glyph: "dot",
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
  const pool = everydayArticlePool(
    context.library.everyday_articles.entries,
    settings.article_level,
    settings.article_length,
  );
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

interface SelectedCodeMix {
  filled: CodeSnippet[];
  localCount: number;
}

/** 选片段（纯同步、快）：与格式化解耦，供同步组卷与异步预组共用。 */
function selectCodeMixSnippets(
  context: BuildTargetContext,
  count?: number,
  charBudget?: number,
): SelectedCodeMix {
  const codeConfig = context.codeConfig ?? {};
  const excludedTexts = usedCodeSnippetTexts(context.records);
  const difficulty = codeDifficultyForContext(context);
  // 按预算控量时多抽候选再截取；否则沿用固定 count
  const targetCount =
    charBudget !== undefined
      ? STAGE_CODE_MAX_SNIPPETS
      : count ?? ((context.localCodeSnippets?.length ?? 0) > 0 ? 3 : 4);
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
  const chosen = [...localSnippets, ...builtinSnippets];
  const filled =
    charBudget === undefined
      ? chosen
      : refillCodeSnippetsToBudget(chosen, context, codeConfig, difficulty, charBudget);
  return { filled, localCount: localSnippets.length };
}

/** 格式化后的收尾（按预算截取 + 拼装 target）：同步异步共用。 */
function finishCodeMixTarget(
  formatted: CodeSnippet[],
  localCount: number,
  charBudget: number | undefined,
  context: BuildTargetContext,
): PracticeTarget {
  const snippets =
    charBudget === undefined ? formatted : selectSnippetsWithinBudget(formatted, charBudget);
  const source = codeMixSource(
    context.localCodeSource,
    context.localCodeScanError,
    localCount,
    snippets.length,
  );
  return {
    mode: "code",
    text: snippets.map((snippet) => snippet.text).join("\n\n"),
    source,
    code_blocks: codeBlocksFromSnippets(snippets),
  };
}

function codeMixTarget(
  context: BuildTargetContext,
  count?: number,
  charBudget?: number,
): PracticeTarget {
  const { filled, localCount } = selectCodeMixSnippets(context, count, charBudget);
  const formatted = formatCodeSnippetsForContext(filled, context);
  return finishCodeMixTarget(formatted, localCount, charBudget, context);
}

/** 问题4：异步组卷——格式化用异步 spawn，等外部格式化器时让出主线程，供练课时后台预组。 */
async function codeMixTargetAsync(
  context: BuildTargetContext,
  count?: number,
  charBudget?: number,
): Promise<PracticeTarget> {
  const { filled, localCount } = selectCodeMixSnippets(context, count, charBudget);
  const formatted = await formatCodeSnippetsForContextAsync(filled, context);
  return finishCodeMixTarget(formatted, localCount, charBudget, context);
}

/** 按字符预算累加完整片段：至少 1 片，每片完整不切碎，总量不超 budget × 容差 */
export function selectSnippetsWithinBudget(
  snippets: CodeSnippet[],
  charBudget: number,
): CodeSnippet[] {
  const picked: CodeSnippet[] = [];
  let chars = 0;
  for (const snippet of snippets) {
    const length = [...snippet.text].length;
    const overTolerance =
      picked.length >= 1 && chars + length > charBudget * STAGE_CODE_BUDGET_TOLERANCE;
    // 正常到容差即停防超量；但若当前严重欠填（粗粒度片段把预算砍在低位，如一个大合约后
    // 第二个大片段超 1.3× 容差），放宽再补这一片，避免计划时长与实际脱节（见 ADR）。
    const severelyUnderfilled = chars < charBudget * STAGE_CODE_UNDERFILL_FLOOR;
    if (overTolerance && !severelyUnderfilled) {
      break;
    }
    picked.push(snippet);
    chars += length;
    if (chars >= charBudget) {
      break;
    }
  }
  return picked;
}

/**
 * 预算模式下代码语料不足以填满时长时，逐级放宽筛选补足候选：
 * 先解除"近期已练"排除（允许复用更早练过的片段），再放宽难度，最后解除语言/框架/项目筛选。
 * 解决代码段在筛选过窄 + 历史片段被排除时只抽到一两段、远填不满预算的问题。
 */
function refillCodeSnippetsToBudget(
  chosen: CodeSnippet[],
  context: BuildTargetContext,
  codeConfig: Partial<CodePracticeConfig>,
  difficulty: string | undefined,
  charBudget: number,
): CodeSnippet[] {
  const result = [...chosen];
  const seen = new Set(result.map((snippet) => snippet.text));
  const totalChars = (): number =>
    result.reduce((sum, snippet) => sum + [...snippet.text].length, 0);
  const levels: Array<{ difficulty: string | undefined; config: Partial<CodePracticeConfig> }> = [
    { difficulty, config: codeConfig },
    { difficulty: undefined, config: codeConfig },
    { difficulty: undefined, config: {} },
  ];
  for (const level of levels) {
    while (totalChars() < charBudget) {
      const more = pickLibraryCodeSnippetsExcludingByDifficulty(
        context.library,
        context.plan.focus_code,
        level.config,
        STAGE_CODE_MAX_SNIPPETS,
        new Set(seen),
        level.difficulty,
        codePickerOptions(context.random),
      );
      const fresh = more.filter((snippet) => !seen.has(snippet.text));
      if (fresh.length === 0) {
        break;
      }
      for (const snippet of fresh) {
        result.push(snippet);
        seen.add(snippet.text);
        if (totalChars() >= charBudget) {
          break;
        }
      }
    }
    if (totalChars() >= charBudget) {
      break;
    }
  }
  return result;
}

function formatCodeSnippetsForContext(
  snippets: CodeSnippet[],
  context: BuildTargetContext,
): CodeSnippet[] {
  return formatCodeSnippetsForPractice(snippets, context.codeStyle);
}

async function formatCodeSnippetsForContextAsync(
  snippets: CodeSnippet[],
  context: BuildTargetContext,
): Promise<CodeSnippet[]> {
  return formatCodeSnippetsForPracticeAsync(snippets, context.codeStyle);
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

export function usedCodeSnippetTexts(records: SessionRecord[]): Set<string> {
  const used = new Set<string>();
  const recentCodeRecords = records
    .filter((entry) => entry.mode === "code")
    .slice(-STAGE_CODE_RECENT_RECORDS);
  for (const record of recentCodeRecords) {
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
  const personalLines: string[] = [];
  const personalEntries: { text: string }[] = [];
  const usedWords = new Set<string>();
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
  const wordRepeats = wordBreakdownWordRepeats(context);
  const focusLines = focusCandidates.flatMap((candidate) =>
    breakdownCandidateLines(candidate, wordRepeats),
  );
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
    .flatMap((entry) =>
      breakdownCandidateLines(breakdownCandidateFromLongWord(entry), wordRepeats),
    );
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
  const personalLines: string[] = [];
  const personalEntries: { text: string }[] = [];
  const usedWords = new Set<string>();
  const dueWords = new Set([
    ...context.plan.focus_words.map((word) => word.toLowerCase()),
    ...recentFeedbackTerms(context.records).map((word) => word.toLowerCase()),
  ]);
  const wordRepeats = wordBreakdownWordRepeats(context);
  const remainingBuiltInCount = Math.max(0, maxEntries - personalEntries.length);
  const builtInLines = context.library.long_words
    .filter(isEverydayLongWordEntry)
    .filter((entry) => dueWords.has(entry.word.toLowerCase()))
    .filter((entry) => !usedWords.has(entry.word.toLowerCase()))
    .slice(0, remainingBuiltInCount)
    .flatMap((entry) =>
      breakdownCandidateLines(breakdownCandidateFromLongWord(entry), wordRepeats),
    );
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
      word_repeats: 2,
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

  const random = context.random ?? Math.random;
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

  const pool = [...context.library.long_words];
  shuffleInPlace(pool, random);
  for (const entry of pool) {
    addCandidate(breakdownCandidateFromLongWord(entry));
  }
  for (const entry of fallbackLongWords) {
    addCandidate(breakdownCandidateFromLongWord(entry));
  }

  return selected;
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
    ...(entry.note_zh === undefined || entry.note_zh.trim().length === 0
      ? {}
      : { note_zh: entry.note_zh.trim() }),
  };
}

function breakdownCandidateLines(candidate: BreakdownCandidate, wordRepeats = 2): string[] {
  const lines = [repeatedWordText(candidate.word, wordRepeats)];
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

function breakdownCandidateTextItems(
  candidate: BreakdownCandidate,
  wordRepeats: number,
): OptionalAnnotationTextItem[] {
  return [
    {
      text: repeatedWordText(candidate.word, wordRepeats),
      audio_text: candidate.word,
      ...(candidate.note_zh === undefined
        ? {}
        : { translation_zh: candidate.note_zh, display: wordAnnotationDisplay(wordRepeats) }),
    },
  ];
}

function repeatedWordText(word: string, repeats: number): string {
  return Array.from({ length: normalizedWordRepeats(repeats) }, () => word).join(" ");
}

function wordBreakdownWordRepeats(context: BuildTargetContext): number {
  return normalizedWordRepeats(context.wordBreakdownSettings?.word_repeats ?? 2);
}

function programmingTermsWordRepeats(context: BuildTargetContext): number {
  return normalizedWordRepeats(context.programmingTermsSettings?.word_repeats ?? 1, 1);
}

function everydayWordRepeats(settings: EverydayEnglishSettings): number {
  return normalizedWordRepeats(settings.word_repeats, 1);
}

function wordAnnotationDisplay(wordRepeats: number): PracticeTargetAnnotation["display"] {
  return wordRepeats > 1 ? "word_loose" : "word";
}

function normalizedWordRepeats(value: number, fallback = 2): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(10, Math.max(1, Math.floor(value)));
}

function matchesBreakdownDomain(
  candidate: BreakdownCandidate,
  options: Pick<BuildLongWordBreakdownPracticeOptions, "domain" | "domains">,
): boolean {
  return matchesAllowedDomain(candidate.domain, options);
}


function matchesAllowedDomain(
  candidateDomain: LongWordEntry["domain"],
  options: Pick<BuildLongWordBreakdownPracticeOptions, "domain" | "domains">,
): boolean {
  const domains =
    options.domains ?? (options.domain === undefined ? undefined : [options.domain]);
  return domains === undefined || domains.includes(candidateDomain);
}

function isEverydayLongWordEntry(entry: LongWordEntry): boolean {
  return entry.domain === "everyday" || entry.domain === "workplace";
}

function isProgrammingLongWordEntry(entry: LongWordEntry): boolean {
  return entry.domain === "programming" || entry.domain === "web3";
}



function normalizedMaxItems(value: number): number {
  return Math.max(0, Math.floor(value));
}


function buildLessonNaming(
  library: Pick<ContentLibrary, "programming_words">,
  random: () => number = Math.random,
): string {
  const lines = namingLinesFromWords(
    library.programming_words.map((entry) => entry.word),
    random,
    5,
  );
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

export function chunkWords(items: string[], chunkSize: number): string[] {
  return chunkItems(items, chunkSize).map((chunk) => chunk.join(" "));
}

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  for (let index = 0; index < items.length; index += safeChunkSize) {
    chunks.push(items.slice(index, index + safeChunkSize));
  }
  return chunks;
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

// ---------------------------------------------------------------------------
// 形态生成器（诊断-处方引擎第 2 期）
// 按训练形态生成阶段语料：数量由字符预算换算，内容回流只读同形态 focus 桶。
// ---------------------------------------------------------------------------

export interface StageTargetOptions {
  stage: { form: TrainingForm; char_budget: number };
  profile: SkillProfile;
  /** 未提供时视为全部启用 */
  enabledModules?: TrainingModule[];
  customLibraries?: CustomLibrary[];
}

/** 词均长 6 + 空格 */
const STAGE_CHARS_PER_WORD = 7;
const STAGE_WORD_MIN_COUNT = 6;
const STAGE_WORD_IDEAL_MIN_COUNT = 25;
const STAGE_WORD_IDEAL_MAX_COUNT = 60;
const STAGE_WORD_MAX_REPEATS = 10;
/** 句均字符 */
const STAGE_CHARS_PER_SENTENCE = 40;
const STAGE_SENTENCE_MIN_COUNT = 2;
const STAGE_SENTENCE_IDEAL_MAX_COUNT = 10;
const STAGE_SENTENCE_SOFT_MAX_COUNT = 12;
const STAGE_SENTENCE_ARTICLE_THRESHOLD = 360;
const STAGE_SENTENCE_MAX_ARTICLES = 3;
/** 代码阶段防御性硬上限：再大的预算也不超这么多片 */
const STAGE_CODE_MAX_SNIPPETS = 8;
/** 代码"近期已练"排除的滑动窗口：只排除最近这么多条代码记录，更早的允许重新出现 */
const STAGE_CODE_RECENT_RECORDS = 30;
/** 最后一片完整保留可略超预算，但总量不超 budget × 此容差 */
const STAGE_CODE_BUDGET_TOLERANCE = 1.3;
/** 严重欠填阈值：select 取到的不足预算这一比例时放宽容差再补片（粗粒度片段兜底） */
const STAGE_CODE_UNDERFILL_FLOOR = 0.6;

interface StageWordDose {
  count: number;
  repeats: number;
}

function chooseStageWordDose(
  candidates: StageWordCandidate[],
  charBudget: number,
): StageWordDose {
  const available = candidates.length;
  if (available === 0) {
    return { count: 0, repeats: 1 };
  }
  const safeBudget = Math.max(1, charBudget);
  let best: { dose: StageWordDose; score: number } | undefined;
  for (let repeats = 1; repeats <= STAGE_WORD_MAX_REPEATS; repeats += 1) {
    const estimatedCount = Math.max(
      1,
      Math.round(safeBudget / Math.max(1, averageRepeatedWordLength(candidates, repeats))),
    );
    const countOptions = new Set<number>([
      STAGE_WORD_MIN_COUNT,
      STAGE_WORD_IDEAL_MIN_COUNT,
      STAGE_WORD_IDEAL_MAX_COUNT,
      estimatedCount,
      estimatedCount - 8,
      estimatedCount - 4,
      estimatedCount + 4,
      estimatedCount + 8,
      available,
    ]);
    for (const countOption of countOptions) {
      const count = clamp(Math.round(countOption), 1, available);
      const chars = repeatedWordItemsLength(candidates.slice(0, count), repeats);
      const mismatch = Math.abs(chars - safeBudget) / safeBudget;
      const denseUniquePenalty =
        count > STAGE_WORD_IDEAL_MAX_COUNT
          ? ((count - STAGE_WORD_IDEAL_MAX_COUNT) / STAGE_WORD_IDEAL_MAX_COUNT) * 1.6
          : 0;
      const tooFewPenalty =
        count < STAGE_WORD_IDEAL_MIN_COUNT && safeBudget > STAGE_WORD_IDEAL_MIN_COUNT * STAGE_CHARS_PER_WORD
          ? ((STAGE_WORD_IDEAL_MIN_COUNT - count) / STAGE_WORD_IDEAL_MIN_COUNT) * 0.8
          : 0;
      const repeatPenalty = (repeats - 1) * 0.18;
      const score = mismatch * 4 + denseUniquePenalty + tooFewPenalty + repeatPenalty;
      if (best === undefined || score < best.score) {
        best = { dose: { count, repeats }, score };
      }
    }
  }
  return best?.dose ?? { count: Math.min(available, STAGE_WORD_MIN_COUNT), repeats: 1 };
}

function averageRepeatedWordLength(candidates: StageWordCandidate[], repeats: number): number {
  const sample = candidates.slice(0, Math.min(candidates.length, 80));
  if (sample.length === 0) {
    return STAGE_CHARS_PER_WORD;
  }
  return (
    sample.reduce(
      (sum, item) => sum + repeatedWordText(item.text, repeats).length + 1,
      0,
    ) / sample.length
  );
}

function repeatedWordItemsLength(items: StageWordCandidate[], repeats: number): number {
  if (items.length === 0) {
    return 0;
  }
  return items.reduce(
    (sum, item, index) =>
      sum + repeatedWordText(item.text, repeats).length + (index === 0 ? 0 : 1),
    0,
  );
}

export function buildStageTarget(
  context: BuildTargetContext,
  options: StageTargetOptions,
): PracticeTarget {
  switch (options.stage.form) {
    case "keys":
      return foundationMixTarget(context);
    case "words":
      return wordsStageTarget(context, options);
    case "symbols":
      return symbolsStageTarget(context, options);
    case "sentences":
      return sentencesStageTarget(context, options);
    case "articles":
      return articlesStageTarget(context, options);
    case "code":
      return codeMixTarget(context, undefined, options.stage.char_budget);
  }
}

function stageModuleEnabled(
  options: StageTargetOptions,
  module: TrainingModule,
): boolean {
  return options.enabledModules === undefined || options.enabledModules.includes(module);
}

/** 某技能维度是否处于弱项（用于特征偏重选料） */
function isDimensionWeak(profile: SkillProfile, id: SkillDimensionId): boolean {
  return profile.dimensions.some(
    (dimension) => dimension.id === id && dimension.status === "weak",
  );
}

interface StageWordCandidate {
  text: string;
  translation_zh?: string;
}

interface StageSentenceCandidate {
  text: string;
  translation_zh: string;
  source_title?: string;
}

interface StageArticleBlock {
  text: string;
  translation_zh: string;
  source_title: string;
}

function wordsStageTarget(
  context: BuildTargetContext,
  options: StageTargetOptions,
): PracticeTarget {
  const random = context.random ?? Math.random;
  const pool = new Map<string, StageWordCandidate>();
  const addCandidate = (candidate: StageWordCandidate): void => {
    const key = candidate.text.toLowerCase();
    if (!pool.has(key)) {
      pool.set(key, candidate);
    }
  };
  if (stageModuleEnabled(options, "everyday_english")) {
    for (const entry of context.library.everyday_words.entries) {
      if (!hasEverydayEntrySource(entry) || entry.translation_zh.trim().length === 0) {
        continue;
      }
      addCandidate({
        text: entry.word,
        translation_zh: conciseChineseMeaning(entry.translation_zh),
      });
    }
  }
  if (stageModuleEnabled(options, "programming_basics")) {
    for (const entry of context.library.programming_words) {
      addCandidate({ text: entry.word, translation_zh: entry.note_zh });
    }
  }
  for (const library of options.customLibraries ?? []) {
    for (const word of library.words) {
      if (word.kind !== "word") {
        continue;
      }
      addCandidate({
        text: word.text,
        ...(word.meaning_zh === undefined ? {} : { translation_zh: word.meaning_zh }),
      });
    }
  }

  // 原子层靶向（弱点重构阶段2）：含你弱键的真实词加权随机偏重，绝不改写词；
  // capitalization 跨键特征叠加（设计 §4.1）；普通词保底权重 1，故仍会掺入。
  // 原子层靶向（弱点重构阶段2）：含你弱键的真实词权重更高、排到前面，绝不改写词。
  // capitalization 跨键特征叠加（设计 §4.1）；普通词保底权重 1，弱键词不足时仍会掺入。
  const weakWeights = weakKeyWeights(context.records ?? []);
  const capWeak = isDimensionWeak(options.profile, "capitalization");
  const CAP_WEIGHT = 1;
  const wordWeightOf = (item: StageWordCandidate): number =>
    1 +
    (capWeak && /[A-Z]/u.test(item.text) ? CAP_WEIGHT : 0) +
    wordKeyWeight(item.text, weakWeights);
  const candidates = [...pool.values()];
  const ordered = weightedSampleWithoutReplacement(
    candidates,
    wordWeightOf,
    candidates.length,
    random,
  );
  const dose = chooseStageWordDose(ordered, options.stage.char_budget);
  const picked = ordered.slice(0, dose.count);

  const annotated = annotatedOptionalTokenText(
    picked.map((item) => ({
      text: repeatedWordText(item.text, dose.repeats),
      ...(item.translation_zh === undefined || item.translation_zh.trim().length === 0
        ? {}
        : { translation_zh: item.translation_zh }),
      display: wordAnnotationDisplay(dose.repeats),
      audio_text: item.text,
    })),
  );
  return {
    mode: "words",
    text: annotated.text,
    source: `keyloop:stage:words:count-${picked.length}:repeat-${dose.repeats}`,
    ...(annotated.annotations.length === 0 ? {} : { annotations: annotated.annotations }),
  };
}

function stageArticleBlocks(
  context: BuildTargetContext,
  settings: EverydayEnglishSettings,
  random: () => number,
): StageArticleBlock[] {
  const pool = everydayArticlePool(
    context.library.everyday_articles.entries,
    settings.article_level,
    settings.article_length,
  );
  const shuffled = [...pool];
  shuffleInPlace(shuffled, random);
  return shuffled
    .map((article) => articleBlock(article))
    .filter((block): block is StageArticleBlock => block !== null);
}

function articleBlock(article: EverydayArticleEntry): StageArticleBlock | null {
  const paragraphs = article.paragraphs.filter(
    (paragraph) =>
      paragraph.text.trim().length > 0 && paragraph.translation_zh.trim().length > 0,
  );
  const text = paragraphs.map((paragraph) => paragraph.text.trim()).join("\n");
  if (text.length === 0) {
    return null;
  }
  return {
    text,
    translation_zh: paragraphs
      .map((paragraph) => paragraph.translation_zh.trim())
      .join("\n"),
    source_title: article.title,
  };
}

function articleAnnotatedBlock(block: StageArticleBlock): AnnotatedTargetText {
  return {
    text: block.text,
    annotations: [
      {
        start: 0,
        end: block.text.length,
        translation_zh: block.translation_zh,
        source_title: block.source_title,
        display: "article",
      },
    ],
  };
}

function chooseSentenceArticleMix(
  sentences: StageSentenceCandidate[],
  articles: StageArticleBlock[],
  charBudget: number,
): { sentenceCount: number; articleCount: number } {
  const safeBudget = Math.max(1, charBudget);
  const maxSentenceOptions = Math.min(
    sentences.length,
    Math.max(STAGE_SENTENCE_SOFT_MAX_COUNT + 4, Math.ceil(safeBudget / 30)),
  );
  const maxArticleOptions =
    safeBudget >= STAGE_SENTENCE_ARTICLE_THRESHOLD
      ? Math.min(articles.length, STAGE_SENTENCE_MAX_ARTICLES)
      : 0;
  let best:
    | { mix: { sentenceCount: number; articleCount: number }; score: number }
    | undefined;
  for (let articleCount = 0; articleCount <= maxArticleOptions; articleCount += 1) {
    for (let sentenceCount = 0; sentenceCount <= maxSentenceOptions; sentenceCount += 1) {
      if (sentenceCount === 0 && articleCount === 0) {
        continue;
      }
      if (articleCount === 0 && sentenceCount < STAGE_SENTENCE_MIN_COUNT) {
        continue;
      }
      const chars = sentenceArticleMixLength(sentences, sentenceCount, articles, articleCount);
      const mismatch = Math.abs(chars - safeBudget) / safeBudget;
      const denseSentencePenalty =
        sentenceCount > STAGE_SENTENCE_IDEAL_MAX_COUNT
          ? ((sentenceCount - STAGE_SENTENCE_IDEAL_MAX_COUNT) /
              STAGE_SENTENCE_IDEAL_MAX_COUNT) *
            1.4
          : 0;
      const articleMissingPenalty =
        safeBudget >= STAGE_SENTENCE_ARTICLE_THRESHOLD && articleCount === 0 ? 1.2 : 0;
      const articlePenalty = articleCount * 0.12;
      const emptySentencePenalty = sentenceCount === 0 ? 0.35 : 0;
      const score =
        mismatch * 4 +
        denseSentencePenalty +
        articleMissingPenalty +
        articlePenalty +
        emptySentencePenalty;
      if (best === undefined || score < best.score) {
        best = { mix: { sentenceCount, articleCount }, score };
      }
    }
  }
  if (best !== undefined) {
    return best.mix;
  }
  return {
    sentenceCount: Math.min(
      sentences.length,
      Math.max(STAGE_SENTENCE_MIN_COUNT, Math.ceil(safeBudget / STAGE_CHARS_PER_SENTENCE)),
    ),
    articleCount: 0,
  };
}

function sentenceArticleMixLength(
  sentences: StageSentenceCandidate[],
  sentenceCount: number,
  articles: StageArticleBlock[],
  articleCount: number,
): number {
  const sentenceLength = sentences
    .slice(0, sentenceCount)
    .reduce((sum, sentence, index) => sum + sentence.text.length + (index === 0 ? 0 : 1), 0);
  const articleLength = articles
    .slice(0, articleCount)
    .reduce((sum, article, index) => sum + article.text.length + (index === 0 ? 0 : 1), 0);
  if (sentenceLength === 0) {
    return articleLength;
  }
  if (articleLength === 0) {
    return sentenceLength;
  }
  return sentenceLength + 1 + articleLength;
}

function sentencesStageTarget(
  context: BuildTargetContext,
  options: StageTargetOptions,
): PracticeTarget {
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const pool = new Map<string, StageSentenceCandidate>();
  const addCandidate = (candidate: StageSentenceCandidate): void => {
    if (!pool.has(candidate.text)) {
      pool.set(candidate.text, candidate);
    }
  };
  const matching = context.library.everyday_sentences.entries
    .filter(hasEverydayEntrySource)
    .filter((entry) => entry.translation_zh.trim().length > 0)
    .filter((entry) => entry.level === settings.sentence_level)
    .filter((entry) => matchesEverydaySentenceLength(entry.length, settings.sentence_length));
  const libraryPool =
    matching.length > 0
      ? matching
      : context.library.everyday_sentences.entries
          .filter(hasEverydayEntrySource)
          .filter((entry) => entry.translation_zh.trim().length > 0);
  for (const entry of libraryPool) {
    addCandidate({
      text: entry.text,
      translation_zh: entry.translation_zh,
      source_title: entry.source_title,
    });
  }
  for (const library of options.customLibraries ?? []) {
    for (const sentence of library.sentences) {
      addCandidate({
        text: sentence.text,
        translation_zh: sentence.translation_zh ?? "",
      });
    }
  }

  // 综合应用层不做错题回流(见 ADR 0001)：句子从库纯随机选取，不针对用户错过的具体句子
  const selected = [...pool.values()];
  shuffleInPlace(selected, random);
  const articleBlocks = stageArticleBlocks(context, settings, random);
  const mix = chooseSentenceArticleMix(selected, articleBlocks, options.stage.char_budget);
  const picked = selected.slice(0, mix.sentenceCount);

  const sentenceBlock = annotatedLineText(
    picked.map((item) => ({
      text: item.text,
      translation_zh: item.translation_zh,
      ...(item.source_title === undefined ? {} : { source_title: item.source_title }),
      display: "line" as const,
    })),
  );
  const articleTargets = articleBlocks
    .slice(0, mix.articleCount)
    .map((article) => articleAnnotatedBlock(article));
  const annotated = combineAnnotatedBlocks([sentenceBlock, ...articleTargets]);
  return {
    mode: "words",
    text: annotated.text,
    source: `keyloop:stage:sentences:count-${picked.length}:articles-${mix.articleCount}`,
    ...(annotated.annotations.length === 0 ? {} : { annotations: annotated.annotations }),
  };
}

const MAX_STAGE_ARTICLES = 5;

/**
 * 综合训练文章阶段：按 char_budget 拼接多篇文章填满时长（解决「选45实际20」与重复）。
 * 每篇生成独立的 display:"article" 注解（各自 start/end/标题/翻译），交由 ghostText
 * 渲染换篇分隔与篇内翻译。无可用文章时回退到句子。
 */
function articlesStageTarget(
  context: BuildTargetContext,
  options: StageTargetOptions,
): PracticeTarget {
  const random = context.random ?? Math.random;
  const settings = everydaySettings(context);
  const pool = everydayArticlePool(
    context.library.everyday_articles.entries,
    settings.article_level,
    settings.article_length,
  );
  const shuffled = [...pool];
  shuffleInPlace(shuffled, random);
  let fullText = "";
  const annotations: PracticeTargetAnnotation[] = [];
  for (const article of shuffled) {
    const paragraphs = article.paragraphs.filter(
      (paragraph) =>
        paragraph.text.trim().length > 0 && paragraph.translation_zh.trim().length > 0,
    );
    const text = paragraphs.map((paragraph) => paragraph.text.trim()).join("\n");
    if (text.length === 0) {
      continue;
    }
    if (fullText.length > 0) {
      fullText += "\n";
    }
    const start = fullText.length;
    fullText += text;
    annotations.push({
      start,
      end: fullText.length,
      translation_zh: paragraphs
        .map((paragraph) => paragraph.translation_zh.trim())
        .join("\n"),
      source_title: article.title,
      display: "article",
    });
    if (
      fullText.length >= options.stage.char_budget ||
      annotations.length >= MAX_STAGE_ARTICLES
    ) {
      break;
    }
  }
  if (annotations.length === 0) {
    return everydaySentencesTarget(context);
  }
  return {
    mode: "words",
    text: fullText,
    source: `keyloop:stage:articles:${settings.article_level}:${settings.article_length}:count-${annotations.length}`,
    annotations,
  };
}

const SYMBOL_VALUE_RATIO = 0.45; // 裸值占符号专项时长比例（裸值与代码语句大致各半、裸值略多）
const SYMBOL_VALUE_AVG_LEN = 14; // value 卡平均字符（IP/日期/金额量级）

/** 综合训练：按符号阶段 char_budget 算该练几张 value（覆盖几种形式），随时长伸缩，下限 2。 */
export function symbolValueCountForBudget(charBudget: number): number {
  return Math.max(2, Math.round((charBudget * SYMBOL_VALUE_RATIO) / SYMBOL_VALUE_AVG_LEN));
}

function symbolsStageTarget(
  context: BuildTargetContext,
  options: StageTargetOptions,
): PracticeTarget {
  if (stageModuleEnabled(options, "programming_basics")) {
    // 综合训练：value 裸值数随分到的时长（char_budget）伸缩，覆盖更多/更少真实形式
    const valueCount = symbolValueCountForBudget(options.stage.char_budget);
    const target = buildSymbolsNumbersTarget(context, {}, valueCount);
    if (target.text.trim().length > 0) {
      // 按形态预算缩放：对慢用户（小预算）按行裁剪。value 行排最前 → 裁尾部时天然受保护
      return fitSymbolsTargetToBudget(context, target, options.stage.char_budget);
    }
  }
  // 编程基础被禁用（或无卡片内容）：退化到基础输入的数字/标点行
  const numberRow = foundationDrillTarget(context, "number-row");
  const punctuation = foundationDrillTarget(context, "punctuation-edges");
  const lines: string[] = [];
  let chars = 0;
  for (const line of [...numberRow.items, ...punctuation.items]) {
    lines.push(line);
    chars += line.length + 1;
    if (chars >= options.stage.char_budget) {
      break;
    }
  }
  return {
    mode: "symbols",
    text: lines.join("\n"),
    source: "keyloop:stage:symbols:foundation",
  };
}

export function fitSymbolsTargetToBudget(
  context: BuildTargetContext,
  target: PracticeTarget,
  budget: number,
): PracticeTarget {
  if (target.text.length >= budget) {
    return trimTargetToCharBudget(target, budget);
  }
  const supplement = symbolSupplementLines(context);
  if (supplement.length === 0) {
    return target;
  }
  // #3：补充前随机打乱，避免每次都从同一段（如数字 10-29）开始、跨天雷同（见 ADR-0002）
  shuffleInPlace(supplement, context.random ?? Math.random);
  const lines = target.text.split("\n");
  let chars = target.text.length;
  let index = 0;
  while (chars < budget && index < supplement.length * 32) {
    const line = supplement[index % supplement.length] ?? "";
    if (line.trim().length > 0) {
      lines.push(line);
      chars += line.length + 1;
    }
    index += 1;
  }
  const text = lines.join("\n");
  const firstBlock = target.code_blocks?.[0];
  return {
    ...target,
    text,
    ...(firstBlock === undefined
      ? {}
      : { code_blocks: [{ ...firstBlock, line_count: lines.length }] }),
  };
}

/**
 * 符号段补充行：跨语言通用的「真实高频字面量 + 运算符」兜底池。
 * 两用：① 某语言符号卡填不满本形态预算时（冷门 / 语料少）在此循环补足，池足够大以免单调重复；
 * ② 与各语言 value 的通用部分同一套理念。内容是真实开发高频、自带符号的字面量
 *（URL / 日期 / 版本 / IP / 端口 / 金额 / 百分比 / 颜色 / MIME / 查询串 / 正则）+ 各类运算符标点，
 * 而非早期从 foundation_drills 抽来的折行英文语篇（会被腰斩、又被代码高亮误着色）。
 * 调用方负责随机打乱。
 */
export function symbolSupplementLines(_context: BuildTargetContext): string[] {
  return [
    "\"2026-06-22\" \"2026-12-31\" \"2027-03-15\"",
    "\"2026-06-22T08:30:00Z\" \"2026-01-01T00:00:00Z\"",
    "\"08:30:00\" \"23:59:59\" \"12:00:00\"",
    "\"yyyy-MM-dd\" \"HH:mm:ss\"",
    "\"https://api.example.com/v1/users\"",
    "\"https://cdn.example.com/assets/app.js\"",
    "\"./src/index.ts\" \"../lib/utils.js\"",
    "\"/var/log/app.log\" \"/usr/local/bin\"",
    "\"?page=1&size=20&sort=desc\"",
    "\"1.0.0\" \"2.3.1\" \"0.12.5-beta\"",
    "\"^1.2.0\" \"~2.0.0\" \">=3.1.0\"",
    "\"192.168.1.1\" \"10.0.0.1\" \"127.0.0.1\"",
    "\"127.0.0.1:3000\" \"localhost:8080\" \"0.0.0.0:5432\"",
    "\"#3B82F6\" \"#EF4444\" \"#10B981\"",
    "\"rgb(255,128,0)\" \"rgba(0,0,0,0.5)\"",
    "$19.99 $1,299.00 $49.50",
    "99.9% 12.5% 0.1% 100%",
    "1499.99 29.95 999.00",
    "3000 8080 5432 6379 27017",
    "200 201 204 400 401 404 500",
    "30_000 60_000 86_400 3_600",
    "1024 2048 4096 65536",
    "3.14159 2.71828 1.41421",
    "-1 0 1 -273.15",
    "\"application/json\" \"text/html\" \"image/png\"",
    "\"utf-8\" \"gzip\" \"deflate\"",
    "\"GET\" \"POST\" \"PUT\" \"DELETE\"",
    "\"^[a-z0-9_-]+$\"",
    "\"\\d{4}-\\d{2}-\\d{2}\"",
    "\"[A-Z]{2,4}\\d{6}\"",
    "\"user@example.com\" \"admin@test.org\"",
    "\"#main\" \".container\" \"[data-id]\"",
    "0xFF 0o755 0b1010",
    "=> -> :: ?. ?? && ||",
    "=== !== <= >= != <>",
    "+= -= *= /= %= **=",
    "( ) { } [ ] < >",
    "! ? : ; , .",
    "& | ^ ~ << >>",
    "+ - * / % **",
    "(0,0) (100,200) (-50,75)",
    "[0..9] [1..100] [-1,1]",
  ];
}

/** 按字符预算在行边界裁剪 target（至少保留 1 行），同步修正 code_blocks 行数 */
function trimTargetToCharBudget(target: PracticeTarget, budget: number): PracticeTarget {
  if (budget <= 0) {
    return target;
  }
  const lines = target.text.split("\n");
  const kept: string[] = [];
  let chars = 0;
  for (const line of lines) {
    const next = chars + line.length + 1;
    if (kept.length > 0 && next > budget) {
      break;
    }
    kept.push(line);
    chars = next;
  }
  if (kept.length === lines.length) {
    return target;
  }
  const text = kept.join("\n");
  const firstBlock = target.code_blocks?.[0];
  return {
    ...target,
    text,
    ...(firstBlock === undefined
      ? {}
      : { code_blocks: [{ ...firstBlock, line_count: kept.length }] }),
  };
}

/** 合并多个 PracticeTarget，平移注解偏移 */
function combinePracticeTargets(
  targets: PracticeTarget[],
  mode: PracticeTarget["mode"],
  source: string,
  separator = "\n",
): PracticeTarget {
  let text = "";
  const annotations: PracticeTargetAnnotation[] = [];
  for (const target of targets) {
    if (target.text.length === 0) {
      continue;
    }
    if (text.length > 0) {
      text += separator;
    }
    const offset = text.length;
    text += target.text;
    for (const annotation of target.annotations ?? []) {
      annotations.push({
        ...annotation,
        start: annotation.start + offset,
        end: annotation.end + offset,
      });
    }
  }
  return {
    mode,
    text,
    source,
    ...(annotations.length === 0 ? {} : { annotations }),
  };
}

/** 二级菜单「日常综合」：单词 + 句子两段，预算按形态 EWMA，focus 分桶回流 */
export function buildEverydayMixStageTarget(
  context: BuildTargetContext,
  profile: SkillProfile,
  customLibraries?: CustomLibrary[],
): PracticeTarget {
  const enabledModules: TrainingModule[] = ["everyday_english"];
  const words = wordsStageTarget(context, {
    stage: { form: "words", char_budget: stageMixBudget(profile, "words") },
    profile,
    enabledModules,
    ...(customLibraries === undefined ? {} : { customLibraries }),
  });
  const sentences = sentencesStageTarget(context, {
    stage: { form: "sentences", char_budget: stageMixBudget(profile, "sentences") },
    profile,
    enabledModules,
    ...(customLibraries === undefined ? {} : { customLibraries }),
  });
  return combinePracticeTargets(
    [words, sentences],
    "words",
    "keyloop:module:everyday-english:mix:adaptive",
  );
}

/** 二级菜单「编程基础综合」：编程词 + 符号数字两段 */
export function buildProgrammingBasicsMixStageTarget(
  context: BuildTargetContext,
  profile: SkillProfile,
): PracticeTarget {
  const enabledModules: TrainingModule[] = ["programming_basics"];
  const words = wordsStageTarget(context, {
    stage: { form: "words", char_budget: stageMixBudget(profile, "words") },
    profile,
    enabledModules,
  });
  const symbols = symbolsStageTarget(context, {
    stage: { form: "symbols", char_budget: stageMixBudget(profile, "symbols") },
    profile,
    enabledModules,
  });
  return combinePracticeTargets(
    [words, symbols],
    "mixed",
    "keyloop:module:programming-basics:mix:adaptive",
  );
}

/** 二级 mix 的形态预算：固定 4 分钟 × 该形态 EWMA WPM（冷启动折扣由 charBudget 内置） */
const STAGE_MIX_MINUTES = 4;

function stageMixBudget(profile: SkillProfile, form: TrainingForm): number {
  return charBudget(form, STAGE_MIX_MINUTES, profile.form_speeds);
}
