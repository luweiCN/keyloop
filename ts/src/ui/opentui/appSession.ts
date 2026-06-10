import {
  type CodeFilterPreference,
  type CodePracticeConfig,
  type CodePracticeOption,
  defaultCodeStyleSettings,
  type CodeStyleSettings,
  type EverydayEnglishSettings,
  type EverydaySentenceLength,
  type KeyAggregate,
  type Language,
  type SpeedUnit,
  type UserPreferences,
} from "../../domain/model";
import { codePracticeOptionsForLibrary } from "../../content/library";
import type { BuildTargetContext } from "../../training/targets";
import {
  activateOpenTuiMenuItem,
  createOpenTuiCodeFilterState,
  createOpenTuiInitialState,
  createOpenTuiSettingsState,
  createOpenTuiStatsState,
  nextOpenTuiStatsView,
  openTuiCodeFilterPickerItems,
  openTuiFlatSettingsItems,
  openTuiMenuItems,
  selectedFlatSettingsIndex,
  type OpenTuiAppState,
  type OpenTuiCodeSettings,
  type OpenTuiFlatSettingsItem,
  type OpenTuiMenuItemId,
  type OpenTuiReturnRoute,
  type OpenTuiStateOptions,
  type OpenTuiSettingsView,
  type OpenTuiStatsStateOptions,
  type OpenTuiStatsView,
  type OpenTuiWordFormSettings,
} from "./appModel";
import {
  renderOpenTuiAppOnce,
  type OpenTuiKeyEvent,
  type OpenTuiRenderer,
  type OpenTuiRendererKit,
} from "./renderer";
import type { KeyStatsSort } from "../../report/stats";
import { localDateKey } from "../../report/stats";

export interface OpenTuiAppSessionContext extends BuildTargetContext {
  language: Language;
  keyAggregates?: KeyAggregate[];
  now?: Date;
  codeFilterOptions?: CodePracticeOption[];
  selectedCodeFilters?: CodeFilterPreference[];
  pinnedCodeFilters?: CodeFilterPreference[];
  codeSettings?: OpenTuiCodeSettings;
  codeStyleSettings?: CodeStyleSettings;
  personalVocabularySettings?: UserPreferences["personal_vocabulary"];
  speedUnit?: SpeedUnit;
  todayElapsedMs?: number;
}

export interface OpenTuiAppSessionOptions {
  kit?: OpenTuiRendererKit;
  initialState?: OpenTuiAppState;
  initialRenderer?: OpenTuiRenderer;
}

export type OpenTuiAppAction = "continue" | "quit" | "start";

export interface OpenTuiAppKeyResult {
  state: OpenTuiAppState;
  action: OpenTuiAppAction;
}

export interface OpenTuiAppSessionResult {
  state: OpenTuiAppState;
  action: Exclude<OpenTuiAppAction, "continue">;
  renderer?: OpenTuiRenderer;
}

const statsViewsByNumber: OpenTuiStatsView[] = [
  "overview",
  "today",
  "comprehensive",
  "modules",
  "keys",
  "tokens",
  "code",
  "daily",
];

const keyStatsSorts: KeyStatsSort[] = [
  "slowest_average",
  "fastest",
  "slowest_single",
  "highest_error_rate",
  "lowest_confidence",
];

const everydayWordCounts = [10, 20, 30, 50] as const;
const everydaySentenceLengths: EverydaySentenceLength[] = [
  "short",
  "medium",
  "long",
  "mixed",
];
const wordBreakdownMaxItems = [2, 4, 6, 8] as const;
const personalVocabularyLimits = [4, 8, 12, 16] as const;
const codeDifficultySettings = [
  "adaptive",
  "all",
  "easy",
  "medium",
  "hard",
] as const satisfies readonly UserPreferences["code_practice"]["difficulty"][];
const codeLengthSettings = [
  "adaptive",
  "short",
  "medium",
  "long",
] as const satisfies readonly UserPreferences["code_practice"]["length"][];
const codeIndentOptions = ["space-2", "space-4", "tab"] as const;
const codeSemicolonStyles = ["always", "never"] as const satisfies readonly CodeStyleSettings["semicolons"][];
const codeQuoteStyles = ["double", "single"] as const satisfies readonly CodeStyleSettings["quotes"][];
const speedUnitSettings = ["wpm", "cpm"] as const satisfies readonly SpeedUnit[];
const codeStyleSettingCount = 3;

type OpenTuiStatsRoute = Extract<OpenTuiAppState["route"], { screen: "stats" }>;
type OpenTuiSettingsRoute = Extract<OpenTuiAppState["route"], { screen: "settings" }>;

interface OpenTuiStatsState {
  language: Language;
  route: OpenTuiStatsRoute;
}

interface OpenTuiSettingsState {
  language: Language;
  route: OpenTuiSettingsRoute;
}

export function reduceOpenTuiAppKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  if (isQuitEvent(event) && !isFocusedCodeFilterSearchInput(state)) {
    return { state, action: "quit" };
  }

  if (isEscapeEvent(event)) {
    if (state.route.screen === "main_menu") {
      return { state, action: "quit" };
    }
    if (state.route.screen === "settings" && state.route.view !== "menu") {
      const menuState = createOpenTuiSettingsState(state.language, "menu", {
        codeFilters: state.codeFilters,
        codeSettings: state.codeSettings,
        codeStyleSettings: state.codeStyleSettings,
        everydaySettings: state.everydaySettings,
        wordFormSettings: state.wordFormSettings,
        speedUnit: state.speed_unit,
        todayElapsedMs: state.today_elapsed_ms,
      });
      return {
        state: flatSettingsSelectionState(
          menuState,
          settingsMenuIndexForView(menuState, state.route.view),
        ),
        action: "continue",
      };
    }
    return {
      state: createOpenTuiInitialState(state.language, {
        codeFilters: state.codeFilters,
        codeSettings: state.codeSettings,
        codeStyleSettings: state.codeStyleSettings,
        everydaySettings: state.everydaySettings,
        wordFormSettings: state.wordFormSettings,
        speedUnit: state.speed_unit,
        todayElapsedMs: state.today_elapsed_ms,
      }),
      action: "continue",
    };
  }

  switch (state.route.screen) {
    case "main_menu":
    case "submenu":
      return reduceMenuKey(state, event, context);
    case "stats":
      return reduceStatsKey({ language: state.language, route: state.route }, event);
    case "settings":
      return reduceSettingsKey(
        { language: state.language, route: state.route },
        state,
        event,
        context,
      );
    case "running":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "complete":
    case "summary":
    case "ansi_palette":
      return { state, action: "continue" };
  }
}

export async function runOpenTuiAppSession(
  context: OpenTuiAppSessionContext,
  options: OpenTuiAppSessionOptions = {},
): Promise<OpenTuiAppSessionResult> {
  const baseState =
    options.initialState ??
    createOpenTuiInitialState(context.language, {
      codeFilters: codeFilterStateFromContext(context),
      codeSettings: codeSettingsFromContext(context),
      codeStyleSettings: codeStyleSettingsFromContext(context),
      everydaySettings: everydaySettingsFromContext(context),
      wordFormSettings: wordFormSettingsFromContext(context),
      speedUnit: speedUnitFromContext(context),
      todayElapsedMs: todayElapsedMsFromContext(context),
    });
  let state =
    baseState.today_elapsed_ms === undefined
      ? { ...baseState, today_elapsed_ms: todayElapsedMsFromContext(context) }
      : baseState;

  const renderer = options.initialRenderer ?? await renderOpenTuiAppOnce(state, options.kit);
  if (options.initialRenderer !== undefined) {
    await renderer.renderState?.(state);
  }
  for (;;) {
    const event = await waitForAppKey(renderer);

    if (event === undefined) {
      renderer.destroy?.();
      return { state, action: "quit" };
    }

    const result = reduceOpenTuiAppKey(state, event, context);
    const previousState = state;
    state = result.state;
    if (result.action === "quit") {
      renderer.destroy?.();
      return { state, action: result.action };
    }
    if (result.action === "start") {
      return { state, action: result.action, renderer };
    }
    if (state !== previousState) {
      await renderer.renderState?.(state);
    }
  }
}

function todayElapsedMsFromContext(context: OpenTuiAppSessionContext): number {
  if (context.todayElapsedMs !== undefined) {
    return context.todayElapsedMs;
  }
  const today = localDateKey(context.now ?? new Date());
  return context.records
    .filter((record) => localDateKey(new Date(record.started_at)) === today)
    .reduce((sum, record) => sum + record.duration_ms, 0);
}

function reduceMenuKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const items = openTuiMenuItems(state);
  if (isMenuDownEvent(event)) {
    return { state: menuSelectionState(state, 1, items.length), action: "continue" };
  }
  if (isMenuUpEvent(event)) {
    return { state: menuSelectionState(state, -1, items.length), action: "continue" };
  }

  const index = numberKeyIndex(event);
  const selectedIndex =
    index ?? (isSelectEvent(event) ? selectedMenuIndex(state, items.length) : undefined);
  if (selectedIndex === undefined) {
    return { state, action: "continue" };
  }

  const item = items[selectedIndex];
  if (item === undefined) {
    return { state, action: "continue" };
  }

  const nextState =
    item.id === "settings"
      ? settingsRootState(state, context)
      : item.id === "stats"
        ? statsState(state.language, context, "overview")
        : activateOpenTuiMenuItem(state, item.id as OpenTuiMenuItemId, context);
  const routedState =
    nextState.route.screen === "running"
      ? runningStateWithReturnRoute(nextState, returnRouteFromMenuState(state))
      : nextState;
  return {
    state: routedState,
    action: routedState.route.screen === "running" ? "start" : "continue",
  };
}

function returnRouteFromMenuState(state: OpenTuiAppState): OpenTuiReturnRoute {
  if (state.route.screen === "submenu") {
    return {
      screen: "submenu",
      menu: state.route.menu,
      ...(state.route.selected_index === undefined
        ? {}
        : { selected_index: state.route.selected_index }),
    };
  }
  return {
    screen: "main_menu",
    ...(state.route.screen === "main_menu" && state.route.selected_index !== undefined
      ? { selected_index: state.route.selected_index }
      : {}),
  };
}

function runningStateWithReturnRoute(
  state: OpenTuiAppState,
  returnRoute: OpenTuiReturnRoute,
): OpenTuiAppState {
  if (state.route.screen !== "running") {
    return state;
  }
  return {
    ...state,
    route: {
      ...state.route,
      return_route: returnRoute,
    },
  };
}

function selectedMenuIndex(state: OpenTuiAppState, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }
  if (state.route.screen !== "main_menu" && state.route.screen !== "submenu") {
    return 0;
  }
  return clampMenuIndex(state.route.selected_index ?? 0, itemCount);
}

function menuSelectionState(
  state: OpenTuiAppState,
  delta: -1 | 1,
  itemCount: number,
): OpenTuiAppState {
  if (state.route.screen !== "main_menu" && state.route.screen !== "submenu") {
    return state;
  }
  if (itemCount <= 0) {
    return state;
  }
  const selectedIndex = selectedMenuIndex(state, itemCount);
  const nextIndex = (selectedIndex + delta + itemCount) % itemCount;
  if (state.route.screen === "main_menu") {
    return {
      ...state,
      route: { screen: "main_menu", selected_index: nextIndex },
    };
  }
  return {
    ...state,
    route: { screen: "submenu", menu: state.route.menu, selected_index: nextIndex },
  };
}

function clampMenuIndex(index: number, itemCount: number): number {
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(itemCount - 1, 0));
}

function selectedSettingsMenuIndex(state: OpenTuiAppState, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }
  if (state.route.screen !== "settings" || state.route.view !== "menu") {
    return 0;
  }
  return clampMenuIndex(state.route.selected_index ?? 0, itemCount);
}

function settingsMenuSelectionState(
  state: OpenTuiAppState,
  delta: -1 | 1,
  itemCount: number,
): OpenTuiAppState {
  if (state.route.screen !== "settings" || state.route.view !== "menu" || itemCount <= 0) {
    return state;
  }
  const selectedIndex = selectedSettingsMenuIndex(state, itemCount);
  const nextIndex = (selectedIndex + delta + itemCount) % itemCount;
  return {
    ...state,
    route: { screen: "settings", view: "menu", selected_index: nextIndex },
  };
}

function settingsViewState(
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
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
    case "code_filters":
      return createOpenTuiSettingsState(language, "code_filters", {
        codeFilters: appState.codeFilters ?? codeFilterStateFromContext(context),
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings,
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings,
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
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
    case "code_style":
      return createOpenTuiSettingsState(language, "code_style", {
        codeFilters: appState.codeFilters,
        codeSettings: appState.codeSettings,
        codeStyleSettings: appState.codeStyleSettings ?? codeStyleSettingsFromContext(context),
        everydaySettings: appState.everydaySettings,
        wordFormSettings: appState.wordFormSettings,
        speedUnit: appState.speed_unit ?? speedUnitFromContext(context),
      });
  }
}

function settingsRootState(
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
    speedUnit: state.speed_unit ?? speedUnitFromContext(context),
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

function settingsMenuIndexForView(
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

function flatSettingsKindForView(
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
  }
}

function reduceSettingsKey(
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

  return { state: appState, action: "continue" };
}

function reduceFlatSettingsKey(
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
  if (item.kind === "code_filters" && isSelectEvent(event)) {
    return {
      state: settingsViewState(state.language, "code_filters", state, context),
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
  return reduceFlatSettingsItem(state, item, selected, direction, context);
}

function reduceFlatSettingsItem(
  state: OpenTuiAppState,
  item: OpenTuiFlatSettingsItem,
  selectedIndex: number,
  direction: -1 | 1,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  const codeSettings = state.codeSettings ?? codeSettingsFromContext(context);
  const codeStyleSettings = state.codeStyleSettings ?? codeStyleSettingsFromContext(context);
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
    case "code_filters":
      return { state, action: "continue" };
  }
}

function flatSettingsResult(
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

function flatSettingsOptions(
  state: OpenTuiAppState,
  overrides: OpenTuiStateOptions,
): OpenTuiStateOptions {
  const options: OpenTuiStateOptions = {};
  const codeFilters = overrides.codeFilters ?? state.codeFilters;
  const codeSettings = overrides.codeSettings ?? state.codeSettings;
  const codeStyleSettings = overrides.codeStyleSettings ?? state.codeStyleSettings;
  const everydaySettings = overrides.everydaySettings ?? state.everydaySettings;
  const wordFormSettings = overrides.wordFormSettings ?? state.wordFormSettings;
  const speedUnit = overrides.speedUnit ?? state.speed_unit;
  const todayElapsedMs = overrides.todayElapsedMs ?? state.today_elapsed_ms;
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
  if (speedUnit !== undefined) {
    options.speedUnit = speedUnit;
  }
  if (todayElapsedMs !== undefined) {
    options.todayElapsedMs = todayElapsedMs;
  }
  return options;
}

function flatSettingsSelectionState(
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

function settingsCycleDirection(event: OpenTuiKeyEvent): -1 | 1 | undefined {
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

function settingsSearchInput(event: OpenTuiKeyEvent): string | "backspace" | undefined {
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

function isFocusedCodeFilterSearchInput(state: OpenTuiAppState): boolean {
  return state.route.screen === "settings" && state.route.view === "code_filters";
}

function reduceWordFormSettingsKey(
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
  if (name === "down" || sequence === "j") {
    return wordFormSettingsResult(state.language, state, {
      ...settings,
      personal_vocabulary: {
        ...settings.personal_vocabulary,
        daily_review_limit: cycleNumberOption(
          personalVocabularyLimits,
          settings.personal_vocabulary.daily_review_limit,
          -1,
        ),
      },
    });
  }
  if (name === "up" || sequence === "k") {
    return wordFormSettingsResult(state.language, state, {
      ...settings,
      personal_vocabulary: {
        ...settings.personal_vocabulary,
        daily_review_limit: cycleNumberOption(
          personalVocabularyLimits,
          settings.personal_vocabulary.daily_review_limit,
          1,
        ),
      },
    });
  }

  return wordFormSettingsResult(state.language, state, settings);
}

function wordFormSettingsResult(
  language: Language,
  state: OpenTuiAppState,
  settings: OpenTuiWordFormSettings,
): OpenTuiAppKeyResult {
  return {
    state: createOpenTuiSettingsState(language, "word_forms", {
      codeFilters: state.codeFilters,
      codeSettings: state.codeSettings,
      codeStyleSettings: state.codeStyleSettings,
      everydaySettings: state.everydaySettings,
      wordFormSettings: settings,
      speedUnit: state.speed_unit,
      todayElapsedMs: state.today_elapsed_ms,
    }),
    action: "continue",
  };
}

function reduceEverydaySettingsKey(
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

function reduceCodeDifficultySettingsKey(
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

function codeDifficultySettingsResult(
  language: Language,
  state: OpenTuiAppState,
  settings: OpenTuiCodeSettings,
): OpenTuiAppKeyResult {
  return {
    state: createOpenTuiSettingsState(language, "code_difficulty", {
      codeFilters: state.codeFilters,
      codeSettings: settings,
      codeStyleSettings: state.codeStyleSettings,
      everydaySettings: state.everydaySettings,
      wordFormSettings: state.wordFormSettings,
      speedUnit: state.speed_unit,
      todayElapsedMs: state.today_elapsed_ms,
    }),
    action: "continue",
  };
}

function reduceCodeStyleSettingsKey(
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

function codeStyleSettingsResult(
  language: Language,
  state: OpenTuiAppState,
  settings: CodeStyleSettings,
  selectedIndex: number,
): OpenTuiAppKeyResult {
  const nextState = createOpenTuiSettingsState(language, "code_style", {
    codeFilters: state.codeFilters,
    codeSettings: state.codeSettings,
    codeStyleSettings: settings,
    everydaySettings: state.everydaySettings,
    wordFormSettings: state.wordFormSettings,
    speedUnit: state.speed_unit,
      todayElapsedMs: state.today_elapsed_ms,
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

function codeStyleSelectedIndex(state: OpenTuiAppState): number {
  if (state.route.screen !== "settings" || state.route.view !== "code_style") {
    return 0;
  }
  return Math.min(Math.max(state.route.selected_index ?? 0, 0), codeStyleSettingCount - 1);
}

function cycleCodeStyleSetting(
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

function codeIndentOption(settings: CodeStyleSettings): (typeof codeIndentOptions)[number] {
  if (settings.indent_style === "tab") {
    return "tab";
  }
  return settings.indent_width === 4 ? "space-4" : "space-2";
}

function codeStyleWithIndentOption(
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

function cycleStringOption<const T extends readonly string[]>(
  values: T,
  current: T[number],
  direction: -1 | 1,
): T[number] {
  const index = values.findIndex((value) => value === current);
  const currentIndex = index === -1 ? 0 : index;
  const next = (currentIndex + direction + values.length) % values.length;
  return values[next] ?? current;
}

function everydaySettingsResult(
  language: Language,
  state: OpenTuiAppState,
  settings: EverydayEnglishSettings,
): OpenTuiAppKeyResult {
  return {
    state: createOpenTuiSettingsState(language, "everyday", {
      codeFilters: state.codeFilters,
      codeSettings: state.codeSettings,
      codeStyleSettings: state.codeStyleSettings,
      everydaySettings: settings,
      wordFormSettings: state.wordFormSettings,
      speedUnit: state.speed_unit,
      todayElapsedMs: state.today_elapsed_ms,
    }),
    action: "continue",
  };
}

function everydaySettingsFromContext(
  context: OpenTuiAppSessionContext,
): EverydayEnglishSettings {
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

function cycleEverydayWordCount(
  current: EverydayEnglishSettings["word_count"],
  direction: -1 | 1,
): EverydayEnglishSettings["word_count"] {
  return cycleNumberOption(everydayWordCounts, current, direction);
}

function cycleNumberOption<const T extends readonly number[]>(
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

function reduceCodeFilterSettingsKey(
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

function codeFilterPickerSearchResult(
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

function moveCodeFilterPickerSelection(
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

function setCodeFilterPickerSelection(
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

function isCodeFilterPickerPinEvent(event: OpenTuiKeyEvent): boolean {
  if (!event.ctrl || event.meta) {
    return false;
  }
  return event.name.toLowerCase() === "p" || event.sequence === "\x10";
}

function toggleCodeFilterPickerPin(
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

function activeCodeFilterPickerItem(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
): ReturnType<typeof openTuiCodeFilterPickerItems>[number] | undefined {
  const items = openTuiCodeFilterPickerItems(codeFilterPickerState(state, filters));
  return items.find((item) => item.active) ?? items[0];
}

function codeFilterPickerSelectionAction(
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

function isCodeFilterPickerDownEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  return name === "down" || sequence === "down";
}

function isCodeFilterPickerUpEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  return name === "up" || sequence === "up";
}

function codeFilterPickerState(
  state: OpenTuiAppState,
  filters: NonNullable<OpenTuiAppState["codeFilters"]>,
): OpenTuiAppState {
  return createOpenTuiSettingsState(state.language, "code_filters", {
    codeFilters: filters,
    codeSettings: state.codeSettings,
    codeStyleSettings: state.codeStyleSettings,
    everydaySettings: state.everydaySettings,
    wordFormSettings: state.wordFormSettings,
    speedUnit: state.speed_unit,
    todayElapsedMs: state.today_elapsed_ms,
  });
}

function codeFilterSettingsResult(
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
    state: createOpenTuiSettingsState(state.language, "code_filters", {
      codeFilters: nextFilters,
      codeSettings: state.codeSettings,
      codeStyleSettings: state.codeStyleSettings,
      everydaySettings: state.everydaySettings,
      wordFormSettings: state.wordFormSettings,
      speedUnit: state.speed_unit,
      todayElapsedMs: state.today_elapsed_ms,
    }),
    action: "continue",
  };
}

function wordFormSettingsFromContext(
  context: OpenTuiAppSessionContext,
): OpenTuiWordFormSettings {
  return {
    word_breakdown: {
      enabled_in_comprehensive:
        context.wordBreakdownSettings?.enabled_in_comprehensive ?? true,
      max_items_per_group: context.wordBreakdownSettings?.max_items_per_group ?? 6,
    },
    personal_vocabulary: {
      enabled_in_comprehensive:
        context.personalVocabularySettings?.enabled_in_comprehensive ?? true,
      daily_review_limit:
        context.personalVocabularySettings?.daily_review_limit ??
        context.personalVocabularyLimit ??
        8,
    },
  };
}

function codeFilterStateFromContext(
  context: OpenTuiAppSessionContext,
): NonNullable<OpenTuiAppState["codeFilters"]> {
  return createOpenTuiCodeFilterState({
    options: context.codeFilterOptions ?? codePracticeOptionsForLibrary(context.library),
    selected: context.selectedCodeFilters ?? codeFilterPreferencesFromConfig(context.codeConfig),
    pinned: context.pinnedCodeFilters ?? [],
  });
}

function codeSettingsFromContext(context: OpenTuiAppSessionContext): OpenTuiCodeSettings {
  return {
    difficulty: context.codeSettings?.difficulty ?? context.codeConfig?.difficulty ?? "adaptive",
    length: context.codeSettings?.length ?? context.codeConfig?.size ?? "adaptive",
  };
}

function codeStyleSettingsFromContext(context: OpenTuiAppSessionContext): CodeStyleSettings {
  return context.codeStyleSettings ?? context.codeStyle ?? defaultCodeStyleSettings();
}

function speedUnitFromContext(context: OpenTuiAppSessionContext): SpeedUnit {
  return context.speedUnit ?? "wpm";
}

function codeFilterPreferencesFromConfig(
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

function addCodeFilterPreference(
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

function hasCodeFilterPreference(
  preferences: CodeFilterPreference[],
  preference: CodeFilterPreference,
): boolean {
  return preferences.some((candidate) => codeFilterPreferencesEqual(candidate, preference));
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

function reduceStatsKey(
  state: OpenTuiStatsState,
  event: OpenTuiKeyEvent,
): OpenTuiAppKeyResult {
  if (isTabEvent(event)) {
    return { state: nextOpenTuiStatsView(state), action: "continue" };
  }

  const index = numberKeyIndex(event);
  if (index !== undefined) {
    const view = statsViewsByNumber[index];
    if (view !== undefined) {
      const options: OpenTuiStatsStateOptions =
        view === "daily" ? { view, dailyIndex: state.route.dailyIndex ?? 0 } : { view };
      return { state: statsStateFromRoute(state, options), action: "continue" };
    }
  }

  if (state.route.view === "keys" && isSortEvent(event)) {
    return {
      state: statsStateFromRoute(state, {
        view: "keys",
        keyStatsSort: nextKeyStatsSort(state.route.keyStatsSort ?? "slowest_average"),
      }),
      action: "continue",
    };
  }

  if (state.route.view === "daily") {
    return reduceDailyStatsKey(state, event);
  }

  return { state, action: "continue" };
}

function reduceDailyStatsKey(
  state: OpenTuiStatsState,
  event: OpenTuiKeyEvent,
): OpenTuiAppKeyResult {
  const current = state.route.dailyIndex ?? 0;
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  if (name === "right" || sequence === "right") {
    return {
      state: statsStateFromRoute(state, { view: "daily", dailyIndex: current + 1 }),
      action: "continue",
    };
  }
  if (name === "left" || sequence === "left") {
    return {
      state: statsStateFromRoute(state, { view: "daily", dailyIndex: Math.max(current - 1, 0) }),
      action: "continue",
    };
  }
  if (name === "home" || sequence === "home") {
    return {
      state: statsStateFromRoute(state, { view: "daily", dailyIndex: 0 }),
      action: "continue",
    };
  }
  if (name === "end" || sequence === "end") {
    return {
      state: statsStateFromRoute(state, { view: "daily", dailyIndex: Number.MAX_SAFE_INTEGER }),
      action: "continue",
    };
  }
  return { state, action: "continue" };
}

function statsState(
  language: Language,
  context: OpenTuiAppSessionContext,
  view: OpenTuiStatsView,
): OpenTuiAppState {
  const options: OpenTuiStatsStateOptions = { view };
  if (context.now !== undefined) {
    options.now = context.now;
  }
  if (context.keyAggregates !== undefined) {
    options.keyAggregates = context.keyAggregates;
  }
  return createOpenTuiStatsState(language, context.records, options);
}

function statsStateFromRoute(
  state: OpenTuiStatsState,
  overrides: OpenTuiStatsStateOptions,
): OpenTuiAppState {
  const options: OpenTuiStatsStateOptions = { view: overrides.view ?? state.route.view };
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
  if (overrides.keyStatsSort !== undefined) {
    options.keyStatsSort = overrides.keyStatsSort;
  }
  if (overrides.dailyIndex !== undefined) {
    options.dailyIndex = overrides.dailyIndex;
  }
  return createOpenTuiStatsState(state.language, state.route.records, options);
}

function nextKeyStatsSort(sort: KeyStatsSort): KeyStatsSort {
  const index = keyStatsSorts.indexOf(sort);
  return keyStatsSorts[(index + 1) % keyStatsSorts.length] ?? "slowest_average";
}

function waitForAppKey(renderer: OpenTuiRenderer): Promise<OpenTuiKeyEvent | undefined> {
  if (renderer.keyInput === undefined) {
    return Promise.resolve(undefined);
  }
  const keyInput = renderer.keyInput;
  return new Promise<OpenTuiKeyEvent>((resolve) => {
    let settled = false;
    const handleKeypress = (event: OpenTuiKeyEvent): void => {
      if (settled) {
        return;
      }
      settled = true;
      keyInput.off("keypress", handleKeypress);
      resolve(event);
    };
    keyInput.on("keypress", handleKeypress);
  });
}

function numberKeyIndex(event: OpenTuiKeyEvent): number | undefined {
  if (event.ctrl || event.meta) {
    return undefined;
  }
  const value = event.sequence || event.name;
  if (!/^[1-9]$/u.test(value)) {
    return undefined;
  }
  return Number(value) - 1;
}

function isEscapeEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "escape" || name === "esc" || event.sequence === "\x1b";
}

function isQuitEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return !event.ctrl && !event.meta && (event.sequence.toLowerCase() === "q" || name === "q");
}

function isTabEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "tab" || event.sequence === "\t";
}

function isMenuDownEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  return name === "down" || sequence === "down" || sequence === "j";
}

function isMenuUpEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  return name === "up" || sequence === "up" || sequence === "k";
}

function isSelectEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    name === "enter" ||
    name === "return" ||
    name === "space" ||
    event.sequence === "\r" ||
    event.sequence === "\n" ||
    event.sequence === " "
  );
}

function isSortEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return !event.ctrl && !event.meta && (event.sequence.toLowerCase() === "s" || name === "s");
}
