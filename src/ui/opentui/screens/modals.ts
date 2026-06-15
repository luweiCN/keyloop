import type { OpenTuiAppState } from "../appModel";
import { openTuiRouteLines, openTuiRouteTitle } from "../appModel";
import { speedFromWpm, speedUnitLabel } from "../../../report/stats";
import { heatScaleColor } from "../../heatScale";
import { TEXT_BOLD, theme, type OpenTuiColorInput, type Tone } from "../theme";
import { listRow, modal, statCell, type KeyHint } from "../components";
import type { OpenTuiRendererKit } from "../kit";
import {
  buildKeyDiagnostics,
  diagnosticKeyId,
  formatElapsedTime,
  renderPanel,
  type CompleteRoute,
  type KeyDiagnosticItem,
  type PracticeOptionsRoute,
  type RunningRoute,
} from "./shared";
import { plannedDurationValue, plannedMinutesValue, renderRunningScreen } from "./running";
import { wordWpmExtremes } from "../../../training/liveSession";

export async function renderCompleteScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): Promise<unknown> {
  if (state.route.screen !== "complete") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  if (state.route.target !== undefined) {
    const target = completedSnapshotTarget(state.route);
    const runningState: OpenTuiAppState = {
      ...state,
      route: {
        screen: "running",
        target,
        source_item: state.route.source_item,
        ...(state.route.lesson === undefined ? {} : { lesson: state.route.lesson }),
        live: completedSnapshotLive(state.route.live, state.route.record),
      },
    };
    // 弹窗关闭后进入复盘态：reviewScroll 控制滚动；弹窗显示时保持默认（停底部）
    const runningScreen = await renderRunningScreen(runningState, kit, {
      completed: true,
      ...(state.route.result_visible
        ? {}
        : { reviewScroll: state.route.review_scroll ?? Number.POSITIVE_INFINITY }),
    });
    if (!state.route.result_visible) {
      return runningScreen;
    }
    return kit.Box(
      {
        id: "keyloop-complete-with-popup",
        position: "relative",
        flexDirection: "column",
        flexGrow: 1,
        width: "100%",
        height: "100%",
        overflow: "hidden",
      },
      runningScreen,
      renderCompletionOverlay(state, kit),
    );
  }
  return renderCompletionPopup(state, kit);
}

export async function renderExitConfirmationScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): Promise<unknown> {
  if (state.route.screen !== "exit_confirmation") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const runningState: OpenTuiAppState = {
    ...state,
    route: {
      screen: "running",
      target: state.route.target,
      source_item: state.route.source_item,
      ...(state.route.lesson === undefined ? {} : { lesson: state.route.lesson }),
      ...(state.route.live === undefined ? {} : { live: state.route.live }),
    },
  };
  return kit.Box(
    {
      id: "keyloop-exit-confirmation-with-popup",
      position: "relative",
      flexDirection: "column",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    await renderRunningScreen(runningState, kit),
    renderExitConfirmationOverlay(state, kit),
  );
}

export async function renderCodeSettingsConfirmationScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): Promise<unknown> {
  if (state.route.screen !== "code_settings_confirmation") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const runningState: OpenTuiAppState = {
    ...state,
    route: {
      screen: "running",
      target: state.route.target,
      source_item: state.route.source_item,
      ...(state.route.lesson === undefined ? {} : { lesson: state.route.lesson }),
      ...(state.route.live === undefined ? {} : { live: state.route.live }),
    },
  };
  return kit.Box(
    {
      id: "keyloop-code-settings-confirmation-with-popup",
      position: "relative",
      flexDirection: "column",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    await renderRunningScreen(runningState, kit),
    renderCodeSettingsConfirmationOverlay(state, kit),
  );
}

export async function renderPracticeOptionsScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): Promise<unknown> {
  if (state.route.screen !== "practice_options") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const runningState: OpenTuiAppState = {
    ...state,
    route: {
      screen: "running",
      target: state.route.target,
      source_item: state.route.source_item,
      ...(state.route.lesson === undefined ? {} : { lesson: state.route.lesson }),
      ...(state.route.live === undefined ? {} : { live: state.route.live }),
    },
  };
  return kit.Box(
    {
      id: "keyloop-practice-options-with-popup",
      position: "relative",
      flexDirection: "column",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    await renderRunningScreen(runningState, kit),
    renderPracticeOptionsOverlay(state.route, state.language, kit),
  );
}

export function renderPracticeOptionsOverlay(
  route: PracticeOptionsRoute,
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown {
  return renderCenteredModalOverlay(
    "keyloop-practice-options-overlay",
    "56%",
    "58%",
    renderPracticeOptionsPopup(route, language, kit),
    kit,
  );
}

export function renderPracticeOptionsPopup(
  route: PracticeOptionsRoute,
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown {
  return renderModalPopup(
    "keyloop-practice-options",
    language === "zh" ? "练习选项" : "Practice options",
    language === "zh" ? "↑↓ 选择 · ←→ 调整 · Enter 继续 · Esc 关闭" : "↑↓ select · ←→ adjust · Enter resume · Esc close",
    "info",
    kit,
    {
      popupChildren: route.practice_options.items.map((item, index) =>
        renderPracticeOptionRow(item, index, index === route.practice_options.selected_index, kit),
      ),
    },
  );
}

export function renderPracticeOptionRow(
  item: PracticeOptionsRoute["practice_options"]["items"][number],
  index: number,
  selected: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  return listRow(
    `keyloop-practice-option-row-${index}`,
    selected,
    { height: 1, gap: 1 },
    kit,
    kit.Text({
      id: `keyloop-practice-option-row-${index}-label`,
      content: item.label,
      fg: selected ? theme.accent : theme.foreground,
      attributes: selected ? TEXT_BOLD : undefined,
      height: 1,
      wrapMode: "none",
      flexGrow: 1,
    }),
    kit.Text({
      id: `keyloop-practice-option-row-${index}-value`,
      content: selected ? `‹ ${item.value} ›` : item.value,
      fg: selected ? theme.warning : theme.muted,
      attributes: selected ? TEXT_BOLD : undefined,
      height: 1,
      wrapMode: "none",
    }),
  );
}

export function renderCodeSettingsConfirmationOverlay(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  return renderCenteredModalOverlay(
    "keyloop-code-settings-confirmation-overlay",
    "64%",
    "45%",
    renderCodeSettingsConfirmationPopup(state, kit),
    kit,
  );
}

export function renderCodeSettingsConfirmationPopup(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const lines = openTuiRouteLines(state);
  return renderModalPopup(
    "keyloop-code-settings-confirmation",
    openTuiRouteTitle(state),
    state.language === "zh" ? "Enter 刷新本组 · Esc 取消" : "Enter refresh · Esc cancel",
    "warn",
    kit,
    {
      popupChildren: [
        kit.Text({
          content: lines[0] ?? "",
          fg: theme.foreground,
          id: "keyloop-code-settings-confirmation-message",
          height: 1,
          truncate: true,
        }),
        kit.Text({
          content: lines[1] ?? "",
          fg: theme.muted,
          id: "keyloop-code-settings-confirmation-warning",
          height: 1,
          truncate: true,
        }),
      ],
    },
  );
}

export function renderExitConfirmationOverlay(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  return renderCenteredModalOverlay(
    "keyloop-exit-confirmation-overlay",
    "64%",
    "45%",
    renderExitConfirmationPopup(state, kit),
    kit,
  );
}

export function renderExitConfirmationPopup(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const lines = openTuiRouteLines(state);
  return renderModalPopup(
    "keyloop-exit-confirmation",
    openTuiRouteTitle(state),
    state.language === "zh" ? "Enter 确认退出 · Esc 返回练习" : "Enter confirm exit · Esc keep typing",
    "bad",
    kit,
    {
      popupChildren: [
        kit.Text({
          content: lines[0] ?? "",
          fg: theme.foreground,
          id: "keyloop-exit-confirmation-message",
          height: 1,
          truncate: true,
        }),
        kit.Text({
          content: lines[1] ?? "",
          fg: theme.muted,
          id: "keyloop-exit-confirmation-warning",
          height: 1,
          truncate: true,
        }),
      ],
    },
  );
}

export function completedSnapshotTarget(route: CompleteRoute): RunningRoute["target"] {
  const target: RunningRoute["target"] = {
    mode: route.record.mode,
    text: route.record.target_text,
    source: route.record.source.length > 0 ? route.record.source : (route.target?.source ?? ""),
  };
  if (route.target?.text === route.record.target_text) {
    if (route.target.code_blocks !== undefined) {
      target.code_blocks = route.target.code_blocks;
    }
    if (route.target.annotations !== undefined) {
      target.annotations = route.target.annotations;
    }
  }
  return target;
}

export function completedSnapshotLive(
  live: RunningRoute["live"] | undefined,
  record: Extract<OpenTuiAppState["route"], { screen: "complete" }>["record"],
): NonNullable<RunningRoute["live"]> {
  return {
    input: record.target_text,
    elapsed_ms: live?.elapsed_ms ?? record.duration_ms,
    key_events: record.key_events,
    metrics: {
      wpm: record.wpm,
      raw_wpm: record.raw_wpm,
      accuracy: record.accuracy,
      errors: record.error_count,
      backspaces: record.backspace_count,
    },
  };
}

export function renderCompletionOverlay(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  return renderCenteredModalOverlay(
    "keyloop-complete-overlay",
    "94%",
    "80%",
    renderCompletionPopup(state, kit),
    kit,
  );
}

export function renderCenteredModalOverlay(
  id: string,
  width: string,
  maxHeight: string,
  modal: unknown,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id,
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: "100%",
      height: "100%",
      zIndex: 10,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    kit.Box(
      {
        id: `${id}-viewport`,
        flexDirection: "column",
        width,
        maxHeight,
        overflow: "hidden",
      },
      modal,
    ),
  );
}

export function renderCompletionPopup(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  if (state.route.screen !== "complete") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const record = state.route.record;
  const next = completionNextLine(state.route, state.language);
  const speedUnit = state.speed_unit ?? "wpm";
  const metricLabel = speedUnitLabel(speedUnit);
  const extremes = wordWpmExtremes(record.target_text, record.key_events);
  return renderModalPopup(
    "keyloop-complete",
    openTuiRouteTitle(state),
    state.language === "zh"
      ? "Enter 关闭 · R 重练 · Q 退出"
      : "Enter close · R repeat · Q quit",
    "good",
    kit,
    {
      shellId: "keyloop-complete-popup",
      panelId: "keyloop-complete-card",
      popupChildren: [
        kit.Text({
          content:
            state.language === "zh"
              ? `模式 ${record.mode} · 模块 ${record.module}`
              : `Mode ${record.mode} · Module ${record.module}`,
          fg: theme.muted,
        }),
        kit.Box(
          {
            id: "keyloop-complete-stat-row",
            flexDirection: "row",
            gap: 2,
            width: "100%",
            height: 2,
            overflow: "hidden",
          },
          statCell(
            "keyloop-complete-stat-wpm",
            metricLabel,
            speedFromWpm(record.wpm, speedUnit).toFixed(1),
            "good",
            kit,
          ),
          statCell(
            "keyloop-complete-stat-raw",
            state.language === "zh" ? `原始 ${metricLabel}` : `Raw ${metricLabel}`,
            speedFromWpm(record.raw_wpm, speedUnit).toFixed(1),
            "neutral",
            kit,
          ),
          statCell(
            "keyloop-complete-stat-accuracy",
            state.language === "zh" ? "准确" : "Accuracy",
            `${record.accuracy.toFixed(1)}%`,
            "warn",
            kit,
          ),
          statCell(
            "keyloop-complete-stat-errors",
            state.language === "zh" ? "错误" : "Errors",
            String(record.error_count),
            "bad",
            kit,
          ),
          ...(extremes === undefined
            ? []
            : [
                statCell(
                  "keyloop-complete-stat-extremes",
                  state.language === "zh" ? "最快/最慢" : "Fast/Slow",
                  `${speedFromWpm(extremes.fastest, speedUnit).toFixed(0)}/${speedFromWpm(
                    extremes.slowest,
                    speedUnit,
                  ).toFixed(0)}`,
                  "neutral",
                  kit,
                ),
              ]),
        ),
        renderCompletionDetails(record, state.route.lesson, state.language, kit),
        ...renderCompletionKeyDiagnostics(record, state.language, kit),
        ...(next === undefined
          ? []
          : [kit.Text({ content: next, fg: theme.cyan, id: "keyloop-complete-next" })]),
      ],
    },
  );
}

export function renderCompletionDetails(
  record: CompleteRoute["record"],
  lesson: CompleteRoute["lesson"],
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown {
  const planned = plannedMinutesValue(lesson);
  return kit.Box(
    {
      id: "keyloop-complete-details",
      flexDirection: "row",
      gap: 2,
      width: "100%",
      overflow: "hidden",
    },
    kit.Text({
      content:
        language === "zh"
          ? `用时 ${formatElapsedTime(record.duration_ms)}`
          : `Time ${formatElapsedTime(record.duration_ms)}`,
      fg: theme.muted,
      id: "keyloop-complete-duration",
      height: 1,
      wrapMode: "none",
    }),
    ...(planned === undefined
      ? []
      : [
          kit.Text({
            content:
              language === "zh"
                ? `计划 ${plannedDurationValue(planned, language)}`
                : `Planned ${plannedDurationValue(planned, language)}`,
            fg: theme.muted,
            id: "keyloop-complete-planned",
            height: 1,
            wrapMode: "none",
          }),
        ]),
    kit.Text({
      content:
        language === "zh"
          ? `正确字符 ${record.correct_chars}/${record.target_len}`
          : `Correct chars ${record.correct_chars}/${record.target_len}`,
      fg: theme.muted,
      id: "keyloop-complete-chars",
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
  );
}

export function renderCompletionKeyDiagnostics(
  record: CompleteRoute["record"],
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown[] {
  const summary = buildKeyDiagnostics(record.target_text, record.key_events);
  const rows = [
    renderCompletionKeySpeedRow(
      "slow",
      language === "zh" ? "慢" : "Slow",
      summary.slow_keys,
      kit,
    ),
    renderCompletionKeySpeedRow(
      "fast",
      language === "zh" ? "快" : "Fast",
      summary.fast_keys,
      kit,
    ),
    renderCompletionKeyErrorRow(
      language === "zh" ? "错" : "Err",
      summary.error_keys,
      kit,
    ),
  ].filter((row): row is unknown => row !== undefined);
  if (rows.length === 0) {
    return [];
  }
  return [
    kit.Box(
      {
        id: "keyloop-complete-key-diagnostics",
        flexDirection: "column",
        gap: 0,
        width: "100%",
        overflow: "hidden",
      },
      ...rows,
    ),
  ];
}

export function renderCompletionKeySpeedRow(
  kind: "slow" | "fast",
  label: string,
  items: readonly KeyDiagnosticItem[],
  kit: OpenTuiRendererKit,
): unknown | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return kit.Box(
    {
      id: `keyloop-complete-key-${kind}-row`,
      flexDirection: "row",
      width: "100%",
      minHeight: 1,
      overflow: "hidden",
    },
    kit.Text({
      id: `keyloop-complete-key-${kind}-label`,
      content: `${label} `,
      fg: theme.foreground,
      height: 1,
      wrapMode: "none",
    }),
    kit.Box(
      {
        id: `keyloop-complete-key-${kind}-grid`,
        flexDirection: "row",
        flexWrap: "wrap",
        flexGrow: 1,
        overflow: "hidden",
      },
      ...items.map((item) =>
        kit.Box(
          {
            id: `keyloop-complete-key-${kind}-cell-${diagnosticKeyId(item.label)}`,
            flexDirection: "row",
            width: 16,
            height: 1,
            overflow: "hidden",
          },
          kit.Text({
            id: `keyloop-complete-key-${kind}-${diagnosticKeyId(item.label)}`,
            content: ` ${item.label} `,
            fg: theme.foreground,
            bg: heatScaleColor("success", item.speed_level),
            height: 1,
            wrapMode: "none",
          }),
          kit.Text({
            id: `keyloop-complete-key-${kind}-${diagnosticKeyId(item.label)}-speed`,
            content: ` ${formatKeyWpm(item.wpm)} WPM  `,
            fg: theme.muted,
            height: 1,
            wrapMode: "none",
          }),
        ),
      ),
    ),
  );
}

export function renderCompletionKeyErrorRow(
  label: string,
  items: readonly KeyDiagnosticItem[],
  kit: OpenTuiRendererKit,
): unknown | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return kit.Box(
    {
      id: "keyloop-complete-key-error-row",
      flexDirection: "row",
      width: "100%",
      minHeight: 1,
      overflow: "hidden",
    },
    kit.Text({
      id: "keyloop-complete-key-error-label",
      content: `${label} `,
      fg: theme.foreground,
      height: 1,
      wrapMode: "none",
    }),
    kit.Box(
      {
        id: "keyloop-complete-key-error-grid",
        flexDirection: "row",
        flexWrap: "wrap",
        flexGrow: 1,
        overflow: "hidden",
      },
      ...items.map((item) =>
        kit.Box(
          {
            id: `keyloop-complete-key-error-cell-${diagnosticKeyId(item.label)}`,
            flexDirection: "row",
            width: 16,
            height: 1,
            overflow: "hidden",
          },
          kit.Text({
            id: `keyloop-complete-key-error-${diagnosticKeyId(item.label)}`,
            content: ` ${item.label} `,
            fg: theme.foreground,
            bg: heatScaleColor("danger", item.error_level),
            height: 1,
            wrapMode: "none",
          }),
          kit.Text({
            id: `keyloop-complete-key-error-${diagnosticKeyId(item.label)}-count`,
            content: ` ×${item.error_count}  `,
            fg: theme.muted,
            height: 1,
            wrapMode: "none",
          }),
        ),
      ),
    ),
  );
}

export function formatKeyWpm(value: number | undefined): string {
  return value === undefined ? "--" : value.toFixed(1);
}

export function renderModalPopup(
  idPrefix: string,
  title: string,
  bottomTitle: string | undefined,
  tone: Tone,
  kit: OpenTuiRendererKit,
  options: {
    shellId?: string;
    panelId?: string;
    popupChildren: unknown[];
  },
): unknown {
  return kit.Box(
    {
      id: options.shellId ?? `${idPrefix}-popup-shell`,
      flexDirection: "column",
      gap: 1,
      width: "100%",
      maxHeight: "100%",
    },
    modal(
      options.panelId ?? `${idPrefix}-popup`,
      { title, tone, ...(bottomTitle === undefined ? {} : { bottomTitle }) },
      kit,
      ...options.popupChildren,
    ),
  );
}

export function completionNextLine(
  route: CompleteRoute,
  language: OpenTuiAppState["language"],
): string | undefined {
  if (route.record.daily_run_id === "" || route.source_item !== "comprehensive") {
    return undefined;
  }
  if (route.next_lesson === undefined) {
    return language === "zh" ? "今日综合练习完成" : "Daily plan complete";
  }
  return language === "zh"
    ? `下一组：${route.next_lesson.module}`
    : `Next: ${route.next_lesson.module}`;
}

type ModalRoute = Extract<
  OpenTuiAppState["route"],
  {
    screen: "exit_confirmation" | "code_settings_confirmation" | "practice_options" | "complete";
  }
>;

export function modalHints(route: ModalRoute, zh: boolean): KeyHint[] {
  switch (route.screen) {
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
        {
          key: "Enter",
          label: zh
            ? route.result_visible
              ? "关闭结果"
              : "继续"
            : route.result_visible
              ? "close result"
              : "continue",
        },
        { key: "R", label: zh ? "重练" : "repeat" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
  }
}
