import {
  activeRecordDates,
  availablePerformanceForms,
  buildDashboardSkillData,
  buildDashboardTrend,
  recordsForDate,
  STATS_TREND_RANGES,
  type StatsTrendRange,
} from "../../report/statsDashboard";
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
import { isSelectEvent, isTabEvent, numberKeyIndex } from "./appSession";
import {
  defaultPhysicalKeyId,
  movePhysicalKey,
} from "./statsVisuals";

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
      return {
        state: statsStateFromRoute(state, { view }),
        action: "continue",
      };
    }
  }

  switch (state.route.view) {
    case "overview":
      return { state, action: "continue" };
    case "trends":
      return reduceTrendsStatsKey(state, event);
    case "skills":
      return reduceSkillsStatsKey(state, event);
    case "history":
      return reduceHistoryStatsKey(state, event);
  }
}

export function reduceTrendsStatsKey(
  state: OpenTuiStatsState,
  event: OpenTuiKeyEvent,
): OpenTuiAppKeyResult {
  const forms = availablePerformanceForms(state.route.records);
  const currentTrend = buildDashboardTrend(state.route.records, {
    ...(state.route.trendForm === undefined
      ? {}
      : { form: state.route.trendForm }),
    metric: state.route.trendMetric ?? "speed",
    range: state.route.trendRange ?? "sessions_30",
    now: state.route.now ?? new Date(),
  });
  if (currentTrend === null) {
    return { state, action: "continue" };
  }

  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  if (name === "m" || sequence === "m") {
    return statsResult(state, {
      view: "trends",
      trendMetric:
        (state.route.trendMetric ?? "speed") === "speed"
          ? "accuracy"
          : "speed",
      trendIndex: Number.MAX_SAFE_INTEGER,
    });
  }
  if (sequence === "[" || name === "[") {
    return statsResult(state, {
      view: "trends",
      trendRange: adjacentTrendRange(
        state.route.trendRange ?? "sessions_30",
        -1,
      ),
      trendIndex: Number.MAX_SAFE_INTEGER,
    });
  }
  if (sequence === "]" || name === "]") {
    return statsResult(state, {
      view: "trends",
      trendRange: adjacentTrendRange(
        state.route.trendRange ?? "sessions_30",
        1,
      ),
      trendIndex: Number.MAX_SAFE_INTEGER,
    });
  }
  if (isVerticalKey(name, sequence, "up") || isVerticalKey(name, sequence, "down")) {
    const direction = isVerticalKey(name, sequence, "up") ? -1 : 1;
    const currentIndex = Math.max(0, forms.indexOf(currentTrend.form));
    const nextForm = forms[cycleIndex(currentIndex, forms.length, direction)];
    return nextForm === undefined
      ? { state, action: "continue" }
      : statsResult(state, {
          view: "trends",
          trendForm: nextForm,
          trendIndex: Number.MAX_SAFE_INTEGER,
        });
  }

  const lastIndex = currentTrend.points.length - 1;
  const currentIndex = clampIndex(
    state.route.trendIndex ?? lastIndex,
    currentTrend.points.length,
  );
  if (isHorizontalKey(name, sequence, "left")) {
    return statsResult(state, {
      view: "trends",
      trendIndex: Math.max(0, currentIndex - 1),
    });
  }
  if (isHorizontalKey(name, sequence, "right")) {
    return statsResult(state, {
      view: "trends",
      trendIndex: Math.min(lastIndex, currentIndex + 1),
    });
  }
  if (name === "home" || sequence === "home") {
    return statsResult(state, { view: "trends", trendIndex: 0 });
  }
  if (name === "end" || sequence === "end") {
    return statsResult(state, { view: "trends", trendIndex: lastIndex });
  }
  return { state, action: "continue" };
}

export function reduceSkillsStatsKey(
  state: OpenTuiStatsState,
  event: OpenTuiKeyEvent,
): OpenTuiAppKeyResult {
  const signals = buildDashboardSkillData(state.route.records).keys;
  const current = state.route.skillKey ?? defaultPhysicalKeyId(signals);
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();
  const direction = arrowDirection(name, sequence);
  if (direction === null) {
    return { state, action: "continue" };
  }
  return statsResult(state, {
    view: "skills",
    skillKey: movePhysicalKey(current, direction),
  });
}

export function reduceHistoryStatsKey(
  state: OpenTuiStatsState,
  event: OpenTuiKeyEvent,
): OpenTuiAppKeyResult {
  const dates = activeRecordDates(state.route.records);
  if (dates.length === 0) {
    return { state, action: "continue" };
  }
  const currentDay = clampIndex(state.route.dailyIndex ?? 0, dates.length);
  const date = dates[currentDay] ?? "";
  const sessions = recordsForDate(state.route.records, date);
  const name = event.name.toLowerCase();
  const sequence = event.sequence.toLowerCase();

  if (isHorizontalKey(name, sequence, "right")) {
    return historyDayResult(state, Math.min(dates.length - 1, currentDay + 1));
  }
  if (isHorizontalKey(name, sequence, "left")) {
    return historyDayResult(state, Math.max(0, currentDay - 1));
  }
  if (name === "home" || sequence === "home") {
    return historyDayResult(state, dates.length - 1);
  }
  if (name === "end" || sequence === "end") {
    return historyDayResult(state, 0);
  }

  const currentSession = clampIndex(
    state.route.historySessionIndex ?? 0,
    sessions.length,
  );
  if (isVerticalKey(name, sequence, "up")) {
    return statsResult(state, {
      view: "history",
      historySessionIndex: Math.max(0, currentSession - 1),
      historyExpanded: false,
    });
  }
  if (isVerticalKey(name, sequence, "down")) {
    return statsResult(state, {
      view: "history",
      historySessionIndex: Math.min(sessions.length - 1, currentSession + 1),
      historyExpanded: false,
    });
  }
  if (isSelectEvent(event) && sessions.length > 0) {
    return statsResult(state, {
      view: "history",
      historyExpanded: !(state.route.historyExpanded ?? false),
    });
  }
  return { state, action: "continue" };
}

export function statsState(
  state: OpenTuiAppState,
  context: OpenTuiAppSessionContext,
  view: OpenTuiStatsView,
): OpenTuiAppState {
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
    view: state.route.view,
    ...(state.route.now === undefined ? {} : { now: state.route.now }),
    ...(state.route.keyAggregates === undefined
      ? {}
      : { keyAggregates: state.route.keyAggregates }),
    ...(state.route.keyStatsSort === undefined
      ? {}
      : { keyStatsSort: state.route.keyStatsSort }),
    ...(state.route.dailyIndex === undefined
      ? {}
      : { dailyIndex: state.route.dailyIndex }),
    ...(state.route.trendIndex === undefined
      ? {}
      : { trendIndex: state.route.trendIndex }),
    ...(state.route.trendForm === undefined
      ? {}
      : { trendForm: state.route.trendForm }),
    ...(state.route.trendMetric === undefined
      ? {}
      : { trendMetric: state.route.trendMetric }),
    ...(state.route.trendRange === undefined
      ? {}
      : { trendRange: state.route.trendRange }),
    ...(state.route.skillKey === undefined
      ? {}
      : { skillKey: state.route.skillKey }),
    ...(state.route.historySessionIndex === undefined
      ? {}
      : { historySessionIndex: state.route.historySessionIndex }),
    ...(state.route.historyExpanded === undefined
      ? {}
      : { historyExpanded: state.route.historyExpanded }),
    ...overrides,
  };
  return createOpenTuiStatsState(state.language, state.route.records, options);
}

export function nextKeyStatsSort(sort: KeyStatsSort): KeyStatsSort {
  const index = keyStatsSorts.indexOf(sort);
  return keyStatsSorts[(index + 1) % keyStatsSorts.length] ?? "slowest_average";
}

function statsResult(
  state: OpenTuiStatsState,
  options: OpenTuiStatsStateOptions,
): OpenTuiAppKeyResult {
  return {
    state: statsStateFromRoute(state, options),
    action: "continue",
  };
}

function historyDayResult(
  state: OpenTuiStatsState,
  dailyIndex: number,
): OpenTuiAppKeyResult {
  return statsResult(state, {
    view: "history",
    dailyIndex,
    historySessionIndex: 0,
    historyExpanded: false,
  });
}

function adjacentTrendRange(
  current: StatsTrendRange,
  delta: -1 | 1,
): StatsTrendRange {
  const index = STATS_TREND_RANGES.indexOf(current);
  return STATS_TREND_RANGES[cycleIndex(index, STATS_TREND_RANGES.length, delta)] ?? "sessions_30";
}

function cycleIndex(index: number, length: number, delta: number): number {
  if (length === 0) return 0;
  return (index + delta + length) % length;
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(length - 1, 0));
}

function arrowDirection(
  name: string,
  sequence: string,
): "left" | "right" | "up" | "down" | null {
  for (const direction of ["left", "right", "up", "down"] as const) {
    if (
      (direction === "left" || direction === "right"
        ? isHorizontalKey(name, sequence, direction)
        : isVerticalKey(name, sequence, direction))
    ) {
      return direction;
    }
  }
  return null;
}

function isHorizontalKey(
  name: string,
  sequence: string,
  direction: "left" | "right",
): boolean {
  const arrowName = direction === "left" ? "arrowleft" : "arrowright";
  const escapeSequence = direction === "left" ? "\x1b[d" : "\x1b[c";
  return (
    name === direction ||
    name === arrowName ||
    sequence === direction ||
    sequence === escapeSequence
  );
}

function isVerticalKey(
  name: string,
  sequence: string,
  direction: "up" | "down",
): boolean {
  const arrowName = direction === "up" ? "arrowup" : "arrowdown";
  const escapeSequence = direction === "up" ? "\x1b[a" : "\x1b[b";
  return (
    name === direction ||
    name === arrowName ||
    sequence === direction ||
    sequence === escapeSequence
  );
}
