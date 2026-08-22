import type {
  Language,
  MainGoal,
  SessionRecord,
  TrainingModule,
} from "../../../domain/model";
import {
  activeRecordDates,
  availablePerformanceForms,
  buildActivityCalendarDays,
  buildActivityDays,
  buildComprehensiveRuns,
  buildDashboardSkillData,
  buildDashboardTrend,
  buildModuleSummaries,
  recordsForDate,
  sessionForm,
  type DashboardActivityDay,
  type DashboardComprehensiveRun,
  type DashboardModuleSummary,
  type DashboardTrend,
  type StatsTrendMetric,
  type StatsTrendRange,
} from "../../../report/statsDashboard";
import {
  aggregateSpeed,
  effectiveActiveMs,
  formatDurationShort,
  speedFromWpm,
  speedUnitLabel,
  weightedAccuracy,
} from "../../../report/stats";
import {
  classifyPerformanceRecord,
  PERFORMANCE_MIN_ACTIVE_MS,
  PERFORMANCE_MIN_TYPED_LEN,
  type PerformanceExclusionReason,
} from "../../../report/performanceTrend";
import type {
  SkillDiagnosis,
  SkillDimensionId,
  TrainingForm,
} from "../../../training/diagnosis";
import type { KeySignal } from "../../../training/keySignal";
import {
  openTuiStatsViews,
  type OpenTuiAppState,
  type OpenTuiStatsView,
} from "../appModel";
import {
  buildBrailleTrendChart,
  type BrailleTrendTone,
  type TerminalBrailleTrendChart,
} from "../brailleChart";
import {
  divider,
  emptyState,
  panel,
  tabStrip,
  type KeyHint,
} from "../components";
import { formLabel } from "../labels";
import type { OpenTuiRendererKit } from "../kit";
import {
  DISPLAY_KEYBOARD_ROWS,
  activityCalendarRows,
  activityGlyph,
  activityLevel,
  defaultPhysicalKeyId,
  keyboardHeatLevel,
  physicalKeyById,
  proportionalWidths,
  signalsForPhysicalKey,
  sparkline,
  summarizeActivity,
  weakestSignalForPhysicalKey,
  type ActivityLevel,
  type DisplayKeycap,
  type KeyboardHeatLevel,
  type PhysicalKey,
} from "../statsVisuals";
import { TEXT_BOLD, theme, type OpenTuiColorInput } from "../theme";
import { renderPanel } from "./shared";

const TODAY_TARGET_MINUTES = 20;
const WIDE_MIN_COLUMNS = 90;
const WIDE_TREND_PLOT_WIDTH = 60;
const COMPACT_TREND_PLOT_HEIGHT = 6;
const WIDE_TREND_PLOT_HEIGHT = 8;
const MODULE_BAR_WIDTH = 28;
const CALENDAR_WEEKS = 52;
const OVERVIEW_CALENDAR_WEEKS = 5;

type StatsRoute = Extract<OpenTuiAppState["route"], { screen: "stats" }>;

const moduleColors: Record<TrainingModule, OpenTuiColorInput> = {
  unknown: theme.muted,
  comprehensive: theme.brightWhite,
  foundation_input: theme.green,
  everyday_english: theme.cyan,
  programming_basics: theme.blue,
  custom_corpus: theme.magenta,
  code_practice: theme.yellow,
};

export function statsViewLabel(
  view: (typeof openTuiStatsViews)[number],
  zh: boolean,
): string {
  switch (view) {
    case "overview":
      return zh ? "总览" : "Overview";
    case "trends":
      return zh ? "趋势" : "Trends";
    case "skills":
      return zh ? "技能" : "Skills";
    case "history":
      return zh ? "历史" : "History";
  }
}

export function renderStatsScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "stats") {
    return renderPanel("keyloop-route-panel", "Stats", [], kit);
  }
  const route = state.route;
  const zh = state.language === "zh";
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
      openTuiStatsViews.map((view, index) => ({
        id: view,
        label: `${index + 1} ${statsViewLabel(view, zh)}`,
        active: view === route.view,
      })),
      kit,
    ),
    route.records.length === 0
      ? renderStatsEmpty(zh, kit)
      : renderActiveStatsView(state, route, kit),
  );
}

function renderActiveStatsView(
  state: OpenTuiAppState,
  route: StatsRoute,
  kit: OpenTuiRendererKit,
): unknown {
  switch (route.view) {
    case "overview":
      return renderOverview(state, route, kit);
    case "trends":
      return renderTrends(state, route, kit);
    case "skills":
      return renderSkills(state, route, kit);
    case "history":
      return renderHistory(state, route, kit);
  }
}

function renderStatsEmpty(zh: boolean, kit: OpenTuiRendererKit): unknown {
  return emptyState(
    "keyloop-stats-empty",
    "⌁",
    zh
      ? "完成一次练习，统计驾驶舱就会点亮"
      : "Complete a session to light up your dashboard",
    zh
      ? "这里会显示长期趋势、键盘热力图、活动日历和下一轮重点"
      : "Long-term trends, keyboard heatmaps, activity, and next focus will appear here",
    kit,
  );
}

function renderOverview(
  state: OpenTuiAppState,
  route: StatsRoute,
  kit: OpenTuiRendererKit,
): unknown {
  const language = state.language;
  const zh = language === "zh";
  const now = route.now ?? new Date();
  const activity = buildActivityDays(route.records, now, 30);
  const activityCalendar = buildActivityCalendarDays(
    route.records,
    now,
    OVERVIEW_CALENDAR_WEEKS,
  );
  const today = activity.at(-1) ?? { date: "", activeMs: 0, sessionCount: 0 };
  const modules = buildModuleSummaries(route.records);
  const runs = buildComprehensiveRuns(route.records);
  const speedTrend = buildDashboardTrend(route.records, {
    metric: "speed",
    range: "sessions_30",
    now,
  });
  const accuracyTrend =
    speedTrend === null
      ? null
      : buildDashboardTrend(route.records, {
          form: speedTrend.form,
          metric: "accuracy",
          range: "sessions_30",
          now,
        });
  const skillData = buildDashboardSkillData(route.records);
  const dimensions = rankedDimensions(skillData.dimensions);
  const weakKeys = skillData.keys
    .filter((signal) => signal.confidence !== null)
    .sort((left, right) => (left.confidence ?? 0) - (right.confidence ?? 0))
    .slice(0, 3);
  const title = overviewInsight(zh, dimensions[0], speedTrend, language);

  return kit.Box(
    {
      id: "keyloop-stats-overview",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
      overflow: "hidden",
    },
    renderActivityRhythm(
      today,
      activity,
      activityCalendar,
      state,
      route.records,
      speedTrend,
      now,
      kit,
    ),
    panel(
      "keyloop-stats-overview-decision",
      {
        title,
        borderColor: theme.border,
        height: 6,
        width: "100%",
        gap: 0,
        bottomTitle: overviewCoverage(zh, speedTrend),
      },
      kit,
      renderOverviewPerformanceTrend(speedTrend, "speed", state, kit),
      renderOverviewPerformanceTrend(accuracyTrend, "accuracy", state, kit),
      renderFocusSummary(dimensions, weakKeys, language, kit),
      renderFocusEvidence(dimensions[0], weakKeys[0], language, kit),
    ),
    panel(
      "keyloop-stats-overview-composition",
      {
        title: zh
          ? "训练构成 · 累计有效时长"
          : "Practice mix · all active time",
        borderColor: theme.border,
        height: 8,
        width: "100%",
        gap: 0,
      },
      kit,
      renderModuleComposition(modules, language, kit),
      divider("keyloop-stats-overview-composition-rule", kit),
      renderLatestRun(runs[0], language, kit),
    ),
  );
}

function renderActivityRhythm(
  today: DashboardActivityDay,
  activity: readonly DashboardActivityDay[],
  calendar: readonly DashboardActivityDay[],
  state: OpenTuiAppState,
  records: readonly SessionRecord[],
  speedTrend: DashboardTrend | null,
  now: Date,
  kit: OpenTuiRendererKit,
): unknown {
  const zh = state.language === "zh";
  const summary = summarizeActivity(activity);
  const compact = (process.stdout.columns ?? 96) < WIDE_MIN_COLUMNS;
  return panel(
    "keyloop-stats-overview-rhythm",
    {
      title: zh ? "训练节奏 · 近 30 天" : "Training rhythm · last 30 days",
      borderColor: theme.border,
      height: 10,
      width: "100%",
      flexDirection: "row",
      gap: compact ? 2 : 4,
      bottomTitle: zh
        ? "每天一格 · 列=周 · 少 ·░▒▓█ 多 · ◆ 今日"
        : "one cell/day · columns=weeks · less ·░▒▓█ more · ◆ today",
    },
    kit,
    kit.Box(
      {
        id: "keyloop-stats-overview-rhythm-summary",
        flexDirection: "column",
        gap: 0,
        width: compact ? 46 : undefined,
        flexGrow: compact ? 0 : 1,
        minWidth: 0,
        height: 7,
        overflow: "hidden",
      },
      renderTodayBullet(today, state.language, kit),
      singleTextLine(
        "keyloop-stats-overview-activity-summary",
        zh
          ? `近 30 天  ${summary.activeDays} 个训练日 · ${summary.totalSessions} 次练习 · ${formatDurationShort(summary.totalActiveMs, state.language)}`
          : `Last 30 days  ${summary.activeDays} active days · ${summary.totalSessions} sessions · ${formatDurationShort(summary.totalActiveMs, state.language)}`,
        theme.foreground,
        kit,
        true,
      ),
      singleTextLine(
        "keyloop-stats-overview-streak",
        zh
          ? `连续训练  当前 ${summary.currentStreak} 天 · 最长 ${summary.longestStreak} 天`
          : `Streak  current ${summary.currentStreak}d · best ${summary.longestStreak}d`,
        summary.currentStreak > 0 ? theme.accent : theme.muted,
        kit,
      ),
      singleTextLine(
        "keyloop-stats-overview-activity-range",
        `${activity[0]?.date.slice(5) ?? "--"} → ${activity.at(-1)?.date.slice(5) ?? "--"}`,
        theme.muted,
        kit,
      ),
      ...(state.mainGoal === undefined || speedTrend === null
        ? []
        : [renderGoalProgress(state.mainGoal, records, state, now, kit)]),
    ),
    renderOverviewActivityCalendar(
      calendar,
      activity[0]?.date ?? "",
      today.date,
      state.language,
      kit,
    ),
  );
}

function renderTodayBullet(
  today: DashboardActivityDay,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const minutes = today.activeMs / 60_000;
  const percent = Math.min(1, minutes / TODAY_TARGET_MINUTES);
  const width = 18;
  const filled = Math.round(percent * width);
  return lineBox(
    "keyloop-stats-overview-today",
    kit,
    textPart(
      "today-label",
      language === "zh" ? "今日有效 " : "Today active ",
      theme.foreground,
      kit,
      true,
    ),
    textPart("today-fill", "█".repeat(filled), theme.accent, kit),
    textPart("today-track", "░".repeat(width - filled), theme.muted, kit),
    textPart(
      "today-value",
      language === "zh"
        ? `  ${minutes.toFixed(1)} / ${TODAY_TARGET_MINUTES} 分钟`
        : `  ${minutes.toFixed(1)} / ${TODAY_TARGET_MINUTES} min`,
      theme.foreground,
      kit,
      true,
    ),
  );
}

function renderGoalProgress(
  goal: MainGoal,
  records: readonly SessionRecord[],
  state: OpenTuiAppState,
  now: Date,
  kit: OpenTuiRendererKit,
): unknown {
  const compact = (process.stdout.columns ?? 96) < WIDE_MIN_COLUMNS;
  const trend = buildDashboardTrend(records, {
    form: goal.form,
    metric: "speed",
    range: "sessions_30",
    now,
  });
  const currentWpm = trend?.recentValue ?? 0;
  const ratio = Math.max(0, Math.min(1, currentWpm / goal.target_wpm));
  const width = compact ? 10 : 14;
  const marker = Math.min(width - 1, Math.round(ratio * (width - 1)));
  const track = `${"━".repeat(marker)}●${"─".repeat(width - marker - 1)}○`;
  const unit = speedUnitLabel(state.speed_unit ?? "wpm");
  const current = speedFromWpm(currentWpm, state.speed_unit ?? "wpm");
  const target = speedFromWpm(goal.target_wpm, state.speed_unit ?? "wpm");
  return lineBox(
    "keyloop-stats-overview-goal",
    kit,
    textPart(
      "goal-label",
      `${state.language === "zh" ? "目标" : "Goal"} ${formLabel(goal.form, state.language)} `,
      theme.foreground,
      kit,
      true,
    ),
    textPart("goal-track", track, ratio >= 1 ? theme.accent : theme.info, kit),
    textPart(
      "goal-value",
      compact
        ? `  ${current.toFixed(1)} → ${target.toFixed(0)} ${unit}`
        : `  ${current.toFixed(1)} → ${target.toFixed(0)} ${unit} · ${goal.deadline.slice(5)}`,
      theme.muted,
      kit,
    ),
  );
}

function renderOverviewActivityCalendar(
  days: readonly DashboardActivityDay[],
  visibleStart: string,
  today: string,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const labels =
    language === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["M", "T", "W", "T", "F", "S", "S"];
  const rows = activityCalendarRows(days);
  return kit.Box(
    {
      id: "keyloop-stats-overview-activity-calendar",
      flexDirection: "column",
      gap: 0,
      width: 18,
      height: 7,
      flexShrink: 0,
      overflow: "hidden",
    },
    ...rows.map((row, rowIndex) =>
      lineBox(
        `keyloop-stats-overview-calendar-row-${rowIndex}`,
        kit,
        textPart(
          `overview-calendar-label-${rowIndex}`,
          `${labels[rowIndex] ?? " "}  `,
          theme.muted,
          kit,
        ),
        ...row.map((day, dayIndex) => {
          const outside = day.date < visibleStart || day.date > today;
          const isToday = day.date === today;
          const level = activityLevel(day.activeMs);
          return textPart(
            `overview-calendar-${rowIndex}-${dayIndex}`,
            outside ? "  " : `${isToday ? "◆" : activityGlyph(level)} `,
            isToday ? theme.cursor : activityColor(level),
            kit,
            isToday,
          );
        }),
      ),
    ),
  );
}

function renderOverviewPerformanceTrend(
  trend: DashboardTrend | null,
  metric: StatsTrendMetric,
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const zh = state.language === "zh";
  const compact = (process.stdout.columns ?? 96) < WIDE_MIN_COLUMNS;
  if (trend === null) {
    return singleTextLine(
      `keyloop-stats-overview-${metric}-empty`,
      zh
        ? `${metricLabel(metric, state.language)}  正在建立可信基线`
        : `${metricLabel(metric, state.language)}  building a trusted baseline`,
      theme.muted,
      kit,
    );
  }
  const values = trend.points.map((point) =>
    displayedTrendValue(point.value, metric, state),
  );
  const value = displayedTrendValue(trend.recentValue, metric, state);
  const delta =
    trend.delta === null
      ? null
      : displayedTrendValue(trend.delta, metric, state);
  const unit = metricUnit(metric, state);
  const deltaUnit = metric === "accuracy" ? "pp" : unit;
  return lineBox(
    `keyloop-stats-overview-${metric}`,
    kit,
    kit.Text({
      id: `keyloop-stats-overview-${metric}-label`,
      content: `${formLabel(trend.form, state.language)} ${metricLabel(metric, state.language)}`,
      fg: theme.foreground,
      attributes: TEXT_BOLD,
      width: compact ? (zh ? 11 : 14) : zh ? 13 : 18,
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
    textPart(
      `${metric}-sparkline`,
      sparkline(values, compact ? 14 : 24),
      theme.info,
      kit,
    ),
    textPart(
      `${metric}-value`,
      `  ${value.toFixed(1)}${unit}  ${deltaText(delta, deltaUnit)}`,
      deltaColor(delta),
      kit,
      true,
    ),
    textPart(
      `${metric}-window`,
      compact
        ? zh
          ? "  近10/前10"
          : "  10 vs 10"
        : zh
          ? "  最近 10 对前 10"
          : "  latest 10 vs previous 10",
      theme.muted,
      kit,
    ),
  );
}

function renderFocusSummary(
  dimensions: readonly SkillDiagnosis[],
  keys: readonly KeySignal[],
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const focus = dimensions
    .filter((dimension) => dimension.status !== "unrated")
    .slice(0, 3)
    .map((dimension) => skillDimensionLabel(dimension.id, language));
  const keyLabels = keys.map((signal) => printableKey(signal.key));
  const content = [...focus, ...keyLabels].join(" · ");
  return lineBox(
    "keyloop-stats-overview-focus",
    kit,
    textPart(
      "focus-label",
      language === "zh" ? "下一轮重点  " : "Next focus  ",
      theme.foreground,
      kit,
      true,
    ),
    textPart(
      "focus-value",
      content ||
        (language === "zh"
          ? "继续积累击键样本"
          : "Collect more keystroke samples"),
      content === "" ? theme.muted : theme.warning,
      kit,
      true,
    ),
  );
}

function renderFocusEvidence(
  dimension: SkillDiagnosis | undefined,
  key: KeySignal | undefined,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const parts: string[] = [];
  if (
    dimension?.ewma_error_rate !== null &&
    dimension?.ewma_error_rate !== undefined
  ) {
    parts.push(
      `${skillDimensionLabel(dimension.id, language)} ${language === "zh" ? "错误率" : "error"} ${dimension.ewma_error_rate.toFixed(1)}%`,
    );
  }
  if (key?.confidence !== null && key?.confidence !== undefined) {
    parts.push(
      language === "zh"
        ? `${printableKey(key.key)} 掌握 ${Math.round(key.confidence * 100)}% · 错误 ${(key.errorRate * 100).toFixed(1)}%`
        : `${printableKey(key.key)} mastery ${Math.round(key.confidence * 100)}% · error ${(key.errorRate * 100).toFixed(1)}%`,
    );
  }
  return singleTextLine(
    "keyloop-stats-overview-evidence",
    `${language === "zh" ? "证据" : "Evidence"}  ${parts.join(" · ") || (language === "zh" ? "样本不足，暂不下结论" : "Not enough evidence yet")}`,
    theme.muted,
    kit,
  );
}

function renderModuleComposition(
  modules: readonly DashboardModuleSummary[],
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const compact = (process.stdout.columns ?? 96) < WIDE_MIN_COLUMNS;
  const widths = proportionalWidths(
    modules.map((module) => module.activeMs),
    compact ? 20 : MODULE_BAR_WIDTH,
  );
  const total = modules.reduce((sum, module) => sum + module.activeMs, 0);
  const legends = modules.slice(0, compact ? 2 : 3).map((module) => {
    const percent = total === 0 ? 0 : (module.activeMs / total) * 100;
    return `${moduleLabel(module.module, language)} ${percent.toFixed(0)}%`;
  });
  return lineBox(
    "keyloop-stats-module-composition",
    kit,
    textPart(
      "module-label",
      language === "zh" ? "模块占比  " : "Module share  ",
      theme.foreground,
      kit,
      true,
    ),
    ...modules.map((module, index) =>
      textPart(
        `module-${module.module}`,
        "█".repeat(widths[index] ?? 0),
        moduleColors[module.module],
        kit,
      ),
    ),
    textPart("module-legend", `  ${legends.join(" · ")}`, theme.muted, kit),
  );
}

function renderLatestRun(
  run: DashboardComprehensiveRun | undefined,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  if (run === undefined) {
    return kit.Box(
      {
        id: "keyloop-stats-overview-run",
        flexDirection: "column",
        gap: 0,
        width: "100%",
        height: 4,
        overflow: "hidden",
      },
      singleTextLine(
        "keyloop-stats-overview-run-empty",
        language === "zh"
          ? "最近一次综合  暂无记录"
          : "Latest full practice  no runs yet",
        theme.muted,
        kit,
      ),
    );
  }
  const completed = run.records.filter(
    (record) => record.completion_state === "completed",
  ).length;
  const zh = language === "zh";
  return kit.Box(
    {
      id: "keyloop-stats-overview-run",
      flexDirection: "column",
      gap: 0,
      width: "100%",
      height: 4,
      overflow: "hidden",
    },
    singleTextLine(
      "keyloop-stats-overview-run-summary",
      zh
        ? `最近一次综合  ${run.date} · ${formatDurationShort(run.activeMs, language)} · ${completed}/${run.records.length} 阶段完成`
        : `Latest full practice  ${run.date} · ${formatDurationShort(run.activeMs, language)} · ${completed}/${run.records.length} stages complete`,
      completed === run.records.length ? theme.accent : theme.warning,
      kit,
      true,
    ),
    kit.Box(
      {
        id: "keyloop-stats-overview-run-route",
        flexDirection: "column",
        gap: 0,
        width: "100%",
        height: 2,
        overflow: "hidden",
      },
      ...[0, 3].map((start) =>
        lineBox(
          `keyloop-stats-overview-run-route-${start / 3}`,
          kit,
          ...run.records
            .slice(start, start + 3)
            .flatMap((record, offset) => [
              ...(offset === 0
                ? []
                : [
                    textPart(
                      `run-arrow-${start + offset}`,
                      " → ",
                      theme.muted,
                      kit,
                    ),
                  ]),
              renderStageKeycap(record, start + offset, language, kit),
            ]),
        ),
      ),
    ),
    singleTextLine(
      "keyloop-stats-overview-run-legend",
      zh
        ? "阶段顺序即训练流程 · ✓ 完成 · ◐ 部分完成"
        : "stage order follows the practice flow · ✓ complete · ◐ partial",
      theme.muted,
      kit,
    ),
  );
}

function renderStageKeycap(
  record: SessionRecord,
  index: number,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const completed = record.completion_state === "completed";
  const form = sessionForm(record);
  return kit.Text({
    id: `keyloop-stats-run-stage-${index}`,
    content: ` ${index + 1} ${stageFormLabel(form, language)} ${stageDuration(record)} ${completed ? "✓" : "◐"} `,
    fg: theme.black,
    bg: completed ? theme.green : theme.yellow,
    attributes: TEXT_BOLD,
    height: 1,
    flexShrink: 0,
    wrapMode: "none",
  });
}

function renderTrends(
  state: OpenTuiAppState,
  route: StatsRoute,
  kit: OpenTuiRendererKit,
): unknown {
  const now = route.now ?? new Date();
  const trend = buildDashboardTrend(route.records, {
    ...(route.trendForm === undefined ? {} : { form: route.trendForm }),
    metric: route.trendMetric ?? "speed",
    range: route.trendRange ?? "sessions_30",
    now,
  });
  if (trend === null || trend.points.length === 0) {
    return renderTrendEmpty(state, route, kit);
  }

  const columns = Math.min(process.stdout.columns ?? 96, 96);
  const wide = columns >= WIDE_MIN_COLUMNS;
  const tall = (process.stdout.rows ?? 32) >= 29;
  const plotWidth = wide
    ? WIDE_TREND_PLOT_WIDTH
    : Math.max(28, Math.min(52, columns - 18));
  const plotHeight = wide ? WIDE_TREND_PLOT_HEIGHT : COMPACT_TREND_PLOT_HEIGHT;
  const displayPoints = trend.points.map((point) => ({
    value: displayedTrendValue(point.value, trend.metric, state),
    label: point.label,
  }));
  const selectedIndex = clampIndex(
    route.trendIndex ?? trend.points.length - 1,
    trend.points.length,
  );
  const chart = buildBrailleTrendChart(displayPoints, {
    width: plotWidth,
    height: plotHeight,
    selectedIndex,
    mode: terminalSupportsBraille() ? "braille" : "dots",
  });
  const selected = trend.points[selectedIndex] ?? trend.points.at(-1);

  return kit.Box(
    {
      id: "keyloop-stats-trends-view",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
      overflow: "hidden",
    },
    panel(
      "keyloop-stats-trend-panel",
      {
        title: trendInsight(trend, state),
        borderColor: theme.border,
        height: plotHeight + 6,
        width: "100%",
        gap: 0,
      },
      kit,
      renderTrendFilters(trend, state.language, kit),
      kit.Box(
        {
          id: "keyloop-stats-trend-content",
          flexDirection: "row",
          alignItems: "center",
          gap: wide ? 3 : 0,
          width: "100%",
          height: plotHeight + 2,
          overflow: "hidden",
        },
        renderTrendChart(chart, kit),
        ...(wide ? [renderTrendKpis(trend, state, kit)] : []),
      ),
      renderTrendPointDetail(selected, selectedIndex, trend, state, kit),
    ),
    ...(tall
      ? [renderTrendContext(route.records, trend, state, now, kit)]
      : []),
  );
}

function renderTrendEmpty(
  state: OpenTuiAppState,
  route: StatsRoute,
  kit: OpenTuiRendererKit,
): unknown {
  const zh = state.language === "zh";
  const forms = availablePerformanceForms(route.records);
  return panel(
    "keyloop-stats-trend-panel",
    { title: zh ? "趋势" : "Trends", borderColor: theme.border, flexGrow: 1 },
    kit,
    singleTextLine(
      "keyloop-stats-trend-filter-empty",
      `${zh ? "可用形态" : "Available forms"}  ${forms.map((form) => formLabel(form, state.language)).join(" · ") || "—"}`,
      theme.muted,
      kit,
    ),
    emptyState(
      "keyloop-stats-trend-empty",
      "⠶",
      zh ? "当前范围还没有可比较数据" : "No comparable data in this range",
      zh
        ? "用 ↑/↓ 切换形态，或用 [ / ] 扩大时间范围"
        : "Use ↑/↓ to change form or [ / ] to expand the range",
      kit,
    ),
  );
}

function renderTrendFilters(
  trend: DashboardTrend,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  return lineBox(
    "keyloop-stats-trend-filters",
    kit,
    textPart(
      "filter-form-label",
      language === "zh" ? "形态 " : "Form ",
      theme.muted,
      kit,
    ),
    textPart(
      "filter-form-value",
      `‹${formLabel(trend.form, language)}›`,
      theme.info,
      kit,
      true,
    ),
    textPart(
      "filter-metric-label",
      language === "zh" ? "   指标 " : "   Metric ",
      theme.muted,
      kit,
    ),
    textPart(
      "filter-metric-value",
      `‹${metricLabel(trend.metric, language)}›`,
      theme.accent,
      kit,
      true,
    ),
    textPart(
      "filter-range-label",
      language === "zh" ? "   范围 " : "   Range ",
      theme.muted,
      kit,
    ),
    textPart(
      "filter-range-value",
      `‹${rangeLabel(trend.range, language)}›`,
      theme.cursor,
      kit,
      true,
    ),
    textPart(
      "filter-bucket",
      `   ${bucketLabel(trend.bucketUnit, language)}`,
      theme.muted,
      kit,
    ),
  );
}

function renderTrendChart(
  chart: TerminalBrailleTrendChart,
  kit: OpenTuiRendererKit,
): unknown {
  const axisLabelWidth = Math.max(...chart.rows.map((row) => row.label.length));
  return kit.Box(
    {
      id: "keyloop-stats-trend-chart",
      flexDirection: "column",
      width: axisLabelWidth + 2 + Array.from(chart.labels).length,
      height: chart.rows.length + 2,
      flexShrink: 0,
      overflow: "hidden",
    },
    ...chart.rows.map((row, rowIndex) =>
      kit.Box(
        {
          id: `keyloop-stats-trend-row-${rowIndex}`,
          flexDirection: "row",
          height: 1,
          flexShrink: 0,
          overflow: "hidden",
        },
        kit.Text({
          id: `keyloop-stats-trend-row-${rowIndex}-label`,
          content: row.label.padStart(axisLabelWidth),
          fg: theme.muted,
          height: 1,
          wrapMode: "none",
        }),
        kit.Text({
          id: `keyloop-stats-trend-row-${rowIndex}-axis`,
          content: ` ${row.label === "" ? "│" : "┤"}`,
          fg: theme.border,
          height: 1,
          wrapMode: "none",
        }),
        ...row.runs.map((run, runIndex) =>
          kit.Text({
            id: `keyloop-stats-trend-row-${rowIndex}-run-${runIndex}`,
            content: run.content,
            fg: trendRunColor(run.tone),
            attributes: run.tone === "selected" ? TEXT_BOLD : undefined,
            height: 1,
            wrapMode: "none",
          }),
        ),
      ),
    ),
    kit.Text({
      id: "keyloop-stats-trend-axis",
      content: `${" ".repeat(axisLabelWidth + 1)}${chart.axis}`,
      fg: theme.border,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: "keyloop-stats-trend-labels",
      content: `${" ".repeat(axisLabelWidth + 2)}${chart.labels}`,
      fg: theme.muted,
      height: 1,
      wrapMode: "none",
    }),
  );
}

function renderTrendKpis(
  trend: DashboardTrend,
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const unit = metricUnit(trend.metric, state);
  const latest = displayedTrendValue(trend.latestValue, trend.metric, state);
  const recent = displayedTrendValue(trend.recentValue, trend.metric, state);
  const delta =
    trend.delta === null
      ? null
      : displayedTrendValue(trend.delta, trend.metric, state);
  const deltaUnit = trend.metric === "accuracy" ? "pp" : unit;
  const zh = state.language === "zh";
  const entries = [
    [
      zh ? "最近点" : "Latest point",
      `${latest.toFixed(1)}${unit}`,
      theme.accent,
    ],
    [
      zh ? "近期 10" : "Recent 10",
      `${recent.toFixed(1)}${unit}`,
      theme.foreground,
    ],
    [
      zh ? "对前 10" : "Vs prev 10",
      deltaText(delta, deltaUnit),
      deltaColor(delta),
    ],
    [
      zh ? "形态样本" : "Form samples",
      `${trend.formEligibleCount}`,
      theme.foreground,
    ],
    [
      zh ? "数据覆盖" : "Coverage",
      `${trend.eligibleCount}/${trend.totalCount}`,
      theme.muted,
    ],
  ] as const;
  return kit.Box(
    {
      id: "keyloop-stats-trend-kpis",
      flexDirection: "column",
      justifyContent: "center",
      flexGrow: 1,
      minWidth: 0,
      height: 7,
      overflow: "hidden",
    },
    ...entries.map(([label, value, color], index) =>
      kit.Box(
        {
          id: `keyloop-stats-trend-kpi-${index}`,
          flexDirection: "row",
          width: "100%",
          height: 1,
          overflow: "hidden",
        },
        kit.Text({
          id: `keyloop-stats-trend-kpi-${index}-label`,
          content: label,
          fg: theme.muted,
          width: state.language === "zh" ? 10 : 13,
          height: 1,
          truncate: true,
          wrapMode: "none",
        }),
        kit.Text({
          id: `keyloop-stats-trend-kpi-${index}-value`,
          content: value,
          fg: color,
          attributes: index === 0 ? TEXT_BOLD : undefined,
          height: 1,
          truncate: true,
          wrapMode: "none",
        }),
      ),
    ),
  );
}

function renderTrendPointDetail(
  point: DashboardTrend["points"][number] | undefined,
  index: number,
  trend: DashboardTrend,
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (point === undefined) {
    return singleTextLine("keyloop-stats-trend-detail", "", theme.muted, kit);
  }
  const speed = speedFromWpm(point.wpm, state.speed_unit ?? "wpm");
  const unit = speedUnitLabel(state.speed_unit ?? "wpm");
  const zh = state.language === "zh";
  return singleTextLine(
    "keyloop-stats-trend-detail",
    `◆ ${index + 1}/${trend.points.length} · ${point.label} · ${point.sessionCount} ${zh ? "次" : point.sessionCount === 1 ? "session" : "sessions"} · ${speed.toFixed(1)} ${unit} · ${point.accuracy.toFixed(1)}% · ${zh ? "有效" : "active"} ${formatDurationShort(point.activeMs, state.language)}`,
    theme.foreground,
    kit,
    true,
  );
}

function renderTrendContext(
  records: readonly SessionRecord[],
  activeTrend: DashboardTrend,
  state: OpenTuiAppState,
  now: Date,
  kit: OpenTuiRendererKit,
): unknown {
  const forms = availablePerformanceForms(records);
  const modules = buildModuleSummaries(records);
  return panel(
    "keyloop-stats-trend-context",
    {
      title:
        state.language === "zh"
          ? `各训练类型最近练习 · ${metricLabel(activeTrend.metric, state.language)} · 最多 30 场`
          : `Recent practice by training type · ${metricLabel(activeTrend.metric, state.language)} · up to 30 sessions`,
      borderColor: theme.border,
      height: forms.length + 4,
      width: "100%",
      gap: 0,
    },
    kit,
    singleTextLine(
      "keyloop-stats-form-pulse-guide",
      state.language === "zh"
        ? `按时间排列（非分布图） · 每柱 1 场 · 柱高 = ${activeTrend.metric === "speed" ? "速度" : "正确率"} · 左旧 → 右新 · 各类型只和自己比`
        : `Timeline, not distribution · 1 bar/session · height = ${activeTrend.metric === "speed" ? "speed" : "accuracy"} · old → new · compare within type`,
      theme.muted,
      kit,
    ),
    ...forms.map((form) => {
      const trend = buildDashboardTrend(records, {
        form,
        metric: activeTrend.metric,
        range: "sessions_30",
        now,
      });
      const values = (trend?.points ?? []).map((point) =>
        displayedTrendValue(point.value, activeTrend.metric, state),
      );
      const value =
        trend === null
          ? "—"
          : `${displayedTrendValue(trend.recentValue, activeTrend.metric, state).toFixed(1)}${metricUnit(activeTrend.metric, state)}`;
      return lineBox(
        `keyloop-stats-form-pulse-${form}`,
        kit,
        textPart(
          `form-pulse-${form}-marker`,
          form === activeTrend.form ? "▌" : " ",
          theme.info,
          kit,
          true,
        ),
        textPart(
          `form-pulse-${form}-label`,
          formLabel(form, state.language).padEnd(
            state.language === "zh" ? 8 : 12,
          ),
          form === activeTrend.form ? theme.foreground : theme.muted,
          kit,
        ),
        textPart(
          `form-pulse-${form}-spark`,
          sparkline(values, 20),
          form === activeTrend.form ? theme.accent : theme.info,
          kit,
        ),
        textPart(
          `form-pulse-${form}-value`,
          `  ${value.padStart(9)}  ${trendDirectionLabel(trend?.delta ?? null, state.language)}`,
          deltaColor(trend?.delta ?? null),
          kit,
        ),
      );
    }),
    renderModuleComposition(modules, state.language, kit),
  );
}

function renderSkills(
  state: OpenTuiAppState,
  route: StatsRoute,
  kit: OpenTuiRendererKit,
): unknown {
  const data = buildDashboardSkillData(route.records);
  const selectedId = route.skillKey ?? defaultPhysicalKeyId(data.keys);
  const selectedKey = physicalKeyById(selectedId);
  const selectedSignals = signalsForPhysicalKey(selectedKey, data.keys);
  const rated = data.keys.filter((signal) => signal.confidence !== null).length;
  const compact = (process.stdout.columns ?? 96) < WIDE_MIN_COLUMNS;
  const selectedLabel = `${selectedKey.label}${selectedKey.shift === undefined ? "" : ` / ${selectedKey.shift}`}`;
  return kit.Box(
    {
      id: "keyloop-stats-skills-view",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
      overflow: "hidden",
    },
    panel(
      "keyloop-stats-keyboard-panel",
      {
        title:
          state.language === "zh"
            ? `键盘热力图 · 当前键 ${selectedLabel}`
            : `Keyboard heatmap · selected ${selectedLabel}`,
        borderColor: theme.border,
        height: 15,
        width: "100%",
        flexDirection: "column",
        gap: 0,
      },
      kit,
      renderKeyboard(data.keys, selectedId, state.language, compact, kit),
      renderSelectedKeyDetail(
        selectedKey,
        selectedSignals,
        state.language,
        compact,
        kit,
      ),
    ),
    renderSkillDimensions(
      data.dimensions,
      rated,
      data.keys.length,
      state.language,
      compact,
      kit,
    ),
  );
}

function renderKeyboard(
  signals: readonly KeySignal[],
  selectedId: string,
  language: Language,
  compact: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: "keyloop-stats-keyboard",
      flexDirection: "column",
      gap: 1,
      width: "100%",
      height: 11,
      flexShrink: 0,
      overflow: "hidden",
    },
    kit.Box(
      {
        id: "keyloop-stats-keyboard-shell",
        flexDirection: "column",
        gap: 1,
        width: "100%",
        height: 9,
        overflow: "hidden",
      },
      ...DISPLAY_KEYBOARD_ROWS.map((row, rowIndex) =>
        kit.Box(
          {
            id: `keyloop-stats-keyboard-row-${rowIndex}`,
            flexDirection: "row",
            justifyContent: compact ? "flex-start" : "center",
            alignItems: "center",
            gap: 1,
            width: "100%",
            height: 1,
            flexShrink: 0,
            overflow: "hidden",
          },
          ...row.map((key) =>
            renderKeyboardKeycap(key, signals, selectedId, compact, kit),
          ),
        ),
      ),
    ),
    renderKeyboardLegend(language, compact, kit),
  );
}

function renderKeyboardKeycap(
  keycap: DisplayKeycap,
  signals: readonly KeySignal[],
  selectedId: string,
  compact: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const physicalKey =
    keycap.physicalKeyId === undefined
      ? null
      : physicalKeyById(keycap.physicalKeyId);
  const signal =
    physicalKey === null
      ? null
      : weakestSignalForPhysicalKey(physicalKey, signals);
  const level = keyboardHeatLevel(signal);
  const selected = keycap.physicalKeyId === selectedId;
  const width = compact ? keycap.compactWidth : keycap.width;
  return kit.Text({
    id:
      keycap.physicalKeyId === undefined
        ? `keyloop-stats-special-key-${keycap.id}`
        : `keyloop-stats-key-${safeId(keycap.physicalKeyId)}`,
    content: centerText(keycap.label, width),
    fg: selected
      ? theme.black
      : physicalKey === null
        ? theme.foreground
        : keyboardHeatForeground(level),
    bg: selected
      ? theme.brightWhite
      : physicalKey === null
        ? theme.brightBlack
        : keyboardHeatBackground(level),
    attributes: TEXT_BOLD,
    height: 1,
    flexShrink: 0,
    wrapMode: "none",
  });
}

function renderKeyboardLegend(
  language: Language,
  compact: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const levels: readonly KeyboardHeatLevel[] = [
    "mastered",
    "watch",
    "weak",
    "critical",
    "unrated",
  ];
  return kit.Box(
    {
      id: "keyloop-stats-keyboard-legend",
      flexDirection: "row",
      justifyContent: compact ? "flex-start" : "center",
      alignItems: "center",
      gap: 1,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    ...levels.map((level) =>
      kit.Text({
        id: `keyloop-stats-keyboard-legend-${level}`,
        content: ` ${keyboardHeatLabel(level, language)} `,
        fg: keyboardHeatForeground(level),
        bg: keyboardHeatBackground(level),
        attributes: TEXT_BOLD,
        height: 1,
        flexShrink: 0,
        wrapMode: "none",
      }),
    ),
  );
}

function renderSelectedKeyDetail(
  key: PhysicalKey,
  signals: readonly KeySignal[],
  language: Language,
  compact: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const zh = language === "zh";
  return kit.Box(
    {
      id: "keyloop-stats-key-detail",
      flexDirection: "column",
      gap: 0,
      width: "100%",
      height: 2,
      overflow: "hidden",
    },
    ...(signals.length === 0
      ? [
          singleTextLine(
            "keyloop-stats-key-detail-empty",
            zh
              ? `${key.label}${key.shift === undefined ? "" : ` / ${key.shift}`}  样本不足，继续练习后显示掌握度`
              : `${key.label}${key.shift === undefined ? "" : ` / ${key.shift}`}  needs more samples before mastery can be rated`,
            theme.muted,
            kit,
          ),
        ]
      : signals.slice(0, 2).map((signal, index) => {
          const level = keyboardHeatLevel(signal);
          return singleTextLine(
            `keyloop-stats-key-detail-${index}`,
            compact
              ? zh
                ? `${printableKey(signal.key)} ${keyboardHeatLabel(level, language)} · 掌握${Math.round((signal.confidence ?? 0) * 100)}% · 错${(signal.errorRate * 100).toFixed(1)}% · ${formatMs(signal.effectiveTimeMs)}ms · n${signal.samples}`
                : `${printableKey(signal.key)} ${keyboardHeatLabel(level, language)} · ${Math.round((signal.confidence ?? 0) * 100)}% · err ${(signal.errorRate * 100).toFixed(1)}% · ${formatMs(signal.effectiveTimeMs)}ms · n${signal.samples}`
              : zh
                ? `${printableKey(signal.key)}  ${keyboardHeatLabel(level, language)} · 掌握 ${Math.round((signal.confidence ?? 0) * 100)}% · 错误 ${(signal.errorRate * 100).toFixed(1)}% · 反应 ${formatMs(signal.effectiveTimeMs)}ms · 样本 ${signal.samples}`
                : `${printableKey(signal.key)}  ${keyboardHeatLabel(level, language)} · mastery ${Math.round((signal.confidence ?? 0) * 100)}% · error ${(signal.errorRate * 100).toFixed(1)}% · response ${formatMs(signal.effectiveTimeMs)}ms · n ${signal.samples}`,
            keyboardHeatColor(level),
            kit,
            true,
          );
        })),
  );
}

function renderSkillDimensions(
  dimensions: readonly SkillDiagnosis[],
  ratedKeys: number,
  totalKeys: number,
  language: Language,
  compact: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const byId = new Map(
    dimensions.map((dimension) => [dimension.id, dimension]),
  );
  const weak = rankedDimensions(dimensions).filter(
    (dimension) => dimension.status === "weak",
  );
  const ranked = rankedDimensions(dimensions);
  const zh = language === "zh";
  return panel(
    "keyloop-stats-dimensions-panel",
    {
      title: zh
        ? `击键表现 · ${weak.length} 项待加强${
            weak.length === 0
              ? ""
              : ` · 优先练 ${weak
                  .slice(0, 2)
                  .map((dimension) =>
                    skillDimensionLabel(dimension.id, language),
                  )
                  .join(" / ")}`
          }`
        : `Keystroke performance · ${weak.length} need work${
            weak.length === 0
              ? ""
              : ` · focus ${weak
                  .slice(0, 2)
                  .map((dimension) =>
                    skillDimensionLabel(dimension.id, language),
                  )
                  .join(" / ")}`
          }`,
      borderColor: theme.border,
      height: 9,
      width: "100%",
      gap: 0,
      bottomTitle: zh
        ? `${ratedKeys}/${totalKeys} 键已评估 · % = 错误率 · ms = 平均反应 · 越低越好`
        : `${ratedKeys}/${totalKeys} keys rated · % = error rate · ms = response · lower is better`,
    },
    kit,
    compact
      ? kit.Box(
          {
            id: "keyloop-stats-dimension-groups",
            flexDirection: "column",
            gap: 0,
            width: "100%",
            height: 7,
            overflow: "hidden",
          },
          singleTextLine(
            "keyloop-stats-dimension-compact-guide",
            zh
              ? "优先项目 · 状态 · 错误率 / 反应时间 / 趋势"
              : "Priority · status · error / response / trend",
            theme.info,
            kit,
            true,
          ),
          ...ranked
            .filter((dimension) => dimension.id !== "word_fluency")
            .slice(0, 5)
            .map((dimension) => renderSkillDimension(dimension, language, kit)),
          renderCompactRhythmDimension(byId.get("word_fluency"), language, kit),
        )
      : kit.Box(
          {
            id: "keyloop-stats-dimension-groups",
            flexDirection: "column",
            gap: 0,
            width: "100%",
            height: 7,
            overflow: "hidden",
          },
          kit.Box(
            {
              id: "keyloop-stats-dimension-primary-groups",
              flexDirection: "row",
              gap: 3,
              width: "100%",
              height: 6,
              overflow: "hidden",
            },
            renderSkillDimensionGroup(
              "input",
              zh
                ? "输入类型 · 错误率 / 反应时间"
                : "Input types · error / response",
              ["symbols", "capitalization", "digits"],
              byId,
              language,
              40,
              kit,
            ),
            renderSkillDimensionGroup(
              "position",
              zh
                ? "键位与手 · 错误率 / 反应时间"
                : "Rows & hands · error / response",
              ["home_row", "top_row", "bottom_row", "left_hand", "right_hand"],
              byId,
              language,
              44,
              kit,
            ),
          ),
          renderCompactRhythmDimension(byId.get("word_fluency"), language, kit),
        ),
  );
}

function renderCompactRhythmDimension(
  dimension: SkillDiagnosis | undefined,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  if (dimension === undefined) {
    return singleTextLine(
      "keyloop-stats-dimension-rhythm-compact",
      language === "zh" ? "输入节奏  待积累样本" : "Rhythm  collecting samples",
      theme.muted,
      kit,
    );
  }
  return lineBox(
    "keyloop-stats-dimension-rhythm-compact",
    kit,
    textPart(
      "dimension-rhythm-compact-title",
      language === "zh" ? "输入节奏  " : "Rhythm  ",
      theme.info,
      kit,
      true,
    ),
    renderSkillDimension(dimension, language, kit),
  );
}

function renderSkillDimensionGroup(
  id: string,
  title: string,
  ids: readonly SkillDimensionId[],
  dimensions: ReadonlyMap<SkillDimensionId, SkillDiagnosis>,
  language: Language,
  width: number | undefined,
  kit: OpenTuiRendererKit,
): unknown {
  const items = ids
    .map((dimensionId) => dimensions.get(dimensionId))
    .filter(
      (dimension): dimension is SkillDiagnosis => dimension !== undefined,
    );
  return kit.Box(
    {
      id: `keyloop-stats-dimension-group-${id}`,
      flexDirection: "column",
      gap: 0,
      width,
      flexGrow: width === undefined ? 1 : undefined,
      minWidth: 0,
      height: 6,
      overflow: "hidden",
    },
    singleTextLine(
      `keyloop-stats-dimension-group-${id}-title`,
      title,
      theme.info,
      kit,
      true,
    ),
    ...items.map((dimension) => renderSkillDimension(dimension, language, kit)),
  );
}

function renderSkillDimension(
  dimension: SkillDiagnosis,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const color = skillStatusColor(dimension.status);
  const error = dimension.ewma_error_rate?.toFixed(1) ?? "—";
  const speed = dimension.ewma_speed?.toFixed(0) ?? "—";
  const trend = skillTrendLabel(dimension.trend, language);
  const metric =
    dimension.id === "word_fluency"
      ? language === "zh"
        ? `${speed} WPM · 错 ${error}% · ${trend}`
        : `${speed} WPM · err ${error}% · ${trend}`
      : language === "zh"
        ? `错 ${error}% · ${speed}ms · ${trend}`
        : `err ${error}% · ${speed}ms · ${trend}`;
  return lineBox(
    `keyloop-stats-dimension-${dimension.id}`,
    kit,
    kit.Text({
      id: `keyloop-stats-dimension-${dimension.id}-label`,
      content: skillDimensionShortLabel(dimension.id, language),
      fg: theme.foreground,
      width: language === "zh" ? 8 : 9,
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
    kit.Text({
      id: `keyloop-stats-dimension-${dimension.id}-status`,
      content: `${statusGlyph(dimension.status)}${skillStatusShortLabel(dimension.status, language)}`,
      fg: color,
      attributes: TEXT_BOLD,
      width: language === "zh" ? 10 : 12,
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
    textPart(`dimension-${dimension.id}-metrics`, metric, theme.muted, kit),
  );
}

function renderHistory(
  state: OpenTuiAppState,
  route: StatsRoute,
  kit: OpenTuiRendererKit,
): unknown {
  const dates = activeRecordDates(route.records);
  const dayIndex = clampIndex(route.dailyIndex ?? 0, dates.length);
  const selectedDate = dates[dayIndex] ?? "";
  const sessions = recordsForDate(route.records, selectedDate);
  const sessionIndex = clampIndex(
    route.historySessionIndex ?? 0,
    sessions.length,
  );
  const now = route.now ?? new Date();
  const calendarAnchor = calendarAnchorForSelection(
    route.records,
    selectedDate,
    now,
  );
  const calendarDays = buildActivityCalendarDays(
    route.records,
    calendarAnchor,
    CALENDAR_WEEKS,
  );
  const compact = (process.stdout.columns ?? 96) < WIDE_MIN_COLUMNS;
  return kit.Box(
    {
      id: "keyloop-stats-history-view",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
      overflow: "hidden",
    },
    panel(
      "keyloop-stats-history-calendar-panel",
      {
        title:
          state.language === "zh"
            ? "52 周训练日历 · 每格 = 1 天有效分钟"
            : "52-week training calendar · one cell = active minutes/day",
        borderColor: theme.border,
        height: compact ? 12 : 10,
        width: "100%",
        flexDirection: compact ? "column" : "row",
        gap: compact ? 0 : 3,
      },
      kit,
      renderActivityCalendar(calendarDays, selectedDate, state.language, kit),
      compact
        ? renderSelectedDayCompactSummary(
            selectedDate,
            sessions,
            route.records,
            state,
            kit,
          )
        : renderSelectedDaySummary(
            selectedDate,
            sessions,
            route.records,
            state,
            kit,
          ),
    ),
    renderSessionHistory(
      selectedDate,
      sessions,
      sessionIndex,
      route.historyExpanded ?? false,
      state,
      compact,
      kit,
    ),
  );
}

function renderSelectedDayCompactSummary(
  date: string,
  sessions: SessionRecord[],
  allRecords: readonly SessionRecord[],
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const activeMs = sessions.reduce(
    (sum, record) => sum + effectiveActiveMs(record),
    0,
  );
  const speed = aggregateSpeed(sessions, state.speed_unit ?? "wpm");
  const accuracy = sessions.length === 0 ? 0 : weightedAccuracy(sessions);
  const run = buildComprehensiveRuns(allRecords).find(
    (item) => item.date === date,
  );
  const completed =
    run?.records.filter((record) => record.completion_state === "completed")
      .length ?? 0;
  const zh = state.language === "zh";
  return kit.Box(
    {
      id: "keyloop-stats-history-day-summary-compact",
      flexDirection: "column",
      gap: 0,
      width: "100%",
      height: 2,
      overflow: "hidden",
    },
    singleTextLine(
      "keyloop-stats-history-day-summary-compact-main",
      zh
        ? `${date || "—"} · ${sessions.length} 次 · ${formatDurationShort(activeMs, state.language)} · ${speed.toFixed(1)} ${speedUnitLabel(state.speed_unit ?? "wpm")} · ${accuracy.toFixed(1)}%`
        : `${date || "—"} · ${sessions.length} sessions · ${formatDurationShort(activeMs, state.language)} · ${speed.toFixed(1)} ${speedUnitLabel(state.speed_unit ?? "wpm")} · ${accuracy.toFixed(1)}%`,
      theme.foreground,
      kit,
      true,
    ),
    singleTextLine(
      "keyloop-stats-history-day-summary-compact-run",
      run === undefined
        ? zh
          ? "综合  —"
          : "Full run  —"
        : zh
          ? `综合  ${completed}/${run.records.length} 阶段完成 · ${formatDurationShort(run.activeMs, state.language)}`
          : `Full run  ${completed}/${run.records.length} stages · ${formatDurationShort(run.activeMs, state.language)}`,
      run === undefined ? theme.muted : theme.accent,
      kit,
    ),
  );
}

function renderActivityCalendar(
  days: readonly DashboardActivityDay[],
  selectedDate: string,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const rows = activityCalendarRows(days);
  const labels =
    language === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["M", "T", "W", "T", "F", "S", "S"];
  return kit.Box(
    {
      id: "keyloop-stats-activity-calendar",
      flexDirection: "column",
      gap: 0,
      width: 57,
      height: 8,
      flexShrink: 0,
      overflow: "hidden",
    },
    ...rows.map((row, rowIndex) =>
      lineBox(
        `keyloop-stats-calendar-row-${rowIndex}`,
        kit,
        textPart(
          `calendar-label-${rowIndex}`,
          `${labels[rowIndex] ?? " "} `,
          theme.muted,
          kit,
        ),
        ...row.map((day, dayIndex) => {
          const selected = day.date === selectedDate;
          const level = activityLevel(day.activeMs);
          return textPart(
            `calendar-${rowIndex}-${dayIndex}`,
            selected ? "◆" : activityGlyph(level),
            selected ? theme.cursor : activityColor(level),
            kit,
            selected,
          );
        }),
      ),
    ),
    singleTextLine(
      "keyloop-stats-calendar-legend",
      language === "zh"
        ? "有效分钟  少 ·░▒▓█ 多   ◆ 当前日期"
        : "active minutes  less ·░▒▓█ more   ◆ selected",
      theme.muted,
      kit,
    ),
  );
}

function renderSelectedDaySummary(
  date: string,
  sessions: SessionRecord[],
  allRecords: readonly SessionRecord[],
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const activeMs = sessions.reduce(
    (sum, record) => sum + effectiveActiveMs(record),
    0,
  );
  const speed = aggregateSpeed(sessions, state.speed_unit ?? "wpm");
  const accuracy = sessions.length === 0 ? 0 : weightedAccuracy(sessions);
  const runs = buildComprehensiveRuns(allRecords).filter(
    (run) => run.date === date,
  );
  const run = runs[0];
  const completedStages =
    run?.records.filter((record) => record.completion_state === "completed")
      .length ?? 0;
  const composition = sessionComposition(sessions, state.language);
  const zh = state.language === "zh";
  return kit.Box(
    {
      id: "keyloop-stats-history-day-summary",
      flexDirection: "column",
      gap: 0,
      flexGrow: 1,
      minWidth: 0,
      height: 8,
      overflow: "hidden",
    },
    singleTextLine(
      "keyloop-stats-history-date",
      date || "—",
      theme.info,
      kit,
      true,
    ),
    singleTextLine(
      "keyloop-stats-history-active",
      `${zh ? "有效时长" : "Active time"}  ${formatDurationShort(activeMs, state.language)}`,
      theme.foreground,
      kit,
      true,
    ),
    singleTextLine(
      "keyloop-stats-history-count",
      zh ? `练习  ${sessions.length} 场` : `Sessions  ${sessions.length}`,
      theme.foreground,
      kit,
    ),
    singleTextLine(
      "keyloop-stats-history-speed",
      zh
        ? `平均速度  ${speed.toFixed(1)} ${speedUnitLabel(state.speed_unit ?? "wpm")}`
        : `Average speed  ${speed.toFixed(1)} ${speedUnitLabel(state.speed_unit ?? "wpm")}`,
      theme.accent,
      kit,
      true,
    ),
    singleTextLine(
      "keyloop-stats-history-accuracy",
      `${zh ? "正确率" : "Accuracy"}  ${accuracy.toFixed(1)}%`,
      theme.foreground,
      kit,
    ),
    singleTextLine(
      "keyloop-stats-history-composition",
      `${zh ? "构成" : "Mix"}  ${composition || "—"}`,
      theme.muted,
      kit,
    ),
    singleTextLine(
      "keyloop-stats-history-run",
      run === undefined
        ? zh
          ? "综合  —"
          : "Full run  —"
        : zh
          ? `综合  ${completedStages}/${run.records.length} 阶段完成 · ${formatDurationShort(run.activeMs, state.language)}`
          : `Full run  ${completedStages}/${run.records.length} stages · ${formatDurationShort(run.activeMs, state.language)}`,
      run === undefined ? theme.muted : theme.accent,
      kit,
    ),
  );
}

function renderSessionHistory(
  date: string,
  sessions: readonly SessionRecord[],
  selectedIndex: number,
  expanded: boolean,
  state: OpenTuiAppState,
  compact: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const visible = visibleSlice(
    sessions,
    selectedIndex,
    compact ? (expanded ? 3 : 6) : 9,
  );
  const zh = state.language === "zh";
  const selected = sessions[selectedIndex];
  return panel(
    "keyloop-stats-history-sessions",
    {
      title: `${date || "—"} · ${zh ? "当日练习记录" : "Practice sessions"}`,
      borderColor: theme.border,
      flexGrow: 1,
      width: "100%",
      gap: 0,
      bottomTitle: zh
        ? `${selectedIndex + (sessions.length === 0 ? 0 : 1)}/${sessions.length} 场 · Enter ${expanded ? "收起详情" : "展开详情"}`
        : `${selectedIndex + (sessions.length === 0 ? 0 : 1)}/${sessions.length} · Enter ${expanded ? "collapse details" : "expand details"}`,
    },
    kit,
    renderSessionHistoryHeader(state.language, kit),
    ...visible.items.map((record, visibleIndex) => {
      const absoluteIndex = visible.start + visibleIndex;
      const active = absoluteIndex === selectedIndex;
      const time = new Date(record.started_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const form = sessionForm(record);
      const speed = speedFromWpm(record.wpm, state.speed_unit ?? "wpm");
      return lineBox(
        `keyloop-stats-history-session-${absoluteIndex}`,
        kit,
        historyTableCell(
          `history-session-${absoluteIndex}-rail`,
          active ? "▌" : " ",
          1,
          theme.info,
          kit,
          true,
        ),
        historyTableCell(
          `history-session-${absoluteIndex}-time`,
          time,
          7,
          theme.muted,
          kit,
        ),
        historyTableCell(
          `history-session-${absoluteIndex}-form`,
          form === null
            ? moduleLabel(record.module, state.language)
            : formLabel(form, state.language),
          14,
          active ? theme.foreground : theme.muted,
          kit,
          active,
        ),
        historyTableCell(
          `history-session-${absoluteIndex}-speed`,
          `${speed.toFixed(1)} ${speedUnitLabel(state.speed_unit ?? "wpm")}`,
          13,
          active ? theme.accent : theme.muted,
          kit,
        ),
        historyTableCell(
          `history-session-${absoluteIndex}-accuracy`,
          `${record.accuracy.toFixed(1)}%`,
          9,
          active ? theme.foreground : theme.muted,
          kit,
        ),
        historyTableCell(
          `history-session-${absoluteIndex}-duration`,
          formatDurationShort(effectiveActiveMs(record), state.language),
          9,
          theme.muted,
          kit,
        ),
        textPart(
          `history-session-${absoluteIndex}-state`,
          record.completion_state === "completed"
            ? zh
              ? "完成"
              : "done"
            : zh
              ? "未完成"
              : "partial",
          record.completion_state === "completed"
            ? theme.accent
            : theme.warning,
          kit,
        ),
      );
    }),
    ...(expanded && selected !== undefined
      ? renderExpandedSession(selected, state, kit)
      : []),
  );
}

function renderExpandedSession(
  record: SessionRecord,
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown[] {
  const zh = state.language === "zh";
  const form = sessionForm(record);
  const speedUnit = speedUnitLabel(state.speed_unit ?? "wpm");
  const completion =
    record.completion_state === "completed"
      ? zh
        ? "完成"
        : "completed"
      : zh
        ? "未完成"
        : "partial";
  const eligibility = classifyPerformanceRecord(record);
  return [
    divider("keyloop-stats-history-session-rule", kit),
    singleTextLine(
      "keyloop-stats-history-session-detail-a",
      zh
        ? `训练  ${moduleLabel(record.module, state.language)} · ${form === null ? "未分类" : formLabel(form, state.language)} · ${completion}`
        : `Session  ${moduleLabel(record.module, state.language)} · ${form === null ? "unclassified" : formLabel(form, state.language)} · ${completion}`,
      theme.foreground,
      kit,
      true,
    ),
    singleTextLine(
      "keyloop-stats-history-session-detail-b",
      zh
        ? `表现  ${speedFromWpm(record.wpm, state.speed_unit ?? "wpm").toFixed(1)} ${speedUnit} · 原始 ${speedFromWpm(record.raw_wpm, state.speed_unit ?? "wpm").toFixed(1)} ${speedUnit} · 正确率 ${record.accuracy.toFixed(1)}%`
        : `Performance  ${speedFromWpm(record.wpm, state.speed_unit ?? "wpm").toFixed(1)} ${speedUnit} · raw ${speedFromWpm(record.raw_wpm, state.speed_unit ?? "wpm").toFixed(1)} ${speedUnit} · accuracy ${record.accuracy.toFixed(1)}%`,
      theme.muted,
      kit,
    ),
    singleTextLine(
      "keyloop-stats-history-session-detail-c",
      zh
        ? `输入  ${record.typed_len} 字符 · 正确 ${record.correct_chars} · 错误 ${record.error_count} · 退格 ${record.backspace_count}`
        : `Typing  ${record.typed_len} chars · correct ${record.correct_chars} · errors ${record.error_count} · backspaces ${record.backspace_count}`,
      theme.muted,
      kit,
    ),
    singleTextLine(
      "keyloop-stats-history-session-detail-d",
      zh
        ? `用时  有效 ${formatDurationShort(record.active_ms, state.language)} · 停顿 ${formatDurationShort(record.idle_ms, state.language)} · 总计 ${formatDurationShort(record.duration_ms, state.language)} · ${performanceEligibilityLabel(eligibility, state.language)}`
        : `Timing  active ${formatDurationShort(record.active_ms, state.language)} · idle ${formatDurationShort(record.idle_ms, state.language)} · total ${formatDurationShort(record.duration_ms, state.language)} · ${performanceEligibilityLabel(eligibility, state.language)}`,
      eligibility.status === "eligible" ? theme.accent : theme.warning,
      kit,
    ),
  ];
}

function renderSessionHistoryHeader(
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const zh = language === "zh";
  return lineBox(
    "keyloop-stats-history-session-header",
    kit,
    historyTableCell("history-header-rail", " ", 1, theme.muted, kit),
    historyTableCell(
      "history-header-time",
      zh ? "时间" : "Time",
      7,
      theme.muted,
      kit,
      true,
    ),
    historyTableCell(
      "history-header-form",
      zh ? "类型" : "Type",
      14,
      theme.muted,
      kit,
      true,
    ),
    historyTableCell(
      "history-header-speed",
      zh ? "速度" : "Speed",
      13,
      theme.muted,
      kit,
      true,
    ),
    historyTableCell(
      "history-header-accuracy",
      zh ? "正确率" : "Accuracy",
      9,
      theme.muted,
      kit,
      true,
    ),
    historyTableCell(
      "history-header-duration",
      zh ? "有效" : "Active",
      9,
      theme.muted,
      kit,
      true,
    ),
    textPart(
      "history-header-state",
      zh ? "结果" : "Result",
      theme.muted,
      kit,
      true,
    ),
  );
}

function historyTableCell(
  id: string,
  content: string,
  width: number,
  color: OpenTuiColorInput,
  kit: OpenTuiRendererKit,
  bold = false,
): unknown {
  return kit.Text({
    id: `keyloop-stats-${id}`,
    content,
    fg: color,
    attributes: bold ? TEXT_BOLD : undefined,
    width,
    height: 1,
    flexShrink: 0,
    truncate: true,
    wrapMode: "none",
  });
}

function sessionComposition(
  sessions: readonly SessionRecord[],
  language: Language,
): string {
  const counts = new Map<string, { readonly label: string; count: number }>();
  for (const record of sessions) {
    const form = sessionForm(record);
    const key = form === null ? `module:${record.module}` : `form:${form}`;
    const label =
      form === null
        ? moduleLabel(record.module, language)
        : formLabel(form, language);
    const current = counts.get(key);
    if (current === undefined) {
      counts.set(key, { label, count: 1 });
    } else {
      current.count += 1;
    }
  }
  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    )
    .slice(0, 3)
    .map(({ label, count }) => `${label} ${count}`)
    .join(" · ");
}

function performanceEligibilityLabel(
  eligibility: ReturnType<typeof classifyPerformanceRecord>,
  language: Language,
): string {
  if (eligibility.status === "eligible") {
    return language === "zh" ? "✓ 计入趋势" : "✓ Included in trend";
  }
  const reason = performanceExclusionReasonLabel(eligibility.reason, language);
  return language === "zh"
    ? `不计入趋势：${reason}`
    : `Excluded from trend: ${reason}`;
}

function performanceExclusionReasonLabel(
  reason: PerformanceExclusionReason,
  language: Language,
): string {
  const zh: Record<PerformanceExclusionReason, string> = {
    active_time: `有效不足 ${Math.ceil(PERFORMANCE_MIN_ACTIVE_MS / 1000)} 秒`,
    typed_length: `输入不足 ${PERFORMANCE_MIN_TYPED_LEN} 字符`,
    correct_chars: "没有正确输入",
    invalid_speed: "速度数据异常",
    unclassified_form: "训练类型无法归类",
    invalid_started_at: "开始时间无效",
  };
  const en: Record<PerformanceExclusionReason, string> = {
    active_time: `less than ${Math.ceil(PERFORMANCE_MIN_ACTIVE_MS / 1000)}s active`,
    typed_length: `fewer than ${PERFORMANCE_MIN_TYPED_LEN} characters`,
    correct_chars: "no correct input",
    invalid_speed: "invalid speed",
    unclassified_form: "unclassified training type",
    invalid_started_at: "invalid start time",
  };
  return language === "zh" ? zh[reason] : en[reason];
}

function lineBox(
  id: string,
  kit: OpenTuiRendererKit,
  ...children: unknown[]
): unknown {
  return kit.Box(
    {
      id,
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      height: 1,
      flexShrink: 0,
      overflow: "hidden",
    },
    ...children,
  );
}

function textPart(
  id: string,
  content: string,
  color: OpenTuiColorInput,
  kit: OpenTuiRendererKit,
  bold = false,
): unknown {
  return kit.Text({
    id: `keyloop-stats-${id}`,
    content,
    fg: color,
    attributes: bold ? TEXT_BOLD : undefined,
    height: 1,
    flexShrink: 0,
    wrapMode: "none",
  });
}

function singleTextLine(
  id: string,
  content: string,
  color: OpenTuiColorInput,
  kit: OpenTuiRendererKit,
  bold = false,
): unknown {
  return kit.Text({
    id,
    content,
    fg: color,
    attributes: bold ? TEXT_BOLD : undefined,
    width: "100%",
    height: 1,
    truncate: true,
    wrapMode: "none",
  });
}

function overviewInsight(
  zh: boolean,
  dimension: SkillDiagnosis | undefined,
  trend: DashboardTrend | null,
  language: Language,
): string {
  if (dimension?.status === "weak") {
    return zh
      ? `${skillDimensionLabel(dimension.id, language)}仍是主要瓶颈`
      : `${skillDimensionLabel(dimension.id, language)} remains the main bottleneck`;
  }
  if (trend?.delta !== null && trend?.delta !== undefined) {
    const direction =
      trend.delta > 0
        ? zh
          ? "正在上升"
          : "is improving"
        : trend.delta < 0
          ? zh
            ? "有所回落"
            : "has dipped"
          : zh
            ? "保持稳定"
            : "is steady";
    return `${formLabel(trend.form, language)}${zh ? "速度" : " speed"} ${direction}`;
  }
  return zh ? "训练画像正在变清晰" : "Your training picture is taking shape";
}

function overviewCoverage(zh: boolean, trend: DashboardTrend | null): string {
  return trend === null
    ? zh
      ? "等待合格会话"
      : "waiting for eligible sessions"
    : zh
      ? `${trend.eligibleCount}/${trend.totalCount} 次可用于表现趋势`
      : `${trend.eligibleCount}/${trend.totalCount} eligible for performance trends`;
}

function trendInsight(trend: DashboardTrend, state: OpenTuiAppState): string {
  const zh = state.language === "zh";
  const subject = `${formLabel(trend.form, state.language)} ${metricLabel(trend.metric, state.language)}`;
  if (trend.delta === null) {
    return zh ? `${subject}正在建立基线` : `${subject} is building a baseline`;
  }
  if (Math.abs(trend.delta) < (trend.metric === "speed" ? 1 : 0.3)) {
    return zh ? `${subject} 保持稳定` : `${subject} is steady`;
  }
  return trend.delta > 0
    ? zh
      ? `${subject} 正在上升`
      : `${subject} is improving`
    : zh
      ? `${subject} 近期回落`
      : `${subject} has dipped recently`;
}

function metricLabel(metric: StatsTrendMetric, language: Language): string {
  return metric === "speed" ? "WPM" : language === "zh" ? "正确率" : "Accuracy";
}

function rangeLabel(range: StatsTrendRange, language: Language): string {
  switch (range) {
    case "sessions_30":
      return language === "zh" ? "30 次" : "30 sessions";
    case "days_90":
      return language === "zh" ? "90 天" : "90 days";
    case "all":
      return language === "zh" ? "全部" : "All time";
  }
}

function bucketLabel(
  unit: DashboardTrend["bucketUnit"],
  language: Language,
): string {
  const labels =
    language === "zh"
      ? {
          session: "逐次",
          day: "按日聚合",
          week: "按周聚合",
          month: "按月聚合",
        }
      : {
          session: "per session",
          day: "daily",
          week: "weekly",
          month: "monthly",
        };
  return labels[unit];
}

function metricUnit(metric: StatsTrendMetric, state: OpenTuiAppState): string {
  return metric === "speed"
    ? ` ${speedUnitLabel(state.speed_unit ?? "wpm")}`
    : "%";
}

function displayedTrendValue(
  value: number,
  metric: StatsTrendMetric,
  state: OpenTuiAppState,
): number {
  return metric === "speed"
    ? speedFromWpm(value, state.speed_unit ?? "wpm")
    : value;
}

function deltaText(delta: number | null, unit: string): string {
  if (delta === null) return "基线";
  const sign = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return `${sign}${Math.abs(delta).toFixed(1)}${unit === "pp" ? "pp" : unit.startsWith(" ") ? unit : ` ${unit}`}`;
}

function deltaColor(delta: number | null): OpenTuiColorInput {
  if (delta === null || delta === 0) return theme.muted;
  return delta > 0 ? theme.accent : theme.warning;
}

function trendDirectionLabel(delta: number | null, language: Language): string {
  if (language === "zh") {
    if (delta === null) return "基线";
    if (delta > 0) return "上升";
    if (delta < 0) return "回落";
    return "持平";
  }
  if (delta === null) return "baseline";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "steady";
}

function trendRunColor(tone: BrailleTrendTone): OpenTuiColorInput {
  switch (tone) {
    case "empty":
      return theme.muted;
    case "line":
      return theme.info;
    case "point":
      return theme.accent;
    case "selected":
      return theme.cursor;
  }
}

function rankedDimensions(
  dimensions: readonly SkillDiagnosis[],
): SkillDiagnosis[] {
  const rank = { weak: 0, normal: 1, stable: 2, unrated: 3 } as const;
  return [...dimensions].sort(
    (left, right) =>
      rank[left.status] - rank[right.status] ||
      (right.ewma_error_rate ?? -1) - (left.ewma_error_rate ?? -1) ||
      left.id.localeCompare(right.id),
  );
}

function skillDimensionLabel(id: SkillDimensionId, language: Language): string {
  const zh: Record<SkillDimensionId, string> = {
    home_row: "中排键（ASDF）",
    top_row: "上排键",
    bottom_row: "下排键",
    left_hand: "左手",
    right_hand: "右手",
    digits: "数字",
    symbols: "符号",
    capitalization: "大写",
    word_fluency: "单词流畅度",
  };
  const en: Record<SkillDimensionId, string> = {
    home_row: "Home row",
    top_row: "Top row",
    bottom_row: "Bottom row",
    left_hand: "Left hand",
    right_hand: "Right hand",
    digits: "Digits",
    symbols: "Symbols",
    capitalization: "Capitalization",
    word_fluency: "Word fluency",
  };
  return language === "zh" ? zh[id] : en[id];
}

function skillDimensionShortLabel(
  id: SkillDimensionId,
  language: Language,
): string {
  if (language === "zh") {
    if (id === "home_row") return "中排键";
    return id === "word_fluency" ? "词流畅" : skillDimensionLabel(id, language);
  }
  const labels: Record<SkillDimensionId, string> = {
    home_row: "Home",
    top_row: "Top",
    bottom_row: "Bottom",
    left_hand: "Left",
    right_hand: "Right",
    digits: "Digits",
    symbols: "Symbols",
    capitalization: "Caps",
    word_fluency: "Words",
  };
  return labels[id];
}

function skillStatusShortLabel(
  status: SkillDiagnosis["status"],
  language: Language,
): string {
  const zh = {
    weak: "待加强",
    normal: "正常",
    stable: "稳定",
    unrated: "样本不足",
  } as const;
  const en = {
    weak: "needs work",
    normal: "normal",
    stable: "stable",
    unrated: "no data",
  } as const;
  return language === "zh" ? zh[status] : en[status];
}

function skillStatusColor(status: SkillDiagnosis["status"]): OpenTuiColorInput {
  switch (status) {
    case "weak":
      return theme.warning;
    case "normal":
      return theme.info;
    case "stable":
      return theme.accent;
    case "unrated":
      return theme.muted;
  }
}

function statusGlyph(status: SkillDiagnosis["status"]): string {
  switch (status) {
    case "weak":
      return "◆";
    case "normal":
      return "●";
    case "stable":
      return "✓";
    case "unrated":
      return "·";
  }
}

function skillTrendLabel(
  trend: SkillDiagnosis["trend"],
  language: Language,
): string {
  const zh = {
    improving: "改善",
    declining: "变慢",
    stable: "持平",
    insufficient: "样本少",
  } as const;
  const en = {
    improving: "up",
    declining: "down",
    stable: "steady",
    insufficient: "more data",
  } as const;
  return language === "zh" ? zh[trend] : en[trend];
}

function keyboardHeatColor(level: KeyboardHeatLevel): OpenTuiColorInput {
  switch (level) {
    case "unrated":
      return theme.muted;
    case "mastered":
      return theme.accent;
    case "watch":
      return theme.info;
    case "weak":
      return theme.warning;
    case "critical":
      return theme.danger;
  }
}

function keyboardHeatBackground(level: KeyboardHeatLevel): OpenTuiColorInput {
  switch (level) {
    case "unrated":
      return theme.brightBlack;
    case "mastered":
      return theme.green;
    case "watch":
      return theme.cyan;
    case "weak":
      return theme.yellow;
    case "critical":
      return theme.red;
  }
}

function keyboardHeatForeground(level: KeyboardHeatLevel): OpenTuiColorInput {
  return level === "critical" || level === "unrated"
    ? theme.brightWhite
    : theme.black;
}

function keyboardHeatLabel(
  level: KeyboardHeatLevel,
  language: Language,
): string {
  const zh: Record<KeyboardHeatLevel, string> = {
    unrated: "样本不足",
    mastered: "达标",
    watch: "接近",
    weak: "待加强",
    critical: "薄弱",
  };
  const en: Record<KeyboardHeatLevel, string> = {
    unrated: "no data",
    mastered: "mastered",
    watch: "close",
    weak: "needs work",
    critical: "critical",
  };
  return language === "zh" ? zh[level] : en[level];
}

function activityColor(level: ActivityLevel): OpenTuiColorInput {
  switch (level) {
    case "empty":
      return theme.border;
    case "low":
      return theme.muted;
    case "medium":
      return theme.info;
    case "high":
      return theme.accent;
    case "peak":
      return theme.brightGreen;
  }
}

function moduleLabel(module: TrainingModule, language: Language): string {
  const zh: Record<TrainingModule, string> = {
    unknown: "其他",
    comprehensive: "综合",
    foundation_input: "基础",
    everyday_english: "日常英语",
    programming_basics: "编程基础",
    custom_corpus: "自建词库",
    code_practice: "代码实战",
  };
  const en: Record<TrainingModule, string> = {
    unknown: "Other",
    comprehensive: "Full practice",
    foundation_input: "Foundation",
    everyday_english: "Everyday English",
    programming_basics: "Programming",
    custom_corpus: "My corpus",
    code_practice: "Code",
  };
  return language === "zh" ? zh[module] : en[module];
}

function stageFormLabel(form: TrainingForm | null, language: Language): string {
  if (form === null) return language === "zh" ? "其他" : "Other";
  if (language === "zh") return formLabel(form, language);
  switch (form) {
    case "keys":
      return "Keys";
    case "words":
      return "Words";
    case "symbols":
      return "Symbols";
    case "sentences":
      return "Sent";
    case "articles":
      return "Text";
    case "code":
      return "Code";
  }
}

function stageDuration(record: SessionRecord): string {
  const seconds = Math.max(0, Math.round(effectiveActiveMs(record) / 1_000));
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
}

function centerText(value: string, width: number): string {
  const safeWidth = Math.max(1, Math.trunc(width));
  const characters = Array.from(value).slice(0, safeWidth);
  const remaining = safeWidth - characters.length;
  const left = Math.floor(remaining / 2);
  return `${" ".repeat(left)}${characters.join("")}${" ".repeat(remaining - left)}`;
}

function calendarAnchorForSelection(
  records: readonly SessionRecord[],
  selectedDate: string,
  now: Date,
): Date {
  const current = buildActivityCalendarDays(records, now, CALENDAR_WEEKS);
  const first = current[0]?.date;
  if (selectedDate !== "" && first !== undefined && selectedDate < first) {
    return new Date(`${selectedDate}T12:00:00`);
  }
  return now;
}

function visibleSlice<T>(
  items: readonly T[],
  selectedIndex: number,
  limit: number,
): { start: number; items: readonly T[] } {
  if (items.length <= limit) return { start: 0, items };
  const start = Math.max(
    0,
    Math.min(items.length - limit, selectedIndex - Math.floor(limit / 2)),
  );
  return { start, items: items.slice(start, start + limit) };
}

function formatMs(value: number | null): string {
  return value === null ? "—" : value.toFixed(0);
}

function printableKey(key: string): string {
  if (key === " ") return "Space";
  if (key === "\n") return "Enter";
  if (key === "\t") return "Tab";
  return key;
}

function safeId(value: string): string {
  return [...value]
    .map((character) => character.codePointAt(0)?.toString(16) ?? "0")
    .join("-");
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(length - 1, 0));
}

function terminalSupportsBraille(): boolean {
  return process.env.TERM?.toLowerCase() !== "dumb";
}

export function statsHints(view: OpenTuiStatsView, zh: boolean): KeyHint[] {
  switch (view) {
    case "overview":
      return [
        { key: "Tab", label: zh ? "切换页面" : "next view" },
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
    case "trends":
      return [
        { key: "↑/↓", label: zh ? "形态" : "form" },
        { key: "←/→", label: zh ? "数据点" : "point" },
        { key: "M", label: zh ? "指标" : "metric" },
        { key: "[ / ]", label: zh ? "范围" : "range" },
        { key: "Tab", label: zh ? "页面" : "view" },
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
    case "skills":
      return [
        { key: "方向键", label: zh ? "选择键位" : "select key" },
        { key: "Tab", label: zh ? "页面" : "view" },
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
    case "history":
      return [
        { key: "←/→", label: zh ? "日期" : "date" },
        { key: "↑/↓", label: zh ? "会话" : "session" },
        { key: "Enter", label: zh ? "详情" : "details" },
        { key: "Tab", label: zh ? "页面" : "view" },
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
  }
}
