import {
  defaultCodePracticeConfig,
  defaultCodeStyleSettings,
  type CodeFilterPreference,
  type CodePracticeConfig,
  type CodePracticeOption,
  type CodeStyleSettings,
  type EverydayEnglishSettings,
  type EverydaySentenceLength,
  type KeyAggregate,
  type KeyEventRecord,
  type Language,
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
  buildEverydayPracticeTarget,
  everydayMeaningLines,
  buildFoundationPracticeTarget,
  buildFoundationMixPracticeTarget,
  buildLongWordBreakdownPracticeTarget,
  buildPersonalVocabularyPracticeTarget,
  buildProgrammingBasicsPracticeTarget,
  buildProgrammingBasicsMixTarget,
  type BuildTargetContext,
  type FoundationPracticeTargetKind,
} from "../../training/targets";
import type { LiveMetrics } from "../../training/liveSession";

export type OpenTuiMainMenuId =
  | "comprehensive"
  | "foundation"
  | "everyday"
  | "programming"
  | "code"
  | "settings"
  | "stats"
  | "ansi_palette";

export type OpenTuiSubmenuId =
  | "foundation_home_row"
  | "foundation_top_row"
  | "foundation_bottom_row"
  | "foundation_number_row"
  | "foundation_symbols"
  | "foundation_left_hand"
  | "foundation_right_hand"
  | "foundation_index_fingers"
  | "foundation_middle_fingers"
  | "foundation_ring_fingers"
  | "foundation_pinky_fingers"
  | "foundation_horizontal_rolls"
  | "foundation_vertical_ladders"
  | "foundation_diagonal_crossovers"
  | "foundation_letter_combinations"
  | "foundation_capitalization"
  | "foundation_mix"
  | "everyday_common_500"
  | "everyday_common_1000"
  | "everyday_common_5000"
  | "everyday_words"
  | "everyday_phrases"
  | "everyday_sentences"
  | "everyday_articles"
  | "everyday_word_decomposition"
  | "long_word_breakdown"
  | "everyday_mix"
  | "operators_brackets_quotes"
  | "programming_terms"
  | "naming_styles"
  | "technical_long_words"
  | "my_vocabulary"
  | "programming_basics_mix"
  | "code_blocks"
  | "code_functions"
  | "code_file_fragments"
  | "code_mix";

export type OpenTuiMenuItemId = OpenTuiMainMenuId | OpenTuiSubmenuId;
export type OpenTuiSubmenu = "foundation" | "everyday" | "programming" | "code";
export type OpenTuiSettingsView =
  | "menu"
  | "language"
  | "code_filters"
  | "code_difficulty"
  | "code_style"
  | "everyday"
  | "word_forms";
export type OpenTuiSettingsMenuItemId =
  | "settings-language"
  | "settings-code-filters"
  | "settings-code-difficulty"
  | "settings-code-style";
export type OpenTuiStatsView =
  | "overview"
  | "today"
  | "comprehensive"
  | "modules"
  | "keys"
  | "tokens"
  | "code"
  | "daily";

export interface OpenTuiMenuItem {
  id: OpenTuiMenuItemId;
  label: string;
  hint: string;
}

export interface OpenTuiSettingsMenuItem {
  id: OpenTuiSettingsMenuItemId;
  view: Exclude<OpenTuiSettingsView, "menu">;
  label: string;
  hint: string;
}

export type OpenTuiFlatSettingsItemKind =
  | "language"
  | "speed_unit"
  | "code_difficulty"
  | "code_length"
  | "code_indent"
  | "code_semicolons"
  | "code_quotes"
  | "code_filters";

export interface OpenTuiFlatSettingsItem {
  kind: OpenTuiFlatSettingsItemKind;
  label: string;
  value: string;
}

export interface OpenTuiCodeFilterPickerItem {
  option: CodePracticeOption;
  optionIndex: number;
  selected: boolean;
  pinned: boolean;
  active: boolean;
}

const codeDifficultyOptions = [
  "adaptive",
  "all",
  "easy",
  "medium",
  "hard",
] as const satisfies readonly UserPreferences["code_practice"]["difficulty"][];
const codeLengthOptions = [
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
  personal_vocabulary: UserPreferences["personal_vocabulary"];
}

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
  practiceOptions?: OpenTuiPracticeOptionsState | undefined;
  speedUnit?: SpeedUnit | undefined;
  todayElapsedMs?: number | undefined;
}

export type OpenTuiReturnRoute =
  | { screen: "main_menu"; selected_index?: number }
  | { screen: "submenu"; menu: OpenTuiSubmenu; selected_index?: number };

export type OpenTuiRoute =
  | { screen: "main_menu"; selected_index?: number }
  | { screen: "submenu"; menu: OpenTuiSubmenu; selected_index?: number }
  | { screen: "settings"; view: OpenTuiSettingsView; selected_index?: number }
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
    }
  | {
      screen: "summary";
      records: SessionRecord[];
      daily_run_id?: string;
    }
  | { screen: "ansi_palette" };

export interface OpenTuiAppState {
  language: Language;
  route: OpenTuiRoute;
  speed_unit?: SpeedUnit | undefined;
  codeFilters?: OpenTuiCodeFilterState | undefined;
  codeSettings?: OpenTuiCodeSettings | undefined;
  codeStyleSettings?: CodeStyleSettings | undefined;
  everydaySettings?: EverydayEnglishSettings | undefined;
  wordFormSettings?: OpenTuiWordFormSettings | undefined;
  today_elapsed_ms?: number | undefined;
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

export function openTuiMenuItems(state: OpenTuiAppState): OpenTuiMenuItem[] {
  switch (state.route.screen) {
    case "main_menu":
      return mainMenuItems(state.language);
    case "submenu":
      return submenuItems(state.route.menu, state.language);
    case "settings":
    case "stats":
    case "running":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "complete":
    case "summary":
    case "ansi_palette":
      return [];
  }
}

export function openTuiSettingsMenuItems(language: Language): OpenTuiSettingsMenuItem[] {
  return [
    settingsItem("settings-language", "language", "界面语言", "Interface language", language),
    settingsItem(
      "settings-code-filters",
      "code_filters",
      "代码语言框架",
      "Code language/framework",
      language,
    ),
    settingsItem("settings-code-difficulty", "code_difficulty", "代码难度", "Code difficulty", language),
    settingsItem("settings-code-style", "code_style", "代码风格", "Code style", language),
  ];
}

export function openTuiFlatSettingsItems(state: OpenTuiAppState): OpenTuiFlatSettingsItem[] {
  const language = state.language;
  const codeSettings = state.codeSettings ?? defaultCodeSettings();
  const codeStyleSettings = state.codeStyleSettings ?? defaultCodeStyleSettings();
  const speedUnit = state.speed_unit ?? "wpm";
  const items: OpenTuiFlatSettingsItem[] = [
    {
      kind: "language",
      label: language === "zh" ? "界面语言" : "Interface language",
      value: language === "zh" ? "中文" : "English",
    },
    {
      kind: "speed_unit",
      label: language === "zh" ? "打字速度" : "Typing speed",
      value: speedUnitSettingLabel(speedUnit, language),
    },
    {
      kind: "code_filters",
      label: language === "zh" ? "代码语言框架" : "Code language/framework",
      value: codeFilterFlatValue(state.codeFilters, language),
    },
    {
      kind: "code_difficulty",
      label: language === "zh" ? "代码难度" : "Code difficulty",
      value: codeDifficultyLabel(codeSettings.difficulty, language),
    },
    {
      kind: "code_length",
      label: language === "zh" ? "代码长度" : "Code length",
      value: codeLengthLabel(codeSettings.length, language),
    },
    {
      kind: "code_indent",
      label: language === "zh" ? "代码缩进" : "Code indent",
      value: codeIndentLabel(codeStyleSettings, language),
    },
    {
      kind: "code_semicolons",
      label: language === "zh" ? "代码分号" : "Code semicolons",
      value: codeSemicolonLabel(codeStyleSettings.semicolons, language),
    },
    {
      kind: "code_quotes",
      label: language === "zh" ? "代码引号" : "Code quotes",
      value: codeQuoteLabel(codeStyleSettings.quotes, language),
    },
  ];
  return items;
}

function speedUnitSettingLabel(speedUnit: SpeedUnit, language: Language): string {
  if (language === "zh") {
    return speedUnit === "wpm" ? "WPM（每分钟标准词）" : "CPM（每分钟字符）";
  }
  return speedUnit === "wpm" ? "WPM (words per minute)" : "CPM (characters per minute)";
}

function codeFilterFlatValue(
  filters: OpenTuiCodeFilterState | undefined,
  language: Language,
): string {
  if (filters === undefined) {
    return language === "zh" ? "全部代码范围" : "All code scopes";
  }
  const query = filters.query.trim();
  if (query !== "") {
    return query;
  }
  if (filters.selected.length === 0) {
    return language === "zh" ? "全部代码范围" : "All code scopes";
  }
  if (filters.selected.length === 1) {
    const selected = filters.selected[0];
    return selected === undefined
      ? language === "zh"
        ? "全部代码范围"
        : "All code scopes"
      : `${selected.facet}: ${selected.value}`;
  }
  return language === "zh"
    ? `已选 ${filters.selected.length} 项`
    : `${filters.selected.length} selected`;
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

function fuzzyIncludes(value: string, query: string): boolean {
  let searchIndex = 0;
  const normalizedValue = value.toLowerCase();
  for (const character of query) {
    searchIndex = normalizedValue.indexOf(character, searchIndex);
    if (searchIndex === -1) {
      return false;
    }
    searchIndex += 1;
  }
  return true;
}

export function selectedFlatSettingsIndex(state: OpenTuiAppState, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }
  if (state.route.screen !== "settings" || state.route.view !== "menu") {
    return 0;
  }
  return Math.min(
    Math.max(Math.trunc(state.route.selected_index ?? 0), 0),
    Math.max(itemCount - 1, 0),
  );
}

function flatSettingsRouteLines(state: OpenTuiAppState): string[] {
  const items = openTuiFlatSettingsItems(state);
  const selected = selectedFlatSettingsIndex(state, items.length);
  return items.map(
    (item, index) => `${index === selected ? ">" : " "} ${item.label}  ${item.value}`,
  );
}

function onOffLabel(enabled: boolean, language: Language): string {
  if (language === "zh") {
    return enabled ? "开" : "关";
  }
  return enabled ? "on" : "off";
}

export function openTuiRouteTitle(state: OpenTuiAppState): string {
  switch (state.route.screen) {
    case "main_menu":
      return "KeyLoop";
    case "submenu":
      return submenuTitle(state.route.menu);
    case "settings":
      if (state.route.view === "code_filters") {
        return state.language === "zh" ? "代码语言框架" : "Code language/framework";
      }
      if (state.route.view === "code_difficulty") {
        return state.language === "zh" ? "代码难度" : "Code difficulty";
      }
      if (state.route.view === "code_style") {
        return state.language === "zh" ? "代码风格" : "Code style";
      }
      if (state.route.view === "everyday") {
        return state.language === "zh" ? "日常英语" : "Everyday English";
      }
      if (state.route.view === "word_forms") {
        return state.language === "zh" ? "词形练习" : "Word form practice";
      }
      if (state.route.view === "language") {
        return state.language === "zh" ? "界面语言" : "Interface language";
      }
      return state.language === "zh" ? "设置" : "Settings";
    case "stats":
      return state.language === "zh" ? "统计" : "Stats";
    case "running":
      return state.language === "zh" ? "练习中" : "Running";
    case "exit_confirmation":
      return state.language === "zh" ? "退出确认" : "Exit confirmation";
    case "code_settings_confirmation":
      return state.language === "zh" ? "刷新代码设置" : "Refresh code settings";
    case "practice_options":
      return state.language === "zh" ? "练习选项" : "Practice options";
    case "complete":
      return state.language === "zh" ? "本组完成" : "Lesson complete";
    case "summary":
      return state.language === "zh" ? "今日总结" : "Daily summary";
    case "ansi_palette":
      return state.language === "zh" ? "ANSI 色板" : "ANSI palette";
  }
}

export function openTuiRouteLines(state: OpenTuiAppState): string[] {
  const speedUnit = state.speed_unit ?? "wpm";
  switch (state.route.screen) {
    case "main_menu":
    case "submenu":
      return openTuiMenuItems(state).map((item, index) => `${index + 1}. ${item.label}  ${item.hint}`);
    case "settings":
      if (state.route.view === "menu") {
        return flatSettingsRouteLines(state);
      }
      return settingsRouteLines(state);
    case "stats":
      return statsRouteLines(state.route, state.language, speedUnit);
    case "running":
      return runningRouteLines(state.route, state.language, speedUnit);
    case "exit_confirmation":
      return exitConfirmationLines(state.language);
    case "code_settings_confirmation":
      return codeSettingsConfirmationLines(state.language);
    case "practice_options":
      return state.route.practice_options.items.map((item) => `${item.label}  ${item.value}`);
    case "complete":
      return completionLines(
        state.route.record,
        state.route.next_lesson,
        state.route.source_item,
        state.language,
        speedUnit,
      );
    case "summary":
      return summaryLines(state.route.records, state.language, speedUnit);
    case "ansi_palette":
      return ansiPaletteLines(state.language);
  }
}

function ansiPaletteLines(language: Language): string[] {
  if (language === "zh") {
    return [
      "临时颜色选择辅助",
      "ANSI slots 0-7: black red green yellow blue magenta cyan white",
      "ANSI slots 8-15: brightBlack brightRed brightGreen brightYellow brightBlue brightMagenta brightCyan brightWhite",
      "渲染: KeyLoop 主题色通过 RGBA.fromIndex(slot) 读取终端 ANSI palette",
      "语义: keyword -> magenta | function/property -> blue | type/operator -> cyan | string -> yellow | wrong.bg -> red",
    ];
  }
  return [
    "Temporary color selection aid",
    "ANSI slots 0-7: black red green yellow blue magenta cyan white",
    "ANSI slots 8-15: brightBlack brightRed brightGreen brightYellow brightBlue brightMagenta brightCyan brightWhite",
    "Render: KeyLoop theme colors use RGBA.fromIndex(slot) to read the terminal ANSI palette",
    "Semantics: keyword -> magenta | function/property -> blue | type/operator -> cyan | string -> yellow | wrong.bg -> red",
  ];
}

function runningRouteLines(
  route: Extract<OpenTuiRoute, { screen: "running" }>,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const lines = [
    route.lesson?.module ?? route.source_item,
    route.target.text,
  ];
  if (route.live !== undefined) {
    lines.push(...runningLiveLines(route.live, language, speedUnit));
  }
  if (isStandaloneEverydayWordItem(route.source_item)) {
    lines.push(...everydayMeaningLines(route.target.text, 6));
  }
  return lines;
}

function isStandaloneEverydayWordItem(item: OpenTuiMenuItemId): boolean {
  return (
    item === "everyday_words" ||
    item === "everyday_common_500" ||
    item === "everyday_common_1000" ||
    item === "everyday_common_5000"
  );
}

function runningLiveLines(
  live: OpenTuiRunningLiveState,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const metrics = live.metrics;
  const speedLabel = speedUnitLabel(speedUnit);
  const speed = speedFromWpm(metrics.wpm, speedUnit);
  const rawSpeed = speedFromWpm(metrics.raw_wpm, speedUnit);
  if (language === "zh") {
    return [
      `输入: ${live.input}`,
      `${speedLabel} ${speed.toFixed(1)} | 原始 ${speedLabel} ${rawSpeed.toFixed(1)} | 正确率 ${metrics.accuracy.toFixed(1)}%`,
      `错误 ${metrics.errors} | 退格 ${metrics.backspaces}`,
    ];
  }
  return [
    `Input: ${live.input}`,
    `${speedLabel} ${speed.toFixed(1)} | Raw ${speedLabel} ${rawSpeed.toFixed(1)} | Accuracy ${metrics.accuracy.toFixed(1)}%`,
    `Errors ${metrics.errors} | Backspace ${metrics.backspaces}`,
  ];
}

function exitConfirmationLines(language: Language): string[] {
  if (language === "zh") {
    return [
      "确定要退出当前练习吗？",
      "未完成的当前进度不会保存。",
      "Enter 确认退出 | Esc 返回练习",
    ];
  }
  return [
    "Exit the current practice?",
    "Unfinished progress will not be saved.",
    "Enter confirm exit | Esc return to practice",
  ];
}

function codeSettingsConfirmationLines(language: Language): string[] {
  if (language === "zh") {
    return [
      "更改代码设置会刷新本组",
      "当前输入会被清空。",
      "Enter 确认 | Esc 继续输入",
    ];
  }
  return [
    "Changing code settings will refresh this group",
    "Current input will be cleared.",
    "Enter confirm | Esc keep typing",
  ];
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
    case "settings":
    case "stats":
    case "running":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "complete":
    case "summary":
    case "ansi_palette":
      return state;
  }
}

function activateMainMenuItem(
  state: OpenTuiAppState,
  itemId: OpenTuiMenuItemId,
  context: BuildTargetContext,
): OpenTuiAppState {
  switch (itemId) {
    case "comprehensive": {
      const effectiveContext = buildTargetContextForState(state, context);
      const lesson = buildDailyPracticePlan(effectiveContext).lessons[0];
      return lesson === undefined
        ? state
        : runningState(state.language, itemId, lesson.target, lesson, stateOptions(state));
    }
    case "foundation":
    case "everyday":
    case "programming":
    case "code":
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

function activateSubmenuItem(
  state: OpenTuiAppState,
  itemId: OpenTuiMenuItemId,
  context: BuildTargetContext,
): OpenTuiAppState {
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
    case "my_vocabulary": {
      const vocabularyContext = buildTargetContextForState(
        state,
        context,
        "standalone",
      );
      return runningState(
        state.language,
        itemId,
        buildPersonalVocabularyPracticeTarget(
          vocabularyContext.personalVocabulary ?? [],
          vocabularyContext.records,
          {
            maxItems: vocabularyContext.personalVocabularyLimit ?? 8,
            ...(vocabularyContext.now === undefined
              ? {}
              : { now: vocabularyContext.now }),
          },
        ),
        undefined,
        stateOptions(state),
      );
    }
    case "everyday_mix":
      return runningState(
        state.language,
        itemId,
        buildEverydayPracticeTarget(effectiveContext, "mix"),
        undefined,
        stateOptions(state),
      );
    case "operators_brackets_quotes":
      return runningState(
        state.language,
        itemId,
        buildProgrammingBasicsPracticeTarget(effectiveContext, "operators_brackets_quotes"),
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
        buildProgrammingBasicsMixTarget(effectiveContext),
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

function mainMenuItems(language: Language): OpenTuiMenuItem[] {
  return [
    item("comprehensive", "综合练习", "Full practice", language),
    item("foundation", "基础输入", "Foundation practice", language),
    item("everyday", "日常练习", "Everyday practice", language),
    item("programming", "编程基础", "Programming basics", language),
    item("code", "代码实战", "Code practice", language),
    item("settings", "设置", "Settings", language),
    item("stats", "统计", "Stats", language),
    item("ansi_palette", "调试色板", "ANSI palette", language),
  ];
}

function submenuItems(menu: OpenTuiSubmenu, language: Language): OpenTuiMenuItem[] {
  switch (menu) {
    case "foundation":
      return [
        item("foundation_home_row", "Home Row", "Home Row", language),
        item("foundation_top_row", "Top Row", "Top Row", language),
        item("foundation_bottom_row", "Bottom Row", "Bottom Row", language),
        item("foundation_number_row", "数字行", "Number Row", language),
        item("foundation_symbols", "符号标点", "Symbols and punctuation", language),
        item("foundation_left_hand", "左手专项", "Left hand", language),
        item("foundation_right_hand", "右手专项", "Right hand", language),
        item("foundation_index_fingers", "食指竖向", "Index columns", language),
        item("foundation_middle_fingers", "中指竖向", "Middle columns", language),
        item("foundation_ring_fingers", "无名指竖向", "Ring columns", language),
        item("foundation_pinky_fingers", "小指专项", "Pinky keys", language),
        item("foundation_horizontal_rolls", "横向连打", "Horizontal rolls", language),
        item("foundation_vertical_ladders", "竖向楼梯", "Vertical ladders", language),
        item("foundation_diagonal_crossovers", "斜向过渡", "Diagonal crossovers", language),
        item("foundation_letter_combinations", "字母组合", "Letter combinations", language),
        item("foundation_capitalization", "大小写基础", "Capitalisation", language),
        item("foundation_mix", "基础综合", "Foundation mix", language),
      ];
    case "everyday":
      return [
        item("everyday_words", "单词", "Words", language),
        item("everyday_sentences", "日常句子", "Everyday sentences", language),
        item("everyday_articles", "文章", "Articles", language),
        item("everyday_word_decomposition", "单词拆分", "Word decomposition", language),
        item("everyday_mix", "日常综合", "Everyday mix", language),
      ];
    case "programming":
      return [
        item(
          "operators_brackets_quotes",
          "符号与括号",
          "Operators, brackets, and quotes",
          language,
        ),
        item("programming_terms", "编程常用词", "Programming terms", language),
        item("naming_styles", "命名形式", "Naming styles", language),
        item("technical_long_words", "技术长词", "Technical long words", language),
        item("my_vocabulary", "我的词库", "My vocabulary", language),
        item("programming_basics_mix", "编程基础综合", "Programming basics mix", language),
      ];
    case "code":
      return [
        item("code_blocks", "代码块", "Code blocks", language),
        item("code_functions", "函数块", "Functions", language),
        item("code_file_fragments", "文件片段", "File fragments", language),
        item("code_mix", "代码综合", "Code mix", language),
      ];
  }
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

function item(
  id: OpenTuiMenuItemId,
  labelZh: string,
  labelEn: string,
  language: Language,
): OpenTuiMenuItem {
  return {
    id,
    label: language === "zh" ? labelZh : labelEn,
    hint: language === "zh" ? labelEn : labelZh,
  };
}

function settingsItem(
  id: OpenTuiSettingsMenuItemId,
  view: Exclude<OpenTuiSettingsView, "menu">,
  labelZh: string,
  labelEn: string,
  language: Language,
): OpenTuiSettingsMenuItem {
  return {
    id,
    view,
    label: language === "zh" ? labelZh : labelEn,
    hint: language === "zh" ? labelEn : labelZh,
  };
}

function settingsRouteLines(state: OpenTuiAppState): string[] {
  if (state.route.screen !== "settings") {
    return [];
  }

  if (state.route.view === "language") {
    if (state.language === "zh") {
      return ["1. 中文  当前", "2. English"];
    }
    return ["1. Chinese", "2. English  current"];
  }

  if (state.route.view === "code_filters") {
    const filters = state.codeFilters;
    if (filters === undefined || filters.options.length === 0) {
      return [
        state.language === "zh" ? "搜索  " : "Search  ",
        state.language === "zh" ? "没有可用代码范围" : "No code filters available",
      ];
    }
    const items = openTuiCodeFilterPickerItems(state);
    const searchLine = `${state.language === "zh" ? "搜索" : "Search"}  ${filters.query}`;
    if (items.length === 0) {
      return [
        searchLine,
        state.language === "zh" ? "没有匹配项" : "No matches",
      ];
    }
    return [
      searchLine,
      ...items.map((item) => {
        const marker = item.active ? ">" : " ";
        const selected = item.selected ? "x" : " ";
        const pinned = item.pinned ? "  pinned" : "";
        return `${marker} [${selected}] ${item.option.facet}: ${item.option.value} (${item.option.count})${pinned}`;
      }),
    ];
  }

  if (state.route.view === "code_difficulty") {
    const settings = state.codeSettings ?? defaultCodeSettings();
    return codeDifficultyOptions.map((value, index) => {
      const current = value === settings.difficulty;
      const label = codeDifficultyLabel(value, state.language);
      return `${index + 1}. ${label}${current ? currentSuffix(state.language) : ""}`;
    });
  }

  if (state.route.view === "code_style") {
    const settings = state.codeStyleSettings ?? defaultCodeStyleSettings();
    const selected = Math.min(Math.max(state.route.selected_index ?? 0, 0), 2);
    const lines = state.language === "zh"
      ? [
          `缩进  ${codeIndentLabel(settings, state.language)}`,
          `分号  ${codeSemicolonLabel(settings.semicolons, state.language)}`,
          `引号  ${codeQuoteLabel(settings.quotes, state.language)}`,
        ]
      : [
          `Indent  ${codeIndentLabel(settings, state.language)}`,
          `Semicolons  ${codeSemicolonLabel(settings.semicolons, state.language)}`,
          `Quotes  ${codeQuoteLabel(settings.quotes, state.language)}`,
        ];
    return lines.map((line, index) => `${index === selected ? ">" : " "} ${line}`);
  }

  if (state.route.view === "everyday") {
    const settings = state.everydaySettings ?? defaultEverydaySettings();
    return state.language === "zh"
      ? [
          `词数  ${settings.word_count}`,
          `句长  ${everydayLengthLabel(settings.sentence_length, state.language)}`,
          `短语  ${settings.include_phrases ? "开" : "关"}`,
        ]
      : [
          `Word count  ${settings.word_count}`,
          `Sentence length  ${everydayLengthLabel(settings.sentence_length, state.language)}`,
          `Phrases  ${settings.include_phrases ? "on" : "off"}`,
        ];
  }

  if (state.route.view === "word_forms") {
    const settings = state.wordFormSettings ?? defaultWordFormSettings();
    return state.language === "zh"
      ? [
          `长词每组  ${settings.word_breakdown.max_items_per_group}`,
          `词库每日  ${settings.personal_vocabulary.daily_review_limit}`,
        ]
      : [
          `Breakdown items per group  ${settings.word_breakdown.max_items_per_group}`,
          `Vocabulary daily limit  ${settings.personal_vocabulary.daily_review_limit}`,
        ];
  }

  return openTuiSettingsMenuItems(state.language).map((item, index) => `${index + 1}. ${item.label}`);
}

function codeFormatterLabel(
  value: CodeStyleSettings["formatter"],
  language: Language,
): string {
  if (language === "zh") {
    switch (value) {
      case "auto":
        return "自动";
      case "prettier":
        return "Prettier";
      case "native":
        return "原生工具";
      case "off":
        return "关闭";
    }
  }
  switch (value) {
    case "auto":
      return "Auto";
    case "prettier":
      return "Prettier";
    case "native":
      return "Native";
    case "off":
      return "Off";
  }
}

function codeSemicolonLabel(
  value: CodeStyleSettings["semicolons"],
  language: Language,
): string {
  if (language === "zh") {
    return value === "always" ? "保留/添加" : "移除";
  }
  return value === "always" ? "Always" : "Never";
}

function codeQuoteLabel(value: CodeStyleSettings["quotes"], language: Language): string {
  if (language === "zh") {
    return value === "single" ? "单引号" : "双引号";
  }
  return value === "single" ? "Single" : "Double";
}

function codeTrailingCommaLabel(
  value: CodeStyleSettings["trailing_commas"],
  language: Language,
): string {
  if (language === "zh") {
    switch (value) {
      case "none":
        return "无";
      case "es5":
        return "ES5";
      case "all":
        return "全部";
    }
  }
  switch (value) {
    case "none":
      return "None";
    case "es5":
      return "ES5";
    case "all":
      return "All";
  }
}

function currentSuffix(language: Language): string {
  return language === "zh" ? "  当前" : "  current";
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
  if (
    codeConfig === undefined &&
    codeStyle === undefined &&
    everydaySettings === undefined &&
    wordFormSettings === undefined
  ) {
    return context;
  }
  const personalVocabularyEnabled =
    personalVocabularyScope === "standalone" ||
    (wordFormSettings?.personal_vocabulary.enabled_in_comprehensive ?? true);
  return {
    ...context,
    ...(codeConfig === undefined ? {} : { codeConfig }),
    ...(codeStyle === undefined ? {} : { codeStyle }),
    ...(everydaySettings === undefined ? {} : { everydaySettings }),
    ...(wordFormSettings === undefined
      ? {}
      : {
          wordBreakdownSettings: wordFormSettings.word_breakdown,
          personalVocabulary: personalVocabularyEnabled
            ? context.personalVocabulary
            : [],
          personalVocabularyLimit: personalVocabularyEnabled
            ? wordFormSettings.personal_vocabulary.daily_review_limit
            : 0,
        }),
  };
}

function stateOptions(state: OpenTuiAppState): OpenTuiStateOptions {
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
  if (state.today_elapsed_ms !== undefined) {
    options.todayElapsedMs = state.today_elapsed_ms;
  }
  return options;
}

function defaultEverydaySettings(): EverydayEnglishSettings {
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
  };
}

function defaultCodeSettings(): OpenTuiCodeSettings {
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

function defaultWordFormSettings(): OpenTuiWordFormSettings {
  return {
    word_breakdown: {
      enabled_in_comprehensive: true,
      max_items_per_group: 6,
    },
    personal_vocabulary: {
      enabled_in_comprehensive: true,
      daily_review_limit: 8,
    },
  };
}

function cloneWordFormSettings(
  settings: OpenTuiWordFormSettings,
): OpenTuiWordFormSettings {
  return {
    word_breakdown: { ...settings.word_breakdown },
    personal_vocabulary: { ...settings.personal_vocabulary },
  };
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

function completionLines(
  record: SessionRecord,
  nextLesson: PracticeLesson | undefined,
  sourceItem: OpenTuiMenuItemId,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const speedLabel = speedUnitLabel(speedUnit);
  const speed = speedFromWpm(record.wpm, speedUnit);
  const rawSpeed = speedFromWpm(record.raw_wpm, speedUnit);
  const lines =
    language === "zh"
      ? [
          `模式 ${record.mode} | 模块 ${record.module}`,
          `${speedLabel} ${speed.toFixed(1)} | 原始 ${speedLabel} ${rawSpeed.toFixed(1)} | 正确率 ${record.accuracy.toFixed(1)}%`,
          `错误 ${record.error_count} | 退格 ${record.backspace_count}`,
        ]
      : [
          `Mode ${record.mode} | Module ${record.module}`,
          `${speedLabel} ${speed.toFixed(1)} | Raw ${speedLabel} ${rawSpeed.toFixed(1)} | Accuracy ${record.accuracy.toFixed(1)}%`,
          `Errors ${record.error_count} | Backspace ${record.backspace_count}`,
        ];

  if (isStandaloneCompletion(record, sourceItem)) {
    return lines;
  }

  if (nextLesson === undefined) {
    lines.push(language === "zh" ? "今日综合练习完成" : "Daily plan complete");
  } else {
    lines.push(
      language === "zh"
        ? `下一组: ${nextLesson.module}`
        : `Next: ${nextLesson.module}`,
    );
  }

  return lines;
}

function isStandaloneCompletion(
  record: SessionRecord,
  sourceItem: OpenTuiMenuItemId,
): boolean {
  return record.daily_run_id === "" || sourceItem !== "comprehensive";
}

function summaryLines(records: SessionRecord[], language: Language, speedUnit: SpeedUnit): string[] {
  if (records.length === 0) {
    return [
      language === "zh"
        ? "还没有完成的练习记录。"
        : "No completed sessions yet.",
    ];
  }

  const activeMs = records.reduce((sum, record) => sum + effectiveActiveMs(record), 0);
  const errors = records.reduce((sum, record) => sum + record.error_count, 0);
  const backspaces = records.reduce((sum, record) => sum + record.backspace_count, 0);
  const speed = aggregateSpeed(records, speedUnit);
  const speedLabel = speedUnitLabel(speedUnit);
  const accuracy = weightedAccuracy(records);

  return language === "zh"
    ? [
        `${records.length} 次练习 | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)} | 正确率 ${accuracy.toFixed(1)}%`,
        `错误 ${errors} | 退格 ${backspaces}`,
      ]
    : [
        `${records.length} sessions | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)} | accuracy ${accuracy.toFixed(1)}%`,
        `Errors ${errors} | Backspace ${backspaces}`,
      ];
}

function statsRouteLines(
  route: Extract<OpenTuiRoute, { screen: "stats" }>,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  switch (route.view) {
    case "overview":
      return statsOverviewLines(route.records, 8, language, { speedUnit });
    case "today":
      return route.now === undefined
        ? statsTodayLines(route.records, 8, language, { speedUnit })
        : statsTodayLines(route.records, 8, language, { now: route.now, speedUnit });
    case "comprehensive":
      return statsComprehensiveLines(route.records, 8, language, { speedUnit });
    case "modules":
      return statsModuleLines(route.records, 8, language, { speedUnit });
    case "keys":
      return keyStatsLines(
        route.keyAggregates ?? [],
        route.keyStatsSort ?? "slowest_average",
        8,
        language,
      );
    case "tokens":
      return statsTokenLines(route.records, 8, language);
    case "code":
      return statsCodeLines(route.records, 8, language, { speedUnit });
    case "daily":
      return statsDailyRouteLines(route, language, speedUnit);
  }
}

function statsDailyRouteLines(
  route: Extract<OpenTuiRoute, { screen: "stats" }>,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const dates = statsDatesFromRecords(route.records);
  if (dates.length === 0) {
    return statsDayLines("", 0, 0, [], 0, language, { speedUnit });
  }
  const index = clampIndex(route.dailyIndex ?? 0, dates.length);
  const date = dates[index];
  if (date === undefined) {
    return statsDayLines("", 0, 0, [], 0, language, { speedUnit });
  }
  const dayRecords = route.records.filter(
    (record) => localDateKey(new Date(record.started_at)) === date,
  );
  return statsDayLines(date, index, dates.length, dayRecords, 2, language, { speedUnit });
}

function nextStatsView(view: OpenTuiStatsView): OpenTuiStatsView {
  switch (view) {
    case "overview":
      return "today";
    case "today":
      return "comprehensive";
    case "comprehensive":
      return "modules";
    case "modules":
      return "keys";
    case "keys":
      return "tokens";
    case "tokens":
      return "code";
    case "code":
      return "daily";
    case "daily":
      return "overview";
  }
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(length - 1, 0));
}

function submenuTitle(menu: OpenTuiSubmenu): string {
  switch (menu) {
    case "foundation":
      return "Foundation practice";
    case "everyday":
      return "Everyday practice";
    case "programming":
      return "Programming basics";
    case "code":
      return "Code practice";
  }
}
