import {
  type TrainingModule,
  type CodeFilterPreference,
  type CodePracticeConfig,
  type CodePracticeOption,
  defaultCodeStyleSettings,
  type CodeStyleSettings,
  type EverydayEnglishSettings,
  type EverydaySentenceLength,
  type Language,
  type MainGoal,
  type SpeedUnit,
  type UserPreferences,
  wordAudioVolumePercents,
} from "../../domain/model";
import { codePracticeOptionsForLibrary } from "../../content/library";
import { TRAINING_FORMS } from "../../training/diagnosis";
import { GOAL_WPM_BASELINE } from "../../training/goalPlan";
import {
  createOpenTuiCodeFilterState,
  createOpenTuiSettingsState,
  defaultCodeSettings,
  defaultCustomLibrarySettings,
  defaultEverydaySettings,
  defaultWordAudioSettings,
  defaultWordFormSettings,
  openTuiCodeFilterPickerItems,
  openTuiFlatSettingsItems,
  openTuiSettingsMenuItems,
  selectedFlatSettingsIndex,
  stateOptions,
  type OpenTuiAppState,
  type OpenTuiStateOptions,
  type OpenTuiCodeSettings,
  type OpenTuiFlatSettingsItem,
  type OpenTuiSettingsView,
  type OpenTuiWordFormSettings,
  type OpenTuiYoudaoTtsCredentialStatus,
} from "./appModel";
import type { OpenTuiKeyEvent } from "./kit";
import type { OpenTuiAppKeyResult, OpenTuiAppSessionContext } from "./appSession";
import {
  isMenuDownEvent,
  isMenuUpEvent,
  isSelectEvent,
  numberKeyIndex,
} from "./appSession";

export const everydayWordCounts = [10, 20, 30, 50] as const;
export const everydaySentenceLengths: EverydaySentenceLength[] = [
  "short",
  "medium",
  "long",
  "mixed",
];
export const wordBreakdownMaxItems = [2, 4, 6, 8] as const;
export const personalVocabularyLimits = [4, 8, 12, 16] as const;
export const codeDifficultySettings = [
  "adaptive",
  "all",
  "easy",
  "medium",
  "hard",
] as const satisfies readonly UserPreferences["code_practice"]["difficulty"][];
export const codeLengthSettings = [
  "adaptive",
  "short",
  "medium",
  "long",
] as const satisfies readonly UserPreferences["code_practice"]["length"][];
export const codeIndentOptions = ["space-2", "space-4", "tab"] as const;
export const codeSemicolonStyles = ["always", "never"] as const satisfies readonly CodeStyleSettings["semicolons"][];
export const codeQuoteStyles = ["double", "single"] as const satisfies readonly CodeStyleSettings["quotes"][];
export const speedUnitSettings = ["wpm", "cpm"] as const satisfies readonly SpeedUnit[];
export const codeStyleSettingCount = 3;

export type OpenTuiSettingsRoute = Extract<OpenTuiAppState["route"], { screen: "settings" }>;

export interface OpenTuiSettingsState {
  language: Language;
  route: OpenTuiSettingsRoute;
}

export function settingsViewState(
  language: Language,
  view: Exclude<OpenTuiSettingsView, "menu">,
  appState: OpenTuiAppState,
  context: OpenTuiAppSessionContext,
): OpenTuiAppState {
  switch (view) {
    case "language":
      return createOpenTuiSettingsState(language, "language", {
        codeFilters: appState.codeFilters,
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings,
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings,
        wordAudioSettings: appState.wordAudioSettings,
        customLibrarySettings: appState.customLibrarySettings,
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
    case "code_filters":
      return createOpenTuiSettingsState(language, "code_filters", {
        codeFilters: appState.codeFilters ?? codeFilterStateFromContext(context),
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings,
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings,
        wordAudioSettings: appState.wordAudioSettings,
        customLibrarySettings: appState.customLibrarySettings,
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
    case "everyday":
      return createOpenTuiSettingsState(language, "everyday", {
        codeFilters: appState.codeFilters,
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings,
        everydaySettings: appState.everydaySettings ?? everydaySettingsFromContext(context),
        wordFormSettings: appState.wordFormSettings,
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
    case "word_forms":
      return createOpenTuiSettingsState(language, "word_forms", {
        codeFilters: appState.codeFilters,
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings,
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings ?? wordFormSettingsFromContext(context),
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
    case "code_difficulty":
      return createOpenTuiSettingsState(language, "code_difficulty", {
        codeFilters: appState.codeFilters,
        codeSettings: appState.codeSettings ?? codeSettingsFromContext(context),
        codeStyleSettings: appState.codeStyleSettings,
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings,
        wordAudioSettings: appState.wordAudioSettings,
        customLibrarySettings: appState.customLibrarySettings,
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
    case "code_style":
      return createOpenTuiSettingsState(language, "code_style", {
        codeFilters: appState.codeFilters,
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings ?? codeStyleSettingsFromContext(context),
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings,
        wordAudioSettings: appState.wordAudioSettings,
        customLibrarySettings: appState.customLibrarySettings,
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
    case "youdao_tts":
      return {
        ...createOpenTuiSettingsState(language, "youdao_tts", {
          codeFilters: appState.codeFilters,
          codeSettings: appState.codeSettings,
          codeStyleSettings: appState.codeStyleSettings,
          everydaySettings: appState.everydaySettings,
          wordFormSettings: appState.wordFormSettings,
          wordAudioSettings: appState.wordAudioSettings,
          customLibrarySettings: appState.customLibrarySettings,
          speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
          youdaoTtsCredentialStatus:
            appState.youdaoTtsCredentialStatus ?? youdaoTtsCredentialStatusFromContext(context),
        }),
        route: {
          screen: "settings",
          view: "youdao_tts",
          selected_index: 0,
          youdao_app_key_input: "",
          youdao_app_secret_input: "",
        },
      };
  }
}

export function settingsRootState(
  state: OpenTuiAppState,
  context: OpenTuiAppSessionContext,
  selectedIndex = 0,
): OpenTuiAppState {
  const nextState = createOpenTuiSettingsState(state.language, "menu", {
    codeFilters: state.codeFilters ?? codeFilterStateFromContext(context),
    codeSettings: state.codeSettings ?? codeSettingsFromContext(context),
    codeStyleSettings: state.codeStyleSettings ?? codeStyleSettingsFromContext(context),
    everydaySettings: state.everydaySettings ?? everydaySettingsFromContext(context),
    wordFormSettings: state.wordFormSettings ?? wordFormSettingsFromContext(context),
    wordAudioSettings: state.wordAudioSettings ?? wordAudioSettingsFromContext(context),
    customLibrarySettings: state.customLibrarySettings ?? customLibrarySettingsFromContext(context),
    speedUnit: state.speed_unit ?? speedUnitFromContext(context),
    youdaoTtsCredentialStatus:
      state.youdaoTtsCredentialStatus ?? youdaoTtsCredentialStatusFromContext(context),
    todayElapsedMs: state.today_elapsed_ms,
  });
  return {
    ...nextState,
    route: {
      screen: "settings",
      view: "menu",
      selected_index: selectedIndex,
    },
  };
}

export function settingsMenuIndexForView(
  state: OpenTuiAppState,
  view: OpenTuiSettingsView,
): number {
  const kind = flatSettingsKindForView(view);
  if (kind === undefined) {
    return 0;
  }
  const index = openTuiFlatSettingsItems(state).findIndex((item) => item.kind === kind);
  return index === -1 ? 0 : index;
}

export function flatSettingsKindForView(
  view: OpenTuiSettingsView,
): OpenTuiFlatSettingsItem["kind"] | undefined {
  switch (view) {
    case "menu":
      return undefined;
    case "language":
      return "language";
    case "code_filters":
      return "code_filters";
    case "code_difficulty":
      return "code_difficulty";
    case "code_style":
      return "code_indent";
    case "everyday":
      return undefined;
    case "word_forms":
      return undefined;
    case "youdao_tts":
      return "youdao_tts";
  }
}

export function reduceSettingsKey(
  state: OpenTuiSettingsState,
  appState: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const index = numberKeyIndex(event);

  if (state.route.view === "menu") {
    return reduceFlatSettingsKey(appState, event, context);
  }

  if (state.route.view === "language" && index === 0) {
    return {
      state: createOpenTuiSettingsState("zh", "language", {
        codeFilters: appState.codeFilters,
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings,
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings,
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      }),
      action: "continue",
    };
  }
  if (state.route.view === "language" && index === 1) {
    return {
      state: createOpenTuiSettingsState("en", "language", {
        codeFilters: appState.codeFilters,
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings,
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings,
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      }),
      action: "continue",
    };
  }

  if (state.route.view === "code_filters") {
    return reduceCodeFilterSettingsKey(appState, event, context);
  }

  if (state.route.view === "code_difficulty") {
    return reduceCodeDifficultySettingsKey(appState, event, context);
  }

  if (state.route.view === "code_style") {
    return reduceCodeStyleSettingsKey(appState, event, context);
  }

  if (state.route.view === "everyday") {
    return reduceEverydaySettingsKey(appState, event, context);
  }

  if (state.route.view === "word_forms") {
    return reduceWordFormSettingsKey(appState, event, context);
  }

  if (state.route.view === "youdao_tts") {
    return reduceYoudaoTtsSettingsKey(appState, event, context);
  }

  return { state: appState, action: "continue" };
}

export function reduceFlatSettingsKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const items = openTuiFlatSettingsItems(state);
  if (items.length === 0) {
    return { state, action: "continue" };
  }
  const selected = selectedFlatSettingsIndex(state, items.length);
  const index = numberKeyIndex(event);
  if (index !== undefined) {
    return {
      state: flatSettingsSelectionState(state, Math.min(index, items.length - 1)),
      action: "continue",
    };
  }
  if (isMenuDownEvent(event)) {
    return {
      state: flatSettingsSelectionState(state, (selected + 1) % items.length),
      action: "continue",
    };
  }
  if (isMenuUpEvent(event)) {
    return {
      state: flatSettingsSelectionState(
        state,
        (selected - 1 + items.length) % items.length,
      ),
      action: "continue",
    };
  }

  const item = items[selected];
  if (item === undefined) {
    return { state, action: "continue" };
  }
  if ((item.kind === "code_filters" || item.kind === "youdao_tts") && isSelectEvent(event)) {
    return {
      state: settingsViewState(state.language, item.kind, state, context),
      action: "continue",
    };
  }
  const direction = settingsCycleDirection(event);
  if (direction === undefined) {
    return { state, action: "continue" };
  }
  if (item.kind === "code_filters") {
    return direction === 1
      ? {
          state: settingsViewState(state.language, "code_filters", state, context),
          action: "continue",
        }
      : { state, action: "continue" };
  }
  if (item.kind === "youdao_tts") {
    return direction === 1
      ? {
          state: settingsViewState(state.language, "youdao_tts", state, context),
          action: "continue",
        }
      : { state, action: "continue" };
  }
  return reduceFlatSettingsItem(state, item, selected, direction, context);
}

export function reduceFlatSettingsItem(
  state: OpenTuiAppState,
  item: OpenTuiFlatSettingsItem,
  selectedIndex: number,
  direction: -1 | 1,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const codeSettings = state.codeSettings ?? codeSettingsFromContext(context);
  const codeStyleSettings = state.codeStyleSettings ?? codeStyleSettingsFromContext(context);
  const wordAudioSettings = state.wordAudioSettings ?? wordAudioSettingsFromContext(context);
  switch (item.kind) {
    case "language": {
      const language = cycleStringOption(["zh", "en"] as const, state.language, direction);
      return flatSettingsResult(language, state, selectedIndex);
    }
    case "speed_unit":
      return flatSettingsResult(state.language, state, selectedIndex, {
        speedUnit: cycleStringOption(
          speedUnitSettings,
          state.speed_unit ?? speedUnitFromContext(context),
          direction,
        ),
      });
    case "code_difficulty":
      return flatSettingsResult(state.language, state, selectedIndex, {
        codeSettings: {
          difficulty: cycleStringOption(
            codeDifficultySettings,
            codeSettings.difficulty,
            direction,
          ),
          length: codeSettings.length,
        },
      });
    case "code_length":
      return flatSettingsResult(state.language, state, selectedIndex, {
        codeSettings: {
          difficulty: codeSettings.difficulty,
          length: cycleStringOption(codeLengthSettings, codeSettings.length, direction),
        },
      });
    case "code_indent":
      return flatSettingsResult(state.language, state, selectedIndex, {
        codeStyleSettings: cycleCodeStyleSetting(codeStyleSettings, 0, direction),
      });
    case "code_semicolons":
      return flatSettingsResult(state.language, state, selectedIndex, {
        codeStyleSettings: cycleCodeStyleSetting(codeStyleSettings, 1, direction),
      });
    case "code_quotes":
      return flatSettingsResult(state.language, state, selectedIndex, {
        codeStyleSettings: cycleCodeStyleSetting(codeStyleSettings, 2, direction),
      });
    case "word_audio":
      return flatSettingsResult(state.language, state, selectedIndex, {
        wordAudioSettings: {
          ...wordAudioSettings,
          enabled: !wordAudioSettings.enabled,
        },
      });
    case "word_audio_volume":
      return flatSettingsResult(state.language, state, selectedIndex, {
        wordAudioSettings: {
          ...wordAudioSettings,
          volume_percent: cycleNumberOption(
            wordAudioVolumePercents,
            wordAudioSettings.volume_percent,
            direction,
          ),
        },
      });
    case "module_foundation":
      return flatSettingsResult(state.language, state, selectedIndex, {
        enabledModules: toggleEnabledModule(state, "foundation_input"),
      });
    case "module_everyday":
      return flatSettingsResult(state.language, state, selectedIndex, {
        enabledModules: toggleEnabledModule(state, "everyday_english"),
      });
    case "module_programming":
      return flatSettingsResult(state.language, state, selectedIndex, {
        enabledModules: toggleEnabledModule(state, "programming_basics"),
      });
    case "module_code":
      return flatSettingsResult(state.language, state, selectedIndex, {
        enabledModules: toggleEnabledModule(state, "code_practice"),
      });
    case "goal_enabled": {
      if (state.mainGoal !== undefined) {
        return flatSettingsResult(state.language, state, selectedIndex, {
          mainGoal: undefined,
        });
      }
      return flatSettingsResult(state.language, state, selectedIndex, {
        mainGoal: defaultMainGoal(context.now ?? new Date()),
      });
    }
    case "goal_form": {
      if (state.mainGoal === undefined) {
        return { state, action: "continue" };
      }
      const form = cycleStringOption(TRAINING_FORMS, state.mainGoal.form, direction);
      return flatSettingsResult(state.language, state, selectedIndex, {
        mainGoal: {
          ...state.mainGoal,
          form,
          target_wpm: GOAL_WPM_BASELINE[form],
          created_at: (context.now ?? new Date()).toISOString(),
        },
      });
    }
    case "goal_target_wpm": {
      if (state.mainGoal === undefined) {
        return { state, action: "continue" };
      }
      return flatSettingsResult(state.language, state, selectedIndex, {
        mainGoal: {
          ...state.mainGoal,
          target_wpm: clampGoalTargetWpm(state.mainGoal.target_wpm + direction * GOAL_WPM_STEP),
        },
      });
    }
    case "goal_deadline": {
      if (state.mainGoal === undefined) {
        return { state, action: "continue" };
      }
      return flatSettingsResult(state.language, state, selectedIndex, {
        mainGoal: {
          ...state.mainGoal,
          deadline: cycleGoalDeadline(
            state.mainGoal.deadline,
            context.now ?? new Date(),
            direction,
          ),
        },
      });
    }
    case "code_filters":
    case "youdao_tts":
    case "dictionary_status":
      return { state, action: "continue" };
  }
}

const allPracticeModules: TrainingModule[] = [
  "foundation_input",
  "everyday_english",
  "programming_basics",
  "code_practice",
];

/** 切换科目开关；至少保留一个启用 */
function toggleEnabledModule(
  state: OpenTuiAppState,
  module: TrainingModule,
): TrainingModule[] {
  const enabled = state.enabledModules ?? [...allPracticeModules];
  if (enabled.includes(module)) {
    const next = enabled.filter((item) => item !== module);
    return next.length === 0 ? enabled : next;
  }
  return allPracticeModules.filter(
    (item) => enabled.includes(item) || item === module,
  );
}

const GOAL_WPM_STEP = 5;
const GOAL_WPM_MIN = 10;
const GOAL_WPM_MAX = 200;
const GOAL_DEADLINE_DAY_PRESETS = [30, 60, 90, 120, 180, 365] as const;
const GOAL_DAY_MS = 86_400_000;

/** 开启目标时的默认目标：代码形态、基线速度、now+90 天期限、锚定 now */
function defaultMainGoal(now: Date): MainGoal {
  return {
    form: "code",
    target_wpm: GOAL_WPM_BASELINE.code,
    deadline: addGoalDays(now, 90),
    created_at: now.toISOString(),
  };
}

function clampGoalTargetWpm(value: number): number {
  return Math.min(GOAL_WPM_MAX, Math.max(GOAL_WPM_MIN, value));
}

function addGoalDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * GOAL_DAY_MS).toISOString().slice(0, 10);
}

/** 按天数档位循环期限：从当前剩余天数找最近档位，±1 切换，换算回绝对日期 */
function cycleGoalDeadline(deadline: string, now: Date, direction: -1 | 1): string {
  const daysLeft = Math.round((Date.parse(deadline) - now.getTime()) / GOAL_DAY_MS);
  const nextDays = cycleNumberOption(GOAL_DEADLINE_DAY_PRESETS, daysLeft, direction);
  return addGoalDays(now, nextDays);
}

export function flatSettingsResult(
  language: Language,
  state: OpenTuiAppState,
  selectedIndex: number,
  overrides: OpenTuiStateOptions = {},
): OpenTuiAppKeyResult {
  const options = flatSettingsOptions(state, overrides);
  const nextState = createOpenTuiSettingsState(language, "menu", options);
  const itemCount = openTuiFlatSettingsItems(nextState).length;
  return {
    state: flatSettingsSelectionState(
      nextState,
      Math.min(selectedIndex, Math.max(itemCount - 1, 0)),
    ),
    action: "continue",
  };
}

export function flatSettingsOptions(
  state: OpenTuiAppState,
  overrides: OpenTuiStateOptions,
): OpenTuiStateOptions {
  const options: OpenTuiStateOptions = {};
  const codeFilters = overrides.codeFilters ?? state.codeFilters;
  const codeSettings = overrides.codeSettings ?? state.codeSettings;
  const codeStyleSettings = overrides.codeStyleSettings ?? state.codeStyleSettings;
  const everydaySettings = overrides.everydaySettings ?? state.everydaySettings;
  const wordFormSettings = overrides.wordFormSettings ?? state.wordFormSettings;
  const wordAudioSettings = overrides.wordAudioSettings ?? state.wordAudioSettings;
  const customLibrarySettings =
    overrides.customLibrarySettings ?? state.customLibrarySettings;
  const speedUnit = overrides.speedUnit ?? state.speed_unit;
  const todayElapsedMs = overrides.todayElapsedMs ?? state.today_elapsed_ms;
  const enabledModules = overrides.enabledModules ?? state.enabledModules;
  // mainGoal 可被显式清除（关闭目标 → undefined），故用 "in" 判断而非 ?? 合并
  const mainGoal = "mainGoal" in overrides ? overrides.mainGoal : state.mainGoal;
  if (codeFilters !== undefined) {
    options.codeFilters = codeFilters;
  }
  if (codeSettings !== undefined) {
    options.codeSettings = codeSettings;
  }
  if (codeStyleSettings !== undefined) {
    options.codeStyleSettings = codeStyleSettings;
  }
  if (everydaySettings !== undefined) {
    options.everydaySettings = everydaySettings;
  }
  if (wordFormSettings !== undefined) {
    options.wordFormSettings = wordFormSettings;
  }
  if (wordAudioSettings !== undefined) {
    options.wordAudioSettings = wordAudioSettings;
  }
  if (customLibrarySettings !== undefined) {
    options.customLibrarySettings = customLibrarySettings;
  }
  if (speedUnit !== undefined) {
    options.speedUnit = speedUnit;
  }
  if (todayElapsedMs !== undefined) {
    options.todayElapsedMs = todayElapsedMs;
  }
  if (enabledModules !== undefined) {
    options.enabledModules = enabledModules;
  }
  if (mainGoal !== undefined) {
    options.mainGoal = mainGoal;
  }
  return options;
}

export function flatSettingsSelectionState(
  state: OpenTuiAppState,
  selectedIndex: number,
): OpenTuiAppState {
  if (state.route.screen !== "settings" || state.route.view !== "menu") {
    return state;
  }
  const itemCount = openTuiFlatSettingsItems(state).length;
  return {
    ...state,
    route: {
      screen: "settings",
      view: "menu",
      selected_index: Math.min(
        Math.max(Math.trunc(selectedIndex), 0),
        Math.max(itemCount - 1, 0),
      ),
    },
  };
}

export function settingsCycleDirection(event: OpenTuiKeyEvent): -1 | 1 | undefined {
  if (event.ctrl || event.meta) {
    return undefined;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  if (name === "left" || sequence === "left" || sequence === "h" || sequence === "-") {
    return -1;
  }
  if (
    name === "right" ||
    sequence === "right" ||
    sequence === "l" ||
    sequence === "n" ||
    sequence === "+" ||
    sequence === "=" ||
    isSelectEvent(event)
  ) {
    return 1;
  }
  return undefined;
}

export function settingsSearchInput(event: OpenTuiKeyEvent): string | "backspace" | undefined {
  if (event.ctrl || event.meta) {
    return undefined;
  }
  const name = event.name.toLowerCase();
  if (name === "backspace" || name === "delete") {
    return "backspace";
  }
  if (event.sequence.length === 1 && event.sequence >= " " && event.sequence !== "\x7f") {
    return event.sequence;
  }
  return undefined;
}

export function isFocusedCodeFilterSearchInput(state: OpenTuiAppState): boolean {
  return state.route.screen === "settings" && state.route.view === "code_filters";
}

export function reduceYoudaoTtsSettingsKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  if (state.route.screen !== "settings" || state.route.view !== "youdao_tts") {
    return { state, action: "continue" };
  }
  const selected = Math.min(Math.max(state.route.selected_index ?? 0, 0), 3);
  const input = youdaoSettingsInput(event);
  if (input !== undefined && selected <= 1) {
    const field = selected === 0 ? "youdao_app_key_input" : "youdao_app_secret_input";
    const current = state.route[field] ?? "";
    const nextValue =
      input === "backspace" ? Array.from(current).slice(0, -1).join("") : current + input;
    const { youdao_message: _message, ...routeWithoutMessage } = state.route;
    return {
      state: {
        ...state,
        route: {
          ...routeWithoutMessage,
          [field]: nextValue,
        },
      },
      action: "continue",
    };
  }
  if (isMenuDownEvent(event)) {
    return { state: youdaoTtsSettingsState(state, (selected + 1) % 4), action: "continue" };
  }
  if (isMenuUpEvent(event)) {
    return { state: youdaoTtsSettingsState(state, (selected - 1 + 4) % 4), action: "continue" };
  }
  const index = numberKeyIndex(event);
  if (index !== undefined && index < 4) {
    return { state: youdaoTtsSettingsState(state, index), action: "continue" };
  }
  if (isSelectEvent(event)) {
    if (selected === 2) {
      const appKey = (state.route.youdao_app_key_input ?? "").trim();
      const appSecret = (state.route.youdao_app_secret_input ?? "").trim();
      if (appKey === "" || appSecret === "") {
        return {
          state: youdaoTtsSettingsState(
            state,
            selected,
            state.language === "zh" ? "请填写 App Key 和 App Secret" : "Enter both App Key and App Secret",
          ),
          action: "continue",
        };
      }
      return {
        state: {
          ...youdaoTtsSettingsState(
            state,
            selected,
            state.language === "zh" ? "已保存到钥匙串" : "Saved to Keychain",
          ),
          youdaoTtsCredentialStatus: "keychain",
        },
        action: "continue",
        persist: {
          kind: "save_youdao_credentials",
          credentials: { appKey, appSecret },
        },
      };
    }
    if (selected === 3) {
      return {
        state: {
          ...youdaoTtsSettingsState(
            state,
            selected,
            state.language === "zh" ? "已清除钥匙串配置" : "Cleared Keychain credentials",
          ),
          youdaoTtsCredentialStatus: "none",
        },
        action: "continue",
        persist: { kind: "clear_youdao_credentials" },
      };
    }
  }
  return { state, action: "continue" };
}

function youdaoTtsSettingsState(
  state: OpenTuiAppState,
  selectedIndex: number,
  message?: string,
): OpenTuiAppState {
  if (state.route.screen !== "settings" || state.route.view !== "youdao_tts") {
    return state;
  }
  const nextRoute: OpenTuiSettingsRoute = {
    ...state.route,
    selected_index: selectedIndex,
  };
  if (message !== undefined) {
    nextRoute.youdao_message = message;
  } else if (state.route.youdao_message !== undefined) {
    nextRoute.youdao_message = state.route.youdao_message;
  }
  return {
    ...state,
    route: nextRoute,
  };
}

function youdaoSettingsInput(event: OpenTuiKeyEvent): string | "backspace" | undefined {
  if (event.ctrl || event.meta) {
    return undefined;
  }
  const name = event.name.toLowerCase();
  if (name === "backspace" || name === "delete") {
    return "backspace";
  }
  if (name === "paste") {
    return event.sequence.replace(/\s+/gu, "");
  }
  if (event.sequence.length === 1 && event.sequence >= " " && event.sequence !== "\x7f") {
    return event.sequence;
  }
  return undefined;
}

export function reduceWordFormSettingsKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const settings = state.wordFormSettings ?? wordFormSettingsFromContext(context);
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  if (name === "left" || sequence === "h" || sequence === "-") {
    return wordFormSettingsResult(state.language, state, {
      ...settings,
      word_breakdown: {
        ...settings.word_breakdown,
        max_items_per_group: cycleNumberOption(
          wordBreakdownMaxItems,
          settings.word_breakdown.max_items_per_group,
          -1,
        ),
      },
    });
  }
  if (
    name === "right" ||
    sequence === "l" ||
    sequence === "n" ||
    sequence === "+" ||
    sequence === "="
  ) {
    return wordFormSettingsResult(state.language, state, {
      ...settings,
      word_breakdown: {
        ...settings.word_breakdown,
        max_items_per_group: cycleNumberOption(
          wordBreakdownMaxItems,
          settings.word_breakdown.max_items_per_group,
          1,
        ),
      },
    });
  }

  return wordFormSettingsResult(state.language, state, settings);
}

export function wordFormSettingsResult(
  language: Language,
  state: OpenTuiAppState,
  settings: OpenTuiWordFormSettings,
): OpenTuiAppKeyResult {
  return {
    state: createOpenTuiSettingsState(language, "word_forms", {
      ...stateOptions(state),
      wordFormSettings: settings,
    }),
    action: "continue",
  };
}

export function reduceEverydaySettingsKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const settings = state.everydaySettings ?? everydaySettingsFromContext(context);
  const index = numberKeyIndex(event);
  if (index !== undefined && index >= 0 && index < everydaySentenceLengths.length) {
    return everydaySettingsResult(state.language, state, {
      ...settings,
      sentence_length: everydaySentenceLengths[index] ?? settings.sentence_length,
    });
  }

  if (isSelectEvent(event)) {
    return everydaySettingsResult(state.language, state, {
      ...settings,
      include_phrases: !settings.include_phrases,
    });
  }

  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  if (name === "left" || sequence === "h" || sequence === "-") {
    return everydaySettingsResult(state.language, state, {
      ...settings,
      word_count: cycleEverydayWordCount(settings.word_count, -1),
    });
  }
  if (
    name === "right" ||
    sequence === "l" ||
    sequence === "n" ||
    sequence === "+" ||
    sequence === "="
  ) {
    return everydaySettingsResult(state.language, state, {
      ...settings,
      word_count: cycleEverydayWordCount(settings.word_count, 1),
    });
  }

  return everydaySettingsResult(state.language, state, settings);
}

export function reduceCodeDifficultySettingsKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const settings = state.codeSettings ?? codeSettingsFromContext(context);
  const index = numberKeyIndex(event);
  if (index !== undefined && index >= 0 && index < codeDifficultySettings.length) {
    return codeDifficultySettingsResult(state.language, state, {
      difficulty: codeDifficultySettings[index] ?? settings.difficulty,
      length: settings.length,
    });
  }
  return codeDifficultySettingsResult(state.language, state, settings);
}

export function codeDifficultySettingsResult(
  language: Language,
  state: OpenTuiAppState,
  settings: OpenTuiCodeSettings,
): OpenTuiAppKeyResult {
  return {
    state: createOpenTuiSettingsState(language, "code_difficulty", {
      ...stateOptions(state),
      codeSettings: settings,
    }),
    action: "continue",
  };
}

export function reduceCodeStyleSettingsKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const settings = state.codeStyleSettings ?? codeStyleSettingsFromContext(context);
  const selected = codeStyleSelectedIndex(state);
  const index = numberKeyIndex(event);
  if (index !== undefined && index >= 0 && index < codeStyleSettingCount) {
    return codeStyleSettingsResult(
      state.language,
      state,
      cycleCodeStyleSetting(settings, index, 1),
      index,
    );
  }

  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  if (name === "down" || sequence === "j") {
    return codeStyleSettingsResult(
      state.language,
      state,
      settings,
      Math.min(selected + 1, codeStyleSettingCount - 1),
    );
  }
  if (name === "up" || sequence === "k") {
    return codeStyleSettingsResult(state.language, state, settings, Math.max(selected - 1, 0));
  }
  if (name === "left" || sequence === "h" || sequence === "-") {
    return codeStyleSettingsResult(
      state.language,
      state,
      cycleCodeStyleSetting(settings, selected, -1),
      selected,
    );
  }
  if (
    name === "right" ||
    sequence === "l" ||
    sequence === "n" ||
    sequence === "+" ||
    sequence === "=" ||
    isSelectEvent(event)
  ) {
    return codeStyleSettingsResult(
      state.language,
      state,
      cycleCodeStyleSetting(settings, selected, 1),
      selected,
    );
  }

  return codeStyleSettingsResult(state.language, state, settings, selected);
}

export function codeStyleSettingsResult(
  language: Language,
  state: OpenTuiAppState,
  settings: CodeStyleSettings,
  selectedIndex: number,
): OpenTuiAppKeyResult {
  const nextState = createOpenTuiSettingsState(language, "code_style", {
    ...stateOptions(state),
    codeStyleSettings: settings,
  });
  return {
    state: {
      ...nextState,
      route: {
        screen: "settings",
        view: "code_style",
        selected_index: Math.min(Math.max(selectedIndex, 0), codeStyleSettingCount - 1),
      },
    },
    action: "continue",
  };
}

export function codeStyleSelectedIndex(state: OpenTuiAppState): number {
  if (state.route.screen !== "settings" || state.route.view !== "code_style") {
    return 0;
  }
  return Math.min(Math.max(state.route.selected_index ?? 0, 0), codeStyleSettingCount - 1);
}

export function cycleCodeStyleSetting(
  settings: CodeStyleSettings,
  index: number,
  direction: -1 | 1,
): CodeStyleSettings {
  switch (index) {
    case 0:
      return codeStyleWithIndentOption(settings, cycleStringOption(codeIndentOptions, codeIndentOption(settings), direction));
    case 1:
      return {
        ...settings,
        semicolons: cycleStringOption(codeSemicolonStyles, settings.semicolons, direction),
      };
    case 2:
      return {
        ...settings,
        quotes: cycleStringOption(codeQuoteStyles, settings.quotes, direction),
      };
    default:
      return settings;
  }
}

export function codeIndentOption(settings: CodeStyleSettings): (typeof codeIndentOptions)[number] {
  if (settings.indent_style === "tab") {
    return "tab";
  }
  return settings.indent_width === 4 ? "space-4" : "space-2";
}

export function codeStyleWithIndentOption(
  settings: CodeStyleSettings,
  option: (typeof codeIndentOptions)[number],
): CodeStyleSettings {
  switch (option) {
    case "tab":
      return { ...settings, indent_style: "tab" };
    case "space-4":
      return { ...settings, indent_style: "space", indent_width: 4 };
    case "space-2":
      return { ...settings, indent_style: "space", indent_width: 2 };
  }
}

export function cycleStringOption<const T extends readonly string[]>(
  values: T,
  current: T[number],
  direction: -1 | 1,
): T[number] {
  const index = values.findIndex((value) => value === current);
  const currentIndex = index === -1 ? 0 : index;
  const next = (currentIndex + direction + values.length) % values.length;
  return values[next] ?? current;
}

export function everydaySettingsResult(
  language: Language,
  state: OpenTuiAppState,
  settings: EverydayEnglishSettings,
): OpenTuiAppKeyResult {
  return {
    state: createOpenTuiSettingsState(language, "everyday", {
      ...stateOptions(state),
      everydaySettings: settings,
    }),
    action: "continue",
  };
}

export function everydaySettingsFromContext(
  context: OpenTuiAppSessionContext,
): EverydayEnglishSettings {
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

export function cycleEverydayWordCount(
  current: EverydayEnglishSettings["word_count"],
  direction: -1 | 1,
): EverydayEnglishSettings["word_count"] {
  return cycleNumberOption(everydayWordCounts, current, direction);
}

export function cycleNumberOption<const T extends readonly number[]>(
  values: T,
  current: number,
  direction: -1 | 1,
): T[number] {
  if (values.length === 0) {
    throw new Error("cycleNumberOption requires at least one value");
  }
  const index = values.findIndex((value) => value === current);
  const currentIndex = index === -1 ? Math.min(2, values.length - 1) : index;
  const next = (currentIndex + direction + values.length) % values.length;
  return values[next] ?? values[currentIndex] ?? values[0]!;
}

export function reduceCodeFilterSettingsKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const filters = state.codeFilters ?? codeFilterStateFromContext(context);
  if (filters.options.length === 0) {
    return {
      state: codeFilterPickerState(state, filters),
      action: "continue",
    };
  }

  if (isCodeFilterPickerDownEvent(event)) {
    return moveCodeFilterPickerSelection(state, filters, 1);
  }
  if (isCodeFilterPickerUpEvent(event)) {
    return moveCodeFilterPickerSelection(state, filters, -1);
  }
  if (isCodeFilterPickerPinEvent(event)) {
    return toggleCodeFilterPickerPin(state, filters);
  }

  const selectionAction = codeFilterPickerSelectionAction(event);
  if (selectionAction !== undefined) {
    return setCodeFilterPickerSelection(state, filters, selectionAction);
  }

  const input = settingsSearchInput(event);
  if (input !== undefined) {
    return codeFilterPickerSearchResult(state, filters, input);
  }

  return {
    state: codeFilterPickerState(state, filters),
    action: "continue",
  };
}

export function codeFilterPickerSearchResult(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
  input: string | "backspace",
): OpenTuiAppKeyResult {
  const query =
    input === "backspace" ? Array.from(filters.query).slice(0, -1).join("") : filters.query + input;
  const nextFilters = createOpenTuiCodeFilterState({
    options: filters.options,
    selected: filters.selected,
    pinned: filters.pinned,
    index: filters.index,
    query,
  });
  const items = openTuiCodeFilterPickerItems(codeFilterPickerState(state, nextFilters));
  const currentVisible = items.some((item) => item.optionIndex === nextFilters.index);
  return codeFilterSettingsResult(state, nextFilters, {
    index: currentVisible ? nextFilters.index : items[0]?.optionIndex,
  });
}

export function moveCodeFilterPickerSelection(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
  direction: -1 | 1,
): OpenTuiAppKeyResult {
  const items = openTuiCodeFilterPickerItems(codeFilterPickerState(state, filters));
  if (items.length === 0) {
    return codeFilterSettingsResult(state, filters, {});
  }
  const activeIndex = Math.max(
    items.findIndex((item) => item.active),
    0,
  );
  const nextItem = items[(activeIndex + direction + items.length) % items.length];
  return codeFilterSettingsResult(state, filters, { index: nextItem?.optionIndex });
}

export function setCodeFilterPickerSelection(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
  action: "select" | "deselect" | "toggle",
): OpenTuiAppKeyResult {
  const item = activeCodeFilterPickerItem(state, filters);
  if (item === undefined) {
    return codeFilterSettingsResult(state, filters, {});
  }
  const preference = codeFilterPreferenceFromOption(item.option);
  const isSelected = hasCodeFilterPreference(filters.selected, preference);
  const selected =
    action === "select"
      ? isSelected
        ? filters.selected
        : [...filters.selected, preference]
      : action === "deselect" || isSelected
        ? filters.selected.filter((candidate) => !codeFilterPreferencesEqual(candidate, preference))
        : [...filters.selected, preference];
  return codeFilterSettingsResult(state, filters, {
    selected,
    index: item.optionIndex,
  });
}

export function isCodeFilterPickerPinEvent(event: OpenTuiKeyEvent): boolean {
  if (!event.ctrl || event.meta) {
    return false;
  }
  return event.name.toLowerCase() === "p" || event.sequence === "\x10";
}

export function toggleCodeFilterPickerPin(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
): OpenTuiAppKeyResult {
  const item = activeCodeFilterPickerItem(state, filters);
  if (item === undefined) {
    return codeFilterSettingsResult(state, filters, {});
  }
  const preference = codeFilterPreferenceFromOption(item.option);
  const pinned = hasCodeFilterPreference(filters.pinned, preference)
    ? filters.pinned.filter((candidate) => !codeFilterPreferencesEqual(candidate, preference))
    : [...filters.pinned, preference];
  return codeFilterSettingsResult(state, filters, {
    pinned,
    active: preference,
  });
}

export function activeCodeFilterPickerItem(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
): ReturnType<typeof openTuiCodeFilterPickerItems>[number] | undefined {
  const items = openTuiCodeFilterPickerItems(codeFilterPickerState(state, filters));
  return items.find((item) => item.active) ?? items[0];
}

export function codeFilterPickerSelectionAction(
  event: OpenTuiKeyEvent,
): "select" | "deselect" | "toggle" | undefined {
  if (event.ctrl || event.meta) {
    return undefined;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  if (name === "left" || sequence === "left") {
    return "deselect";
  }
  if (name === "space" || event.sequence === " ") {
    return "toggle";
  }
  if (name === "right" || sequence === "right" || isSelectEvent(event)) {
    return "select";
  }
  return undefined;
}

export function isCodeFilterPickerDownEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  return name === "down" || sequence === "down";
}

export function isCodeFilterPickerUpEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  return name === "up" || sequence === "up";
}

export function codeFilterPickerState(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
): OpenTuiAppState {
  return createOpenTuiSettingsState(state.language, "code_filters", { ...stateOptions(state), codeFilters: filters });
}

export function codeFilterSettingsResult(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
  overrides: {
    selected?: CodeFilterPreference[];
    pinned?: CodeFilterPreference[];
    index?: number | undefined;
    active?: CodeFilterPreference;
  },
): OpenTuiAppKeyResult {
  const nextFilters = createOpenTuiCodeFilterState({
    options: filters.options,
    selected: overrides.selected ?? filters.selected,
    pinned: overrides.pinned ?? filters.pinned,
    index: overrides.index ?? filters.index,
    query: filters.query,
  });
  const active = overrides.active;
  if (active !== undefined) {
    const activeIndex = nextFilters.options.findIndex((option) =>
      codeFilterPreferencesEqual(codeFilterPreferenceFromOption(option), active),
    );
    if (activeIndex !== -1) {
      nextFilters.index = activeIndex;
    }
  }
  return {
    state: createOpenTuiSettingsState(state.language, "code_filters", { ...stateOptions(state), codeFilters: nextFilters }),
    action: "continue",
  };
}

export function wordFormSettingsFromContext(
  context: OpenTuiAppSessionContext,
): OpenTuiWordFormSettings {
  return {
    word_breakdown: {
      enabled_in_comprehensive:
        context.wordBreakdownSettings?.enabled_in_comprehensive ?? true,
      max_items_per_group: context.wordBreakdownSettings?.max_items_per_group ?? 6,
      word_repeats: context.wordBreakdownSettings?.word_repeats ?? 2,
    },
    programming_terms: {
      word_repeats: context.programmingTermsSettings?.word_repeats ?? 1,
    },
  };
}

export function wordAudioSettingsFromContext(
  context: OpenTuiAppSessionContext,
): UserPreferences["word_audio"] {
  return context.wordAudioSettings ?? defaultWordAudioSettings();
}

export function customLibrarySettingsFromContext(
  context: OpenTuiAppSessionContext,
): UserPreferences["custom_library"] {
  return context.customLibrarySettings ?? defaultCustomLibrarySettings();
}

export function codeFilterStateFromContext(
  context: OpenTuiAppSessionContext,
): NonNullable<OpenTuiAppState["codeFilters"]> {
  return createOpenTuiCodeFilterState({
    options: context.codeFilterOptions ?? codePracticeOptionsForLibrary(context.library),
    selected: context.selectedCodeFilters ?? codeFilterPreferencesFromConfig(context.codeConfig),
    pinned: context.pinnedCodeFilters ?? [],
  });
}

export function codeSettingsFromContext(context: OpenTuiAppSessionContext): OpenTuiCodeSettings {
  return {
    difficulty: context.codeSettings?.difficulty ?? context.codeConfig?.difficulty ?? "adaptive",
    length: context.codeSettings?.length ?? context.codeConfig?.size ?? "adaptive",
  };
}

export function codeStyleSettingsFromContext(context: OpenTuiAppSessionContext): CodeStyleSettings {
  return context.codeStyleSettings ?? context.codeStyle ?? defaultCodeStyleSettings();
}

export function speedUnitFromContext(context: OpenTuiAppSessionContext): SpeedUnit {
  return context.speedUnit ?? "wpm";
}

export function youdaoTtsCredentialStatusFromContext(
  context: OpenTuiAppSessionContext,
): OpenTuiYoudaoTtsCredentialStatus {
  return context.youdaoTtsCredentialStatus ?? "none";
}

export function codeFilterPreferencesFromConfig(
  config: Partial<CodePracticeConfig> | undefined,
): CodeFilterPreference[] {
  if (config === undefined) {
    return [];
  }
  const preferences: CodeFilterPreference[] = [];
  addCodeFilterPreference(preferences, "language", config.language);
  addCodeFilterPreference(preferences, "framework", config.framework);
  addCodeFilterPreference(preferences, "project", config.project);
  for (const value of config.languages ?? []) {
    addCodeFilterPreference(preferences, "language", value);
  }
  for (const value of config.frameworks ?? []) {
    addCodeFilterPreference(preferences, "framework", value);
  }
  for (const value of config.projects ?? []) {
    addCodeFilterPreference(preferences, "project", value);
  }
  return preferences;
}

export function addCodeFilterPreference(
  preferences: CodeFilterPreference[],
  facet: CodeFilterPreference["facet"],
  value: string | undefined,
): void {
  if (value === undefined) {
    return;
  }
  const preference: CodeFilterPreference = { facet, value };
  if (!hasCodeFilterPreference(preferences, preference)) {
    preferences.push(preference);
  }
}

export function hasCodeFilterPreference(
  preferences: CodeFilterPreference[],
  preference: CodeFilterPreference,
): boolean {
  return preferences.some((candidate) => codeFilterPreferencesEqual(candidate, preference));
}

export function codeFilterPreferenceFromOption(option: CodePracticeOption): CodeFilterPreference {
  return { facet: option.facet, value: option.value };
}

export function codeFilterPreferencesEqual(
  left: CodeFilterPreference,
  right: CodeFilterPreference,
): boolean {
  return left.facet === right.facet && left.value === right.value;
}
