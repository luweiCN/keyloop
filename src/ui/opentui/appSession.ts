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
import type { Dictionary } from "../../content/dictionary";
import type { CustomLibrary } from "../../training/customLibrary";
import type { YoudaoCredentialStore, YoudaoTtsCredentials } from "../../audio/youdaoCredentials";
import {
  deleteCustomLibraryAtDir,
  saveCustomLibraryToDir,
} from "../../storage/keyloopStore";
import type { BuildTargetContext } from "../../training/targets";
import {
  activateOpenTuiMenuItem,
  adjustStagePlanMinutes,
  startStagePlanFirstLesson,
  createOpenTuiCodeFilterState,
  createOpenTuiInitialState,
  createOpenTuiSettingsState,
  createOpenTuiStatsState,
  nextOpenTuiStatsView,
  openTuiCodeFilterPickerItems,
  openTuiFlatSettingsItems,
  openTuiMenuItems,
  openTuiStatsViews,
  selectedFlatSettingsIndex,
  stateOptions,
  withRoute,
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
  type OpenTuiYoudaoTtsCredentialStatus,
} from "./appModel";
import {
  renderOpenTuiAppOnce,
  type OpenTuiKeyEvent,
  type OpenTuiRenderer,
  type OpenTuiRendererKit,
} from "./renderer";
import type { KeyStatsSort } from "../../report/stats";
import { localDateKey } from "../../report/stats";

import {
  flatSettingsSelectionState,
  isFocusedCodeFilterSearchInput,
  reduceSettingsKey,
  settingsMenuIndexForView,
  settingsRootState,
  codeFilterStateFromContext,
  codeSettingsFromContext,
  codeStyleSettingsFromContext,
  everydaySettingsFromContext,
  speedUnitFromContext,
  customLibrarySettingsFromContext,
  wordAudioSettingsFromContext,
  wordFormSettingsFromContext,
} from "./settingsReducers";
import { reduceStatsKey, statsState } from "./statsReducer";
import { reduceGoalOnboardingKey } from "./goalOnboardingReducer";
import { setUiEventSink } from "./uiEventBus";
import {
  reduceLibraryDetailKey,
  reduceLibraryActionsKey,
  reduceLibraryBrowseKey,
  reduceLibraryCreateKey,
  reduceLibraryDeleteConfirmKey,
  reduceLibraryInputKey,
  reduceLibraryManageKey,
  reduceLibraryPreviewKey,
} from "./libraryReducers";

export interface OpenTuiAppSessionContext extends BuildTargetContext {
  language: Language;
  keyAggregates?: KeyAggregate[];
  now?: Date;
  codeFilterOptions?: CodePracticeOption[];
  selectedCodeFilters?: CodeFilterPreference[];
  pinnedCodeFilters?: CodeFilterPreference[];
  codeSettings?: OpenTuiCodeSettings;
  codeStyleSettings?: CodeStyleSettings;
  wordAudioSettings?: UserPreferences["word_audio"];
  customLibrarySettings?: UserPreferences["custom_library"];
  speedUnit?: SpeedUnit;
  todayElapsedMs?: number;
  customLibraries?: CustomLibrary[];
  dictionary?: Dictionary;
  librariesDir?: string;
  youdaoCredentialStore?: YoudaoCredentialStore;
  youdaoTtsCredentialStatus?: OpenTuiYoudaoTtsCredentialStatus;
}

export interface OpenTuiAppSessionOptions {
  kit?: OpenTuiRendererKit;
  initialState?: OpenTuiAppState;
  initialRenderer?: OpenTuiRenderer;
}

export type OpenTuiAppAction = "continue" | "quit" | "start";

export type LibraryPersist =
  | { kind: "save"; library: CustomLibrary }
  | { kind: "delete"; slug: string };

export type YoudaoCredentialsPersist =
  | { kind: "save_youdao_credentials"; credentials: YoudaoTtsCredentials }
  | { kind: "clear_youdao_credentials" };

export interface OpenTuiAppKeyResult {
  state: OpenTuiAppState;
  action: OpenTuiAppAction;
  persist?: LibraryPersist | YoudaoCredentialsPersist;
}

export interface OpenTuiAppSessionResult {
  state: OpenTuiAppState;
  action: Exclude<OpenTuiAppAction, "continue">;
  renderer?: OpenTuiRenderer;
}




export function reduceOpenTuiAppKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  if (
    isQuitEvent(event) &&
    !isFocusedCodeFilterSearchInput(state) &&
    !isLibraryTextInputScreen(state) &&
    !isYoudaoCredentialInputScreen(state)
  ) {
    return { state, action: "quit" };
  }

  if (isEscapeEvent(event)) {
    if (state.route.screen === "main_menu") {
      return { state, action: "quit" };
    }
    if (
      state.route.screen === "library_menu" ||
      state.route.screen === "library_manage" ||
      state.route.screen === "library_create"
    ) {
      // 二级屏（练习分项 / 管理列表 / 新建）返回自建语料库子菜单
      return {
        state: withRoute(state, { screen: "submenu", menu: "custom", selected_index: 0 }),
        action: "continue",
      };
    }
    if (state.route.screen === "library_input") {
      return {
        state: withRoute(state, {
          screen: "library_actions",
          slug: state.route.slug,
          selected_index: 0,
        }),
        action: "continue",
      };
    }
    if (state.route.screen === "library_preview") {
      const payload = state.route.payload;
      return {
        state: withRoute(state, {
          screen: "library_input",
          slug: state.route.slug,
          kind: payload.kind === "article" ? "article" : payload.kind,
          text: payload.raw_text,
          ...(payload.editing_id === undefined ? {} : { editing_id: payload.editing_id }),
        }),
        action: "continue",
      };
    }
    if (state.route.screen === "library_detail") {
      if (state.route.editing !== undefined) {
        const { editing: _discard, ...rest } = state.route;
        return { state: withRoute(state, rest), action: "continue" };
      }
      return {
        state: withRoute(state, {
          screen: "library_browse",
          slug: state.route.slug,
          query: state.route.return_query,
          index: state.route.return_index,
        }),
        action: "continue",
      };
    }
    if (state.route.screen === "library_actions") {
      return {
        state: withRoute(state, { screen: "library_manage", selected_index: 0 }),
        action: "continue",
      };
    }
    if (
      state.route.screen === "library_browse" ||
      state.route.screen === "library_delete_confirm"
    ) {
      // 三级屏（浏览 / 删库确认）返回所属库的操作菜单
      return {
        state: withRoute(state, {
          screen: "library_actions",
          slug: state.route.slug,
          selected_index: 0,
        }),
        action: "continue",
      };
    }
    if (state.route.screen === "settings" && state.route.view !== "menu") {
      const menuState = createOpenTuiSettingsState(state.language, "menu", stateOptions(state));
      return {
        state: flatSettingsSelectionState(
          menuState,
          settingsMenuIndexForView(menuState, state.route.view),
        ),
        action: "continue",
      };
    }
    return {
      state: withRoute(state, { screen: "main_menu", selected_index: 0 }),
      action: "continue",
    };
  }

  switch (state.route.screen) {
    case "main_menu":
    case "submenu":
    case "library_menu":
      return reduceMenuKey(state, event, context);
    case "library_create": {
      const result = reduceLibraryCreateKey(state, event);
      return {
        state: result.state,
        action: "continue",
        ...(result.persist === undefined ? {} : { persist: result.persist }),
      };
    }
    case "library_input": {
      const result = reduceLibraryInputKey(state, event, context);
      return { state: result.state, action: "continue" };
    }
    case "library_preview": {
      const result = reduceLibraryPreviewKey(state, event);
      return {
        state: result.state,
        action: "continue",
        ...(result.persist === undefined ? {} : { persist: result.persist }),
      };
    }
    case "library_detail": {
      const result = reduceLibraryDetailKey(state, event, context);
      return {
        state: result.state,
        action: "continue",
        ...(result.persist === undefined ? {} : { persist: result.persist }),
      };
    }
    case "library_manage": {
      const result = reduceLibraryManageKey(state, event);
      return { state: result.state, action: "continue" };
    }
    case "library_actions": {
      const result = reduceLibraryActionsKey(state, event);
      return { state: result.state, action: "continue" };
    }
    case "library_browse": {
      const result = reduceLibraryBrowseKey(state, event);
      return {
        state: result.state,
        action: "continue",
        ...(result.persist === undefined ? {} : { persist: result.persist }),
      };
    }
    case "library_delete_confirm": {
      const result = reduceLibraryDeleteConfirmKey(state, event);
      return {
        state: result.state,
        action: "continue",
        ...(result.persist === undefined ? {} : { persist: result.persist }),
      };
    }
    case "stats":
      return reduceStatsKey({ ...state, route: state.route }, event);
    case "settings":
      return reduceSettingsKey(
        { language: state.language, route: state.route },
        state,
        event,
        context,
      );
    case "stage_plan":
      return reduceStagePlanKey(state, event, context);
    case "goal_onboarding":
      return {
        state: reduceGoalOnboardingKey(state, event, context.now ?? new Date()).state,
        action: "continue",
      };
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

function reduceStagePlanKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult {
  if (state.route.screen !== "stage_plan") {
    return { state, action: "continue" };
  }
  if (isSelectEvent(event)) {
    const started = startStagePlanFirstLesson(state);
    return {
      state: started,
      action: started.route.screen === "running" ? "start" : "continue",
    };
  }
  if (isStagePlanLeftEvent(event) || isStagePlanRightEvent(event)) {
    const direction: -1 | 1 = isStagePlanLeftEvent(event) ? -1 : 1;
    return { state: adjustStagePlanMinutes(state, context, direction), action: "continue" };
  }
  return { state, action: "continue" };
}

function isStagePlanLeftEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  return name === "left" || event.sequence.toLowerCase() === "left";
}

function isStagePlanRightEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  return name === "right" || event.sequence.toLowerCase() === "right";
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
      wordAudioSettings: wordAudioSettingsFromContext(context),
      customLibrarySettings: customLibrarySettingsFromContext(context),
      speedUnit: speedUnitFromContext(context),
      customLibraries: context.customLibraries ?? [],
      ...(context.enabledModules === undefined
        ? {}
        : { enabledModules: context.enabledModules }),
      ...(context.mainGoal === undefined ? {} : { mainGoal: context.mainGoal }),
      dictionaryTier: context.dictionary?.tier ?? "none",
      youdaoTtsCredentialStatus: context.youdaoTtsCredentialStatus ?? "none",
      todayElapsedMs: todayElapsedMsFromContext(context),
    });
  // 今日时长每次进入会话都按最新记录重算（context 已含刚完成的练习），
  // 否则练习后返回菜单会一直显示练习前的旧值
  let state: OpenTuiAppState = {
    ...baseState,
    today_elapsed_ms: todayElapsedMsFromContext(context),
  };

  const renderer = options.initialRenderer ?? await renderOpenTuiAppOnce(state, options.kit);
  if (options.initialRenderer !== undefined) {
    await renderer.renderState?.(state);
  }
  setUiEventSink((event) => {
    const settle = activeSettlers.get(renderer);
    if (settle !== undefined) {
      settle(event);
      return;
    }
    const queue = pendingAppEvents.get(renderer) ?? [];
    queue.push(event);
    pendingAppEvents.set(renderer, queue);
  });
  try {
  for (;;) {
    const event = await waitForAppKey(renderer);

    if (event === undefined) {
      renderer.destroy?.();
      return { state, action: "quit" };
    }

    const result = reduceOpenTuiAppKey(state, event, context);
    if (result.persist !== undefined) {
      if (result.persist.kind === "save" && context.librariesDir !== undefined) {
        await saveCustomLibraryToDir(result.persist.library, context.librariesDir);
      } else if (result.persist.kind === "delete" && context.librariesDir !== undefined) {
        await deleteCustomLibraryAtDir(result.persist.slug, context.librariesDir);
      } else if (
        result.persist.kind === "save_youdao_credentials" &&
        context.youdaoCredentialStore !== undefined
      ) {
        await context.youdaoCredentialStore.save(result.persist.credentials);
      } else if (
        result.persist.kind === "clear_youdao_credentials" &&
        context.youdaoCredentialStore !== undefined
      ) {
        await context.youdaoCredentialStore.clear();
      }
    }
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
  } finally {
    setUiEventSink(null);
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
        ? statsState(state, context, "overview")
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
  if (state.route.screen === "library_menu") {
    return {
      screen: "library_menu",
      slug: state.route.slug,
      ...(state.route.selected_index === undefined
        ? {}
        : { selected_index: state.route.selected_index }),
    };
  }
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
  if (
    state.route.screen !== "main_menu" &&
    state.route.screen !== "submenu" &&
    state.route.screen !== "library_menu"
  ) {
    return 0;
  }
  return clampMenuIndex(state.route.selected_index ?? 0, itemCount);
}

function menuSelectionState(
  state: OpenTuiAppState,
  delta: -1 | 1,
  itemCount: number,
): OpenTuiAppState {
  if (
    state.route.screen !== "main_menu" &&
    state.route.screen !== "submenu" &&
    state.route.screen !== "library_menu"
  ) {
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
  if (state.route.screen === "library_menu") {
    return {
      ...state,
      route: { screen: "library_menu", slug: state.route.slug, selected_index: nextIndex },
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



interface PasteCapableKeyInput {
  on?(event: "paste", handler: (event: { bytes?: Uint8Array }) => void): void;
  off?(event: "paste", handler: (event: { bytes?: Uint8Array }) => void): void;
}

function isLibraryTextInputScreen(state: OpenTuiAppState): boolean {
  return (
    state.route.screen === "library_create" ||
    state.route.screen === "library_input" ||
    state.route.screen === "library_browse" ||
    (state.route.screen === "library_detail" && state.route.editing !== undefined)
  );
}

function isYoudaoCredentialInputScreen(state: OpenTuiAppState): boolean {
  if (state.route.screen !== "settings" || state.route.view !== "youdao_tts") {
    return false;
  }
  const selected = Math.min(Math.max(state.route.selected_index ?? 0, 0), 3);
  return selected <= 1;
}

/**
 * 同一 stdin 块（IME 整句上屏、连击）会在一个同步批次里派发多个 keypress。
 * resolve 第一个后剩余事件先进缓冲，退订延迟到批次结束，下次调用先吃缓冲。
 */
const pendingAppEvents = new WeakMap<OpenTuiRenderer, OpenTuiKeyEvent[]>();
const activeSettlers = new WeakMap<OpenTuiRenderer, (event: OpenTuiKeyEvent) => void>();

function waitForAppKey(renderer: OpenTuiRenderer): Promise<OpenTuiKeyEvent | undefined> {
  if (renderer.keyInput === undefined) {
    return Promise.resolve(undefined);
  }
  const buffered = pendingAppEvents.get(renderer);
  if (buffered !== undefined && buffered.length > 0) {
    return Promise.resolve(buffered.shift());
  }
  const keyInput = renderer.keyInput;
  const pasteInput = keyInput as unknown as PasteCapableKeyInput;
  return new Promise<OpenTuiKeyEvent>((resolve) => {
    let settled = false;
    const settle = (event: OpenTuiKeyEvent): void => {
      if (settled) {
        const queue = pendingAppEvents.get(renderer) ?? [];
        queue.push(event);
        pendingAppEvents.set(renderer, queue);
        return;
      }
      settled = true;
      activeSettlers.delete(renderer);
      queueMicrotask(() => {
        keyInput.off("keypress", handleKeypress);
        pasteInput.off?.("paste", handlePaste);
      });
      resolve(event);
    };
    activeSettlers.set(renderer, settle);
    const handleKeypress = (event: OpenTuiKeyEvent): void => {
      settle(event);
    };
    const handlePaste = (event: { bytes?: Uint8Array }): void => {
      const text = event.bytes === undefined ? "" : new TextDecoder().decode(event.bytes);
      if (text === "") {
        return;
      }
      settle({ name: "paste", sequence: text, ctrl: false, meta: false });
    };
    keyInput.on("keypress", handleKeypress);
    pasteInput.on?.("paste", handlePaste);
  });
}

export function numberKeyIndex(event: OpenTuiKeyEvent): number | undefined {
  if (event.ctrl || event.meta) {
    return undefined;
  }
  const value = event.sequence || event.name;
  if (!/^[1-9]$/u.test(value)) {
    return undefined;
  }
  return Number(value) - 1;
}

export function isEscapeEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "escape" || name === "esc" || event.sequence === "\x1b";
}

export function isQuitEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return !event.ctrl && !event.meta && (event.sequence.toLowerCase() === "q" || name === "q");
}

export function isTabEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "tab" || event.sequence === "\t";
}

export function isMenuDownEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  return name === "down" || sequence === "down" || sequence === "j";
}

export function isMenuUpEvent(event: OpenTuiKeyEvent): boolean {
  if (event.ctrl || event.meta) {
    return false;
  }
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  return name === "up" || sequence === "up" || sequence === "k";
}

export function isSelectEvent(event: OpenTuiKeyEvent): boolean {
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

export function isSortEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return !event.ctrl && !event.meta && (event.sequence.toLowerCase() === "s" || name === "s");
}
