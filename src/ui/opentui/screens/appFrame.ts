import type { OpenTuiAppState } from "../appModel";
import {
  liveOptionsAvailableForSource,
  openTuiRouteTitle,
  targetRefreshAvailableForSource,
} from "../appModel";
import { TEXT_BOLD, theme } from "../theme";
import { divider, keyHintBar, type KeyHint } from "../components";
import type { OpenTuiRendererKit } from "../kit";
import { formatElapsedTime } from "./shared";
import { menuHints } from "./menu";
import { settingsHints } from "./settings";
import { statsHints } from "./stats";
import { runningHints } from "./running";
import { modalHints } from "./modals";

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
    case "submenu":
      return menuHints(state.route.screen, zh);
    case "library_menu":
      return menuHints("submenu", zh);
    case "library_create":
    case "library_manage":
    case "library_actions":
    case "library_input":
    case "library_preview":
    case "library_browse":
    case "library_delete_confirm":
    case "library_detail":
      return [
        { key: "Esc", label: zh ? "返回" : "back" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
    case "settings":
      return settingsHints(state.route.view, zh);
    case "stats":
      return statsHints(state.route.view, zh);
    case "running":
      return runningHints(state.route, zh);
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "complete":
      return modalHints(state.route, zh);
    case "stage_plan":
      return [
        { key: "Enter", label: zh ? "开始" : "start" },
        { key: "←/→", label: zh ? "调整时长" : "adjust" },
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
    case "goal_onboarding":
      return [
        { key: "Enter", label: zh ? "设为目标" : "set goal" },
        { key: "←/→", label: zh ? "切换方向" : "switch" },
        { key: "S", label: zh ? "跳过" : "skip" },
        { key: "N", label: zh ? "不再提醒" : "stop" },
      ];
    case "summary":
    case "ansi_palette":
      return [
        { key: "Esc", label: zh ? "返回" : "back" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
  }
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
    case "stage_plan":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "summary":
    case "goal_onboarding":
    case "ansi_palette":
    case "library_menu":
    case "library_create":
    case "library_manage":
    case "library_actions":
    case "library_input":
    case "library_preview":
    case "library_browse":
    case "library_delete_confirm":
    case "library_detail":
      return openTuiRouteTitle(state);
  }
}
