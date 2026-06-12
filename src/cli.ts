import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
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
  observeKeyEvent,
  preferencesPath,
  saveKeyAggregatesToPath,
  savePreferencesToPath,
  saveSessionCheckpointToPath,
  sessionLogPath,
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
import type { CustomLibrary } from "./training/customLibrary";
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
  wordAudioSettings?: UserPreferences["word_audio"];
  customLibrarySettings?: UserPreferences["custom_library"];
  customLibraries?: CustomLibrary[];
  sourceItem?: OpenTuiRunningRoute["source_item"];
  initialRenderer?: OpenTuiRenderer;
  returnState?: OpenTuiAppState;
  speedUnit?: SpeedUnit;
  todayElapsedMs?: number;
  now?: Date;
  saveCheckpoint?: (lesson: PracticeLesson, target: PracticeTarget) => Promise<void>;
  saveRecord?: (record: SessionRecord) => Promise<void>;
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
      "",
      "Commands:",
      "  start    Start a realtime typing session",
      "  plan     Generate the next adaptive practice plan",
      "  report   Show practice reports",
      "  import   Preview code snippets extracted from a repository",
      "  sources  List built-in corpus sources",
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
    "",
    "命令:",
    "  start    开始实时打字练习",
    "  plan     生成下一轮自适应计划",
    "  report   查看练习报告",
    "  import   预览从仓库提取的代码片段",
    "  sources  查看内置语料来源",
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
      programmingTermsSettings: preferences.programming_terms,
      wordBreakdownSettings: preferences.word_breakdown,
      wordAudioSettings: preferences.word_audio,
      customLibrarySettings: preferences.custom_library,
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
    programming_terms: { ...preferences.programming_terms },
    word_audio: { ...preferences.word_audio },
    custom_library: { ...preferences.custom_library },
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
      !programmingTermsSettingsEqual(
        state.wordFormSettings.programming_terms,
        preferences.programming_terms,
      )
    ) {
      next.programming_terms = { ...state.wordFormSettings.programming_terms };
      changed = true;
    }
  }

  if (
    state.wordAudioSettings !== undefined &&
    !wordAudioSettingsEqual(state.wordAudioSettings, preferences.word_audio)
  ) {
    next.word_audio = { ...state.wordAudioSettings };
    changed = true;
  }

  if (
    state.customLibrarySettings !== undefined &&
    !customLibrarySettingsEqual(state.customLibrarySettings, preferences.custom_library)
  ) {
    next.custom_library = { ...state.customLibrarySettings };
    changed = true;
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
    left.word_repeats === right.word_repeats &&
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
    left.max_items_per_group === right.max_items_per_group &&
    left.word_repeats === right.word_repeats
  );
}

function programmingTermsSettingsEqual(
  left: UserPreferences["programming_terms"],
  right: UserPreferences["programming_terms"],
): boolean {
  return left.word_repeats === right.word_repeats;
}

function wordAudioSettingsEqual(
  left: UserPreferences["word_audio"],
  right: UserPreferences["word_audio"],
): boolean {
  return left.enabled === right.enabled;
}

function customLibrarySettingsEqual(
  left: UserPreferences["custom_library"],
  right: UserPreferences["custom_library"],
): boolean {
  return left.word_repeats === right.word_repeats;
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
    programmingTermsSettings: preferences.programming_terms,
    wordBreakdownSettings: preferences.word_breakdown,
    localCodeSnippets,
    ...(command.repo === undefined ? {} : { localCodeSource: command.repo }),
    ...(localCodeScanError === undefined ? {} : { localCodeScanError }),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
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
      wordAudioSettings: preferences.word_audio,
      customLibrarySettings: preferences.custom_library,
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
    ...(context.wordAudioSettings === undefined
      ? {}
      : { wordAudioSettings: context.wordAudioSettings }),
    ...(context.customLibrarySettings === undefined
      ? {}
      : { customLibrarySettings: context.customLibrarySettings }),
    ...(context.customLibraries === undefined ? {} : { customLibraries: context.customLibraries }),
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
    effectiveAppContext.programmingTermsSettings = state.wordFormSettings.programming_terms;
  }
  if (state.wordAudioSettings !== undefined) {
    effectiveAppContext.wordAudioSettings = state.wordAudioSettings;
  }
  if (state.customLibrarySettings !== undefined) {
    effectiveAppContext.customLibrarySettings = state.customLibrarySettings;
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
    ...(effectiveAppContext.wordAudioSettings === undefined
      ? {}
      : { wordAudioSettings: effectiveAppContext.wordAudioSettings }),
    ...(effectiveAppContext.customLibrarySettings === undefined
      ? {}
      : { customLibrarySettings: effectiveAppContext.customLibrarySettings }),
    ...(effectiveAppContext.customLibraries === undefined
      ? {}
      : { customLibraries: effectiveAppContext.customLibraries }),
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

export function returnStateFromRunningState(state: OpenTuiAppState): OpenTuiAppState {
  const route: OpenTuiReturnRoute =
    state.route.screen === "running" && state.route.return_route !== undefined
      ? state.route.return_route
      : { screen: "main_menu", selected_index: 0 };
  // 展开整个 state 只替换 route：session 字段（customLibraries、dictionaryTier、
  // 设置等）全部自动延续，避免逐字段拷贝漏掉新增字段（曾导致自建语料库
  // 在练习返回后从菜单消失）。
  return { ...state, route };
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
  if (sourceItem.startsWith("library_kind_")) {
    return {
      kind: "words",
      module: "custom_corpus",
      category: "custom_library",
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
    case "symbols_numbers":
      return {
        kind: "code_block",
        module: "programming_basics",
        category: "symbols_numbers",
      };
    case "builtin_api":
      return {
        kind: "code_block",
        module: "programming_basics",
        category: "builtin_api",
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
    case "programming_basics_mix":
      return {
        kind: "code_block",
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



function commaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}


function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
