import type { OpenTuiAppState } from "../appModel";
import {
  liveOptionsAvailableForSource,
  openTuiRouteTitle,
  targetRefreshAvailableForSource,
} from "../appModel";
import { TEXT_BOLD, theme } from "../theme";
import { divider, keyHintBar, type KeyHint } from "../components";
import type { OpenTuiRendererKit } from "../kit";
import { formatElapsedTime, type RunningRoute } from "./shared";

export const OPEN_TUI_ROOT_ID = "keyloop-open-tui-root";

export const APP_FRAME_WIDTH = 96;

export function renderAppFrame(
  state: OpenTuiAppState,
  content: unknown,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: OPEN_TUI_ROOT_ID,
      backgroundColor: theme.background,
      paddingX: 1,
      flexDirection: "column",
      gap: 0,
      width: APP_FRAME_WIDTH,
      marginLeft: "auto",
      marginRight: "auto",
      height: "100%",
    },
    renderTopbar(state, kit),
    divider("keyloop-topbar-rule", kit),
    kit.Box(
      {
        id: "keyloop-app-content",
        flexDirection: "column",
        gap: 1,
        flexGrow: 1,
        width: "100%",
        overflow: "hidden",
      },
      content,
    ),
    divider("keyloop-hintbar-rule", kit),
    keyHintBar("keyloop-hintbar", routeHints(state), kit),
  );
}

export function renderTopbar(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  return kit.Box(
    {
      id: "keyloop-topbar",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
      height: 1,
    },
    kit.Box(
      { id: "keyloop-route", flexDirection: "row", gap: 1 },
      kit.Text({
        content: "▌KeyLoop",
        fg: theme.accent,
        attributes: TEXT_BOLD,
        id: "keyloop-brand",
        height: 1,
        wrapMode: "none",
      }),
      kit.Text({
        content: `› ${routeCrumb(state)}`,
        fg: theme.muted,
        id: "keyloop-route-crumb",
        height: 1,
        wrapMode: "none",
        truncate: true,
      }),
    ),
    kit.Box(
      {
        id: "keyloop-topbar-today-duration",
        flexDirection: "row",
        gap: 1,
        alignItems: "center",
        height: 1,
        flexShrink: 0,
      },
      kit.Text({
        id: "keyloop-topbar-today-duration-label",
        content: state.language === "zh" ? "今日" : "Today",
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
      }),
      kit.Text({
        id: "keyloop-topbar-today-duration-value",
        content: todayDurationValue(state),
        fg: theme.brightCyan,
        height: 1,
        wrapMode: "none",
      }),
    ),
  );
}

export function routeHints(state: OpenTuiAppState): KeyHint[] {
  const zh = state.language === "zh";
  switch (state.route.screen) {
    case "main_menu":
      return [
        { key: "↑↓", label: zh ? "选择" : "select" },
        { key: "1-9", label: zh ? "直达" : "jump" },
        { key: "Enter", label: zh ? "进入" : "open" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
    case "submenu":
      return [
        { key: "↑↓", label: zh ? "选择" : "select" },
        { key: "1-9", label: zh ? "直达" : "jump" },
        { key: "Enter", label: zh ? "开始" : "start" },
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
    case "settings":
      if (state.route.view === "code_filters") {
        return [
          { key: "↑↓", label: zh ? "选择" : "select" },
          { key: "Enter/→", label: zh ? "选中" : "toggle" },
          { key: "←", label: zh ? "清除" : "clear" },
          { key: "Ctrl+P", label: zh ? "固定常用" : "pin" },
          { key: "Esc", label: zh ? "返回" : "back" },
        ];
      }
      if (state.route.view === "menu") {
        return [
          { key: "↑↓", label: zh ? "选择" : "select" },
          { key: "←→", label: zh ? "调整" : "adjust" },
          { key: "Enter", label: zh ? "打开" : "open" },
          { key: "Esc", label: zh ? "返回" : "back" },
        ];
      }
      return [{ key: "Esc", label: zh ? "返回" : "back" }];
    case "stats":
      return [
        { key: "Tab", label: zh ? "切换视图" : "next view" },
        ...(state.route.view === "keys"
          ? [{ key: "S", label: zh ? "排序" : "sort" }]
          : []),
        ...(state.route.view === "daily"
          ? [{ key: "←→", label: zh ? "切换日期" : "change day" }]
          : []),
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
    case "running":
      return runningHints(state.route, zh);
    case "exit_confirmation":
      return [
        { key: "Enter", label: zh ? "确认退出" : "confirm exit" },
        { key: "Esc", label: zh ? "返回练习" : "keep typing" },
      ];
    case "code_settings_confirmation":
      return [
        { key: "Enter", label: zh ? "刷新本组" : "refresh group" },
        { key: "Esc", label: zh ? "取消" : "cancel" },
      ];
    case "practice_options":
      return [
        { key: "↑↓", label: zh ? "选择" : "select" },
        { key: "←→", label: zh ? "调整" : "adjust" },
        { key: "Enter", label: zh ? "继续" : "resume" },
        { key: "Esc", label: zh ? "关闭" : "close" },
      ];
    case "complete":
      return [
        { key: "Enter", label: zh
          ? state.route.result_visible
            ? "关闭结果"
            : "继续"
          : state.route.result_visible
            ? "close result"
            : "continue" },
        { key: "R", label: zh ? "重练" : "repeat" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
    case "summary":
    case "ansi_palette":
      return [
        { key: "Esc", label: zh ? "返回" : "back" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
  }
}

export function runningHints(route: RunningRoute, zh: boolean): KeyHint[] {
  const paused = route.live?.paused === true;
  const hints: KeyHint[] = [
    { key: "Ctrl+P", label: zh ? (paused ? "继续" : "暂停") : paused ? "resume" : "pause" },
    { key: "Ctrl+N", label: zh ? "重打" : "retry" },
  ];
  if (liveOptionsAvailableForSource(route.source_item)) {
    hints.push({ key: "Ctrl+O", label: zh ? "选项" : "options" });
  }
  if (targetRefreshAvailableForSource(route.source_item)) {
    hints.push({ key: "Ctrl+R", label: zh ? "重开" : "refresh" });
  }
  hints.push({ key: "Esc", label: zh ? "退出" : "exit" });
  return hints;
}

export function todayDurationValue(state: OpenTuiAppState): string {
  const liveElapsedMs =
    state.route.screen === "running" || state.route.screen === "exit_confirmation"
      ? state.route.live?.elapsed_ms ?? 0
      : state.route.screen === "complete"
        ? state.route.live?.elapsed_ms ?? state.route.record.duration_ms
        : 0;
  return formatElapsedTime((state.today_elapsed_ms ?? 0) + liveElapsedMs);
}

export function routeCrumb(state: OpenTuiAppState): string {
  switch (state.route.screen) {
    case "main_menu":
      return state.language === "zh" ? "练习菜单 · 今日自适应计划" : "Practice menu · adaptive plan";
    case "submenu":
      return `${openTuiRouteTitle(state)} › ${state.language === "zh" ? "选择练习" : "choose lesson"}`;
    case "running":
      return `${openTuiRouteTitle(state)} › ${state.route.lesson?.module ?? state.route.source_item}`;
    case "complete":
      return `${openTuiRouteTitle(state)} › ${state.route.record.module}`;
    case "settings":
    case "stats":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "summary":
    case "ansi_palette":
      return openTuiRouteTitle(state);
  }
}
