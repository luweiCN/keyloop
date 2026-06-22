import type { KeyAggregate } from "../../domain/model";
import type { KeyStatsSort } from "../../report/stats";
import {
  createOpenTuiStatsState,
  nextOpenTuiStatsView,
  stateOptions,
  type OpenTuiAppState,
  type OpenTuiSessionState,
  type OpenTuiStatsStateOptions,
  type OpenTuiStatsView,
  openTuiStatsViews,
} from "./appModel";
import type { OpenTuiKeyEvent } from "./kit";
import type { OpenTuiAppKeyResult, OpenTuiAppSessionContext } from "./appSession";
import { isSelectEvent, isSortEvent, isTabEvent, numberKeyIndex } from "./appSession";

export const keyStatsSorts: KeyStatsSort[] = [
  "slowest_average",
  "fastest",
  "slowest_single",
  "highest_error_rate",
  "lowest_confidence",
];

export type OpenTuiStatsRoute = Extract<OpenTuiAppState["route"], { screen: "stats" }>;

export interface OpenTuiStatsState extends OpenTuiSessionState {
  route: OpenTuiStatsRoute;
}

export function reduceStatsKey(
  state: OpenTuiStatsState,
  event: OpenTuiKeyEvent,
): OpenTuiAppKeyResult {
  if (isTabEvent(event)) {
    return { state: nextOpenTuiStatsView(state), action: "continue" };
  }

  const index = numberKeyIndex(event);
  if (index !== undefined) {
    const view = openTuiStatsViews[index];
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

export function reduceDailyStatsKey(
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

export function statsState(
  state: OpenTuiAppState,
  context: OpenTuiAppSessionContext,
  view: OpenTuiStatsView,
): OpenTuiAppState {
  // stateOptions(state) 透传会话级字段（含 mainGoal），避免进入数据屏丢失目标
  const options: OpenTuiStatsStateOptions = { ...stateOptions(state), view };
  if (context.now !== undefined) {
    options.now = context.now;
  }
  if (context.keyAggregates !== undefined) {
    options.keyAggregates = context.keyAggregates;
  }
  return createOpenTuiStatsState(state.language, context.records, options);
}

export function statsStateFromRoute(
  state: OpenTuiStatsState,
  overrides: OpenTuiStatsStateOptions,
): OpenTuiAppState {
  const options: OpenTuiStatsStateOptions = {
    ...stateOptions(state),
    view: overrides.view ?? state.route.view,
  };
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

export function nextKeyStatsSort(sort: KeyStatsSort): KeyStatsSort {
  const index = keyStatsSorts.indexOf(sort);
  return keyStatsSorts[(index + 1) % keyStatsSorts.length] ?? "slowest_average";
}
