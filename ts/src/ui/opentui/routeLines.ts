import type { Language, PracticeLesson, SessionRecord, SpeedUnit } from "../../domain/model";
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
    case "summary":
      return state.language === "zh" ? "今日总结" : "Daily summary";
    case "ansi_palette":
      return state.language === "zh" ? "ANSI 色板" : "ANSI palette";
  }
}

export function openTuiRouteLines(state: OpenTuiAppState): string[] {
  const speedUnit = state.speed_unit ?? "wpm";
  switch (state.route.screen) {
    case "main_menu":
    case "submenu":
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
    case "summary":
      return summaryLines(state.route.records, state.language, speedUnit);
    case "ansi_palette":
      return ansiPaletteLines(state.language);
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

export function summaryLines(records: SessionRecord[], language: Language, speedUnit: SpeedUnit): string[] {
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

  return language === "zh"
    ? [
        `${records.length} 次练习 | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)} | 正确率 ${accuracy.toFixed(1)}%`,
        `错误 ${errors} | 退格 ${backspaces}`,
      ]
    : [
        `${records.length} sessions | active ${formatDurationShort(activeMs, language)} | ${speedLabel} ${speed.toFixed(1)} | accuracy ${accuracy.toFixed(1)}%`,
        `Errors ${errors} | Backspace ${backspaces}`,
      ];
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

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(length - 1, 0));
}
