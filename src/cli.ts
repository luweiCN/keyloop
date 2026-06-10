import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  createPersonalArticleEntry,
  createPersonalSentenceEntry,
  parseArticleFile,
} from "./training/personalCorpus";
import { TextEncoder } from "node:util";

import {
  buildDailyPracticePlan,
  refreshModuleMixTarget,
  type BuildTargetContext,
} from "./training/targets";
import { buildPlan } from "./training/plan";
import {
  appendSessionToPath,
  clearSessionCheckpointAtPath,
  customLibrariesDirPath,
  dailyRunsPath,
  currentSessionPath,
  keyStatsPath,
  keyloopDataDir,
  loadKeyAggregatesFromPath,
  loadCustomLibrariesFromDir,
  loadOrCreateDailyPracticePlanFromPath,
  loadPreferencesFromPath,
  loadSessionsFromPath,
  loadVocabularyStoreFromPath,
  observeKeyEvent,
  preferencesPath,
  saveKeyAggregatesToPath,
  savePreferencesToPath,
  saveSessionCheckpointToPath,
  saveVocabularyStoreToPath,
  sessionLogPath,
  vocabularyPath,
  collectionsPath,
  loadCollectionsStoreFromPath,
  saveCollectionsStoreToPath,
  loadPersonalArticlesStoreFromPath,
  loadPersonalSentencesStoreFromPath,
  personalArticlesPath,
  personalSentencesPath,
  savePersonalArticlesStoreToPath,
  savePersonalSentencesStoreToPath,
} from "./storage/keyloopStore";
import {
  defaultCodePracticeConfig,
  type CodePracticeConfig,
  type DailyPracticePlan,
  type KeyAggregate,
  type Language,
  type Mode,
  type PracticeLesson,
  type PracticeTarget,
  type SessionRecord,
  type SpeedUnit,
  type UserPreferences,
} from "./domain/model";
import {
  codePracticeOptionsForLibrary,
  loadContentLibrary,
  resolveContentRoot,
  sourceCatalog,
} from "./content/library";
import { Dictionary, ensureFullDictionary } from "./content/dictionary";
import {
  importPreview,
  planReport,
  sessionSummary,
  sourceCatalogReport,
  todayReport,
} from "./report/report";
import {
  extractSnippets,
  type CodeSnippet,
} from "./content/snippets";
import {
  archivePersonalVocabularyEntry,
  createPersonalVocabularyEntry,
  importPersonalVocabularyEntries,
  upsertPersonalVocabularyEntry,
  type PersonalVocabularyKind,
  type PersonalVocabularyPriority,
  collectionTagCounts,
  upsertCorpusCollection,
} from "./training/vocabulary";
import {
  runOpenTuiAppSession,
  type OpenTuiAppSessionContext,
  type OpenTuiAppSessionResult,
} from "./ui/opentui/appSession";
import {
  openTuiCodeConfig,
  type OpenTuiAppState,
  type OpenTuiReturnRoute,
  type OpenTuiRoute,
} from "./ui/opentui/appModel";
import type { OpenTuiRenderer } from "./ui/opentui/renderer";

export type ParsedCommand =
  | ParsedStartCommand
  | { kind: "vocab"; action: ParsedVocabAction }
  | { kind: "corpus"; action: ParsedCorpusAction }
  | { kind: "sentence"; action: ParsedSentenceAction }
  | { kind: "article"; action: ParsedArticleAction }
  | { kind: "report"; scope: "today" }
  | { kind: "help" }
  | { kind: "plan" }
  | { kind: "import"; path: string }
  | { kind: "sources" };

export interface ParsedCli {
  language: Language;
  command: ParsedCommand | null;
}

export interface ParsedStartCommand {
  kind: "start";
  mode: Mode;
  repo?: string;
  code_language?: string;
  code_framework?: string;
  code_project?: string;
}

export type ParsedCorpusAction =
  | { kind: "new"; slug: string; name?: string; description?: string }
  | { kind: "list" }
  | { kind: "import"; slug: string; path: string }
  | { kind: "archive"; slug: string }
  | { kind: "restore"; slug: string };

export type ParsedSentenceAction =
  | { kind: "add"; text: string; zh?: string; note?: string; collection?: string }
  | { kind: "list" };

export type ParsedArticleAction =
  | { kind: "import"; path: string; title?: string; collection?: string }
  | { kind: "list" };

export type ParsedVocabAction =
  | ParsedVocabAddAction
  | { kind: "list" }
  | { kind: "remove"; id: string }
  | { kind: "import"; path: string };

export interface ParsedVocabAddAction {
  kind: "add";
  text: string;
  entry_kind?: PersonalVocabularyKind;
  parts?: string[];
  aliases?: string[];
  tags?: string[];
  priority?: PersonalVocabularyPriority;
  meaning_zh?: string;
}

export interface RunCliOptions {
  env?: Record<string, string | undefined>;
  homeDir?: string;
  now?: Date;
  idFactory?: () => string;
  runner?: StartRunner;
  appRunner?: AppRunner;
}

export interface RunCliResult {
  stdout: string;
  renderer?: OpenTuiRenderer;
  state?: OpenTuiAppState;
  persistedRecords?: SessionRecord[];
}

export interface StartRunnerContext {
  dailyPlan: DailyPracticePlan;
  records: SessionRecord[];
  language: Language;
  dataDir: string;
  codeConfig: CodePracticeConfig;
  targetContext?: BuildTargetContext;
  sourceItem?: OpenTuiRunningRoute["source_item"];
  initialRenderer?: OpenTuiRenderer;
  returnState?: OpenTuiAppState;
  speedUnit?: SpeedUnit;
  todayElapsedMs?: number;
  now?: Date;
  saveCheckpoint?: (lesson: PracticeLesson, target: PracticeTarget) => Promise<void>;
  saveRecord?: (record: SessionRecord) => Promise<void>;
  captureVocabulary?: (words: string[]) => Promise<number>;
}

export interface StartRunnerResult {
  completedRecords: SessionRecord[];
  lastSavedTo?: string | null;
  renderer?: OpenTuiRenderer;
  state?: OpenTuiAppState;
}

export type StartRunner = (context: StartRunnerContext) => Promise<StartRunnerResult>;

export interface AppRunnerContext extends OpenTuiAppSessionContext {
  dataDir: string;
  codeConfig: CodePracticeConfig;
}

export type AppRunner = (
  context: AppRunnerContext,
) => Promise<OpenTuiAppSessionResult>;

type OpenTuiRunningRoute = Extract<OpenTuiRoute, { screen: "running" }>;

const modes = ["chars", "numbers", "case", "words", "symbols", "code", "mixed"] as const;

export function parseCliArgs(args: string[]): ParsedCli {
  const remaining = [...args];
  let language: Language = "zh";

  for (let index = 0; index < remaining.length; ) {
    const option = splitOptionToken(remaining[index]);
    if (option.name !== "--language") {
      index += 1;
      continue;
    }
    const value =
      option.value === undefined ? remaining[index + 1] : option.value;
    if (value !== "zh" && value !== "en") {
      throw new Error("--language must be zh or en");
    }
    language = value;
    remaining.splice(index, option.value === undefined ? 2 : 1);
  }

  const commandName = remaining.shift();
  if (commandName === undefined) {
    return { language, command: null };
  }

  switch (commandName) {
    case "--help":
    case "-h":
    case "help":
      ensureNoExtraArgs("help", remaining);
      return { language, command: { kind: "help" } };
    case "start":
      return { language, command: parseStartCommand(remaining) };
    case "report":
      return { language, command: parseReportCommand(remaining) };
    case "plan":
      ensureNoExtraArgs("plan", remaining);
      return { language, command: { kind: "plan" } };
    case "import": {
      const path = remaining.shift();
      if (path === undefined) {
        throw new Error("import requires a path");
      }
      ensureNoExtraArgs("import", remaining);
      return { language, command: { kind: "import", path } };
    }
    case "sources":
      ensureNoExtraArgs("sources", remaining);
      return { language, command: { kind: "sources" } };
    case "vocab":
      return { language, command: parseVocabCommand(remaining) };
    case "corpus":
      return { language, command: parseCorpusCommand(remaining) };
    case "sentence":
      return { language, command: parseSentenceCommand(remaining) };
    case "article":
      return { language, command: parseArticleCommand(remaining) };
    default:
      throw new Error(`Unknown command: ${commandName}`);
  }
}

export async function runCli(
  args: string[],
  options: RunCliOptions = {},
): Promise<RunCliResult> {
  const parsed = parseCliArgs(args);
  const dataDirOptions: Parameters<typeof keyloopDataDir>[0] = {};
  if (options.env !== undefined) {
    dataDirOptions.env = options.env;
  }
  if (options.homeDir !== undefined) {
    dataDirOptions.homeDir = options.homeDir;
  }
  const dataDir = keyloopDataDir(dataDirOptions);
  if (parsed.command === null) {
    return runApp(dataDir, options);
  }

  const command = parsed.command;

  switch (command.kind) {
    case "help":
      return { stdout: helpText(parsed.language) };
    case "start":
      return runStart(command, dataDir, options);
    case "report":
      return runReport(command.scope, dataDir, parsed.language, options.now);
    case "plan":
      return runPlan(dataDir, parsed.language, options.now);
    case "import": {
      const snippets = await extractSnippets(command.path);
      return { stdout: importPreview(command.path, snippets, parsed.language) };
    }
    case "sources": {
      const sources = await sourceCatalog(contentLibraryOptions(options));
      return { stdout: sourceCatalogReport(sources, parsed.language) };
    }
    case "vocab":
      return runVocab(command.action, dataDir, parsed.language, options);
    case "corpus":
      return runCorpus(command.action, dataDir, parsed.language, options);
    case "sentence":
      return runSentence(command.action, dataDir, parsed.language, options);
    case "article":
      return runArticle(command.action, dataDir, parsed.language, options);
  }
}

function helpText(language: Language): string {
  if (language === "en") {
    return [
      "KeyLoop: terminal typing practice for programmers",
      "",
      "Usage:",
      "  keyloop [--language zh|en]",
      "  keyloop start [--repo PATH] [--code-language NAME] [--code-framework NAME] [--code-project NAME]",
      "  keyloop plan",
      "  keyloop report [today]",
      "  keyloop import PATH",
      "  keyloop sources",
      "  keyloop vocab add TEXT [--parts a,b] [--alias VALUE] [--tag VALUE] [--priority 1|2|3]",
      "  keyloop vocab list",
      "  keyloop vocab remove ID",
      "  keyloop vocab import PATH",
      "",
      "Commands:",
      "  start    Start a realtime typing session",
      "  plan     Generate the next adaptive practice plan",
      "  report   Show practice reports",
      "  import   Preview code snippets extracted from a repository",
      "  sources  List built-in corpus sources",
      "  vocab    Manage personal vocabulary entries",
      "",
    ].join("\n");
  }

  return [
    "KeyLoop：程序员终端打字训练",
    "",
    "用法:",
    "  keyloop [--language zh|en]",
    "  keyloop start [--repo 路径] [--code-language 名称] [--code-framework 名称] [--code-project 名称]",
    "  keyloop plan",
    "  keyloop report [today]",
    "  keyloop import 路径",
    "  keyloop sources",
    "  keyloop vocab add 文本 [--parts a,b] [--alias 值] [--tag 值] [--priority 1|2|3]",
    "  keyloop vocab list",
    "  keyloop vocab remove ID",
    "  keyloop vocab import 路径",
    "",
    "命令:",
    "  start    开始实时打字练习",
    "  plan     生成下一轮自适应计划",
    "  report   查看练习报告",
    "  import   预览从仓库提取的代码片段",
    "  sources  查看内置语料来源",
    "  vocab    管理个人词库",
    "",
  ].join("\n");
}

async function runApp(
  dataDir: string,
  options: RunCliOptions,
): Promise<RunCliResult> {
  let records = await loadSessionsFromPath(sessionLogPath(dataDir));
  const preferences = await loadPreferencesFromPath(preferencesPath(dataDir));
  const library = await loadContentLibrary(contentLibraryOptions(options));
  const language = preferences.interface_language;
  const keyAggregates = await loadKeyAggregatesFromPath(keyStatsPath(dataDir));
  const vocabularyStore = await loadVocabularyStoreFromPath(vocabularyPath(dataDir));
  const librariesDir = customLibrariesDirPath(dataDir);
  const customLibraries = await loadCustomLibrariesFromDir(librariesDir);
  const fullDictionaryPath = join(dataDir, "dict", "ecdict.db");
  const contentRoot = await resolveContentRoot();
  const dictionary = await Dictionary.open({
    miniPath: join(contentRoot, "dictionary_mini.json"),
    fullDbPath: fullDictionaryPath,
  });
  if (dictionary.tier !== "full") {
    void ensureFullDictionary({ dbPath: fullDictionaryPath }); // 后台静默下载，失败下次启动重试
  }
  let initialState: OpenTuiAppState | undefined;
  let initialRenderer: OpenTuiRenderer | undefined;

  for (;;) {
    const context: AppRunnerContext = {
      language,
      records,
      plan: buildPlan(records, language, options.now),
      library,
      codeConfig: codeConfigFromPreferences(preferences),
      codeFilterOptions: codePracticeOptionsForLibrary(library),
      selectedCodeFilters: preferences.global_code_filters,
      pinnedCodeFilters: preferences.pinned_code_filters,
      codeSettings: preferences.code_practice,
      codeStyleSettings: preferences.code_style,
      codeStyle: preferences.code_style,
      everydaySettings: preferences.everyday_english,
      wordBreakdownSettings: preferences.word_breakdown,
      personalVocabularySettings: preferences.personal_vocabulary,
      speedUnit: preferences.speed_unit,
      todayElapsedMs: todayElapsedMsFromRecords(records, options.now ?? new Date()),
      dataDir,
    };

    if (keyAggregates.length > 0) {
      context.keyAggregates = keyAggregates;
    }
    if (options.now !== undefined) {
      context.now = options.now;
    }
    context.personalVocabulary = vocabularyStore.entries;
    context.customCollections = (
      await loadCollectionsStoreFromPath(collectionsPath(dataDir))
    ).collections;
    context.personalSentences = (
      await loadPersonalSentencesStoreFromPath(personalSentencesPath(dataDir))
    ).entries;
    context.personalArticles = (
      await loadPersonalArticlesStoreFromPath(personalArticlesPath(dataDir))
    ).entries;
    context.personalVocabularyLimit =
      preferences.personal_vocabulary.daily_review_limit;
    context.customLibraries = customLibraries;
    context.dictionary = dictionary;
    context.librariesDir = librariesDir;

    const appResult =
      options.appRunner === undefined
        ? await runOpenTuiAppSession(context, {
            ...(initialState === undefined ? {} : { initialState }),
            ...(initialRenderer === undefined ? {} : { initialRenderer }),
          })
        : await options.appRunner(context);
    initialState = undefined;
    initialRenderer = undefined;

    const nextPreferences = preferencesFromAppState(preferences, appResult.state, language);
    if (nextPreferences !== undefined) {
      await savePreferencesToPath(nextPreferences, preferencesPath(dataDir));
    }
    if (appResult.action !== "start") {
      return { stdout: "" };
    }

    const startContext = await startContextFromAppState(
      appResult.state,
      context,
      dataDir,
      options,
    );
    if (startContext === undefined) {
      appResult.renderer?.destroy?.();
      return { stdout: "" };
    }
    const contextWithRenderer =
      appResult.renderer === undefined
        ? startContext
        : { ...startContext, initialRenderer: appResult.renderer };
    const startResult = await runStartRunner(contextWithRenderer, dataDir, options);
    records = [...records, ...(startResult.persistedRecords ?? [])];
    if (
      options.appRunner === undefined &&
      startResult.renderer !== undefined &&
      startResult.state !== undefined
    ) {
      initialRenderer = startResult.renderer;
      initialState = startResult.state;
      continue;
    }
    return { stdout: startResult.stdout };
  }
}

export function codeConfigFromPreferences(
  preferences: UserPreferences,
): CodePracticeConfig {
  const config = defaultCodePracticeConfig({
    match_any: true,
    difficulty: preferences.code_practice.difficulty,
  });
  if (preferences.code_practice.length !== "adaptive") {
    config.size = preferences.code_practice.length;
  }
  for (const filter of preferences.global_code_filters) {
    switch (filter.facet) {
      case "language":
        config.languages.push(filter.value);
        break;
      case "framework":
        config.frameworks.push(filter.value);
        break;
      case "project":
        config.projects.push(filter.value);
        break;
    }
  }
  return config;
}

function codeConfigWithPreferences(
  cliCodeConfig: CodePracticeConfig,
  preferences: UserPreferences,
): CodePracticeConfig {
  const config: CodePracticeConfig = {
    ...cliCodeConfig,
    difficulty: preferences.code_practice.difficulty,
  };
  if (preferences.code_practice.length !== "adaptive") {
    config.size = preferences.code_practice.length;
  }
  return config;
}

function contentLibraryOptions(options: RunCliOptions): {
  userEverydayCorpusPath?: string;
} {
  const path = options.env?.KEYLOOP_EVERYDAY_CORPUS?.trim();
  return path === undefined || path.length === 0
    ? {}
    : { userEverydayCorpusPath: path };
}

function preferencesFromAppState(
  preferences: UserPreferences,
  state: OpenTuiAppSessionResult["state"],
  initialLanguage: Language,
): UserPreferences | undefined {
  let changed = false;
  const next: UserPreferences = {
    ...preferences,
    pinned_code_filters: preferences.pinned_code_filters.map(cloneCodeFilterPreference),
    global_code_filters: preferences.global_code_filters.map(cloneCodeFilterPreference),
    code_practice: { ...preferences.code_practice },
    code_style: { ...preferences.code_style },
    everyday_english: { ...preferences.everyday_english },
    word_breakdown: { ...preferences.word_breakdown },
    personal_vocabulary: { ...preferences.personal_vocabulary },
  };

  if (state.language !== initialLanguage) {
    next.interface_language = state.language;
    changed = true;
  }

  if (state.speed_unit !== undefined && state.speed_unit !== preferences.speed_unit) {
    next.speed_unit = state.speed_unit;
    changed = true;
  }

  if (state.codeFilters !== undefined) {
    const globalFilters = state.codeFilters.selected.map(cloneCodeFilterPreference);
    const pinnedFilters = state.codeFilters.pinned.map(cloneCodeFilterPreference);
    if (!codeFilterPreferencesEqual(globalFilters, preferences.global_code_filters)) {
      next.global_code_filters = globalFilters;
      changed = true;
    }
    if (!codeFilterPreferencesEqual(pinnedFilters, preferences.pinned_code_filters)) {
      next.pinned_code_filters = pinnedFilters;
      changed = true;
    }
  }

  if (
    state.codeSettings !== undefined &&
    (state.codeSettings.difficulty !== preferences.code_practice.difficulty ||
      state.codeSettings.length !== preferences.code_practice.length)
  ) {
    next.code_practice = { ...state.codeSettings };
    changed = true;
  }

  if (
    state.codeStyleSettings !== undefined &&
    !codeStyleSettingsEqual(state.codeStyleSettings, preferences.code_style)
  ) {
    next.code_style = { ...state.codeStyleSettings };
    changed = true;
  }

  if (
    state.everydaySettings !== undefined &&
    !everydaySettingsEqual(state.everydaySettings, preferences.everyday_english)
  ) {
    next.everyday_english = { ...state.everydaySettings };
    changed = true;
  }

  if (state.wordFormSettings !== undefined) {
    if (
      !wordBreakdownSettingsEqual(
        state.wordFormSettings.word_breakdown,
        preferences.word_breakdown,
      )
    ) {
      next.word_breakdown = { ...state.wordFormSettings.word_breakdown };
      changed = true;
    }
    if (
      !personalVocabularySettingsEqual(
        state.wordFormSettings.personal_vocabulary,
        preferences.personal_vocabulary,
      )
    ) {
      next.personal_vocabulary = { ...state.wordFormSettings.personal_vocabulary };
      changed = true;
    }
  }

  return changed ? next : undefined;
}

function cloneCodeFilterPreference(
  preference: UserPreferences["global_code_filters"][number],
): UserPreferences["global_code_filters"][number] {
  return { facet: preference.facet, value: preference.value };
}

function codeFilterPreferencesEqual(
  left: UserPreferences["global_code_filters"],
  right: UserPreferences["global_code_filters"],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (preference, index) =>
        preference.facet === right[index]?.facet &&
        preference.value === right[index]?.value,
    )
  );
}

function everydaySettingsEqual(
  left: UserPreferences["everyday_english"],
  right: UserPreferences["everyday_english"],
): boolean {
  return (
    left.word_range === right.word_range &&
    left.word_count === right.word_count &&
    left.sentence_level === right.sentence_level &&
    left.sentence_length === right.sentence_length &&
    left.sentence_count === right.sentence_count &&
    left.article_level === right.article_level &&
    left.article_length === right.article_length &&
    left.decomposition_level === right.decomposition_level &&
    left.decomposition_word_count === right.decomposition_word_count &&
    left.decomposition_part_repeats === right.decomposition_part_repeats &&
    left.decomposition_word_repeats === right.decomposition_word_repeats &&
    left.include_phrases === right.include_phrases
  );
}

function codeStyleSettingsEqual(
  left: UserPreferences["code_style"],
  right: UserPreferences["code_style"],
): boolean {
  return (
    left.formatter === right.formatter &&
    left.indent_style === right.indent_style &&
    left.indent_width === right.indent_width &&
    left.semicolons === right.semicolons &&
    left.quotes === right.quotes &&
    left.trailing_commas === right.trailing_commas
  );
}

function wordBreakdownSettingsEqual(
  left: UserPreferences["word_breakdown"],
  right: UserPreferences["word_breakdown"],
): boolean {
  return (
    left.enabled_in_comprehensive === right.enabled_in_comprehensive &&
    left.max_items_per_group === right.max_items_per_group
  );
}

function personalVocabularySettingsEqual(
  left: UserPreferences["personal_vocabulary"],
  right: UserPreferences["personal_vocabulary"],
): boolean {
  return (
    left.enabled_in_comprehensive === right.enabled_in_comprehensive &&
    left.daily_review_limit === right.daily_review_limit
  );
}

function parseStartCommand(args: string[]): ParsedStartCommand {
  let mode: Mode = "chars";
  const first = args[0];
  if (first !== undefined && !first.startsWith("-")) {
    if (!isMode(first)) {
      throw new Error(`Unknown start mode: ${first}`);
    }
    mode = first;
    args.shift();
  }

  const command: ParsedStartCommand = { kind: "start", mode };
  while (args.length > 0) {
    const option = splitOptionToken(args.shift());
    switch (option.name) {
      case "--repo":
      case "-r":
        command.repo = optionValue(option, args);
        break;
      case "--code-language":
        command.code_language = optionValue(option, args);
        break;
      case "--code-framework":
        command.code_framework = optionValue(option, args);
        break;
      case "--code-project":
        command.code_project = optionValue(option, args);
        break;
      default:
        throw new Error(`Unknown start option: ${option.name}`);
    }
  }
  return command;
}

function parseReportCommand(args: string[]): ParsedCommand {
  const scope = args.shift() ?? "today";
  if (scope !== "today") {
    throw new Error(`Unknown report scope: ${scope}`);
  }
  ensureNoExtraArgs("report", args);
  return { kind: "report", scope };
}

function parseSentenceCommand(args: string[]): ParsedCommand {
  const actionName = args.shift();
  switch (actionName) {
    case "add": {
      const text = args.shift();
      if (text === undefined || text.trim() === "") {
        throw new Error("sentence add requires text");
      }
      const action: ParsedSentenceAction = { kind: "add", text };
      while (args.length > 0) {
        const option = splitOptionToken(args.shift());
        switch (option.name) {
          case "--zh":
            action.zh = optionValue(option, args);
            break;
          case "--note":
            action.note = optionValue(option, args);
            break;
          case "--collection":
            action.collection = optionValue(option, args);
            break;
          default:
            throw new Error(`Unknown sentence add option: ${option.name}`);
        }
      }
      return { kind: "sentence", action };
    }
    case "list":
      ensureNoExtraArgs("sentence list", args);
      return { kind: "sentence", action: { kind: "list" } };
    default:
      throw new Error("sentence supports: add, list");
  }
}

function parseArticleCommand(args: string[]): ParsedCommand {
  const actionName = args.shift();
  switch (actionName) {
    case "import": {
      const path = args.shift();
      if (path === undefined) {
        throw new Error("article import requires a file path");
      }
      const action: ParsedArticleAction = { kind: "import", path };
      while (args.length > 0) {
        const option = splitOptionToken(args.shift());
        switch (option.name) {
          case "--title":
            action.title = optionValue(option, args);
            break;
          case "--collection":
            action.collection = optionValue(option, args);
            break;
          default:
            throw new Error(`Unknown article import option: ${option.name}`);
        }
      }
      return { kind: "article", action };
    }
    case "list":
      ensureNoExtraArgs("article list", args);
      return { kind: "article", action: { kind: "list" } };
    default:
      throw new Error("article supports: import, list");
  }
}

function parseCorpusCommand(args: string[]): ParsedCommand {
  const actionName = args.shift();
  switch (actionName) {
    case "new": {
      const slug = requireCorpusSlug(args.shift());
      const action: ParsedCorpusAction = { kind: "new", slug };
      while (args.length > 0) {
        const option = splitOptionToken(args.shift());
        switch (option.name) {
          case "--name":
            action.name = optionValue(option, args);
            break;
          case "--desc":
          case "--description":
            action.description = optionValue(option, args);
            break;
          default:
            throw new Error(`Unknown corpus new option: ${option.name}`);
        }
      }
      return { kind: "corpus", action };
    }
    case "list":
      ensureNoExtraArgs("corpus list", args);
      return { kind: "corpus", action: { kind: "list" } };
    case "import": {
      const slug = requireCorpusSlug(args.shift());
      const path = args.shift();
      if (path === undefined) {
        throw new Error("corpus import requires a file path");
      }
      ensureNoExtraArgs("corpus import", args);
      return { kind: "corpus", action: { kind: "import", slug, path } };
    }
    case "archive": {
      const slug = requireCorpusSlug(args.shift());
      ensureNoExtraArgs("corpus archive", args);
      return { kind: "corpus", action: { kind: "archive", slug } };
    }
    case "restore": {
      const slug = requireCorpusSlug(args.shift());
      ensureNoExtraArgs("corpus restore", args);
      return { kind: "corpus", action: { kind: "restore", slug } };
    }
    default:
      throw new Error("corpus supports: new, list, import, archive, restore");
  }
}

function requireCorpusSlug(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error("corpus command requires a collection slug");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new Error("collection slug must be lowercase letters, digits, and dashes");
  }
  return value;
}

function parseVocabCommand(args: string[]): ParsedCommand {
  const actionName = args.shift();
  switch (actionName) {
    case "add":
      return { kind: "vocab", action: parseVocabAddAction(args) };
    case "list":
      ensureNoExtraArgs("vocab list", args);
      return { kind: "vocab", action: { kind: "list" } };
    case "remove": {
      const id = args.shift();
      if (id === undefined) {
        throw new Error("vocab remove requires an id");
      }
      ensureNoExtraArgs("vocab remove", args);
      return { kind: "vocab", action: { kind: "remove", id } };
    }
    case "import": {
      const path = args.shift();
      if (path === undefined) {
        throw new Error("vocab import requires a path");
      }
      ensureNoExtraArgs("vocab import", args);
      return { kind: "vocab", action: { kind: "import", path } };
    }
    default:
      throw new Error(`Unknown vocab action: ${actionName ?? ""}`);
  }
}

function parseVocabAddAction(args: string[]): ParsedVocabAddAction {
  const text = args.shift();
  if (text === undefined) {
    throw new Error("vocab add requires text");
  }

  const action: ParsedVocabAddAction = { kind: "add", text };
  while (args.length > 0) {
    const option = splitOptionToken(args.shift());
    switch (option.name) {
      case "--kind":
        action.entry_kind = parsePersonalVocabularyKind(optionValue(option, args));
        break;
      case "--parts":
        action.parts = [
          ...(action.parts ?? []),
          ...commaSeparated(optionValue(option, args)),
        ];
        break;
      case "--alias":
        action.aliases = [
          ...(action.aliases ?? []),
          optionValue(option, args),
        ];
        break;
      case "--tag":
        action.tags = [...(action.tags ?? []), optionValue(option, args)];
        break;
      case "--priority":
        action.priority = parsePersonalVocabularyPriority(optionValue(option, args));
        break;
      case "--meaning-zh":
        action.meaning_zh = optionValue(option, args);
        break;
      default:
        throw new Error(`Unknown vocab add option: ${option.name}`);
    }
  }
  return action;
}

async function runStart(
  command: ParsedStartCommand,
  dataDir: string,
  options: RunCliOptions,
): Promise<RunCliResult> {
  const records = await loadSessionsFromPath(sessionLogPath(dataDir));
  const preferences = await loadPreferencesFromPath(preferencesPath(dataDir));
  const language = preferences.interface_language;
  const cliCodeConfig = codeConfigFromStartCommand(command);
  const preferenceCodeConfig = codeConfigFromPreferences(preferences);
  const codeConfig: CodePracticeConfig = isCodeConfigEmpty(cliCodeConfig)
    ? preferenceCodeConfig
    : codeConfigWithPreferences(cliCodeConfig, preferences);
  const library = await loadContentLibrary(contentLibraryOptions(options));
  const plan = buildPlan(records, language, options.now);
  let localCodeSnippets: CodeSnippet[] = [];
  let localCodeScanError: string | undefined;
  if (command.repo !== undefined) {
    try {
      localCodeSnippets = await extractSnippets(command.repo);
    } catch (error) {
      localCodeScanError = errorMessage(error);
    }
  }
  const targetContext: Parameters<typeof buildDailyPracticePlan>[0] = {
    records,
    plan,
    library,
    codeConfig,
    codeStyle: preferences.code_style,
    everydaySettings: preferences.everyday_english,
    wordBreakdownSettings: preferences.word_breakdown,
    localCodeSnippets,
    ...(command.repo === undefined ? {} : { localCodeSource: command.repo }),
    ...(localCodeScanError === undefined ? {} : { localCodeScanError }),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
  if (preferences.personal_vocabulary.enabled_in_comprehensive) {
    const vocabularyStore = await loadVocabularyStoreFromPath(vocabularyPath(dataDir));
    targetContext.personalVocabulary = vocabularyStore.entries;
    targetContext.personalVocabularyLimit =
      preferences.personal_vocabulary.daily_review_limit;
  }
  const freshDailyPlan = buildDailyPracticePlan(targetContext);
  const dailyPlan = await loadDailyPracticePlan(dataDir, records, freshDailyPlan, options);
  return runStartRunner(
    {
      dailyPlan,
      records,
      language,
      dataDir,
      codeConfig,
      speedUnit: preferences.speed_unit,
      targetContext,
      ...(options.now === undefined ? {} : { now: options.now }),
    },
    dataDir,
    options,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runStartRunner(
  context: StartRunnerContext,
  dataDir: string,
  options: RunCliOptions,
): Promise<RunCliResult> {
  const { dailyPlan, records, language, codeConfig } = context;
  await saveStartCheckpoint(context, dataDir);
  const persistedRecords: SessionRecord[] = [];
  const persistedRecordIds = new Set<string>();
  let lastSavedTo: string | null = null;
  const saveRecord = async (record: SessionRecord): Promise<void> => {
    if (persistedRecordIds.has(record.id)) {
      return;
    }
    lastSavedTo = await saveSessionRecord(record, dataDir);
    persistedRecordIds.add(record.id);
    persistedRecords.push(record);
  };
  const result = await (options.runner ?? defaultRunner)({
    dailyPlan,
    records,
    language,
    dataDir,
    codeConfig,
    ...(context.speedUnit === undefined ? {} : { speedUnit: context.speedUnit }),
    ...(context.targetContext === undefined
      ? {}
      : { targetContext: context.targetContext }),
    ...(context.sourceItem === undefined ? {} : { sourceItem: context.sourceItem }),
    ...(context.initialRenderer === undefined
      ? {}
      : { initialRenderer: context.initialRenderer }),
    ...(context.returnState === undefined ? {} : { returnState: context.returnState }),
    ...(context.todayElapsedMs === undefined
      ? {}
      : { todayElapsedMs: context.todayElapsedMs }),
    ...(context.now === undefined ? {} : { now: context.now }),
    saveCheckpoint: async (lesson, target) => {
      await saveLessonCheckpoint(context, dataDir, lesson, target);
    },
    saveRecord,
    captureVocabulary: async (words) => {
      const vocabPath = vocabularyPath(dataDir);
      let store = await loadVocabularyStoreFromPath(vocabPath);
      const existing = new Set(
        store.entries.filter((e) => !e.archived).map((e) => e.text.toLowerCase()),
      );
      let added = 0;
      for (const word of words) {
        if (existing.has(word.toLowerCase())) {
          continue;
        }
        existing.add(word.toLowerCase());
        const entry = createPersonalVocabularyEntry(
          { text: word, tags: ["mistakes"] },
          vocabularyCreateOptions(options),
        );
        store = upsertPersonalVocabularyEntry(store, entry, entry.updated_at);
        added += 1;
      }
      if (added > 0) {
        await saveVocabularyStoreToPath(store, vocabPath);
      }
      return added;
    },
  });

  for (const record of result.completedRecords) {
    await saveRecord(record);
  }

  if (result.renderer !== undefined && result.state !== undefined) {
    return {
      stdout: "",
      renderer: result.renderer,
      state: result.state,
      persistedRecords,
    };
  }

  if (persistedRecords.length === 0) {
    return {
      stdout:
        language === "zh"
          ? "没有完成的练习记录，未保存。\n"
          : "No completed sessions were saved.\n",
      persistedRecords,
    };
  }

  const lastRecord = persistedRecords[persistedRecords.length - 1];
  if (lastRecord === undefined) {
    return {
      stdout:
        language === "zh"
          ? "没有完成的练习记录，未保存。\n"
          : "No completed sessions were saved.\n",
      persistedRecords,
    };
  }
  const savedTo = lastSavedTo ?? result.lastSavedTo ?? sessionLogPath(dataDir);
  const lines = [sessionSummary(lastRecord, savedTo, language, { speedUnit: context.speedUnit ?? "wpm" })];
  if (persistedRecords.length > 1) {
    lines.push(
      language === "zh"
        ? `已保存 ${persistedRecords.length} 次练习。`
        : `Saved ${persistedRecords.length} sessions.`,
    );
  }
  return {
    stdout: `${lines.join("\n\n")}\n`,
    persistedRecords,
  };
}

async function startContextFromAppState(
  state: OpenTuiAppSessionResult["state"],
  appContext: AppRunnerContext,
  dataDir: string,
  options: RunCliOptions,
): Promise<StartRunnerContext | undefined> {
  if (state.route.screen !== "running") {
    return undefined;
  }

  const codeConfig = openTuiCodeConfig(state) ?? appContext.codeConfig;
  const effectiveAppContext: AppRunnerContext = {
    ...appContext,
    codeConfig,
  };
  if (state.everydaySettings !== undefined) {
    effectiveAppContext.everydaySettings = state.everydaySettings;
  }
  if (state.wordFormSettings !== undefined) {
    effectiveAppContext.wordBreakdownSettings = state.wordFormSettings.word_breakdown;
    effectiveAppContext.personalVocabularySettings =
      state.wordFormSettings.personal_vocabulary;
    if (state.wordFormSettings.personal_vocabulary.enabled_in_comprehensive) {
      effectiveAppContext.personalVocabularyLimit =
        state.wordFormSettings.personal_vocabulary.daily_review_limit;
    } else {
      effectiveAppContext.personalVocabulary = [];
      effectiveAppContext.personalVocabularyLimit = 0;
    }
  }
  const dailyPlan =
    state.route.source_item === "comprehensive"
      ? await loadDailyPracticePlan(
          dataDir,
          effectiveAppContext.records,
          buildDailyPracticePlan(effectiveAppContext),
          options,
        )
      : standaloneDailyPlanFromRoute(state.route);

  return {
    dailyPlan,
    records: effectiveAppContext.records,
    language: state.language,
    dataDir,
    codeConfig,
    targetContext: effectiveAppContext,
    sourceItem: state.route.source_item,
    returnState: returnStateFromRunningState(state),
    speedUnit: state.speed_unit ?? appContext.speedUnit ?? "wpm",
    ...(effectiveAppContext.todayElapsedMs === undefined
      ? {}
      : { todayElapsedMs: effectiveAppContext.todayElapsedMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
}

function todayElapsedMsFromRecords(records: SessionRecord[], now: Date): number {
  const today = localDateKey(now);
  return records
    .filter((record) => localDateKey(new Date(record.started_at)) === today)
    .reduce((sum, record) => sum + record.duration_ms, 0);
}

function returnStateFromRunningState(state: OpenTuiAppState): OpenTuiAppState {
  const route: OpenTuiReturnRoute =
    state.route.screen === "running" && state.route.return_route !== undefined
      ? state.route.return_route
      : { screen: "main_menu", selected_index: 0 };
  return {
    language: state.language,
    route,
    ...(state.codeFilters === undefined ? {} : { codeFilters: state.codeFilters }),
    ...(state.codeSettings === undefined ? {} : { codeSettings: state.codeSettings }),
    ...(state.codeStyleSettings === undefined ? {} : { codeStyleSettings: state.codeStyleSettings }),
    ...(state.everydaySettings === undefined ? {} : { everydaySettings: state.everydaySettings }),
    ...(state.wordFormSettings === undefined ? {} : { wordFormSettings: state.wordFormSettings }),
    ...(state.speed_unit === undefined ? {} : { speed_unit: state.speed_unit }),
    ...(state.today_elapsed_ms === undefined ? {} : { today_elapsed_ms: state.today_elapsed_ms }),
  };
}

async function loadDailyPracticePlan(
  dataDir: string,
  records: SessionRecord[],
  freshPlan: DailyPracticePlan,
  options: RunCliOptions,
): Promise<DailyPracticePlan> {
  const now = options.now ?? new Date();
  const dailyPlanOptions: Parameters<typeof loadOrCreateDailyPracticePlanFromPath>[0] = {
    path: dailyRunsPath(dataDir),
    today: localDateKey(now),
    freshPlan,
    records,
    now: now.toISOString(),
  };
  if (options.idFactory !== undefined) {
    dailyPlanOptions.idFactory = options.idFactory;
  }
  return loadOrCreateDailyPracticePlanFromPath(dailyPlanOptions);
}

function standaloneDailyPlanFromRoute(route: OpenTuiRunningRoute): DailyPracticePlan {
  const lesson = standaloneLessonFromRoute(route);
  return {
    run_id: "",
    run_number: 0,
    target_minutes: lesson.estimated_minutes,
    completed_ms: 0,
    lessons: [lesson],
  };
}

function standaloneLessonFromRoute(route: OpenTuiRunningRoute): PracticeLesson {
  const metadata = standaloneLessonMetadata(route.source_item);
  return {
    id: route.lesson?.id ?? `standalone:${route.source_item}`,
    kind: route.lesson?.kind ?? metadata.kind,
    module: route.lesson?.module ?? metadata.module,
    category: route.lesson?.category ?? metadata.category,
    mix_profile: "standalone",
    estimated_minutes: route.lesson?.estimated_minutes ?? 4,
    target: route.target,
    reason_zh: route.lesson?.reason_zh ?? "",
    reason_en: route.lesson?.reason_en ?? "",
  };
}

function standaloneLessonMetadata(
  sourceItem: OpenTuiRunningRoute["source_item"],
): Pick<PracticeLesson, "kind" | "module" | "category"> {
  if (sourceItem.startsWith("custom_tag_")) {
    return {
      kind: "words",
      module: "custom_corpus",
      category: "personal_vocabulary",
    };
  }
  switch (sourceItem) {
    case "foundation_home_row":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "home_row",
      };
    case "foundation_top_row":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "top_row",
      };
    case "foundation_bottom_row":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "bottom_row",
      };
    case "foundation_number_row":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "numbers_symbols",
      };
    case "foundation_symbols":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "punctuation_edges",
      };
    case "foundation_left_hand":
    case "foundation_right_hand":
    case "foundation_index_fingers":
    case "foundation_middle_fingers":
    case "foundation_ring_fingers":
    case "foundation_pinky_fingers":
    case "foundation_horizontal_rolls":
    case "foundation_vertical_ladders":
    case "foundation_diagonal_crossovers":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "finger_transitions",
      };
    case "foundation_letter_combinations":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "letter_combinations",
      };
    case "foundation_capitalization":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "basic_words",
      };
    case "foundation_mix":
      return {
        kind: "foundation",
        module: "foundation_input",
        category: "foundation_mix",
      };
    case "everyday_words":
      return {
        kind: "words",
        module: "everyday_english",
        category: "everyday_words",
      };
    case "everyday_phrases":
      return {
        kind: "words",
        module: "everyday_english",
        category: "everyday_phrases",
      };
    case "everyday_sentences":
      return {
        kind: "words",
        module: "everyday_english",
        category: "everyday_sentences",
      };
    case "everyday_articles":
      return {
        kind: "words",
        module: "everyday_english",
        category: "everyday_articles",
      };
    case "everyday_word_decomposition":
      return {
        kind: "words",
        module: "everyday_english",
        category: "everyday_word_decomposition",
      };
    case "everyday_mix":
      return {
        kind: "common_words",
        module: "everyday_english",
        category: "everyday_mix",
      };
    case "operators_brackets_quotes":
      return {
        kind: "symbols",
        module: "programming_basics",
        category: "operators_brackets_quotes",
      };
    case "programming_terms":
      return {
        kind: "words",
        module: "programming_basics",
        category: "programming_terms",
      };
    case "naming_styles":
      return {
        kind: "naming",
        module: "programming_basics",
        category: "naming_styles",
      };
    case "technical_long_words":
    case "long_word_breakdown":
      return {
        kind: "words",
        module: "programming_basics",
        category: "word_breakdown",
      };
    case "my_vocabulary":
      return {
        kind: "words",
        module: "programming_basics",
        category: "personal_vocabulary",
      };
    case "custom_my_words":
      return {
        kind: "words",
        module: "custom_corpus",
        category: "personal_vocabulary",
      };
    case "custom_my_sentences":
    case "custom_my_articles":
      return {
        kind: "words",
        module: "custom_corpus",
        category: "personal_vocabulary",
      };
    case "programming_basics_mix":
      return {
        kind: "symbols",
        module: "programming_basics",
        category: "programming_basics_mix",
      };
    case "code_blocks":
      return {
        kind: "code_block",
        module: "code_practice",
        category: "code_snippet",
      };
    case "code_functions":
      return {
        kind: "code_block",
        module: "code_practice",
        category: "code_function",
      };
    case "code_file_fragments":
      return {
        kind: "code_block",
        module: "code_practice",
        category: "code_file_fragment",
      };
    case "code_mix":
      return {
        kind: "code_block",
        module: "code_practice",
        category: "code_mix",
      };
    default:
      return {
        kind: "words",
        module: "unknown",
        category: "unknown",
      };
  }
}

async function saveStartCheckpoint(
  context: StartRunnerContext,
  dataDir: string,
): Promise<void> {
  const selection = firstUnfinishedLesson(context.dailyPlan, context.records);
  if (selection === undefined) {
    return;
  }
  const target = checkpointTargetForLesson(context, selection.lesson);
  await saveLessonCheckpoint(context, dataDir, selection.lesson, target);
}

async function saveLessonCheckpoint(
  context: StartRunnerContext,
  dataDir: string,
  lesson: PracticeLesson,
  target: PracticeTarget,
): Promise<void> {
  const keyAggregates = await loadKeyAggregatesFromPath(keyStatsPath(dataDir));
  await saveSessionCheckpointToPath(
    {
      target_id: lesson.id,
      target_hash: targetTextHash(target.text),
      input_len: 0,
      active_ms: 0,
      idle_ms: 0,
      key_sample_count: keySampleCount(keyAggregates),
      key_aggregates: keyAggregates.map((aggregate) => ({ ...aggregate })),
    },
    currentSessionPath(dataDir),
  );
}

async function saveSessionRecord(
  record: SessionRecord,
  dataDir: string,
): Promise<string> {
  const savedTo = await appendSessionToPath(record, sessionLogPath(dataDir));
  await updateKeyStatsFromCompletedRecords([record], dataDir);
  await clearSessionCheckpointAtPath(currentSessionPath(dataDir));
  return savedTo;
}

function checkpointTargetForLesson(
  context: StartRunnerContext,
  lesson: PracticeLesson,
): PracticeTarget {
  if (
    context.targetContext === undefined ||
    context.dailyPlan.run_id.length === 0 ||
    lesson.mix_profile !== "comprehensive"
  ) {
    return lesson.target;
  }

  try {
    return refreshModuleMixTarget(lesson, {
      ...context.targetContext,
      records: context.records,
      plan: buildPlan(context.records, context.language, context.now),
    });
  } catch {
    return lesson.target;
  }
}

function firstUnfinishedLesson(
  dailyPlan: DailyPracticePlan,
  records: SessionRecord[],
): { lesson: PracticeLesson; index: number } | undefined {
  const completedLessonIds = new Set(
    records
      .filter((record) => record.daily_run_id === dailyPlan.run_id)
      .filter((record) => record.completion_state === "completed")
      .map((record) => record.lesson_id),
  );
  const index = dailyPlan.lessons.findIndex(
    (lesson) => !completedLessonIds.has(lesson.id),
  );
  const lesson = dailyPlan.lessons[index];
  if (index < 0 || lesson === undefined) {
    return undefined;
  }
  return { lesson, index };
}

function targetTextHash(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function keySampleCount(aggregates: KeyAggregate[]): number {
  return aggregates.reduce((sum, aggregate) => sum + aggregate.sample_count, 0);
}

async function updateKeyStatsFromCompletedRecords(
  records: SessionRecord[],
  dataDir: string,
): Promise<void> {
  const aggregates = await loadKeyAggregatesFromPath(keyStatsPath(dataDir));
  for (const record of records) {
    observeRecordKeyEvents(aggregates, record);
  }
  await saveKeyAggregatesToPath(aggregates, keyStatsPath(dataDir));
}

function observeRecordKeyEvents(
  aggregates: KeyAggregate[],
  record: SessionRecord,
): void {
  let previousAtMs: number | undefined;
  for (const event of record.key_events) {
    const intervalMs =
      previousAtMs === undefined ? 0 : Math.max(event.at_ms - previousAtMs, 0);
    previousAtMs = event.at_ms;
    observeKeyEvent(aggregates, event, intervalMs);
  }
}

async function runReport(
  scope: "today",
  dataDir: string,
  language: Language,
  now: Date | undefined,
): Promise<RunCliResult> {
  switch (scope) {
    case "today": {
      const records = await loadSessionsFromPath(sessionLogPath(dataDir));
      const preferences = await loadPreferencesFromPath(preferencesPath(dataDir));
      const plan = buildPlan(records, language, now);
      const reportOptions = {
        ...(now === undefined ? {} : { now }),
        speedUnit: preferences.speed_unit,
      };
      return {
        stdout: todayReport(records, plan, language, reportOptions),
      };
    }
  }
}

async function runPlan(
  dataDir: string,
  language: Language,
  now: Date | undefined,
): Promise<RunCliResult> {
  const records = await loadSessionsFromPath(sessionLogPath(dataDir));
  const plan = buildPlan(records, language, now);
  return { stdout: planReport(plan, language) };
}

async function runSentence(
  action: ParsedSentenceAction,
  dataDir: string,
  language: Language,
  options: RunCliOptions,
): Promise<RunCliResult> {
  const path = personalSentencesPath(dataDir);
  switch (action.kind) {
    case "add": {
      const store = await loadPersonalSentencesStoreFromPath(path);
      const createOptions = vocabularyCreateOptions(options);
      const entry = createPersonalSentenceEntry(
        {
          text: action.text,
          ...(action.zh === undefined ? {} : { translation_zh: action.zh }),
          ...(action.note === undefined ? {} : { source_note: action.note }),
          ...(action.collection === undefined ? {} : { collection: action.collection }),
        },
        createOptions,
      );
      await savePersonalSentencesStoreToPath(
        { version: 1, entries: [...store.entries, entry] },
        path,
      );
      return {
        stdout:
          language === "zh"
            ? `已收藏句子：${entry.text}\n`
            : `Saved sentence: ${entry.text}\n`,
      };
    }
    case "list": {
      const store = await loadPersonalSentencesStoreFromPath(path);
      const active = store.entries.filter((entry) => !entry.archived);
      if (active.length === 0) {
        return {
          stdout:
            language === "zh"
              ? "暂无收藏的句子。用 keyloop sentence add \"TEXT\" --zh 译文 添加。\n"
              : 'No saved sentences. Add one with: keyloop sentence add "TEXT" --zh TRANSLATION\n',
        };
      }
      const lines = active.map(
        (entry) => `${entry.id}\t${entry.text}${entry.translation_zh === undefined ? "" : `\t${entry.translation_zh}`}`,
      );
      return { stdout: `${language === "zh" ? "我的句子" : "My sentences"}\n${lines.join("\n")}\n` };
    }
  }
}

async function runArticle(
  action: ParsedArticleAction,
  dataDir: string,
  language: Language,
  options: RunCliOptions,
): Promise<RunCliResult> {
  const path = personalArticlesPath(dataDir);
  switch (action.kind) {
    case "import": {
      const raw = await readFile(action.path, "utf8");
      const fallbackTitle = basename(action.path).replace(/\.[^.]+$/u, "");
      const parsedArticle = parseArticleFile(raw, action.title ?? fallbackTitle);
      const store = await loadPersonalArticlesStoreFromPath(path);
      const entry = createPersonalArticleEntry(
        {
          title: action.title ?? parsedArticle.title,
          paragraphs: parsedArticle.paragraphs,
          ...(action.collection === undefined ? {} : { collection: action.collection }),
          source_note: action.path,
        },
        vocabularyCreateOptions(options),
      );
      await savePersonalArticlesStoreToPath(
        { version: 1, entries: [...store.entries, entry] },
        path,
      );
      return {
        stdout:
          language === "zh"
            ? `已收藏文章「${entry.title}」（${entry.paragraphs.length} 段）。\n`
            : `Saved article "${entry.title}" (${entry.paragraphs.length} paragraphs).\n`,
      };
    }
    case "list": {
      const store = await loadPersonalArticlesStoreFromPath(path);
      const active = store.entries.filter((entry) => !entry.archived);
      if (active.length === 0) {
        return {
          stdout:
            language === "zh"
              ? "暂无收藏的文章。用 keyloop article import 文件.md 导入。\n"
              : "No saved articles. Import one with: keyloop article import FILE.md\n",
        };
      }
      const lines = active.map((entry) => `${entry.id}\t${entry.title}\t${entry.paragraphs.length}p`);
      return { stdout: `${language === "zh" ? "我的文章" : "My articles"}\n${lines.join("\n")}\n` };
    }
  }
}

async function runCorpus(
  action: ParsedCorpusAction,
  dataDir: string,
  language: Language,
  options: RunCliOptions,
): Promise<RunCliResult> {
  const path = collectionsPath(dataDir);
  const vocabPath = vocabularyPath(dataDir);
  const now = (options.now ?? new Date()).toISOString();
  switch (action.kind) {
    case "new": {
      const store = await loadCollectionsStoreFromPath(path);
      if (store.collections.some((c) => c.slug === action.slug && !c.archived)) {
        throw new Error(`collection already exists: ${action.slug}`);
      }
      const meta = {
        slug: action.slug,
        name: action.name ?? action.slug,
        ...(action.description === undefined ? {} : { description: action.description }),
        created_at: now,
        archived: false,
      };
      await saveCollectionsStoreToPath(upsertCorpusCollection(store, meta), path);
      return {
        stdout:
          language === "zh"
            ? `已创建主题词库 ${meta.slug}（${meta.name}）。用 keyloop corpus import ${meta.slug} 文件 导入词条。\n`
            : `Created collection ${meta.slug} (${meta.name}). Import entries with: keyloop corpus import ${meta.slug} FILE\n`,
      };
    }
    case "list": {
      const store = await loadCollectionsStoreFromPath(path);
      const vocabulary = await loadVocabularyStoreFromPath(vocabPath);
      const counts = collectionTagCounts(vocabulary.entries);
      if (store.collections.length === 0 && counts.size === 0) {
        return {
          stdout:
            language === "zh"
              ? "暂无主题词库。用 keyloop corpus new 名称 创建一个。\n"
              : "No collections yet. Create one with: keyloop corpus new SLUG\n",
        };
      }
      const known = new Set(store.collections.map((c) => c.slug));
      const lines = [
        ...store.collections
          .sort((a, b) => a.slug.localeCompare(b.slug))
          .map((c) => {
            const status = c.archived ? (language === "zh" ? "已归档" : "archived") : "";
            return `${c.slug}\t${c.name}\t${counts.get(c.slug) ?? 0}\t${status}`.trimEnd();
          }),
        ...[...counts.keys()]
          .filter((tag) => !known.has(tag))
          .sort()
          .map((tag) => `${tag}\t${tag}\t${counts.get(tag) ?? 0}`),
      ];
      const heading = language === "zh" ? "主题词库" : "Collections";
      return { stdout: `${heading}\n${lines.join("\n")}\n` };
    }
    case "import": {
      const raw = await readFile(action.path, "utf8");
      const store = await loadCollectionsStoreFromPath(path);
      if (!store.collections.some((c) => c.slug === action.slug)) {
        const meta = {
          slug: action.slug,
          name: action.slug,
          created_at: now,
          archived: false,
        };
        await saveCollectionsStoreToPath(upsertCorpusCollection(store, meta), path);
      }
      let vocabulary = await loadVocabularyStoreFromPath(vocabPath);
      const existing = new Set(
        vocabulary.entries
          .filter((e) => !e.archived)
          .map((e) => e.text.toLowerCase()),
      );
      const createOptions = vocabularyCreateOptions(options);
      let added = 0;
      const skipped: string[] = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#")) continue;
        const [text, meaning] = trimmed.split("\t").map((part) => part.trim());
        if (text === undefined || text === "") continue;
        if ([...text].some((ch) => ch.charCodeAt(0) > 127)) {
          skipped.push(text);
          continue;
        }
        if (existing.has(text.toLowerCase())) {
          skipped.push(text);
          continue;
        }
        existing.add(text.toLowerCase());
        const entry = createPersonalVocabularyEntry(
          {
            text,
            tags: [action.slug],
            ...(meaning === undefined || meaning === "" ? {} : { meaning_zh: meaning }),
          },
          createOptions,
        );
        vocabulary = upsertPersonalVocabularyEntry(vocabulary, entry, entry.updated_at);
        added += 1;
      }
      await saveVocabularyStoreToPath(vocabulary, vocabPath);
      const skippedNote =
        skipped.length === 0
          ? ""
          : language === "zh"
            ? `（跳过 ${skipped.length} 条：重复或含不可打字字符）`
            : ` (skipped ${skipped.length}: duplicates or untypable characters)`;
      return {
        stdout:
          language === "zh"
            ? `已向 ${action.slug} 导入 ${added} 条词条${skippedNote}。\n`
            : `Imported ${added} entries into ${action.slug}${skippedNote}.\n`,
      };
    }
    case "archive":
    case "restore": {
      const store = await loadCollectionsStoreFromPath(path);
      const meta = store.collections.find((c) => c.slug === action.slug);
      if (meta === undefined) {
        throw new Error(`unknown collection: ${action.slug}`);
      }
      const updated = { ...meta, archived: action.kind === "archive" };
      await saveCollectionsStoreToPath(upsertCorpusCollection(store, updated), path);
      return {
        stdout:
          language === "zh"
            ? `${action.kind === "archive" ? "已归档" : "已恢复"}主题词库 ${action.slug}。\n`
            : `Collection ${action.slug} ${action.kind === "archive" ? "archived" : "restored"}.\n`,
      };
    }
  }
}

async function runVocab(
  action: ParsedVocabAction,
  dataDir: string,
  language: Language,
  options: RunCliOptions,
): Promise<RunCliResult> {
  const path = vocabularyPath(dataDir);
  switch (action.kind) {
    case "add": {
      const store = await loadVocabularyStoreFromPath(path);
      const createOptions = vocabularyCreateOptions(options);
      const entryInput: Parameters<typeof createPersonalVocabularyEntry>[0] = {
        text: action.text,
      };
      if (action.entry_kind !== undefined) {
        entryInput.kind = action.entry_kind;
      }
      if (action.parts !== undefined) {
        entryInput.parts = action.parts;
      }
      if (action.aliases !== undefined) {
        entryInput.aliases = action.aliases;
      }
      if (action.tags !== undefined) {
        entryInput.tags = action.tags;
      }
      if (action.priority !== undefined) {
        entryInput.priority = action.priority;
      }
      if (action.meaning_zh !== undefined) {
        entryInput.meaning_zh = action.meaning_zh;
      }
      const entry = createPersonalVocabularyEntry(entryInput, createOptions);
      await saveVocabularyStoreToPath(
        upsertPersonalVocabularyEntry(store, entry, entry.updated_at),
        path,
      );
      return {
        stdout:
          language === "zh"
            ? `已添加词库条目 ${entry.id}: ${entry.text}\n`
            : `Added vocabulary entry ${entry.id}: ${entry.text}\n`,
      };
    }
    case "list": {
      const store = await loadVocabularyStoreFromPath(path);
      const activeEntries = store.entries.filter((entry) => !entry.archived);
      if (activeEntries.length === 0) {
        return {
          stdout:
            language === "zh"
              ? "暂无词库条目。\n"
              : "No active vocabulary entries.\n",
        };
      }
      const heading = language === "zh" ? "个人词库" : "Personal vocabulary";
      const lines = activeEntries
        .sort((left, right) => left.text.localeCompare(right.text))
        .map((entry) => {
          const tags = entry.tags.length === 0 ? "-" : entry.tags.join(",");
          return `${entry.id}\t${entry.kind}\tP${entry.priority}\t${entry.text}\t${tags}`;
        });
      return { stdout: `${heading}\n${lines.join("\n")}\n` };
    }
    case "remove": {
      const store = await loadVocabularyStoreFromPath(path);
      const now = (options.now ?? new Date()).toISOString();
      await saveVocabularyStoreToPath(
        archivePersonalVocabularyEntry(store, action.id, now),
        path,
      );
      return {
        stdout:
          language === "zh"
            ? `已归档词库条目 ${action.id}\n`
            : `Archived vocabulary entry ${action.id}\n`,
      };
    }
    case "import": {
      const store = await loadVocabularyStoreFromPath(path);
      const imported = importPersonalVocabularyEntries(
        JSON.parse(await readFile(action.path, "utf8")) as unknown,
        vocabularyCreateOptions(options),
      );
      const updated = imported.reduce(
        (current, entry) => upsertPersonalVocabularyEntry(current, entry, entry.updated_at),
        store,
      );
      await saveVocabularyStoreToPath(updated, path);
      return {
        stdout:
          language === "zh"
            ? `已导入 ${imported.length} 个词库条目。\n`
            : `Imported ${imported.length} vocabulary entries.\n`,
      };
    }
  }
}

function codeConfigFromStartCommand(command: ParsedStartCommand): CodePracticeConfig {
  const config = defaultCodePracticeConfig();
  if (command.code_language !== undefined) {
    config.language = command.code_language;
  }
  if (command.code_framework !== undefined) {
    config.framework = command.code_framework;
  }
  if (command.code_project !== undefined) {
    config.project = command.code_project;
  }
  return config;
}

function isCodeConfigEmpty(config: CodePracticeConfig): boolean {
  return (
    config.language === undefined &&
    config.framework === undefined &&
    config.project === undefined &&
    config.level === undefined &&
    config.size === undefined &&
    config.languages.length === 0 &&
    config.frameworks.length === 0 &&
    config.projects.length === 0
  );
}

async function defaultRunner(): Promise<StartRunnerResult> {
  return { completedRecords: [] };
}

async function defaultAppRunner(
  context: AppRunnerContext,
): Promise<OpenTuiAppSessionResult> {
  return runOpenTuiAppSession(context);
}

function ensureNoExtraArgs(command: string, args: string[]): void {
  if (args.length > 0) {
    throw new Error(`${command} received unexpected argument: ${args[0]}`);
  }
}

interface ParsedOptionToken {
  name: string;
  value?: string;
}

function splitOptionToken(option: string | undefined): ParsedOptionToken {
  const text = option ?? "";
  const equalsIndex = text.indexOf("=");
  return equalsIndex === -1
    ? { name: text }
    : { name: text.slice(0, equalsIndex), value: text.slice(equalsIndex + 1) };
}

function optionValue(option: ParsedOptionToken, args: string[]): string {
  if (option.value !== undefined) {
    if (option.value.length === 0) {
      throw new Error(`${option.name} requires a value`);
    }
    return option.value;
  }
  return requiredValue(option.name, args);
}

function requiredValue(option: string | undefined, args: string[]): string {
  const value = args.shift();
  if (option === undefined || value === undefined || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function isMode(value: string): value is Mode {
  return (modes as readonly string[]).includes(value);
}

function parsePersonalVocabularyKind(value: string): PersonalVocabularyKind {
  if (
    value === "word" ||
    value === "phrase" ||
    value === "identifier" ||
    value === "code_term"
  ) {
    return value;
  }
  throw new Error("--kind must be word, phrase, identifier, or code_term");
}

function parsePersonalVocabularyPriority(value: string): PersonalVocabularyPriority {
  if (value === "1" || value === "2" || value === "3") {
    return Number(value) as PersonalVocabularyPriority;
  }
  throw new Error("--priority must be 1, 2, or 3");
}

function commaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function vocabularyCreateOptions(
  options: RunCliOptions,
): Parameters<typeof createPersonalVocabularyEntry>[1] {
  const createOptions: Parameters<typeof createPersonalVocabularyEntry>[1] = {};
  if (options.now !== undefined) {
    createOptions.now = options.now.toISOString();
  }
  if (options.idFactory !== undefined) {
    createOptions.idFactory = options.idFactory;
  }
  return createOptions;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
