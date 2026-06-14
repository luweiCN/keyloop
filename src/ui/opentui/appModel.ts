import type { DictionaryTier } from "../../content/dictionary";
import type { CustomLibrary } from "../../training/customLibrary";
import {
  buildLibraryArticleTarget,
  buildLibraryMixTarget,
  buildLibraryPhrasesTarget,
  buildLibrarySentencesTarget,
  buildLibraryWordsTarget,
} from "../../training/customLibraryTargets";
import {
  defaultCodePracticeConfig,
  defaultCodeStyleSettings,
  type CodeFilterPreference,
  type CodePracticeConfig,
  type DailyPracticePlan,
  type TrainingModule,
  type CodePracticeOption,
  type CodeStyleSettings,
  type EverydayEnglishSettings,
  type EverydaySentenceLength,
  type KeyAggregate,
  type KeyEventRecord,
  type Language,
  type MainGoal,
  type PracticeLesson,
  type PracticeTarget,
  type SessionRecord,
  type SpeedUnit,
  type UserPreferences,
} from "../../domain/model";
import {
  codeDifficultyLabel,
  codeIndentLabel,
  codeLengthLabel,
  everydayLengthLabel,
} from "./labels";
import type {
  OpenTuiMenuItem,
  OpenTuiMenuItemId,
  OpenTuiSubmenu,
} from "./menuItems";
import type { OpenTuiSettingsView } from "./settingsItems";
import {
  aggregateSpeed,
  effectiveActiveMs,
  formatDurationShort,
  keyStatsLines,
  localDateKey,
  type KeyStatsSort,
  statsCodeLines,
  statsComprehensiveLines,
  statsDatesFromRecords,
  statsDayLines,
  statsModuleLines,
  statsOverviewLines,
  statsTodayLines,
  statsTokenLines,
  speedFromWpm,
  speedUnitLabel,
  weightedAccuracy,
} from "../../report/stats";
import {
  buildCodeMixPracticeTarget,
  buildCodeSpecialistPracticeTarget,
  buildDailyPracticePlan,
  buildEverydayMixStageTarget,
  buildEverydayPracticeTarget,
  buildProgrammingBasicsMixStageTarget,
  everydayMeaningLines,
  buildFoundationPracticeTarget,
  buildFoundationMixPracticeTarget,
  buildLongWordBreakdownPracticeTarget,
  buildProgrammingBasicsPracticeTarget,
  type BuildTargetContext,
  type FoundationPracticeTargetKind,
} from "../../training/targets";
import {
  buildBuiltinApiTarget,
  buildProgrammingBasicsMixTarget,
  buildSymbolsNumbersTarget,
} from "../../training/programmingBasicsTargets";
import type { LiveMetrics } from "../../training/liveSession";
import { buildSkillProfile, type SkillProfile } from "../../training/diagnosis";
import {
  cyclePreset,
  recommendedDailyMinutes,
  snapToPreset,
} from "../../training/prescription";
import { recommendGoalPlan } from "../../training/goalPlan";
import { completedDailyLessonIds } from "../../storage/keyloopStore";

export const openTuiStatsViews = [
  "overview",
  "today",
  "comprehensive",
  "modules",
  "keys",
  "tokens",
  "code",
  "daily",
] as const;

export type OpenTuiStatsView = (typeof openTuiStatsViews)[number];

export interface OpenTuiCodeFilterPickerItem {
  option: CodePracticeOption;
  optionIndex: number;
  selected: boolean;
  pinned: boolean;
  active: boolean;
}

export const codeDifficultyOptions = [
  "adaptive",
  "all",
  "easy",
  "medium",
  "hard",
] as const satisfies readonly UserPreferences["code_practice"]["difficulty"][];
export const codeLengthOptions = [
  "adaptive",
  "short",
  "medium",
  "long",
] as const satisfies readonly UserPreferences["code_practice"]["length"][];

export interface OpenTuiCodeFilterState {
  options: CodePracticeOption[];
  selected: CodeFilterPreference[];
  pinned: CodeFilterPreference[];
  index: number;
  query: string;
}

export interface OpenTuiWordFormSettings {
  word_breakdown: UserPreferences["word_breakdown"];
  programming_terms: UserPreferences["programming_terms"];
}

export type OpenTuiWordAudioSettings = UserPreferences["word_audio"];
export type OpenTuiCustomLibrarySettings = UserPreferences["custom_library"];
export type OpenTuiYoudaoTtsCredentialStatus = "keychain" | "env" | "none" | "unavailable";

export interface OpenTuiCodeSettings {
  difficulty: UserPreferences["code_practice"]["difficulty"];
  length: UserPreferences["code_practice"]["length"];
}

export interface OpenTuiPracticeOptionItem {
  id: string;
  label: string;
  value: string;
}

export interface OpenTuiPracticeOptionsState {
  selected_index: number;
  items: OpenTuiPracticeOptionItem[];
}

export interface OpenTuiRunningLiveState {
  input: string;
  metrics: LiveMetrics;
  key_events?: KeyEventRecord[] | undefined;
  elapsed_ms?: number;
  paused?: boolean;
}

export interface OpenTuiStateOptions {
  codeFilters?: OpenTuiCodeFilterState | undefined;
  codeSettings?: OpenTuiCodeSettings | undefined;
  codeStyleSettings?: CodeStyleSettings | undefined;
  everydaySettings?: Partial<EverydayEnglishSettings> | undefined;
  wordFormSettings?: OpenTuiWordFormSettings | undefined;
  wordAudioSettings?: OpenTuiWordAudioSettings | undefined;
  customLibrarySettings?: OpenTuiCustomLibrarySettings | undefined;
  practiceOptions?: OpenTuiPracticeOptionsState | undefined;
  speedUnit?: SpeedUnit | undefined;
  todayElapsedMs?: number | undefined;
  customLibraries?: CustomLibrary[] | undefined;
  dictionaryTier?: DictionaryTier | undefined;
  youdaoTtsCredentialStatus?: OpenTuiYoudaoTtsCredentialStatus | undefined;
  enabledModules?: TrainingModule[] | undefined;
  mainGoal?: MainGoal | undefined;
}

export type OpenTuiReturnRoute =
  | { screen: "main_menu"; selected_index?: number }
  | { screen: "submenu"; menu: OpenTuiSubmenu; selected_index?: number }
  | { screen: "library_menu"; slug: string; selected_index?: number };

export type OpenTuiRoute =
  | { screen: "main_menu"; selected_index?: number }
  | { screen: "submenu"; menu: OpenTuiSubmenu; selected_index?: number }
  | {
      screen: "settings";
      view: OpenTuiSettingsView;
      selected_index?: number;
      youdao_app_key_input?: string;
      youdao_app_secret_input?: string;
      youdao_message?: string;
    }
  | {
      screen: "stats";
      records: SessionRecord[];
      view: OpenTuiStatsView;
      now?: Date;
      keyAggregates?: KeyAggregate[];
      keyStatsSort?: KeyStatsSort;
      dailyIndex?: number;
    }
  | {
      screen: "running";
      target: PracticeTarget;
      lesson?: PracticeLesson;
      source_item: OpenTuiMenuItemId;
      live?: OpenTuiRunningLiveState;
      return_route?: OpenTuiReturnRoute;
      /** 综合训练：诊断屏确认的当日阶段计划（保证所见即所练） */
      daily_plan?: DailyPracticePlan;
    }
  | {
      screen: "stage_plan";
      plan: DailyPracticePlan;
      diagnosis_lines: string[];
      /** 当日恢复场景：已完成的 lesson id（计划行打 ✓，开始时跳过） */
      completed_lesson_ids?: string[];
    }
  | {
      screen: "exit_confirmation";
      target: PracticeTarget;
      lesson?: PracticeLesson;
      source_item: OpenTuiMenuItemId;
      live?: OpenTuiRunningLiveState;
    }
  | {
      screen: "code_settings_confirmation";
      target: PracticeTarget;
      lesson?: PracticeLesson;
      source_item: OpenTuiMenuItemId;
      live?: OpenTuiRunningLiveState;
    }
  | {
      screen: "practice_options";
      target: PracticeTarget;
      lesson?: PracticeLesson;
      source_item: OpenTuiMenuItemId;
      live?: OpenTuiRunningLiveState;
      practice_options: OpenTuiPracticeOptionsState;
    }
  | {
      screen: "complete";
      record: SessionRecord;
      source_item: OpenTuiMenuItemId;
      next_lesson?: PracticeLesson;
      lesson?: PracticeLesson;
      target?: PracticeTarget;
      live?: OpenTuiRunningLiveState;
      result_visible: boolean;
      /** 弹窗关闭后复盘滚动的窗口起始行；undefined 时默认停在底部 */
      review_scroll?: number;
    }
  | {
      screen: "summary";
      records: SessionRecord[];
      daily_run_id?: string;
    }
  | { screen: "ansi_palette" }
  | { screen: "library_menu"; slug: string; selected_index?: number }
  | { screen: "library_create"; name: string }
  | { screen: "library_manage"; selected_index?: number }
  | { screen: "library_actions"; slug: string; selected_index?: number }
  | {
      screen: "library_input";
      slug: string;
      kind: "words" | "sentences" | "article";
      text: string;
      cursor?: number;
      editing_id?: string;
    }
  | { screen: "library_preview"; slug: string; payload: LibraryPreviewPayload }
  | {
      screen: "library_browse";
      slug: string;
      query: string;
      index: number;
      /** 待确认删除的条目 id */
      confirm_delete_id?: string;
    }
  | {
      screen: "library_detail";
      slug: string;
      entry_id: string;
      /** 返回 picker 时恢复的搜索词与选中位置 */
      return_query: string;
      return_index: number;
      /** 查看态滚动偏移（视觉行） */
      scroll: number;
      /** 删除二次确认中 */
      confirm_delete?: boolean;
      /** 编辑态：弹窗内可编辑缓冲；undefined 为查看态 */
      editing?: { text: string; cursor: number };
    }
  | { screen: "library_delete_confirm"; slug: string };

export type LibraryPreviewPayload =
  | {
      kind: "words";
      raw_text: string;
      entries: {
        text: string;
        word_kind: "word" | "phrase";
        meaning_zh?: string;
        phonetic?: string;
        source: "dict" | "manual";
      }[];
      error_lines: string[];
      editing_id?: string;
    }
  | {
      kind: "sentences";
      raw_text: string;
      entries: { text: string; translation_zh?: string }[];
      editing_id?: string;
    }
  | {
      kind: "article";
      raw_text: string;
      title: string;
      paragraphs: { text: string; translation_zh?: string }[];
      warnings: string[];
      editing_id?: string;
    };

/**
 * Session-scoped fields that survive every screen change. Anything added
 * here is automatically carried across navigation because route changes
 * must go through withRoute()/stateOptions() rather than rebuilding the
 * state by hand.
 */
export interface OpenTuiSessionState {
  language: Language;
  speed_unit?: SpeedUnit | undefined;
  codeFilters?: OpenTuiCodeFilterState | undefined;
  codeSettings?: OpenTuiCodeSettings | undefined;
  codeStyleSettings?: CodeStyleSettings | undefined;
  everydaySettings?: EverydayEnglishSettings | undefined;
  wordFormSettings?: OpenTuiWordFormSettings | undefined;
  wordAudioSettings?: OpenTuiWordAudioSettings | undefined;
  customLibrarySettings?: OpenTuiCustomLibrarySettings | undefined;
  customLibraries?: CustomLibrary[] | undefined;
  dictionaryTier?: DictionaryTier | undefined;
  youdaoTtsCredentialStatus?: OpenTuiYoudaoTtsCredentialStatus | undefined;
  today_elapsed_ms?: number | undefined;
  enabledModules?: TrainingModule[] | undefined;
  mainGoal?: MainGoal | undefined;
}

export interface OpenTuiAppState extends OpenTuiSessionState {
  route: OpenTuiRoute;
}

/** The one way to change screens: keep the session, swap the route. */
export function withRoute(state: OpenTuiAppState, route: OpenTuiRoute): OpenTuiAppState {
  return { ...state, route };
}

export interface OpenTuiCompletionStateOptions extends OpenTuiStateOptions {
  nextLesson?: PracticeLesson;
  sourceItem?: OpenTuiMenuItemId;
  lesson?: PracticeLesson;
  target?: PracticeTarget;
  live?: OpenTuiRunningLiveState;
  resultVisible?: boolean;
}

export interface OpenTuiExitConfirmationStateOptions extends OpenTuiStateOptions {
  lesson?: PracticeLesson;
  sourceItem?: OpenTuiMenuItemId;
  live?: OpenTuiRunningLiveState;
}

export interface OpenTuiCodeSettingsConfirmationStateOptions extends OpenTuiStateOptions {
  lesson?: PracticeLesson;
  sourceItem?: OpenTuiMenuItemId;
  live?: OpenTuiRunningLiveState;
}

export interface OpenTuiPracticeOptionsStateOptions extends OpenTuiStateOptions {
  lesson?: PracticeLesson;
  sourceItem?: OpenTuiMenuItemId;
  live?: OpenTuiRunningLiveState;
}

export interface OpenTuiSummaryStateOptions extends OpenTuiStateOptions {
  dailyRunId?: string;
}

export interface OpenTuiStatsStateOptions extends OpenTuiStateOptions {
  view?: OpenTuiStatsView;
  now?: Date;
  keyAggregates?: KeyAggregate[];
  keyStatsSort?: KeyStatsSort;
  dailyIndex?: number;
}

export function createOpenTuiInitialState(
  language: Language = "zh",
  options: OpenTuiStateOptions = {},
): OpenTuiAppState {
  return appState(language, { screen: "main_menu", selected_index: 0 }, options);
}

export function createOpenTuiSettingsState(
  language: Language,
  view: OpenTuiSettingsView = "menu",
  options: OpenTuiStateOptions = {},
): OpenTuiAppState {
  return appState(language, { screen: "settings", view }, options);
}

export function createOpenTuiCodeFilterState(input: {
  options: CodePracticeOption[];
  selected?: CodeFilterPreference[];
  pinned?: CodeFilterPreference[];
  index?: number;
  query?: string;
}): OpenTuiCodeFilterState {
  const baseOptions = input.options.filter((option) => option.facet !== "project");
  const pinned = uniqueCodeFilterPreferences(input.pinned ?? []).filter((preference) =>
    baseOptions.some((option) => codeFilterMatchesOption(preference, option)),
  );
  const options = [...baseOptions].sort((left, right) => compareCodeOptions(left, right, pinned));
  const selected = uniqueCodeFilterPreferences(input.selected ?? []).filter((preference) =>
    options.some((option) => codeFilterMatchesOption(preference, option)),
  );
  const index = Math.min(Math.max(input.index ?? 0, 0), Math.max(options.length - 1, 0));
  return { options, selected, pinned, index, query: input.query ?? "" };
}

export function openTuiCodeConfig(state: OpenTuiAppState): CodePracticeConfig | undefined {
  if (state.codeFilters === undefined && state.codeSettings === undefined) {
    return undefined;
  }

  const config = defaultCodePracticeConfig({ match_any: true });
  if (state.codeSettings !== undefined) {
    config.difficulty = state.codeSettings.difficulty;
    if (state.codeSettings.length !== "adaptive") {
      config.size = state.codeSettings.length;
    }
  }
  for (const preference of state.codeFilters?.selected ?? []) {
    switch (preference.facet) {
      case "language":
        config.languages.push(preference.value);
        break;
      case "framework":
        config.frameworks.push(preference.value);
        break;
      case "project":
        config.projects.push(preference.value);
        break;
    }
  }
  return config;
}

export function createOpenTuiCompletionState(
  language: Language,
  record: SessionRecord,
  options: OpenTuiCompletionStateOptions = {},
): OpenTuiAppState {
  const route: OpenTuiRoute = {
    screen: "complete",
    record,
    source_item: options.sourceItem ?? "comprehensive",
    result_visible: options.resultVisible ?? true,
  };
  if (options.nextLesson !== undefined) {
    route.next_lesson = options.nextLesson;
  }
  if (options.lesson !== undefined) {
    route.lesson = options.lesson;
  }
  if (options.target !== undefined) {
    route.target = options.target;
  }
  if (options.live !== undefined) {
    route.live = options.live;
  }
  return appState(language, route, options);
}

export function createOpenTuiExitConfirmationState(
  language: Language,
  target: PracticeTarget,
  options: OpenTuiExitConfirmationStateOptions = {},
): OpenTuiAppState {
  const route: OpenTuiRoute = {
    screen: "exit_confirmation",
    target,
    source_item: options.sourceItem ?? "comprehensive",
  };
  if (options.lesson !== undefined) {
    route.lesson = options.lesson;
  }
  if (options.live !== undefined) {
    route.live = options.live;
  }
  return appState(language, route, options);
}

export function createOpenTuiCodeSettingsConfirmationState(
  language: Language,
  target: PracticeTarget,
  options: OpenTuiCodeSettingsConfirmationStateOptions = {},
): OpenTuiAppState {
  const route: OpenTuiRoute = {
    screen: "code_settings_confirmation",
    target,
    source_item: options.sourceItem ?? "comprehensive",
  };
  if (options.lesson !== undefined) {
    route.lesson = options.lesson;
  }
  if (options.live !== undefined) {
    route.live = options.live;
  }
  return appState(language, route, options);
}

export function createOpenTuiPracticeOptionsState(
  language: Language,
  target: PracticeTarget,
  options: OpenTuiPracticeOptionsStateOptions = {},
): OpenTuiAppState {
  const route: OpenTuiRoute = {
    screen: "practice_options",
    target,
    source_item: options.sourceItem ?? "comprehensive",
    practice_options: clonePracticeOptions(
      options.practiceOptions ?? { selected_index: 0, items: [] },
    ),
  };
  if (options.lesson !== undefined) {
    route.lesson = options.lesson;
  }
  if (options.live !== undefined) {
    route.live = options.live;
  }
  return appState(language, route, options);
}

export function createOpenTuiSummaryState(
  language: Language,
  records: SessionRecord[],
  options: OpenTuiSummaryStateOptions = {},
): OpenTuiAppState {
  const route: OpenTuiRoute = {
    screen: "summary",
    records: [...records],
  };
  if (options.dailyRunId !== undefined) {
    route.daily_run_id = options.dailyRunId;
  }
  return appState(language, route, options);
}

export function createOpenTuiStatsState(
  language: Language,
  records: SessionRecord[],
  options: OpenTuiStatsStateOptions = {},
): OpenTuiAppState {
  const route: OpenTuiRoute = {
    screen: "stats",
    records: [...records],
    view: options.view ?? "overview",
  };
  if (options.now !== undefined) {
    route.now = options.now;
  }
  if (options.keyAggregates !== undefined) {
    route.keyAggregates = [...options.keyAggregates];
  }
  if (options.keyStatsSort !== undefined) {
    route.keyStatsSort = options.keyStatsSort;
  }
  if (options.dailyIndex !== undefined) {
    route.dailyIndex = options.dailyIndex;
  }
  return appState(language, route, options);
}

export function nextOpenTuiStatsView(state: OpenTuiAppState): OpenTuiAppState {
  if (state.route.screen !== "stats") {
    return state;
  }
  const nextView = nextStatsView(state.route.view);
  const options: OpenTuiStatsStateOptions = { view: nextView };
  if (state.route.now !== undefined) {
    options.now = state.route.now;
  }
  if (state.route.keyAggregates !== undefined) {
    options.keyAggregates = state.route.keyAggregates;
  }
  if (state.route.keyStatsSort !== undefined) {
    options.keyStatsSort = state.route.keyStatsSort;
  }
  if (state.route.dailyIndex !== undefined) {
    options.dailyIndex = state.route.dailyIndex;
  }
  if (state.speed_unit !== undefined) {
    options.speedUnit = state.speed_unit;
  }
  if (state.codeFilters !== undefined) {
    options.codeFilters = state.codeFilters;
  }
  if (state.codeSettings !== undefined) {
    options.codeSettings = state.codeSettings;
  }
  if (state.everydaySettings !== undefined) {
    options.everydaySettings = state.everydaySettings;
  }
  if (state.wordFormSettings !== undefined) {
    options.wordFormSettings = state.wordFormSettings;
  }
  return createOpenTuiStatsState(state.language, state.route.records, options);
}

export function openTuiCodeFilterPickerItems(
  state: OpenTuiAppState,
): OpenTuiCodeFilterPickerItem[] {
  if (state.route.screen !== "settings" || state.route.view !== "code_filters") {
    return [];
  }
  const filters = state.codeFilters;
  if (filters === undefined) {
    return [];
  }
  const matches = codeFilterOptionsMatchingQuery(filters.options, filters.query);
  const activeMatch =
    matches.find((match) => match.index === filters.index) ?? matches[0];
  const activeIndex = activeMatch?.index ?? 0;
  return matches.map(({ option, index }) => {
    const preference = codeFilterPreferenceFromOption(option);
    return {
      option,
      optionIndex: index,
      selected: hasCodeFilterPreference(filters.selected, preference),
      pinned: hasCodeFilterPreference(filters.pinned, preference),
      active: index === activeIndex,
    };
  });
}

function codeFilterOptionsMatchingQuery(
  options: CodePracticeOption[],
  query: string,
): Array<{ option: CodePracticeOption; index: number }> {
  const normalizedQuery = query.trim().toLowerCase();
  return options.flatMap((option, index) => {
    if (
      normalizedQuery === "" ||
      fuzzyIncludes(`${option.facet} ${option.value}`, normalizedQuery)
    ) {
      return [{ option, index }];
    }
    return [];
  });
}

export function fuzzyIncludes(value: string, query: string): boolean {
  let searchIndex = 0;
  const normalizedValue = value.toLowerCase();
  for (const character of query.toLowerCase()) {
    searchIndex = normalizedValue.indexOf(character, searchIndex);
    if (searchIndex === -1) {
      return false;
    }
    searchIndex += 1;
  }
  return true;
}

export function activateOpenTuiMenuItem(
  state: OpenTuiAppState,
  itemId: OpenTuiMenuItemId,
  context: BuildTargetContext,
): OpenTuiAppState {
  switch (state.route.screen) {
    case "main_menu":
      return activateMainMenuItem(state, itemId, context);
    case "submenu":
      return activateSubmenuItem(state, itemId, context);
    case "library_menu":
      return activateLibraryMenuItem(state, itemId);
    case "settings":
    case "stats":
    case "running":
    case "stage_plan":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "complete":
    case "summary":
    case "ansi_palette":
    case "library_create":
    case "library_manage":
    case "library_actions":
    case "library_input":
    case "library_preview":
    case "library_browse":
    case "library_delete_confirm":
    case "library_detail":
      return state;
  }
}

function activateMainMenuItem(
  state: OpenTuiAppState,
  itemId: OpenTuiMenuItemId,
  context: BuildTargetContext,
): OpenTuiAppState {
  switch (itemId) {
    case "comprehensive":
      return comprehensiveStagePlanState(
        state,
        buildTargetContextForState(state, context),
      );
    case "foundation":
    case "everyday":
    case "programming":
    case "code":
    case "custom":
      return appState(
        state.language,
        { screen: "submenu", menu: itemId, selected_index: 0 },
        stateOptions(state),
      );
    case "settings":
      return createOpenTuiSettingsState(state.language, "menu", stateOptions(state));
    case "stats":
      return createOpenTuiStatsState(state.language, context.records, stateOptions(state));
    case "ansi_palette":
      return appState(state.language, { screen: "ansi_palette" }, stateOptions(state));
    default:
      return state;
  }
}

function activateLibraryMenuItem(
  state: OpenTuiAppState,
  itemId: OpenTuiMenuItemId,
): OpenTuiAppState {
  if (itemId === "library_manage") {
    return withRoute(state, { screen: "library_manage", selected_index: 0 });
  }
  if (!itemId.startsWith("library_kind_")) {
    return state;
  }
  const spec = itemId.slice("library_kind_".length);
  const separator = spec.lastIndexOf(":");
  if (separator === -1) {
    return state;
  }
  const slug = spec.slice(0, separator);
  const kind = spec.slice(separator + 1);
  const library = (state.customLibraries ?? []).find((entry) => entry.slug === slug);
  if (library === undefined) {
    return state;
  }
  const target =
    kind === "words"
      ? buildLibraryWordsTarget(library, {
          wordRepeats: (state.customLibrarySettings ?? defaultCustomLibrarySettings()).word_repeats,
        })
      : kind === "phrases"
        ? buildLibraryPhrasesTarget(library)
        : kind === "sentences"
          ? buildLibrarySentencesTarget(library)
          : kind === "articles"
            ? buildLibraryArticleTarget(library)
            : kind === "mix"
              ? buildLibraryMixTarget(library)
              : undefined;
  if (target === undefined || target.text === "") {
    return state;
  }
  return runningState(state.language, itemId, target, undefined, stateOptions(state));
}

function activateSubmenuItem(
  state: OpenTuiAppState,
  itemId: OpenTuiMenuItemId,
  context: BuildTargetContext,
): OpenTuiAppState {
  if (itemId.startsWith("library_open_")) {
    const slug = itemId.slice("library_open_".length);
    return withRoute(state, { screen: "library_menu", slug, selected_index: 0 });
  }
  if (itemId === "library_new") {
    return withRoute(state, { screen: "library_create", name: "" });
  }
  if (itemId === "library_manage") {
    return withRoute(state, { screen: "library_manage", selected_index: 0 });
  }
  const effectiveContext = buildTargetContextForState(state, context);
  const foundationDrillId = foundationDrillForMenuItem(itemId);
  if (foundationDrillId !== undefined) {
    return runningState(
      state.language,
      itemId,
      buildFoundationPracticeTarget(effectiveContext, foundationDrillId),
      undefined,
      stateOptions(state),
    );
  }
  switch (itemId) {
    case "foundation_mix":
      return runningState(
        state.language,
        itemId,
        buildFoundationMixPracticeTarget(effectiveContext),
        undefined,
        stateOptions(state),
      );
    case "everyday_common_500":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "common_500"),
        undefined,
        stateOptions(state),
      );
    case "everyday_common_1000":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "common_1000"),
        undefined,
        stateOptions(state),
      );
    case "everyday_common_5000":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "common_5000"),
        undefined,
        stateOptions(state),
      );
    case "everyday_words":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "words"),
        undefined,
        stateOptions(state),
      );
    case "everyday_phrases":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "phrases"),
        undefined,
        stateOptions(state),
      );
    case "everyday_sentences":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "sentences"),
        undefined,
        stateOptions(state),
      );
    case "everyday_articles":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "articles"),
        undefined,
        stateOptions(state),
      );
    case "everyday_word_decomposition":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "word_decomposition"),
        undefined,
        stateOptions(state),
      );
    case "technical_long_words":
      return runningState(
        state.language,
        itemId,
        buildLongWordBreakdownPracticeTarget(effectiveContext, {
          profile: "standalone",
          domain: "programming",
          maxItems: 6,
        }),
        undefined,
        stateOptions(state),
      );
    case "long_word_breakdown":
      return runningState(
        state.language,
        itemId,
        buildLongWordBreakdownPracticeTarget(effectiveContext, {
          profile: "standalone",
          domains: ["everyday", "workplace"],
          maxItems: 6,
        }),
        undefined,
        stateOptions(state),
      );
    case "everyday_mix":
      return runningState(
        state.language,
        itemId,
        buildEverydayMixStageTarget(
          effectiveContext,
          buildSkillProfile(effectiveContext.records, effectiveContext.plan, effectiveContext.now),
          state.customLibraries,
        ),
        undefined,
        stateOptions(state),
      );
    case "symbols_numbers":
      return runningState(
        state.language,
        itemId,
        buildSymbolsNumbersTarget(effectiveContext),
        undefined,
        stateOptions(state),
      );
    case "builtin_api":
      return runningState(
        state.language,
        itemId,
        buildBuiltinApiTarget(effectiveContext),
        undefined,
        stateOptions(state),
      );
    case "programming_terms":
      return runningState(
        state.language,
        itemId,
        buildProgrammingBasicsPracticeTarget(effectiveContext, "programming_terms"),
        undefined,
        stateOptions(state),
      );
    case "naming_styles":
      return runningState(
        state.language,
        itemId,
        buildProgrammingBasicsPracticeTarget(effectiveContext, "naming_styles"),
        undefined,
        stateOptions(state),
      );
    case "programming_basics_mix":
      return runningState(
        state.language,
        itemId,
        buildProgrammingBasicsMixStageTarget(
          effectiveContext,
          buildSkillProfile(effectiveContext.records, effectiveContext.plan, effectiveContext.now),
        ),
        undefined,
        stateOptions(state),
      );
    case "code_blocks":
      return runningState(
        state.language,
        itemId,
        buildCodeSpecialistPracticeTarget(
          contextWithCodeLevel(effectiveContext, "block"),
          standaloneCodeSnippetCount,
        ),
        undefined,
        stateOptions(state),
      );
    case "code_functions":
      return runningState(
        state.language,
        itemId,
        buildCodeSpecialistPracticeTarget(
          contextWithCodeLevel(effectiveContext, "function"),
          standaloneCodeSnippetCount,
        ),
        undefined,
        stateOptions(state),
      );
    case "code_file_fragments":
      return runningState(
        state.language,
        itemId,
        buildCodeSpecialistPracticeTarget(
          contextWithCodeLevel(effectiveContext, "file"),
          standaloneCodeSnippetCount,
        ),
        undefined,
        stateOptions(state),
      );
    case "code_mix":
      return runningState(
        state.language,
        itemId,
        buildCodeMixPracticeTarget(effectiveContext, standaloneCodeSnippetCount),
        undefined,
        stateOptions(state),
      );
    default:
      return state;
  }
}

const standaloneCodeSnippetCount = 1;

function contextWithCodeLevel(
  context: BuildTargetContext,
  level: CodePracticeConfig["level"] | undefined,
): BuildTargetContext {
  const codeConfig: CodePracticeConfig = {
    ...defaultCodePracticeConfig({ match_any: true }),
    ...context.codeConfig,
    ...(level === undefined ? {} : { level }),
  };
  if (level === undefined) {
    delete codeConfig.level;
  }
  return {
    ...context,
    codeConfig,
  };
}

function runningState(
  language: Language,
  sourceItem: OpenTuiMenuItemId,
  target: PracticeTarget,
  lesson?: PracticeLesson,
  options: OpenTuiStateOptions = {},
): OpenTuiAppState {
  const route: OpenTuiRoute = {
    screen: "running",
    target,
    source_item: sourceItem,
  };
  if (lesson !== undefined) {
    route.lesson = lesson;
  }
  return appState(language, route, options);
}

function foundationDrillForMenuItem(
  itemId: OpenTuiMenuItemId,
): FoundationPracticeTargetKind | undefined {
  switch (itemId) {
    case "foundation_home_row":
      return "home-row";
    case "foundation_top_row":
      return "top-row";
    case "foundation_bottom_row":
      return "bottom-row";
    case "foundation_number_row":
      return "number-row";
    case "foundation_symbols":
      return "punctuation-edges";
    case "foundation_left_hand":
      return "left-hand";
    case "foundation_right_hand":
      return "right-hand";
    case "foundation_index_fingers":
      return "index-fingers";
    case "foundation_middle_fingers":
      return "middle-fingers";
    case "foundation_ring_fingers":
      return "ring-fingers";
    case "foundation_pinky_fingers":
      return "pinky-fingers";
    case "foundation_horizontal_rolls":
      return "horizontal-rolls";
    case "foundation_vertical_ladders":
      return "vertical-ladders";
    case "foundation_diagonal_crossovers":
      return "diagonal-crossovers";
    case "foundation_letter_combinations":
      return "english-transitions";
    case "foundation_capitalization":
      return "capitalization";
    default:
      return undefined;
  }
}

function appState(
  language: Language,
  route: OpenTuiRoute,
  options: OpenTuiStateOptions = {},
): OpenTuiAppState {
  const state: OpenTuiAppState = { language, route };
  if (options.speedUnit !== undefined) {
    state.speed_unit = options.speedUnit;
  }
  if (options.codeFilters !== undefined) {
    state.codeFilters = cloneCodeFilterState(options.codeFilters);
  }
  if (options.enabledModules !== undefined) {
    state.enabledModules = [...options.enabledModules];
  }
  if (options.mainGoal !== undefined) {
    state.mainGoal = options.mainGoal;
  }
  if (options.codeSettings !== undefined) {
    state.codeSettings = cloneCodeSettings(options.codeSettings);
  }
  if (options.codeStyleSettings !== undefined) {
    state.codeStyleSettings = cloneCodeStyleSettings(options.codeStyleSettings);
  }
  if (options.everydaySettings !== undefined) {
    state.everydaySettings = cloneEverydaySettings(options.everydaySettings);
  }
  if (options.wordFormSettings !== undefined) {
    state.wordFormSettings = cloneWordFormSettings(options.wordFormSettings);
  }
  if (options.wordAudioSettings !== undefined) {
    state.wordAudioSettings = cloneWordAudioSettings(options.wordAudioSettings);
  }
  if (options.customLibrarySettings !== undefined) {
    state.customLibrarySettings = cloneCustomLibrarySettings(options.customLibrarySettings);
  }
  if (options.customLibraries !== undefined) {
    state.customLibraries = options.customLibraries;
  }
  if (options.dictionaryTier !== undefined) {
    state.dictionaryTier = options.dictionaryTier;
  }
  if (options.youdaoTtsCredentialStatus !== undefined) {
    state.youdaoTtsCredentialStatus = options.youdaoTtsCredentialStatus;
  }
  if (options.todayElapsedMs !== undefined) {
    state.today_elapsed_ms = options.todayElapsedMs;
  }
  return state;
}

function buildTargetContextForState(
  state: OpenTuiAppState,
  context: BuildTargetContext,
  personalVocabularyScope: "comprehensive" | "standalone" = "comprehensive",
): BuildTargetContext {
  const codeConfig = openTuiCodeConfig(state);
  const codeStyle = state.codeStyleSettings;
  const everydaySettings = state.everydaySettings;
  const wordFormSettings = state.wordFormSettings;
  const wordAudioSettings = state.wordAudioSettings;
  const customLibrarySettings = state.customLibrarySettings;
  const enabledModules = state.enabledModules;
  const customLibraries = state.customLibraries;
  const mainGoal = state.mainGoal;
  if (
    codeConfig === undefined &&
    codeStyle === undefined &&
    everydaySettings === undefined &&
    wordFormSettings === undefined &&
    wordAudioSettings === undefined &&
    customLibrarySettings === undefined &&
    enabledModules === undefined &&
    customLibraries === undefined &&
    mainGoal === undefined
  ) {
    return context;
  }
  return {
    ...context,
    ...(codeConfig === undefined ? {} : { codeConfig }),
    ...(codeStyle === undefined ? {} : { codeStyle }),
    ...(everydaySettings === undefined ? {} : { everydaySettings }),
    ...(enabledModules === undefined ? {} : { enabledModules }),
    ...(customLibraries === undefined ? {} : { customLibraries }),
    ...(mainGoal === undefined ? {} : { mainGoal }),
    ...(wordFormSettings === undefined
      ? {}
      : {
          wordBreakdownSettings: wordFormSettings.word_breakdown,
          programmingTermsSettings: wordFormSettings.programming_terms,
        }),
  };
}

export function stateOptions(state: OpenTuiAppState): OpenTuiStateOptions {
  const options: OpenTuiStateOptions = {};
  if (state.speed_unit !== undefined) {
    options.speedUnit = state.speed_unit;
  }
  if (state.codeFilters !== undefined) {
    options.codeFilters = state.codeFilters;
  }
  if (state.codeSettings !== undefined) {
    options.codeSettings = state.codeSettings;
  }
  if (state.codeStyleSettings !== undefined) {
    options.codeStyleSettings = state.codeStyleSettings;
  }
  if (state.everydaySettings !== undefined) {
    options.everydaySettings = state.everydaySettings;
  }
  if (state.wordFormSettings !== undefined) {
    options.wordFormSettings = state.wordFormSettings;
  }
  if (state.wordAudioSettings !== undefined) {
    options.wordAudioSettings = state.wordAudioSettings;
  }
  if (state.customLibrarySettings !== undefined) {
    options.customLibrarySettings = state.customLibrarySettings;
  }
  if (state.customLibraries !== undefined) {
    options.customLibraries = state.customLibraries;
  }
  if (state.enabledModules !== undefined) {
    options.enabledModules = state.enabledModules;
  }
  if (state.mainGoal !== undefined) {
    options.mainGoal = state.mainGoal;
  }
  if (state.dictionaryTier !== undefined) {
    options.dictionaryTier = state.dictionaryTier;
  }
  if (state.youdaoTtsCredentialStatus !== undefined) {
    options.youdaoTtsCredentialStatus = state.youdaoTtsCredentialStatus;
  }
  if (state.today_elapsed_ms !== undefined) {
    options.todayElapsedMs = state.today_elapsed_ms;
  }
  return options;
}

export function defaultEverydaySettings(): EverydayEnglishSettings {
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
  };
}

export function defaultCodeSettings(): OpenTuiCodeSettings {
  return { difficulty: "adaptive", length: "adaptive" };
}

function cloneCodeSettings(settings: OpenTuiCodeSettings): OpenTuiCodeSettings {
  return { ...settings };
}

function clonePracticeOptions(settings: OpenTuiPracticeOptionsState): OpenTuiPracticeOptionsState {
  return {
    selected_index: settings.selected_index,
    items: settings.items.map((item) => ({ ...item })),
  };
}

function cloneCodeStyleSettings(settings: CodeStyleSettings): CodeStyleSettings {
  return { ...settings };
}

function cloneEverydaySettings(
  settings: Partial<EverydayEnglishSettings>,
): EverydayEnglishSettings {
  return { ...defaultEverydaySettings(), ...settings };
}

export function defaultWordFormSettings(): OpenTuiWordFormSettings {
  return {
    word_breakdown: {
      enabled_in_comprehensive: true,
      max_items_per_group: 6,
      word_repeats: 2,
    },
    programming_terms: {
      word_repeats: 1,
    },
  };
}

export function defaultWordAudioSettings(): OpenTuiWordAudioSettings {
  return { enabled: false, volume_percent: 100 };
}

export function defaultCustomLibrarySettings(): OpenTuiCustomLibrarySettings {
  return { word_repeats: 1 };
}

function cloneWordFormSettings(
  settings: OpenTuiWordFormSettings,
): OpenTuiWordFormSettings {
  return {
    word_breakdown: { ...settings.word_breakdown },
    programming_terms: { ...settings.programming_terms },
  };
}

function cloneWordAudioSettings(settings: OpenTuiWordAudioSettings): OpenTuiWordAudioSettings {
  return { ...settings };
}

function cloneCustomLibrarySettings(
  settings: OpenTuiCustomLibrarySettings,
): OpenTuiCustomLibrarySettings {
  return { ...settings };
}

function cloneCodeFilterState(filters: OpenTuiCodeFilterState): OpenTuiCodeFilterState {
  return {
    options: filters.options.map((option) => ({ ...option })),
    selected: filters.selected.map((preference) => ({ ...preference })),
    pinned: filters.pinned.map((preference) => ({ ...preference })),
    index: filters.index,
    query: filters.query,
  };
}

function compareCodeOptions(
  left: CodePracticeOption,
  right: CodePracticeOption,
  pinned: CodeFilterPreference[],
): number {
  return (
    codeFilterRank(pinned, codeFilterPreferenceFromOption(left)) -
      codeFilterRank(pinned, codeFilterPreferenceFromOption(right)) ||
    right.count - left.count ||
    codePracticeFacetRank(left.facet) - codePracticeFacetRank(right.facet) ||
    left.value.localeCompare(right.value)
  );
}

function codePracticeFacetRank(facet: CodePracticeOption["facet"]): number {
  switch (facet) {
    case "language":
      return 0;
    case "framework":
      return 1;
    case "project":
      return 2;
  }
}

function codeFilterRank(
  pinned: CodeFilterPreference[],
  preference: CodeFilterPreference,
): number {
  const index = pinned.findIndex((candidate) => codeFilterPreferencesEqual(candidate, preference));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function uniqueCodeFilterPreferences(
  preferences: CodeFilterPreference[],
): CodeFilterPreference[] {
  const unique: CodeFilterPreference[] = [];
  for (const preference of preferences) {
    if (!hasCodeFilterPreference(unique, preference)) {
      unique.push({ ...preference });
    }
  }
  return unique;
}

function hasCodeFilterPreference(
  preferences: CodeFilterPreference[],
  preference: CodeFilterPreference,
): boolean {
  return preferences.some((candidate) => codeFilterPreferencesEqual(candidate, preference));
}

function codeFilterMatchesOption(
  preference: CodeFilterPreference,
  option: CodePracticeOption,
): boolean {
  return codeFilterPreferencesEqual(preference, codeFilterPreferenceFromOption(option));
}

function codeFilterPreferenceFromOption(option: CodePracticeOption): CodeFilterPreference {
  return { facet: option.facet, value: option.value };
}

function codeFilterPreferencesEqual(
  left: CodeFilterPreference,
  right: CodeFilterPreference,
): boolean {
  return left.facet === right.facet && left.value === right.value;
}

function nextStatsView(view: OpenTuiStatsView): OpenTuiStatsView {
  const index = openTuiStatsViews.indexOf(view);
  return openTuiStatsViews[(index + 1) % openTuiStatsViews.length] ?? "overview";
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(length - 1, 0));
}

export {
  liveOptionsAvailableForSource,
  mainMenuItems,
  openTuiMenuItems,
  submenuForStandaloneItem,
  submenuItems,
  submenuTitle,
  targetRefreshAvailableForSource,
  wordBreakdownLiveOptionSources,
  everydayLiveOptionSources,
  type OpenTuiMainMenuId,
  type OpenTuiMenuItem,
  type OpenTuiMenuItemId,
  type OpenTuiSubmenu,
  type OpenTuiSubmenuId,
} from "./menuItems";
export {
  flatSettingsRouteLines,
  openTuiFlatSettingsItems,
  openTuiSettingsMenuItems,
  selectedFlatSettingsIndex,
  settingsRouteLines,
  type OpenTuiFlatSettingsItem,
  type OpenTuiFlatSettingsItemKind,
  type OpenTuiSettingsMenuItem,
  type OpenTuiSettingsMenuItemId,
  type OpenTuiSettingsView,
} from "./settingsItems";
export { openTuiRouteLines, openTuiRouteTitle } from "./routeLines";

/** 综合训练诊断/计划屏：构建当日阶段计划与诊断摘要 */
export function comprehensiveStagePlanState(
  state: OpenTuiAppState,
  effectiveContext: BuildTargetContext,
  targetMinutesOverride?: number,
): OpenTuiAppState {
  // 无显式选择时：默认落到"最接近推荐值"的档位（首次/手动调时长都重新生成）
  const profile = buildSkillProfile(
    effectiveContext.records,
    effectiveContext.plan,
    effectiveContext.now,
  );
  const goal = effectiveContext.mainGoal;
  const baseMinutes = goal
    ? recommendGoalPlan(
        goal,
        effectiveContext.records,
        profile,
        effectiveContext.now ?? new Date(),
        recommendedDailyMinutes(profile),
      ).daily_minutes
    : recommendedDailyMinutes(profile);
  const defaultMinutes = snapToPreset(baseMinutes);
  const storedPlan =
    targetMinutesOverride === undefined ? effectiveContext.todayDailyPlan : undefined;
  const plan =
    storedPlan ??
    buildDailyPracticePlan(effectiveContext, {
      targetMinutesOverride: targetMinutesOverride ?? defaultMinutes,
    });
  const completedLessonIds =
    storedPlan === undefined
      ? []
      : [...completedDailyLessonIds(storedPlan, effectiveContext.records)];
  return appState(
    state.language,
    {
      screen: "stage_plan",
      plan,
      diagnosis_lines: diagnosisSummaryLines(profile, state.language),
      ...(completedLessonIds.length === 0 ? {} : { completed_lesson_ids: completedLessonIds }),
    },
    stateOptions(state),
  );
}

/** 诊断屏上按 ←/→ 切换时长档位 */
export function adjustStagePlanMinutes(
  state: OpenTuiAppState,
  context: BuildTargetContext,
  direction: -1 | 1,
): OpenTuiAppState {
  if (state.route.screen !== "stage_plan") {
    return state;
  }
  if (state.route.plan.run_id.length > 0) {
    // 当日计划已落盘开练，时长不再可调
    return state;
  }
  return comprehensiveStagePlanState(
    state,
    buildTargetContextForState(state, context),
    cyclePreset(state.route.plan.target_minutes, direction),
  );
}

/** 诊断屏回车：开始第一阶段（计划随 running route 下传，保证所见即所练） */
export function startStagePlanFirstLesson(state: OpenTuiAppState): OpenTuiAppState {
  if (state.route.screen !== "stage_plan") {
    return state;
  }
  const plan = state.route.plan;
  const completed = new Set(state.route.completed_lesson_ids ?? []);
  const lesson = plan.lessons.find((item) => !completed.has(item.id)) ?? plan.lessons[0];
  if (lesson === undefined) {
    return state;
  }
  const running = runningState(
    state.language,
    "comprehensive",
    lesson.target,
    lesson,
    stateOptions(state),
  );
  if (running.route.screen !== "running") {
    return running;
  }
  return { ...running, route: { ...running.route, daily_plan: plan } };
}

const skillDimensionLabels: Record<
  string,
  { zh: string; en: string }
> = {
  home_row: { zh: "中排键位", en: "home row" },
  top_row: { zh: "上排键位", en: "top row" },
  bottom_row: { zh: "下排键位", en: "bottom row" },
  left_hand: { zh: "左手键区", en: "left hand" },
  right_hand: { zh: "右手键区", en: "right hand" },
  digits: { zh: "数字", en: "digits" },
  symbols: { zh: "符号标点", en: "symbols" },
  capitalization: { zh: "大小写切换", en: "capitalization" },
  word_fluency: { zh: "单词流畅度", en: "word fluency" },
  long_words: { zh: "长词", en: "long words" },
};

export function diagnosisSummaryLines(
  profile: SkillProfile,
  language: Language,
): string[] {
  const rated = profile.dimensions.filter((item) => item.status !== "unrated");
  if (rated.length === 0) {
    return [
      language === "zh"
        ? "还没有足够数据，先按默认计划练起来。"
        : "Not enough data yet - starting with the default plan.",
    ];
  }
  const lines: string[] = [];
  for (const dimension of profile.dimensions) {
    if (dimension.status !== "weak") {
      continue;
    }
    const label = skillDimensionLabels[dimension.id];
    const name =
      label === undefined ? dimension.id : language === "zh" ? label.zh : label.en;
    const errorRate =
      dimension.ewma_error_rate === null
        ? ""
        : ` ${dimension.ewma_error_rate.toFixed(1)}%`;
    lines.push(
      language === "zh"
        ? `${name}：错误率${errorRate}（弱项）`
        : `${name}: error rate${errorRate} (weak)`,
    );
  }
  if (lines.length === 0) {
    lines.push(
      language === "zh"
        ? "各项技能状态正常，按常规轮换安排。"
        : "All skills look healthy - regular rotation today.",
    );
  }
  return lines;
}
