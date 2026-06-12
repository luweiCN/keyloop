export type Language = "zh" | "en";

export type Mode =
  | "chars"
  | "numbers"
  | "case"
  | "words"
  | "symbols"
  | "code"
  | "mixed";

export type LessonKind =
  | "foundation"
  | "warmup"
  | "chunks"
  | "common_words"
  | "words"
  | "symbols"
  | "naming"
  | "code_block";

export type TrainingModule =
  | "unknown"
  | "comprehensive"
  | "foundation_input"
  | "everyday_english"
  | "programming_basics"
  | "custom_corpus"
  | "code_practice";

export type TrainingCategory =
  | "unknown"
  | "foundation_mix"
  | "home_row"
  | "top_row"
  | "bottom_row"
  | "finger_transitions"
  | "punctuation_edges"
  | "letter_combinations"
  | "basic_words"
  | "everyday_words"
  | "everyday_phrases"
  | "everyday_sentences"
  | "everyday_articles"
  | "everyday_word_decomposition"
  | "everyday_mix"
  | "numbers_symbols"
  | "symbols_numbers"
  | "programming_terms"
  | "naming_styles"
  | "builtin_api"
  | "programming_basics_mix"
  | "code_snippet"
  | "code_function"
  | "code_file_fragment"
  | "code_mix"
  | "review"
  | "word_breakdown"
  | "personal_vocabulary"
  | "custom_library";

export type MixProfile = "standalone" | "comprehensive" | "review";
export type CompletionState = "completed" | "partial";
export type TokenKind = "word" | "symbol" | "code";
export type KeyAction = "insert" | "auto_indent" | "backspace";
export type CodePracticeLevel = "block" | "function" | "file";
export type CodePracticeFacet = "language" | "framework" | "project";
export type CodePracticeDifficultySetting =
  | "adaptive"
  | "all"
  | "easy"
  | "medium"
  | "hard";
export type CodePracticeLengthSetting = "adaptive" | "short" | "medium" | "long";
export type CodePracticeSize = Exclude<CodePracticeLengthSetting, "adaptive">;
export type CodeFormatterMode = "auto" | "prettier" | "native" | "off";
export type CodeIndentStyle = "space" | "tab";
export type CodeIndentWidth = 2 | 4;
export type CodeSemicolonStyle = "always" | "never";
export type CodeQuoteStyle = "double" | "single";
export type CodeTrailingCommaStyle = "none" | "es5" | "all";
export type EverydayWordRange = "200" | "1000" | "5000" | "10000";
export type EverydayLevel =
  | "high_school"
  | "cet4"
  | "cet6"
  | "postgraduate"
  | "toefl_ielts";
export type EverydayPracticeLength = "short" | "medium" | "long" | "mixed";
export type EverydaySentenceLength = EverydayPracticeLength;
export type EverydayGroupWordCount = number;
export type EverydaySentenceCount = number;
export type EverydayRepeatCount = number;
export type WordAudioVolumePercent = number;
export type SpeedUnit = "wpm" | "cpm";

export interface CharStats {
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
}

export interface PracticeTarget {
  mode: Mode;
  text: string;
  source: string;
  code_blocks?: PracticeTargetCodeBlock[];
  annotations?: PracticeTargetAnnotation[];
  /** 渲染提示：空格显示为中点 ·（输入仍为空格），用于词组练习 */
  space_glyph?: "dot";
}

export interface PracticeTargetAnnotation {
  start: number;
  end: number;
  translation_zh: string;
  source_title?: string;
  display?: PracticeTargetAnnotationDisplay;
  audio_text?: string;
}

export type PracticeTargetAnnotationDisplay = "word" | "word_loose" | "line" | "article";

export interface PracticeTargetCodeBlock {
  start_line: number;
  line_count: number;
  language: string;
  framework: string;
  project: string;
  source: string;
  difficulty?: CodePracticeDifficultySetting;
  size?: CodePracticeSize;
}

export interface PracticeLesson {
  id: string;
  kind: LessonKind;
  module: TrainingModule;
  category: TrainingCategory;
  mix_profile: MixProfile;
  estimated_minutes: number;
  target: PracticeTarget;
  reason_zh: string;
  reason_en: string;
}

export interface DailyPracticePlan {
  run_id: string;
  run_number: number;
  target_minutes: number;
  completed_ms: number;
  lessons: PracticeLesson[];
}

export interface CodeFilterPreference {
  facet: CodePracticeFacet;
  value: string;
}

export interface CodePracticeConfig {
  language?: string;
  framework?: string;
  project?: string;
  languages: string[];
  frameworks: string[];
  projects: string[];
  level?: CodePracticeLevel;
  difficulty?: CodePracticeDifficultySetting;
  size?: CodePracticeSize;
  match_any: boolean;
}

export interface CodePracticeOption {
  facet: CodePracticeFacet;
  value: string;
  count: number;
}

export interface CodeStyleSettings {
  formatter: CodeFormatterMode;
  indent_style: CodeIndentStyle;
  indent_width: CodeIndentWidth;
  semicolons: CodeSemicolonStyle;
  quotes: CodeQuoteStyle;
  trailing_commas: CodeTrailingCommaStyle;
}

export interface EverydayEnglishSettings {
  word_range: EverydayWordRange;
  word_count: EverydayGroupWordCount;
  word_repeats: EverydayRepeatCount;
  sentence_level: EverydayLevel;
  sentence_length: EverydaySentenceLength;
  sentence_count: EverydaySentenceCount;
  article_level: EverydayLevel;
  article_length: EverydayPracticeLength;
  decomposition_level: EverydayLevel;
  decomposition_word_count: EverydayGroupWordCount;
  decomposition_part_repeats: EverydayRepeatCount;
  decomposition_word_repeats: EverydayRepeatCount;
  include_phrases: boolean;
}

export interface UserPreferences {
  interface_language: Language;
  speed_unit: SpeedUnit;
  pinned_code_filters: CodeFilterPreference[];
  global_code_filters: CodeFilterPreference[];
  code_practice: {
    difficulty: CodePracticeDifficultySetting;
    length: CodePracticeLengthSetting;
  };
  code_style: CodeStyleSettings;
  everyday_english: EverydayEnglishSettings;
  word_breakdown: {
    enabled_in_comprehensive: boolean;
    max_items_per_group: number;
    word_repeats: EverydayRepeatCount;
  };
  programming_terms: {
    word_repeats: EverydayRepeatCount;
  };
  word_audio: {
    enabled: boolean;
    volume_percent: WordAudioVolumePercent;
  };
  custom_library: {
    word_repeats: EverydayRepeatCount;
  };
  personal_vocabulary: {
    enabled_in_comprehensive: boolean;
    daily_review_limit: number;
  };
}

export interface KeyEventRecord {
  at_ms: number;
  action: KeyAction;
  position: number;
  expected: string | null;
  input: string | null;
  correct: boolean;
}

export interface TokenStat {
  token: string;
  kind: TokenKind;
  start_delay_ms: number;
  duration_ms: number;
  errors: number;
}

export interface GroupFeedback {
  error_keys: Array<[string, number]>;
  slow_keys: Array<[string, number]>;
  error_tokens: Array<[string, number]>;
  slow_tokens: Array<[string, number]>;
  missed_symbols: Array<[string, number]>;
  backspace_clusters: Array<[string, number]>;
}

export interface KeyAggregate {
  key: string;
  sample_count: number;
  hit_count: number;
  miss_count: number;
  avg_ms: number;
  fastest_ms: number;
  slowest_ms: number;
  filtered_avg_ms: number;
  error_rate: number;
  confidence: number;
  last_seen_at: string | null;
}

export interface SessionCheckpoint {
  target_id: string;
  target_hash: string;
  input_len: number;
  active_ms: number;
  idle_ms: number;
  key_sample_count: number;
  key_aggregates: KeyAggregate[];
}

export interface SessionRecord {
  id: string;
  started_at: string;
  mode: Mode;
  source: string;
  daily_run_id: string;
  lesson_id: string;
  lesson_index: number | null;
  completion_state: CompletionState;
  module: TrainingModule;
  category: TrainingCategory;
  duration_ms: number;
  active_ms: number;
  idle_ms: number;
  manual_pause_ms: number;
  idle_pause_count: number;
  start_to_first_key_ms: number;
  last_key_to_end_ms: number;
  char_stats: CharStats;
  target_text: string;
  user_input: string;
  target_len: number;
  typed_len: number;
  correct_chars: number;
  wpm: number;
  raw_wpm: number;
  accuracy: number;
  error_count: number;
  backspace_count: number;
  error_chars: Record<string, number>;
  error_tokens: Record<string, number>;
  slow_tokens: TokenStat[];
  token_stats: TokenStat[];
  key_events: KeyEventRecord[];
}

export interface PracticePlan {
  focus_words: string[];
  focus_symbols: string[];
  focus_code: string[];
  focus_keys: string[];
  advice: string[];
  recommended_mode: Mode;
  has_recent_history: boolean;
}

const DEFAULT_STARTED_AT = "1970-01-01T00:00:00Z";

const modes = ["chars", "numbers", "case", "words", "symbols", "code", "mixed"] as const;
const lessonKinds = [
  "foundation",
  "warmup",
  "chunks",
  "common_words",
  "words",
  "symbols",
  "naming",
  "code_block",
] as const;
const trainingModules = [
  "unknown",
  "comprehensive",
  "foundation_input",
  "everyday_english",
  "programming_basics",
  "code_practice",
] as const;
const trainingCategories = [
  "unknown",
  "foundation_mix",
  "home_row",
  "top_row",
  "bottom_row",
  "finger_transitions",
  "punctuation_edges",
  "letter_combinations",
  "basic_words",
  "everyday_words",
  "everyday_phrases",
  "everyday_sentences",
  "everyday_articles",
  "everyday_word_decomposition",
  "everyday_mix",
  "numbers_symbols",
  "symbols_numbers",
  "programming_terms",
  "naming_styles",
  "builtin_api",
  "programming_basics_mix",
  "code_snippet",
  "code_function",
  "code_file_fragment",
  "code_mix",
  "review",
  "word_breakdown",
  "personal_vocabulary",
  "custom_library",
] as const;
const codePracticeLengthSettings = ["adaptive", "short", "medium", "long"] as const;
const mixProfiles = ["standalone", "comprehensive", "review"] as const;
const completionStates = ["completed", "partial"] as const;
const tokenKinds = ["word", "symbol", "code"] as const;
const keyActions = ["insert", "auto_indent", "backspace"] as const;
const codePracticeFacets = ["language", "framework", "project"] as const;
const codePracticeDifficultySettings = [
  "adaptive",
  "all",
  "easy",
  "medium",
  "hard",
] as const;
const codeFormatterModes = ["auto", "prettier", "native", "off"] as const;
const codePracticeLengthSizes = ["short", "medium", "long"] as const;
const codeIndentStyles = ["space", "tab"] as const;
const codeIndentWidths = [2, 4] as const;
const codeSemicolonStyles = ["always", "never"] as const;
const codeQuoteStyles = ["double", "single"] as const;
const codeTrailingCommaStyles = ["none", "es5", "all"] as const;
const everydayWordRanges = ["200", "1000", "5000", "10000"] as const;
const everydayLevels = [
  "high_school",
  "cet4",
  "cet6",
  "postgraduate",
  "toefl_ielts",
] as const;
const everydaySentenceLengths = ["short", "medium", "long", "mixed"] as const;
const everydayGroupWordCounts = [10, 20, 30, 50] as const;
const everydaySentenceCounts = [3, 5, 8, 10] as const;
const everydayRepeatCounts = [1, 3, 5] as const;
const wordBreakdownRepeatCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const wordAudioVolumePercents = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

export function parsePracticeTarget(value: unknown): PracticeTarget {
  const object = asObject(value);
  const codeBlocks = arrayValue(object.code_blocks).map(parsePracticeTargetCodeBlock);
  const annotations = arrayValue(object.annotations).map(parsePracticeTargetAnnotation);
  return {
    mode: literalIfPresent(object.mode, modes, "mixed", "target.mode"),
    text: stringValue(object.text),
    source: stringValue(object.source),
    ...(codeBlocks.length === 0 ? {} : { code_blocks: codeBlocks }),
    ...(annotations.length === 0 ? {} : { annotations }),
  };
}

function parsePracticeTargetAnnotation(value: unknown): PracticeTargetAnnotation {
  const object = asObject(value);
  const sourceTitle = optionalString(object.source_title);
  const audioText = optionalString(object.audio_text);
  const display = optionalLiteral(
    object.display,
    ["word", "word_loose", "line", "article"] as const,
  );
  return {
    start: numberValue(object.start),
    end: numberValue(object.end),
    translation_zh: stringValue(object.translation_zh),
    ...(sourceTitle === undefined ? {} : { source_title: sourceTitle }),
    ...(display === undefined ? {} : { display }),
    ...(audioText === undefined ? {} : { audio_text: audioText }),
  };
}

function parsePracticeTargetCodeBlock(value: unknown): PracticeTargetCodeBlock {
  const object = asObject(value);
  const difficulty = optionalLiteral(object.difficulty, codePracticeDifficultySettings);
  const size = optionalLiteral(object.size, codePracticeLengthSizes);
  return {
    start_line: numberValue(object.start_line),
    line_count: numberValue(object.line_count),
    language: stringValue(object.language),
    framework: stringValue(object.framework),
    project: stringValue(object.project),
    source: stringValue(object.source),
    ...(difficulty === undefined ? {} : { difficulty }),
    ...(size === undefined ? {} : { size }),
  };
}

export function parsePracticeLesson(value: unknown): PracticeLesson {
  const object = asObject(value);
  return {
    id: stringValue(object.id),
    kind: requiredLiteral(object.kind, lessonKinds, "lesson.kind"),
    module: literalIfPresent(
      object.module,
      trainingModules,
      "programming_basics",
      "lesson.module",
    ),
    category: literalIfPresent(
      object.category,
      trainingCategories,
      "programming_terms",
      "lesson.category",
    ),
    mix_profile: literalIfPresent(
      object.mix_profile,
      mixProfiles,
      "standalone",
      "lesson.mix_profile",
    ),
    estimated_minutes: numberValue(object.estimated_minutes),
    target: parsePracticeTarget(object.target),
    reason_zh: stringValue(object.reason_zh),
    reason_en: stringValue(object.reason_en),
  };
}

export function parseDailyPracticePlan(value: unknown): DailyPracticePlan {
  const object = asObject(value);
  return {
    run_id: stringValue(object.run_id),
    run_number: numberValue(object.run_number),
    target_minutes: numberValue(object.target_minutes),
    completed_ms: numberValue(object.completed_ms),
    lessons: arrayValue(object.lessons).map(parsePracticeLesson),
  };
}

export function parseUserPreferences(value: unknown): UserPreferences {
  const object = asObject(value);
  const codePractice = asObject(object.code_practice);
  const codeStyle = asObject(object.code_style);
  const wordBreakdown = asObject(object.word_breakdown);
  const programmingTerms = asObject(object.programming_terms);
  const wordAudio = asObject(object.word_audio);
  const customLibrary = asObject(object.custom_library);
  const personalVocabulary = asObject(object.personal_vocabulary);
  return {
    interface_language: literalIfPresent(
      object.interface_language,
      ["zh", "en"] as const,
      "zh",
      "interface_language",
    ),
    speed_unit: literalIfPresent(
      object.speed_unit,
      ["wpm", "cpm"] as const,
      "wpm",
      "speed_unit",
    ),
    pinned_code_filters: arrayValue(object.pinned_code_filters).map((item) =>
      parseCodeFilterPreference(item, "pinned_code_filters"),
    ),
    global_code_filters: arrayValue(object.global_code_filters).map((item) =>
      parseCodeFilterPreference(item, "global_code_filters"),
    ),
    code_practice: {
      difficulty: literalIfPresent(
        codePractice.difficulty,
        codePracticeDifficultySettings,
        "adaptive",
        "code_practice.difficulty",
      ),
      length: literalIfPresent(
        codePractice.length,
        codePracticeLengthSettings,
        "adaptive",
        "code_practice.length",
      ),
    },
    code_style: parseCodeStyleSettings(codeStyle),
    everyday_english: parseEverydayEnglishSettings(object.everyday_english),
    word_breakdown: {
      enabled_in_comprehensive: booleanValue(
        wordBreakdown.enabled_in_comprehensive,
        true,
      ),
      max_items_per_group: numberValue(wordBreakdown.max_items_per_group, 6),
      word_repeats: nearestNumberOption(
        numberValue(wordBreakdown.word_repeats, 2),
        wordBreakdownRepeatCounts,
        2,
      ),
    },
    programming_terms: {
      word_repeats: nearestNumberOption(
        programmingTerms.word_repeats,
        wordBreakdownRepeatCounts,
        1,
      ),
    },
    word_audio: {
      enabled: booleanValue(wordAudio.enabled, false),
      volume_percent: nearestNumberOption(
        numberValue(wordAudio.volume_percent, 100),
        wordAudioVolumePercents,
        100,
      ),
    },
    custom_library: {
      word_repeats: nearestNumberOption(
        customLibrary.word_repeats,
        wordBreakdownRepeatCounts,
        1,
      ),
    },
    personal_vocabulary: {
      enabled_in_comprehensive: booleanValue(
        personalVocabulary.enabled_in_comprehensive,
        true,
      ),
      daily_review_limit: numberValue(personalVocabulary.daily_review_limit, 8),
    },
  };
}

export function defaultCodeStyleSettings(
  overrides: Partial<CodeStyleSettings> = {},
): CodeStyleSettings {
  return {
    formatter: "auto",
    indent_style: "space",
    indent_width: 2,
    semicolons: "always",
    quotes: "double",
    trailing_commas: "es5",
    ...overrides,
  };
}

function parseCodeStyleSettings(value: unknown): CodeStyleSettings {
  const object = asObject(value);
  return defaultCodeStyleSettings({
    formatter: literalIfPresent(
      object.formatter,
      codeFormatterModes,
      "auto",
      "code_style.formatter",
    ),
    indent_style: literalIfPresent(
      object.indent_style,
      codeIndentStyles,
      "space",
      "code_style.indent_style",
    ),
    indent_width: literalNumberIfPresent(
      object.indent_width,
      codeIndentWidths,
      2,
      "code_style.indent_width",
    ),
    semicolons: literalIfPresent(
      object.semicolons,
      codeSemicolonStyles,
      "always",
      "code_style.semicolons",
    ),
    quotes: literalIfPresent(
      object.quotes,
      codeQuoteStyles,
      "double",
      "code_style.quotes",
    ),
    trailing_commas: literalIfPresent(
      object.trailing_commas,
      codeTrailingCommaStyles,
      "es5",
      "code_style.trailing_commas",
    ),
  });
}

export function parseSessionRecord(value: unknown): SessionRecord {
  const object = asObject(value);
  return {
    id: stringValue(object.id, "legacy"),
    started_at: stringValue(object.started_at, DEFAULT_STARTED_AT),
    mode: literalIfPresent(object.mode, modes, "mixed", "session.mode"),
    source: stringValue(object.source),
    daily_run_id: stringValue(object.daily_run_id),
    lesson_id: stringValue(object.lesson_id),
    lesson_index: nullableNumber(object.lesson_index),
    completion_state: literalIfPresent(
      object.completion_state,
      completionStates,
      "completed",
      "session.completion_state",
    ),
    module: literalIfPresent(object.module, trainingModules, "unknown", "session.module"),
    category: literalIfPresent(
      object.category,
      trainingCategories,
      "unknown",
      "session.category",
    ),
    duration_ms: numberValue(object.duration_ms),
    active_ms: numberValue(object.active_ms),
    idle_ms: numberValue(object.idle_ms),
    manual_pause_ms: numberValue(object.manual_pause_ms),
    idle_pause_count: numberValue(object.idle_pause_count),
    start_to_first_key_ms: numberValue(object.start_to_first_key_ms),
    last_key_to_end_ms: numberValue(object.last_key_to_end_ms),
    char_stats: parseCharStats(object.char_stats),
    target_text: stringValue(object.target_text),
    user_input: stringValue(object.user_input),
    target_len: numberValue(object.target_len),
    typed_len: numberValue(object.typed_len),
    correct_chars: numberValue(object.correct_chars),
    wpm: numberValue(object.wpm),
    raw_wpm: numberValue(object.raw_wpm),
    accuracy: numberValue(object.accuracy),
    error_count: numberValue(object.error_count),
    backspace_count: numberValue(object.backspace_count),
    error_chars: numberRecord(object.error_chars),
    error_tokens: numberRecord(object.error_tokens),
    slow_tokens: arrayValue(object.slow_tokens).map(parseTokenStat),
    token_stats: arrayValue(object.token_stats).map(parseTokenStat),
    key_events: arrayValue(object.key_events).map(parseKeyEventRecord),
  };
}

export function defaultSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "legacy",
    started_at: DEFAULT_STARTED_AT,
    mode: "mixed",
    source: "",
    daily_run_id: "",
    lesson_id: "",
    lesson_index: null,
    completion_state: "completed",
    module: "unknown",
    category: "unknown",
    duration_ms: 0,
    active_ms: 0,
    idle_ms: 0,
    manual_pause_ms: 0,
    idle_pause_count: 0,
    start_to_first_key_ms: 0,
    last_key_to_end_ms: 0,
    char_stats: { correct: 0, incorrect: 0, extra: 0, missed: 0 },
    target_text: "",
    user_input: "",
    target_len: 0,
    typed_len: 0,
    correct_chars: 0,
    wpm: 0,
    raw_wpm: 0,
    accuracy: 0,
    error_count: 0,
    backspace_count: 0,
    error_chars: {},
    error_tokens: {},
    slow_tokens: [],
    token_stats: [],
    key_events: [],
    ...overrides,
  };
}

export function defaultUserPreferences(
  overrides: Partial<UserPreferences> = {},
): UserPreferences {
  return {
    interface_language: "zh",
    speed_unit: "wpm",
    pinned_code_filters: [],
    global_code_filters: [],
    code_practice: {
      difficulty: "adaptive",
      length: "adaptive",
    },
    code_style: defaultCodeStyleSettings(),
    everyday_english: {
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
    },
    word_breakdown: {
      enabled_in_comprehensive: true,
      max_items_per_group: 6,
      word_repeats: 2,
    },
    programming_terms: {
      word_repeats: 1,
    },
    word_audio: {
      enabled: false,
      volume_percent: 100,
    },
    custom_library: {
      word_repeats: 1,
    },
    personal_vocabulary: {
      enabled_in_comprehensive: true,
      daily_review_limit: 8,
    },
    ...overrides,
  };
}

export function defaultCodePracticeConfig(
  overrides: Partial<CodePracticeConfig> = {},
): CodePracticeConfig {
  return {
    languages: [],
    frameworks: [],
    projects: [],
    match_any: false,
    ...overrides,
  };
}

export function defaultKeyAggregate(overrides: Partial<KeyAggregate> = {}): KeyAggregate {
  return {
    key: "",
    sample_count: 0,
    hit_count: 0,
    miss_count: 0,
    avg_ms: 0,
    fastest_ms: 0,
    slowest_ms: 0,
    filtered_avg_ms: 0,
    error_rate: 0,
    confidence: 0,
    last_seen_at: null,
    ...overrides,
  };
}

export function parseKeyAggregate(value: unknown): KeyAggregate {
  const object = asObject(value);
  return {
    key: stringValue(object.key),
    sample_count: numberValue(object.sample_count),
    hit_count: numberValue(object.hit_count),
    miss_count: numberValue(object.miss_count),
    avg_ms: numberValue(object.avg_ms),
    fastest_ms: numberValue(object.fastest_ms),
    slowest_ms: numberValue(object.slowest_ms),
    filtered_avg_ms: numberValue(object.filtered_avg_ms),
    error_rate: numberValue(object.error_rate),
    confidence: numberValue(object.confidence),
    last_seen_at: nullableString(object.last_seen_at),
  };
}

export function parseSessionCheckpoint(value: unknown): SessionCheckpoint {
  const object = asObject(value);
  return {
    target_id: stringValue(object.target_id),
    target_hash: stringValue(object.target_hash),
    input_len: numberValue(object.input_len),
    active_ms: numberValue(object.active_ms),
    idle_ms: numberValue(object.idle_ms),
    key_sample_count: numberValue(object.key_sample_count),
    key_aggregates: arrayValue(object.key_aggregates).map(parseKeyAggregate),
  };
}

function parseCodeFilterPreference(value: unknown, fieldName: string): CodeFilterPreference {
  const object = asObject(value);
  return {
    facet: requiredLiteral(object.facet, codePracticeFacets, `${fieldName}.facet`),
    value: stringValue(object.value),
  };
}

function parseEverydayEnglishSettings(value: unknown): EverydayEnglishSettings {
  const object = asObject(value);
  return {
    word_range: literal(object.word_range, everydayWordRanges, "1000"),
    word_count: nearestNumberOption(
      object.word_count,
      everydayGroupWordCounts,
      20,
    ),
    word_repeats: nearestNumberOption(
      object.word_repeats,
      wordBreakdownRepeatCounts,
      1,
    ),
    sentence_level: literal(object.sentence_level, everydayLevels, "cet4"),
    sentence_length: literal(object.sentence_length, everydaySentenceLengths, "mixed"),
    sentence_count: nearestNumberOption(
      object.sentence_count,
      everydaySentenceCounts,
      5,
    ),
    article_level: literal(object.article_level, everydayLevels, "cet4"),
    article_length: literal(object.article_length, everydaySentenceLengths, "short"),
    decomposition_level: literal(object.decomposition_level, everydayLevels, "cet4"),
    decomposition_word_count: nearestNumberOption(
      object.decomposition_word_count,
      everydayGroupWordCounts,
      10,
    ),
    decomposition_part_repeats: nearestNumberOption(
      object.decomposition_part_repeats,
      everydayRepeatCounts,
      3,
    ),
    decomposition_word_repeats: nearestNumberOption(
      object.decomposition_word_repeats,
      everydayRepeatCounts,
      3,
    ),
    include_phrases: booleanValue(object.include_phrases, true),
  };
}

function parseCharStats(value: unknown): CharStats {
  const object = asObject(value);
  return {
    correct: numberValue(object.correct),
    incorrect: numberValue(object.incorrect),
    extra: numberValue(object.extra),
    missed: numberValue(object.missed),
  };
}

function parseKeyEventRecord(value: unknown): KeyEventRecord {
  const object = asObject(value);
  return {
    at_ms: numberValue(object.at_ms),
    action: requiredLiteral(object.action, keyActions, "key_events.action"),
    position: numberValue(object.position),
    expected: nullableString(object.expected),
    input: nullableString(object.input),
    correct: booleanValue(object.correct),
  };
}

function parseTokenStat(value: unknown): TokenStat {
  const object = asObject(value);
  return {
    token: stringValue(object.token),
    kind: requiredLiteral(object.kind, tokenKinds, "token_stats.kind"),
    start_delay_ms: numberValue(object.start_delay_ms),
    duration_ms: numberValue(object.duration_ms),
    errors: numberValue(object.errors),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return numberValue(value);
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return stringValue(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberRecord(value: unknown): Record<string, number> {
  const object = asObject(value);
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(object)) {
    if (typeof item === "number" && Number.isFinite(item)) {
      result[key] = item;
    }
  }
  return result;
}

function literal<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function literalIfPresent<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  fieldName: string,
): T[number] {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "string" && allowed.includes(value)) {
    return value;
  }
  throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}`);
}

function optionalLiteral<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | undefined {
  return typeof value === "string" && allowed.includes(value) ? value : undefined;
}

function literalNumberIfPresent<const T extends readonly number[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  fieldName: string,
): T[number] {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "number" && allowed.includes(value)) {
    return value;
  }
  throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}`);
}

function nearestNumberOption<const T extends readonly number[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  if (allowed.includes(value)) {
    return value;
  }
  return allowed.reduce<T[number]>((nearest, option) => {
    const currentDistance = Math.abs(value - nearest);
    const optionDistance = Math.abs(value - option);
    return optionDistance < currentDistance ? option : nearest;
  }, fallback);
}

function requiredLiteral<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fieldName: string,
): T[number] {
  if (typeof value === "string" && allowed.includes(value)) {
    return value;
  }
  throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}`);
}
