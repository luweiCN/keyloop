import type { DailyPracticePlan, Language, MainGoal, PracticeLesson, SessionRecord, SpeedUnit } from "../../domain/model";
import { SESSION_LENGTH_PRESETS, snapToPreset } from "../../training/prescription";
import {
  aggregateSpeed,
  effectiveActiveMs,
  formatDurationShort,
  keyStatsLines,
  localDateKey,
  speedFromWpm,
  speedUnitLabel,
  statsCodeLines,
  statsComprehensiveLines,
  statsDatesFromRecords,
  statsDayLines,
  statsModuleLines,
  statsOverviewLines,
  statsTodayLines,
  statsTokenLines,
  weightedAccuracy,
} from "../../report/stats";
import type {
  OpenTuiAppState,
  OpenTuiRoute,
  OpenTuiRunningLiveState,
  OpenTuiStatsView,
} from "./appModel";
import { everydayMeaningLines } from "../../training/targets";
import { openTuiStatsViews } from "./appModel";
import { openTuiMenuItems, submenuTitle, type OpenTuiMenuItemId } from "./menuItems";
import { flatSettingsRouteLines, settingsRouteLines } from "./settingsItems";
import { formLabel } from "./labels";
import { formForCategory } from "../../training/diagnosis";
import type { GoalRecommendation } from "../../training/goalPlan";

export function openTuiRouteTitle(state: OpenTuiAppState): string {
  switch (state.route.screen) {
    case "main_menu":
      return "KeyLoop";
    case "submenu":
      return submenuTitle(state.route.menu);
    case "settings":
      if (state.route.view === "code_filters") {
        return state.language === "zh" ? "代码语言框架" : "Code language/framework";
      }
      if (state.route.view === "code_difficulty") {
        return state.language === "zh" ? "代码难度" : "Code difficulty";
      }
      if (state.route.view === "code_style") {
        return state.language === "zh" ? "代码风格" : "Code style";
      }
      if (state.route.view === "everyday") {
        return state.language === "zh" ? "日常英语" : "Everyday English";
      }
      if (state.route.view === "word_forms") {
        return state.language === "zh" ? "词形练习" : "Word form practice";
      }
      if (state.route.view === "language") {
        return state.language === "zh" ? "界面语言" : "Interface language";
      }
      return state.language === "zh" ? "设置" : "Settings";
    case "stats":
      return state.language === "zh" ? "统计" : "Stats";
    case "running":
      return state.language === "zh" ? "练习中" : "Running";
    case "exit_confirmation":
      return state.language === "zh" ? "退出确认" : "Exit confirmation";
    case "code_settings_confirmation":
      return state.language === "zh" ? "刷新代码设置" : "Refresh code settings";
    case "practice_options":
      return state.language === "zh" ? "练习选项" : "Practice options";
    case "complete":
      return state.language === "zh" ? "本组完成" : "Lesson complete";
    case "stage_plan":
      return state.language === "zh" ? "今日训练计划" : "Today's training plan";
    case "summary":
      return state.language === "zh" ? "今日总结" : "Daily summary";
    case "ansi_palette":
      return state.language === "zh" ? "ANSI 色板" : "ANSI palette";
    case "library_menu": {
      const library = (state.customLibraries ?? []).find(
        (entry) => state.route.screen === "library_menu" && entry.slug === state.route.slug,
      );
      return library?.name ?? (state.language === "zh" ? "自建语料库" : "My library");
    }
    case "library_create":
      return state.language === "zh" ? "新建语料库" : "New library";
    case "library_manage":
      return state.language === "zh" ? "管理语料库" : "Manage libraries";
    case "library_actions":
      return state.language === "zh" ? "语料库管理" : "Library actions";
    case "library_input":
      return state.language === "zh" ? "录入内容" : "Add content";
    case "library_preview":
      return state.language === "zh" ? "预览确认" : "Preview";
    case "library_browse":
      return state.language === "zh" ? "浏览内容" : "Browse entries";
    case "library_detail":
      return state.language === "zh" ? "条目详情" : "Entry detail";
    case "library_delete_confirm":
      return state.language === "zh" ? "删除确认" : "Delete confirmation";
  }
}

export function openTuiRouteLines(state: OpenTuiAppState): string[] {
  const speedUnit = state.speed_unit ?? "wpm";
  switch (state.route.screen) {
    case "main_menu":
    case "submenu":
    case "library_menu":
      return openTuiMenuItems(state).map((item, index) => `${index + 1}. ${item.label}  ${item.hint}`);
    case "settings":
      if (state.route.view === "menu") {
        return flatSettingsRouteLines(state);
      }
      return settingsRouteLines(state);
    case "stats":
      return statsRouteLines(state.route, state.language, speedUnit);
    case "running":
      return runningRouteLines(state.route, state.language, speedUnit);
    case "exit_confirmation":
      return exitConfirmationLines(state.language);
    case "code_settings_confirmation":
      return codeSettingsConfirmationLines(state.language);
    case "practice_options":
      return state.route.practice_options.items.map((item) => `${item.label}  ${item.value}`);
    case "complete":
      return completionLines(
        state.route.record,
        state.route.next_lesson,
        state.route.source_item,
        state.language,
        speedUnit,
      );
    case "stage_plan":
      return stagePlanLines(
        state.route.plan,
        state.route.diagnosis_lines,
        state.language,
        state.route.completed_lesson_ids ?? [],
        state.route.goal,
        state.route.goal_recommendation,
      );
    case "summary":
      return summaryLines(
        state.route.records,
        state.language,
        speedUnit,
        state.route.lessons ?? [],
      );
    case "ansi_palette":
      return ansiPaletteLines(state.language);
    case "library_create":
    case "library_manage":
    case "library_actions":
    case "library_input":
    case "library_preview":
    case "library_browse":
    case "library_delete_confirm":
    case "library_detail":
      return [];
  }
}

export function ansiPaletteLines(language: Language): string[] {
  if (language === "zh") {
    return [
      "临时颜色选择辅助",
      "ANSI slots 0-7: black red green yellow blue magenta cyan white",
      "ANSI slots 8-15: brightBlack brightRed brightGreen brightYellow brightBlue brightMagenta brightCyan brightWhite",
      "渲染: KeyLoop 主题色通过 RGBA.fromIndex(slot) 读取终端 ANSI palette",
      "语义: keyword -> magenta | function/property -> blue | type/operator -> cyan | string -> yellow | wrong.bg -> red",
    ];
  }
  return [
    "Temporary color selection aid",
    "ANSI slots 0-7: black red green yellow blue magenta cyan white",
    "ANSI slots 8-15: brightBlack brightRed brightGreen brightYellow brightBlue brightMagenta brightCyan brightWhite",
    "Render: KeyLoop theme colors use RGBA.fromIndex(slot) to read the terminal ANSI palette",
    "Semantics: keyword -> magenta | function/property -> blue | type/operator -> cyan | string -> yellow | wrong.bg -> red",
  ];
}

export function runningRouteLines(
  route: Extract<OpenTuiRoute, { screen: "running" }>,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const lines = [
    route.lesson?.module ?? route.source_item,
    route.target.text,
  ];
  if (route.live !== undefined) {
    lines.push(...runningLiveLines(route.live, language, speedUnit));
  }
  if (isStandaloneEverydayWordItem(route.source_item)) {
    lines.push(...everydayMeaningLines(route.target.text, 6));
  }
  return lines;
}

export function isStandaloneEverydayWordItem(item: OpenTuiMenuItemId): boolean {
  return (
    item === "everyday_words" ||
    item === "everyday_common_500" ||
    item === "everyday_common_1000" ||
    item === "everyday_common_5000"
  );
}

export function runningLiveLines(
  live: OpenTuiRunningLiveState,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const metrics = live.metrics;
  const speedLabel = speedUnitLabel(speedUnit);
  const speed = speedFromWpm(metrics.wpm, speedUnit);
  const rawSpeed = speedFromWpm(metrics.raw_wpm, speedUnit);
  if (language === "zh") {
    return [
      `输入: ${live.input}`,
      `${speedLabel} ${speed.toFixed(1)} | 原始 ${speedLabel} ${rawSpeed.toFixed(1)} | 正确率 ${metrics.accuracy.toFixed(1)}%`,
      `错误 ${metrics.errors} | 退格 ${metrics.backspaces}`,
    ];
  }
  return [
    `Input: ${live.input}`,
    `${speedLabel} ${speed.toFixed(1)} | Raw ${speedLabel} ${rawSpeed.toFixed(1)} | Accuracy ${metrics.accuracy.toFixed(1)}%`,
    `Errors ${metrics.errors} | Backspace ${metrics.backspaces}`,
  ];
}

export function exitConfirmationLines(language: Language): string[] {
  if (language === "zh") {
    return [
      "确定要退出当前练习吗？",
      "未完成的当前进度不会保存。",
      "Enter 确认退出 | Esc 返回练习",
    ];
  }
  return [
    "Exit the current practice?",
    "Unfinished progress will not be saved.",
    "Enter confirm exit | Esc return to practice",
  ];
}

export function codeSettingsConfirmationLines(language: Language): string[] {
  if (language === "zh") {
    return [
      "更改代码设置会刷新本组",
      "当前输入会被清空。",
      "Enter 确认 | Esc 继续输入",
    ];
  }
  return [
    "Changing code settings will refresh this group",
    "Current input will be cleared.",
    "Enter confirm | Esc keep typing",
  ];
}

export function completionLines(
  record: SessionRecord,
  nextLesson: PracticeLesson | undefined,
  sourceItem: OpenTuiMenuItemId,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const speedLabel = speedUnitLabel(speedUnit);
  const speed = speedFromWpm(record.wpm, speedUnit);
  const rawSpeed = speedFromWpm(record.raw_wpm, speedUnit);
  const lines =
    language === "zh"
      ? [
          `模式 ${record.mode} | 模块 ${record.module}`,
          `${speedLabel} ${speed.toFixed(1)} | 原始 ${speedLabel} ${rawSpeed.toFixed(1)} | 正确率 ${record.accuracy.toFixed(1)}%`,
          `错误 ${record.error_count} | 退格 ${record.backspace_count}`,
        ]
      : [
          `Mode ${record.mode} | Module ${record.module}`,
          `${speedLabel} ${speed.toFixed(1)} | Raw ${speedLabel} ${rawSpeed.toFixed(1)} | Accuracy ${record.accuracy.toFixed(1)}%`,
          `Errors ${record.error_count} | Backspace ${record.backspace_count}`,
        ];

  if (isStandaloneCompletion(record, sourceItem)) {
    return lines;
  }

  if (nextLesson === undefined) {
    lines.push(language === "zh" ? "今日综合练习完成" : "Daily plan complete");
  } else {
    lines.push(
      language === "zh"
        ? `下一组: ${nextLesson.module}`
        : `Next: ${nextLesson.module}`,
    );
  }

  return lines;
}

export function isStandaloneCompletion(
  record: SessionRecord,
  sourceItem: OpenTuiMenuItemId,
): boolean {
  return record.daily_run_id === "" || sourceItem !== "comprehensive";
}

export function summaryLines(
  records: SessionRecord[],
  language: Language,
  speedUnit: SpeedUnit,
  lessons: PracticeLesson[] = [],
): string[] {
  if (records.length === 0) {
    return [
      language === "zh"
        ? "还没有完成的练习记录。"
        : "No completed sessions yet.",
    ];
  }

  const activeMs = records.reduce((sum, record) => sum + effectiveActiveMs(record), 0);
  const errors = records.reduce((sum, record) => sum + record.error_count, 0);
  const backspaces = records.reduce((sum, record) => sum + record.backspace_count, 0);
  const speed = aggregateSpeed(records, speedUnit);
  const speedLabel = speedUnitLabel(speedUnit);
  const accuracy = weightedAccuracy(records);
  const zh = language === "zh";

  const aggregateLine = zh
    ? `${records.length} 次练习 | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)} | 正确率 ${accuracy.toFixed(1)}%`
    : `${records.length} sessions | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)} | accuracy ${accuracy.toFixed(1)}%`;
  const errorLine = zh ? `错误 ${errors} | 退格 ${backspaces}` : `Errors ${errors} | Backspace ${backspaces}`;

  // 综合训练：逐练习「计划 vs 实际」时长 + 总计行（无 lessons 时退回纯汇总）
  const planLines = perLessonPlannedActualLines(records, lessons, language);
  if (planLines.length === 0) {
    return [aggregateLine, errorLine];
  }
  return [...planLines, aggregateLine, errorLine];
}

function perLessonPlannedActualLines(
  records: SessionRecord[],
  lessons: PracticeLesson[],
  language: Language,
): string[] {
  if (lessons.length === 0) {
    return [];
  }
  const zh = language === "zh";
  const lines: string[] = [];
  let totalPlanned = 0;
  let totalActual = 0;
  for (const record of records) {
    const lesson = record.lesson_index === null ? undefined : lessons[record.lesson_index];
    if (lesson === undefined || lesson.mix_profile !== "comprehensive") {
      continue;
    }
    const form = formForCategory(lesson.category);
    if (form === null) {
      continue;
    }
    const planned = lesson.estimated_minutes;
    const actual = effectiveActiveMs(record) / 60_000;
    totalPlanned += planned;
    totalActual += actual;
    const label = formLabel(form, language);
    lines.push(
      zh
        ? `${label} 计划 ${planned} 分 · 实际 ${actual.toFixed(1)} 分`
        : `${label} planned ${planned}m · actual ${actual.toFixed(1)}m`,
    );
  }
  if (lines.length === 0) {
    return [];
  }
  lines.push(
    zh
      ? `计划 ${totalPlanned} 分 · 实际 ${totalActual.toFixed(1)} 分`
      : `planned ${totalPlanned}m · actual ${totalActual.toFixed(1)}m`,
  );
  return lines;
}

export function statsRouteLines(
  route: Extract<OpenTuiRoute, { screen: "stats" }>,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  switch (route.view) {
    case "overview":
      return statsOverviewLines(route.records, 8, language, { speedUnit });
    case "today":
      return route.now === undefined
        ? statsTodayLines(route.records, 8, language, { speedUnit })
        : statsTodayLines(route.records, 8, language, { now: route.now, speedUnit });
    case "comprehensive":
      return statsComprehensiveLines(route.records, 8, language, { speedUnit });
    case "modules":
      return statsModuleLines(route.records, 8, language, { speedUnit });
    case "keys":
      return keyStatsLines(
        route.keyAggregates ?? [],
        route.keyStatsSort ?? "slowest_average",
        8,
        language,
      );
    case "tokens":
      return statsTokenLines(route.records, 8, language);
    case "code":
      return statsCodeLines(route.records, 8, language, { speedUnit });
    case "daily":
      return statsDailyRouteLines(route, language, speedUnit);
  }
}

export function statsDailyRouteLines(
  route: Extract<OpenTuiRoute, { screen: "stats" }>,
  language: Language,
  speedUnit: SpeedUnit,
): string[] {
  const dates = statsDatesFromRecords(route.records);
  if (dates.length === 0) {
    return statsDayLines("", 0, 0, [], 0, language, { speedUnit });
  }
  const index = clampIndex(route.dailyIndex ?? 0, dates.length);
  const date = dates[index];
  if (date === undefined) {
    return statsDayLines("", 0, 0, [], 0, language, { speedUnit });
  }
  const dayRecords = route.records.filter(
    (record) => localDateKey(new Date(record.started_at)) === date,
  );
  return statsDayLines(date, index, dates.length, dayRecords, 2, language, { speedUnit });
}

/**
 * 目标进度行（诊断屏顶部「方向盘 + 仪表盘」）。按推荐阶段展示当前 WPM、
 * 目标、达成预期与理想每日节奏。on_track 为主路径范例，其余 3 个阶段待填。
 */
export function goalProgressLines(
  goal: MainGoal,
  recommendation: GoalRecommendation,
  language: Language,
): string[] {
  const zh = language === "zh";
  const head = `${zh ? "目标" : "Goal"}:${formLabel(goal.form, language)}`;
  const current = Math.round(recommendation.current_wpm);
  const span = `${current}→${goal.target_wpm}`;
  switch (recommendation.phase) {
    case "on_track": {
      const eta = recommendation.projected_date
        ? formatMonthDay(recommendation.projected_date)
        : "?";
      return [
        zh
          ? `${head} ${span} · 预计 ${eta} · 理想每日 ~${recommendation.daily_minutes} 分`
          : `${head} ${span} · ETA ${eta} · ideal ~${recommendation.daily_minutes} min/day`,
      ];
    }
    case "cold_start":
      return [
        zh
          ? `${head} ${span} · 数据积累中，先练满 7 天给精准计划 · 暂按 ~${recommendation.daily_minutes} 分`
          : `${head} ${span} · warming up — practice 7 days for a precise plan · ~${recommendation.daily_minutes} min for now`,
      ];
    case "unreachable": {
      const projected = Math.round(recommendation.projected_wpm_at_deadline ?? current);
      return [
        zh
          ? `${head} ${span} · 按当前节奏期限内约到 ${projected} · 可延期/加量/调目标`
          : `${head} ${span} · ~${projected} by deadline at this pace · extend / add time / adjust`,
      ];
    }
    case "achieved":
      return [
        zh ? `${head} 已达成 ${goal.target_wpm} 🎉` : `${head} reached ${goal.target_wpm} 🎉`,
      ];
  }
}

function formatMonthDay(isoDate: string): string {
  const parts = isoDate.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/** 本次综合训练的真实计划分钟 = 各阶段回算后 estimated_minutes 之和 */
export function comprehensivePlanMinutes(plan: DailyPracticePlan): number {
  return plan.lessons.reduce((sum, lesson) => sum + lesson.estimated_minutes, 0);
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(length - 1, 0));
}

function stagePlanLines(
  plan: DailyPracticePlan,
  diagnosisLines: string[],
  language: Language,
  completedLessonIds: string[],
  goal: MainGoal | undefined,
  goalRecommendation: GoalRecommendation | undefined,
): string[] {
  const zh = language === "zh";
  const completed = new Set(completedLessonIds);
  const lines: string[] = [];
  if (goal !== undefined && goalRecommendation !== undefined) {
    lines.push(...goalProgressLines(goal, goalRecommendation, language));
    lines.push("");
  }
  lines.push(zh ? "诊断摘要:" : "Diagnosis:");
  for (const line of diagnosisLines) {
    lines.push(`  ${line}`);
  }
  lines.push("");
  const completedMinutes = Math.round(plan.completed_ms / 60_000);
  const planMinutes = comprehensivePlanMinutes(plan);
  lines.push(
    zh
      ? `今日计划: ${plan.lessons.length} 个阶段，本次约 ${planMinutes} 分钟（选定 ${plan.target_minutes} 分 · 今日已练 ${completedMinutes} 分钟）`
      : `Plan: ${plan.lessons.length} stages, ~${planMinutes} min this run (target ${plan.target_minutes} · done today: ${completedMinutes} min)`,
  );
  for (const [index, lesson] of plan.lessons.entries()) {
    const reason = zh ? lesson.reason_zh : lesson.reason_en;
    const mark = completed.has(lesson.id) ? "✓" : " ";
    lines.push(
      `  ${mark} ${index + 1}. ${lesson.estimated_minutes} min  ${reason}`,
    );
  }
  const activePreset = snapToPreset(plan.target_minutes);
  const presets = SESSION_LENGTH_PRESETS.map((minutes) =>
    minutes === activePreset ? `[${minutes}]` : ` ${minutes} `,
  ).join(" ");
  lines.push(zh ? `时长档位: ${presets}  (←/→ 切换)` : `Length: ${presets}  (←/→)`);
  lines.push("");
  const adjustable = plan.run_id.length === 0;
  lines.push(
    zh
      ? adjustable
        ? "[Enter] 开始  [←/→] 切换档位  [Esc] 返回"
        : "[Enter] 继续（跳过已完成阶段）  [Esc] 返回"
      : adjustable
        ? "[Enter] start  [Left/Right] switch length  [Esc] back"
        : "[Enter] continue (skips finished stages)  [Esc] back",
  );
  return lines;
}

const EMPTY_EMPHASIS: ReadonlySet<number> = new Set();

/**
 * stage_plan 面板里需要提亮的引导行（今日计划 / 时长档位）。
 * renderPanel 默认把非首行渲染为暗灰 muted，这两行太暗易被用户跳过，
 * 故单独标出行索引交由渲染层用前景色高亮。其它路由不强调（返回空集）。
 */
export function openTuiRouteEmphasis(state: OpenTuiAppState): ReadonlySet<number> {
  if (state.route.screen !== "stage_plan") {
    return EMPTY_EMPHASIS;
  }
  const indexes = new Set<number>();
  openTuiRouteLines(state).forEach((line, index) => {
    const trimmed = line.trimStart();
    if (
      trimmed.startsWith("今日计划") ||
      trimmed.startsWith("Plan:") ||
      trimmed.startsWith("时长档位") ||
      trimmed.startsWith("Length:")
    ) {
      indexes.add(index);
    }
  });
  return indexes;
}
