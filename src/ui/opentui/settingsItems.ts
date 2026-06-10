import type { CodeStyleSettings, Language, SpeedUnit } from "../../domain/model";
import { codeDifficultyLabel, codeIndentLabel, codeLengthLabel, everydayLengthLabel } from "./labels";
import type { OpenTuiAppState, OpenTuiCodeFilterState } from "./appModel";
import {
  codeDifficultyOptions,
  codeLengthOptions,
  defaultCodeSettings,
  defaultEverydaySettings,
  defaultWordFormSettings,
  openTuiCodeFilterPickerItems,
} from "./appModel";
import { defaultCodeStyleSettings } from "../../domain/model";

export type OpenTuiSettingsView =
  | "menu"
  | "language"
  | "code_filters"
  | "code_difficulty"
  | "code_style"
  | "everyday"
  | "word_forms";
export type OpenTuiSettingsMenuItemId =
  | "settings-language"
  | "settings-code-filters"
  | "settings-code-difficulty"
  | "settings-code-style";

export interface OpenTuiSettingsMenuItem {
  id: OpenTuiSettingsMenuItemId;
  view: Exclude<OpenTuiSettingsView, "menu">;
  label: string;
  hint: string;
}

export type OpenTuiFlatSettingsItemKind =
  | "language"
  | "speed_unit"
  | "code_difficulty"
  | "code_length"
  | "code_indent"
  | "code_semicolons"
  | "code_quotes"
  | "code_filters";

export interface OpenTuiFlatSettingsItem {
  kind: OpenTuiFlatSettingsItemKind;
  label: string;
  value: string;
}

export function openTuiSettingsMenuItems(language: Language): OpenTuiSettingsMenuItem[] {
  return [
    settingsItem("settings-language", "language", "界面语言", "Interface language", language),
    settingsItem(
      "settings-code-filters",
      "code_filters",
      "代码语言框架",
      "Code language/framework",
      language,
    ),
    settingsItem("settings-code-difficulty", "code_difficulty", "代码难度", "Code difficulty", language),
    settingsItem("settings-code-style", "code_style", "代码风格", "Code style", language),
  ];
}

export function openTuiFlatSettingsItems(state: OpenTuiAppState): OpenTuiFlatSettingsItem[] {
  const language = state.language;
  const codeSettings = state.codeSettings ?? defaultCodeSettings();
  const codeStyleSettings = state.codeStyleSettings ?? defaultCodeStyleSettings();
  const speedUnit = state.speed_unit ?? "wpm";
  const items: OpenTuiFlatSettingsItem[] = [
    {
      kind: "language",
      label: language === "zh" ? "界面语言" : "Interface language",
      value: language === "zh" ? "中文" : "English",
    },
    {
      kind: "speed_unit",
      label: language === "zh" ? "打字速度" : "Typing speed",
      value: speedUnitSettingLabel(speedUnit, language),
    },
    {
      kind: "code_filters",
      label: language === "zh" ? "代码语言框架" : "Code language/framework",
      value: codeFilterFlatValue(state.codeFilters, language),
    },
    {
      kind: "code_difficulty",
      label: language === "zh" ? "代码难度" : "Code difficulty",
      value: codeDifficultyLabel(codeSettings.difficulty, language),
    },
    {
      kind: "code_length",
      label: language === "zh" ? "代码长度" : "Code length",
      value: codeLengthLabel(codeSettings.length, language),
    },
    {
      kind: "code_indent",
      label: language === "zh" ? "代码缩进" : "Code indent",
      value: codeIndentLabel(codeStyleSettings, language),
    },
    {
      kind: "code_semicolons",
      label: language === "zh" ? "代码分号" : "Code semicolons",
      value: codeSemicolonLabel(codeStyleSettings.semicolons, language),
    },
    {
      kind: "code_quotes",
      label: language === "zh" ? "代码引号" : "Code quotes",
      value: codeQuoteLabel(codeStyleSettings.quotes, language),
    },
  ];
  return items;
}

export function speedUnitSettingLabel(speedUnit: SpeedUnit, language: Language): string {
  if (language === "zh") {
    return speedUnit === "wpm" ? "WPM（每分钟标准词）" : "CPM（每分钟字符）";
  }
  return speedUnit === "wpm" ? "WPM (words per minute)" : "CPM (characters per minute)";
}

export function codeFilterFlatValue(
  filters: OpenTuiCodeFilterState | undefined,
  language: Language,
): string {
  if (filters === undefined) {
    return language === "zh" ? "全部代码范围" : "All code scopes";
  }
  const query = filters.query.trim();
  if (query !== "") {
    return query;
  }
  if (filters.selected.length === 0) {
    return language === "zh" ? "全部代码范围" : "All code scopes";
  }
  if (filters.selected.length === 1) {
    const selected = filters.selected[0];
    return selected === undefined
      ? language === "zh"
        ? "全部代码范围"
        : "All code scopes"
      : `${selected.facet}: ${selected.value}`;
  }
  return language === "zh"
    ? `已选 ${filters.selected.length} 项`
    : `${filters.selected.length} selected`;
}

export function selectedFlatSettingsIndex(state: OpenTuiAppState, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }
  if (state.route.screen !== "settings" || state.route.view !== "menu") {
    return 0;
  }
  return Math.min(
    Math.max(Math.trunc(state.route.selected_index ?? 0), 0),
    Math.max(itemCount - 1, 0),
  );
}

export function flatSettingsRouteLines(state: OpenTuiAppState): string[] {
  const items = openTuiFlatSettingsItems(state);
  const selected = selectedFlatSettingsIndex(state, items.length);
  return items.map(
    (item, index) => `${index === selected ? ">" : " "} ${item.label}  ${item.value}`,
  );
}

export function onOffLabel(enabled: boolean, language: Language): string {
  if (language === "zh") {
    return enabled ? "开" : "关";
  }
  return enabled ? "on" : "off";
}

export function settingsItem(
  id: OpenTuiSettingsMenuItemId,
  view: Exclude<OpenTuiSettingsView, "menu">,
  labelZh: string,
  labelEn: string,
  language: Language,
): OpenTuiSettingsMenuItem {
  return {
    id,
    view,
    label: language === "zh" ? labelZh : labelEn,
    hint: language === "zh" ? labelEn : labelZh,
  };
}

export function settingsRouteLines(state: OpenTuiAppState): string[] {
  if (state.route.screen !== "settings") {
    return [];
  }

  if (state.route.view === "language") {
    if (state.language === "zh") {
      return ["1. 中文  当前", "2. English"];
    }
    return ["1. Chinese", "2. English  current"];
  }

  if (state.route.view === "code_filters") {
    const filters = state.codeFilters;
    if (filters === undefined || filters.options.length === 0) {
      return [
        state.language === "zh" ? "搜索  " : "Search  ",
        state.language === "zh" ? "没有可用代码范围" : "No code filters available",
      ];
    }
    const items = openTuiCodeFilterPickerItems(state);
    const searchLine = `${state.language === "zh" ? "搜索" : "Search"}  ${filters.query}`;
    if (items.length === 0) {
      return [
        searchLine,
        state.language === "zh" ? "没有匹配项" : "No matches",
      ];
    }
    return [
      searchLine,
      ...items.map((item) => {
        const marker = item.active ? ">" : " ";
        const selected = item.selected ? "x" : " ";
        const pinned = item.pinned ? "  pinned" : "";
        return `${marker} [${selected}] ${item.option.facet}: ${item.option.value} (${item.option.count})${pinned}`;
      }),
    ];
  }

  if (state.route.view === "code_difficulty") {
    const settings = state.codeSettings ?? defaultCodeSettings();
    return codeDifficultyOptions.map((value, index) => {
      const current = value === settings.difficulty;
      const label = codeDifficultyLabel(value, state.language);
      return `${index + 1}. ${label}${current ? currentSuffix(state.language) : ""}`;
    });
  }

  if (state.route.view === "code_style") {
    const settings = state.codeStyleSettings ?? defaultCodeStyleSettings();
    const selected = Math.min(Math.max(state.route.selected_index ?? 0, 0), 2);
    const lines = state.language === "zh"
      ? [
          `缩进  ${codeIndentLabel(settings, state.language)}`,
          `分号  ${codeSemicolonLabel(settings.semicolons, state.language)}`,
          `引号  ${codeQuoteLabel(settings.quotes, state.language)}`,
        ]
      : [
          `Indent  ${codeIndentLabel(settings, state.language)}`,
          `Semicolons  ${codeSemicolonLabel(settings.semicolons, state.language)}`,
          `Quotes  ${codeQuoteLabel(settings.quotes, state.language)}`,
        ];
    return lines.map((line, index) => `${index === selected ? ">" : " "} ${line}`);
  }

  if (state.route.view === "everyday") {
    const settings = state.everydaySettings ?? defaultEverydaySettings();
    return state.language === "zh"
      ? [
          `词数  ${settings.word_count}`,
          `句长  ${everydayLengthLabel(settings.sentence_length, state.language)}`,
          `短语  ${settings.include_phrases ? "开" : "关"}`,
        ]
      : [
          `Word count  ${settings.word_count}`,
          `Sentence length  ${everydayLengthLabel(settings.sentence_length, state.language)}`,
          `Phrases  ${settings.include_phrases ? "on" : "off"}`,
        ];
  }

  if (state.route.view === "word_forms") {
    const settings = state.wordFormSettings ?? defaultWordFormSettings();
    return state.language === "zh"
      ? [
          `长词每组  ${settings.word_breakdown.max_items_per_group}`,
          `词库每日  ${settings.personal_vocabulary.daily_review_limit}`,
        ]
      : [
          `Breakdown items per group  ${settings.word_breakdown.max_items_per_group}`,
          `Vocabulary daily limit  ${settings.personal_vocabulary.daily_review_limit}`,
        ];
  }

  return openTuiSettingsMenuItems(state.language).map((item, index) => `${index + 1}. ${item.label}`);
}

export function codeFormatterLabel(
  value: CodeStyleSettings["formatter"],
  language: Language,
): string {
  if (language === "zh") {
    switch (value) {
      case "auto":
        return "自动";
      case "prettier":
        return "Prettier";
      case "native":
        return "原生工具";
      case "off":
        return "关闭";
    }
  }
  switch (value) {
    case "auto":
      return "Auto";
    case "prettier":
      return "Prettier";
    case "native":
      return "Native";
    case "off":
      return "Off";
  }
}

export function codeSemicolonLabel(
  value: CodeStyleSettings["semicolons"],
  language: Language,
): string {
  if (language === "zh") {
    return value === "always" ? "保留/添加" : "移除";
  }
  return value === "always" ? "Always" : "Never";
}

export function codeQuoteLabel(value: CodeStyleSettings["quotes"], language: Language): string {
  if (language === "zh") {
    return value === "single" ? "单引号" : "双引号";
  }
  return value === "single" ? "Single" : "Double";
}

export function codeTrailingCommaLabel(
  value: CodeStyleSettings["trailing_commas"],
  language: Language,
): string {
  if (language === "zh") {
    switch (value) {
      case "none":
        return "无";
      case "es5":
        return "ES5";
      case "all":
        return "全部";
    }
  }
  switch (value) {
    case "none":
      return "None";
    case "es5":
      return "ES5";
    case "all":
      return "All";
  }
}

export function currentSuffix(language: Language): string {
  return language === "zh" ? "  当前" : "  current";
}
