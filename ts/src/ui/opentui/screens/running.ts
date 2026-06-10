import type { OpenTuiAppState } from "../appModel";
import {
  liveOptionsAvailableForSource,
  openTuiRouteLines,
  openTuiRouteTitle,
  targetRefreshAvailableForSource,
} from "../appModel";
import type { EverydayEnglishSettings, SpeedUnit } from "../../../domain/model";
import { speedFromWpm, speedUnitLabel } from "../../../report/stats";
import { heatScaleColor } from "../../heatScale";
import { TEXT_BOLD, theme, toneColor, type OpenTuiColorInput, type Tone } from "../theme";
import { panel, type KeyHint } from "../components";
import {
  codeDifficultyLabel,
  codeFacetLabel,
  codeLengthLabel,
  everydayLengthLabel,
  everydayLevelShortLabel,
  everydayWordRangeLabel,
} from "../labels";
import type { OpenTuiRendererKit } from "../kit";
import {
  buildKeyDiagnostics,
  diagnosticKeyId,
  diagnosticKeyRows,
  formatElapsedTime,
  groupProgressForTarget,
  progressDetailLine,
  renderGroupProgressPanel,
  renderPanel,
  type GroupProgressData,
  type KeyDiagnosticItem,
  type LiveMetrics,
  type RunningRoute,
} from "./shared";
import { renderGhostText } from "./ghostText";

export const DIAGNOSTIC_LABEL_WIDTH = 8;

export const DIAGNOSTIC_KEY_CELL_WIDTH = 3;

export async function renderRunningScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
  options: { completed?: boolean } = {},
): Promise<unknown> {
  if (state.route.screen !== "running") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const route = state.route;
  const input = route.live?.input ?? "";
  const ghostText = await renderGhostText(
    route.target.text,
    input,
    route.target.mode,
    route.target.source,
    route.target.code_blocks,
    route.target.annotations,
    kit,
    options.completed === true
      ? state.language === "zh"
        ? "✓ 本组完成 · Enter 下一组"
        : "✓ Group complete · Enter for next"
      : undefined,
  );
  return kit.Box(
    {
      id: "keyloop-running-screen",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
    },
    renderPracticeOverview(state, input, kit),
    renderPracticeDataPanel(
      route.target.text,
      input,
      route.live?.metrics.backspaces ?? 0,
      route.live?.metrics,
      state.language,
      state.speed_unit ?? "wpm",
      kit,
    ),
    ghostText,
    renderDiagnostics(
      route.target.text,
      route.live,
      kit,
      state.language,
    ),
  );
}

export function renderPracticeOverview(
  state: OpenTuiAppState,
  input: string,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "running") {
    return kit.Box({}, kit.Text({ content: "", fg: theme.foreground }));
  }
  const route = state.route;
  const moduleName = route.lesson?.module ?? route.source_item;
  const category = route.lesson?.category ?? route.target.mode;
  const title =
    state.language === "zh"
      ? `${runningTitlePrefix(route.source_item)}：${moduleName}`
      : `${runningTitlePrefix(route.source_item)}: ${moduleName}`;
  const lessonReason =
    state.language === "zh"
      ? route.lesson?.reason_zh.trim()
      : route.lesson?.reason_en.trim();
  const reason =
    lessonReason !== undefined && lessonReason.length > 0
      ? lessonReason
      : route.source_item === "comprehensive"
        ? state.language === "zh"
          ? `当前计划检测到 ${category} 需要复习，本组保留完整上下文。`
          : `Current plan is focusing ${category}; this group keeps the full context.`
        : undefined;
  const contentStatus =
    route.target.mode === "code"
      ? codeStatusSegments(route.target, input, state.language)
      : everydayStatusSegments(route.source_item, state.everydaySettings, state.language);
  return kit.Box(
    {
      id: "keyloop-practice-overview",
      flexDirection: "row",
      alignItems: "flex-start",
      width: "100%",
      gap: 2,
      flexShrink: 0,
      overflow: "hidden",
    },
    kit.Box(
      { flexDirection: "column", flexGrow: 1, minWidth: 0 },
      kit.Text({
        content: title,
        fg: theme.foreground,
        attributes: TEXT_BOLD,
        id: "keyloop-lesson-title",
        height: 1,
        truncate: true,
      }),
      ...(reason === undefined
        ? []
        : [
            kit.Text({
              content: reason,
              fg: theme.muted,
              id: "keyloop-lesson-reason",
              height: 1,
              truncate: true,
            }),
          ]),
      ...(contentStatus === undefined
        ? []
        : [
            renderPracticeStatusLine(
              contentStatus,
              practiceOptionsAvailable(route),
              state.language,
              kit,
            ),
          ]),
    ),
    renderPracticeTimeStack(state, kit),
  );
}

export function practiceOptionsAvailable(route: RunningRoute): boolean {
  return liveOptionsAvailableForSource(route.source_item);
}

export interface StatusSegment {
  readonly label?: string;
  readonly value: string;
}

export function renderPracticeStatusLine(
  segments: readonly StatusSegment[],
  optionsAvailable: boolean,
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: "keyloop-practice-status-line",
      flexDirection: "row",
      gap: 1,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    ...segments.flatMap((segment, index) => [
      ...(index === 0
        ? []
        : [
            kit.Text({
              id: `keyloop-practice-status-separator-${index - 1}`,
              content: "·",
              fg: theme.border,
              height: 1,
              wrapMode: "none",
            }),
          ]),
      ...(segment.label === undefined
        ? []
        : [
            kit.Text({
              id: `keyloop-practice-status-label-${index}`,
              content: segment.label,
              fg: theme.muted,
              height: 1,
              wrapMode: "none",
            }),
          ]),
      kit.Text({
        id: `keyloop-practice-status-value-${index}`,
        content: segment.value,
        fg: theme.info,
        height: 1,
        truncate: true,
        wrapMode: "none",
      }),
    ]),
    ...(optionsAvailable
      ? [
          kit.Text({
            id: "keyloop-practice-options-hint-separator",
            content: "·",
            fg: theme.border,
            height: 1,
            flexShrink: 0,
            wrapMode: "none",
          }),
          kit.Text({
            id: "keyloop-practice-options-hint-key",
            content: "Ctrl+O",
            fg: theme.accent,
            attributes: TEXT_BOLD,
            height: 1,
            flexShrink: 0,
            wrapMode: "none",
          }),
          kit.Text({
            id: "keyloop-practice-options-hint",
            content: language === "zh" ? "调整" : "adjust",
            fg: theme.muted,
            height: 1,
            flexShrink: 0,
            wrapMode: "none",
          }),
        ]
      : []),
  );
}

export function everydayStatusSegments(
  sourceItem: string,
  settings: OpenTuiAppState["everydaySettings"],
  language: OpenTuiAppState["language"],
): StatusSegment[] | undefined {
  if (settings === undefined) {
    return undefined;
  }
  const zh = language === "zh";
  switch (sourceItem) {
    case "everyday_words":
      return [
        {
          label: zh ? "词库" : "Range",
          value: everydayWordRangeLabel(settings.word_range, language),
        },
        {
          label: zh ? "每组" : "Per group",
          value: zh ? `${settings.word_count} 词` : `${settings.word_count} words`,
        },
      ];
    case "everyday_sentences":
      return [
        {
          label: zh ? "词汇量" : "Vocabulary",
          value: everydayLevelShortLabel(settings.sentence_level, language),
        },
        {
          label: zh ? "长度" : "Length",
          value: everydayLengthLabel(settings.sentence_length, language),
        },
        {
          label: zh ? "每组" : "Per group",
          value: zh ? `${settings.sentence_count} 句` : `${settings.sentence_count} sentences`,
        },
      ];
    case "everyday_articles":
      return [
        {
          label: zh ? "词汇量" : "Vocabulary",
          value: everydayLevelShortLabel(settings.article_level, language),
        },
        {
          label: zh ? "长度" : "Length",
          value: everydayLengthLabel(settings.article_length, language),
        },
      ];
    case "everyday_word_decomposition":
      return [
        {
          label: zh ? "词汇量" : "Vocabulary",
          value: everydayLevelShortLabel(settings.decomposition_level, language),
        },
        {
          label: zh ? "每组" : "Per group",
          value: zh
            ? `${settings.decomposition_word_count} 词`
            : `${settings.decomposition_word_count} words`,
        },
        {
          label: zh ? "拆分" : "Parts",
          value: `×${settings.decomposition_part_repeats}`,
        },
        {
          label: zh ? "全词" : "Whole",
          value: `×${settings.decomposition_word_repeats}`,
        },
      ];
    default:
      return undefined;
  }
}

export function renderPracticeTimeStack(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  if (state.route.screen !== "running") {
    return kit.Box({});
  }
  return kit.Box(
    {
      id: "keyloop-practice-time-stack",
      flexDirection: "column",
      alignItems: "flex-end",
      flexShrink: 0,
      gap: 0,
    },
    renderTimeValueRow(
      "keyloop-lesson-duration",
      groupDurationLabel(state.language),
      formatElapsedTime(state.route.live?.elapsed_ms ?? 0),
      theme.accent,
      kit,
      state.route.live?.paused === true
        ? {
            id: "keyloop-lesson-pause-state",
            content: pauseStateLabel(state.language),
            color: theme.yellow,
          }
        : undefined,
    ),
  );
}

export function renderTimeValueRow(
  id: string,
  label: string,
  value: string,
  valueColor: OpenTuiColorInput,
  kit: OpenTuiRendererKit,
  suffix?: { id: string; content: string; color: OpenTuiColorInput } | undefined,
): unknown {
  return kit.Box(
    {
      id,
      flexDirection: "row",
      gap: 1,
      alignItems: "center",
      height: 1,
      flexShrink: 0,
    },
    kit.Text({
      content: label,
      fg: theme.foreground,
      id: `${id}-label`,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      content: value,
      fg: valueColor,
      id: `${id}-value`,
      height: 1,
      wrapMode: "none",
    }),
    ...(suffix === undefined
      ? []
      : [
          kit.Text({
            content: suffix.content,
            fg: suffix.color,
            id: suffix.id,
            height: 1,
            wrapMode: "none",
            attributes: TEXT_BOLD,
          }),
        ]),
  );
}

export function pauseStateLabel(language: OpenTuiAppState["language"]): string {
  return language === "zh" ? "⏸ 已暂停" : "⏸ Paused";
}

export function groupDurationLabel(language: OpenTuiAppState["language"]): string {
  return language === "zh" ? "本组用时" : "Group";
}

export function codeStatusSegments(
  target: RunningRoute["target"],
  input: string,
  language: OpenTuiAppState["language"],
): StatusSegment[] {
  const blocks = target.code_blocks ?? [];
  const currentBlock = currentCodeBlock(blocks, input);
  const blockIndex =
    currentBlock === undefined ? -1 : blocks.findIndex((block) => block === currentBlock);
  const segments: StatusSegment[] = [];
  if (blocks.length > 1 && blockIndex >= 0) {
    segments.push({
      label: language === "zh" ? "代码块" : "Block",
      value: `${blockIndex + 1}/${blocks.length}`,
    });
  }
  const scope = codeBlockScopeLabel(currentBlock);
  if (scope.length > 0) {
    segments.push({ value: scope });
  }
  if (currentBlock?.difficulty !== undefined) {
    segments.push({
      label: language === "zh" ? "难度" : "Difficulty",
      value: codeDifficultyLabel(currentBlock.difficulty, language),
    });
  }
  if (currentBlock?.size !== undefined) {
    segments.push({
      label: language === "zh" ? "长度" : "Length",
      value: codeLengthLabel(currentBlock.size, language),
    });
  }
  if (segments.length === 0) {
    segments.push({ value: language === "zh" ? "代码" : "Code" });
  }
  return segments;
}

export function currentCodeBlock(
  blocks: readonly NonNullable<RunningRoute["target"]["code_blocks"]>[number][],
  input: string,
): NonNullable<RunningRoute["target"]["code_blocks"]>[number] | undefined {
  if (blocks.length === 0) {
    return undefined;
  }
  const lineIndex = Math.max(input.split("\n").length - 1, 0);
  return (
    blocks.find(
      (block) => lineIndex >= block.start_line && lineIndex < block.start_line + block.line_count,
    ) ?? blocks[blocks.length - 1]
  );
}

export function codeBlockScopeLabel(
  block: NonNullable<RunningRoute["target"]["code_blocks"]>[number] | undefined,
): string {
  if (block === undefined) {
    return "";
  }
  const language = codeFacetLabel(block.language);
  const framework =
    block.framework.length === 0 ||
    block.framework === "general" ||
    block.framework === "none" ||
    block.framework === "local"
      ? ""
      : codeFacetLabel(block.framework);
  return framework.length === 0 ? language : `${language} / ${framework}`;
}

export function renderLiveMetrics(
  metrics: LiveMetrics | undefined,
  language: OpenTuiAppState["language"],
  speedUnit: SpeedUnit,
  kit: OpenTuiRendererKit,
  options: { framed?: boolean } = {},
): unknown {
  const values = metrics ?? {
    wpm: 0,
    raw_wpm: 0,
    accuracy: 100,
    errors: 0,
    backspaces: 0,
  };
  const metricLabel = speedUnitLabel(speedUnit);
  return renderMetricBar(
    "keyloop-live",
    [
      {
        key: "wpm",
        label: language === "zh" ? metricLabel : metricLabel,
        value: speedFromWpm(values.wpm, speedUnit).toFixed(1),
        tone: "good",
      },
      {
        key: "raw",
        label: language === "zh" ? `原始 ${metricLabel}` : `Raw ${metricLabel}`,
        value: speedFromWpm(values.raw_wpm, speedUnit).toFixed(1),
        tone: "neutral",
      },
      {
        key: "accuracy",
        label: language === "zh" ? "准确" : "Accuracy",
        value: `${values.accuracy.toFixed(1)}%`,
        tone: "warn",
      },
      {
        key: "errors",
        label: language === "zh" ? "错误" : "Errors",
        value: String(values.errors),
        tone: "bad",
      },
    ],
    kit,
    options,
  );
}

export function renderPracticeDataPanel(
  targetText: string,
  inputText: string,
  backspaces: number,
  metrics: LiveMetrics | undefined,
  language: OpenTuiAppState["language"],
  speedUnit: SpeedUnit,
  kit: OpenTuiRendererKit,
): unknown {
  const progress = groupProgressForTarget(targetText, inputText, backspaces);
  return panel(
    "keyloop-practice-data",
    { bottomTitle: progressDetailLine(progress, language), height: 4, width: "100%" },
    kit,
    renderLiveMetrics(metrics, language, speedUnit, kit, { framed: false }),
    renderGroupProgressPanel(progress, language, kit, { framed: false }),
  );
}

export interface MetricBarItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: Tone;
}

export function renderMetricBar(
  idPrefix: string,
  items: readonly MetricBarItem[],
  kit: OpenTuiRendererKit,
  options: { framed?: boolean } = {},
): unknown {
  const framed = options.framed ?? true;
  return kit.Box(
    {
      id: `${idPrefix}-metrics`,
      border: framed ? true : undefined,
      borderStyle: framed ? "rounded" : undefined,
      borderColor: framed ? theme.border : undefined,
      paddingX: framed ? 1 : 0,
      height: framed ? 3 : 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      width: "100%",
      overflow: "hidden",
    },
    ...items.map((item) =>
      renderMetricSegment(idPrefix, item, kit),
    ),
  );
}

export function renderMetricSegment(
  idPrefix: string,
  item: MetricBarItem,
  kit: OpenTuiRendererKit,
): unknown {
  const id = `${idPrefix}-metric-${item.key}`;
  return kit.Box(
    {
      id,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 1,
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,
      height: 1,
      overflow: "hidden",
    },
    kit.Text({
      content: item.label,
      fg: theme.muted,
      id: `${id}-label`,
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
    kit.Text({
      content: item.value,
      fg: toneColor(item.tone),
      attributes: TEXT_BOLD,
      id: `${id}-value`,
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
  );
}

export function renderDiagnostics(
  targetText: string,
  live: RunningRoute["live"] | undefined,
  kit: OpenTuiRendererKit,
  language: OpenTuiAppState["language"],
): unknown {
  const keySummary = buildKeyDiagnostics(targetText, live?.key_events ?? []);
  const keyRows = diagnosticKeyRows(keySummary.keys, 22);
  const panelHeight = keyRows.length > 0 ? Math.max(keyRows.length * 2 + 2, 4) : 3;
  return kit.Box(
    {
      id: "keyloop-diagnostics",
      flexDirection: "column",
      gap: 1,
      width: "100%",
    },
    kit.Box(
      {
        id: "keyloop-training-diagnostics",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.border,
        title: language === "zh" ? " 训练诊断 " : " Training diagnostics ",
        paddingX: 1,
        flexDirection: "column",
        gap: 0,
        width: "100%",
        height: panelHeight,
      },
      ...(keyRows.length > 0
        ? [
            ...keyRows.map((row, index) =>
              renderDiagnosticKeyRow("speed", row, index, language, kit),
            ),
            ...keyRows.map((row, index) =>
              renderDiagnosticKeyRow("error", row, index, language, kit),
            ),
          ]
        : [
            kit.Text({
              id: "keyloop-training-diagnostics-empty",
              content:
                language === "zh"
                  ? "开始输入后显示本组诊断"
                  : "Start typing to show this group diagnosis",
              fg: theme.muted,
              height: 1,
              truncate: true,
            }),
          ]),
    ),
  );
}

export function renderDiagnosticKeyRow(
  metric: "speed" | "error",
  row: KeyDiagnosticItem[],
  index: number,
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown {
  const label =
    index === 0
      ? metric === "speed"
        ? language === "zh"
          ? "速度:"
          : "Speed:"
        : language === "zh"
          ? "错误:"
          : "Errors:"
      : "";
  return kit.Box(
    {
      id: `keyloop-diagnostic-${metric}-row-${index}`,
      flexDirection: "row",
      flexWrap: "nowrap",
      width: "100%",
      minHeight: 1,
    },
    kit.Box(
      {
      id: `keyloop-diagnostic-${metric}-row-${index}-label`,
        width: DIAGNOSTIC_LABEL_WIDTH,
        height: 1,
        flexShrink: 0,
        overflow: "hidden",
      },
      kit.Text({
        id: `keyloop-diagnostic-${metric}-row-${index}-label-text`,
        content: label,
        fg: theme.foreground,
      height: 1,
      wrapMode: "none",
      }),
    ),
    ...row.map((item) => renderDiagnosticKeyCell(metric, item, kit)),
  );
}

export function renderDiagnosticKeyCell(
  metric: "speed" | "error",
  item: KeyDiagnosticItem,
  kit: OpenTuiRendererKit,
): unknown {
  const level = metric === "speed" ? item.speed_level : item.error_level;
  const color =
    metric === "speed" ? heatScaleColor("success", level) : heatScaleColor("danger", level);
  return kit.Text({
    id: `keyloop-diagnostic-${metric}-key-${diagnosticKeyId(item.label)}`,
    content: ` ${item.label} `,
    fg: theme.foreground,
    bg: color,
    width: DIAGNOSTIC_KEY_CELL_WIDTH,
    height: 1,
    wrapMode: "none",
  });
}

export function runningTitlePrefix(sourceItem: string): string {
  if (sourceItem.startsWith("foundation")) {
    return "基础练习";
  }
  return sourceItem.startsWith("code") ? "代码实战" : "练习中";
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
