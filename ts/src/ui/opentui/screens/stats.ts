import type { OpenTuiAppState } from "../appModel";
import {
  openTuiRouteLines,
  openTuiRouteTitle,
  openTuiStatsViews,
  type OpenTuiStatsView,
} from "../appModel";
import { theme } from "../theme";
import { emptyState, tabStrip, type KeyHint } from "../components";
import type { OpenTuiRendererKit } from "../kit";
import { renderPanel } from "./shared";

export function statsViewLabel(view: (typeof openTuiStatsViews)[number], zh: boolean): string {
  switch (view) {
    case "overview":
      return zh ? "总览" : "Overview";
    case "today":
      return zh ? "今日" : "Today";
    case "comprehensive":
      return zh ? "综合" : "Daily plan";
    case "modules":
      return zh ? "模块" : "Modules";
    case "keys":
      return zh ? "键位" : "Keys";
    case "tokens":
      return zh ? "词块" : "Tokens";
    case "code":
      return zh ? "代码" : "Code";
    case "daily":
      return zh ? "按日" : "By day";
  }
}

export function renderStatsScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  if (state.route.screen !== "stats") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const zh = state.language === "zh";
  const activeView = state.route.view;
  const lines = openTuiRouteLines(state);
  const hasData =
    state.route.records.length > 0 ||
    (activeView === "keys" && (state.route.keyAggregates?.length ?? 0) > 0);
  return kit.Box(
    {
      id: "keyloop-stats-screen",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
      overflow: "hidden",
    },
    tabStrip(
      "keyloop-stats-tabs",
      openTuiStatsViews.map((view) => ({
        id: view,
        label: statsViewLabel(view, zh),
        active: view === activeView,
      })),
      kit,
    ),
    !hasData
      ? emptyState(
          "keyloop-stats-empty",
          "◌",
          zh ? "还没有练习记录" : "No sessions yet",
          zh ? "完成一次练习后这里会显示统计数据" : "Finish a session to see stats here",
          kit,
        )
      : renderPanel(
          "keyloop-route-panel",
          statsViewLabel(activeView, zh),
          lines,
          kit,
          { flexGrow: 1 },
        ),
  );
}

export function statsHints(view: OpenTuiStatsView, zh: boolean): KeyHint[] {
  return [
    { key: "Tab", label: zh ? "切换视图" : "next view" },
    ...(view === "keys" ? [{ key: "S", label: zh ? "排序" : "sort" }] : []),
    ...(view === "daily" ? [{ key: "←→", label: zh ? "切换日期" : "change day" }] : []),
    { key: "Esc", label: zh ? "返回" : "back" },
  ];
}
