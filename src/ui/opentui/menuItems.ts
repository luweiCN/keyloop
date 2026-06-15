import type { Language } from "../../domain/model";
import type { OpenTuiAppState } from "./appModel";
import type { OpenTuiSettingsMenuItemId } from "./settingsItems";

export type OpenTuiMainMenuId =
  | "comprehensive"
  | "foundation"
  | "everyday"
  | "programming"
  | "code"
  | "custom"
  | "settings"
  | "stats"
  | "ansi_palette";

export type OpenTuiSubmenuId =
  | "foundation_home_row"
  | "foundation_top_row"
  | "foundation_bottom_row"
  | "foundation_number_row"
  | "foundation_symbols"
  | "foundation_left_hand"
  | "foundation_right_hand"
  | "foundation_index_fingers"
  | "foundation_middle_fingers"
  | "foundation_ring_fingers"
  | "foundation_pinky_fingers"
  | "foundation_horizontal_rolls"
  | "foundation_vertical_ladders"
  | "foundation_diagonal_crossovers"
  | "foundation_letter_combinations"
  | "foundation_capitalization"
  | "foundation_mix"
  | "everyday_common_500"
  | "everyday_common_1000"
  | "everyday_common_5000"
  | "everyday_words"
  | "everyday_phrases"
  | "everyday_sentences"
  | "everyday_articles"
  | "everyday_word_decomposition"
  | "long_word_breakdown"
  | "everyday_mix"
  | "symbols_numbers"
  | "programming_terms"
  | "naming_styles"
  | "technical_long_words"
  | "builtin_api"
  | "programming_basics_mix"
  | "code_blocks"
  | "code_functions"
  | "code_file_fragments"
  | "code_mix"
  | "library_new"
  | "library_manage"
  | `library_open_${string}`
  | `library_kind_${string}`;

export type OpenTuiMenuItemId = OpenTuiMainMenuId | OpenTuiSubmenuId;
export type OpenTuiSubmenu = "foundation" | "everyday" | "programming" | "code" | "custom";

export interface OpenTuiMenuItem {
  id: OpenTuiMenuItemId;
  label: string;
  hint: string;
}

export function openTuiMenuItems(state: OpenTuiAppState): OpenTuiMenuItem[] {
  switch (state.route.screen) {
    case "main_menu":
      return mainMenuItems(state.language);
    case "submenu":
      if (state.route.menu === "custom") {
        return customSubmenuItems(state);
      }
      return submenuItems(state.route.menu, state.language);
    case "library_menu":
      return libraryMenuItems(state, state.route.slug);
    case "settings":
    case "stats":
    case "running":
    case "stage_plan":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "complete":
    case "summary":
    case "goal_onboarding":
    case "ansi_palette":
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

export function mainMenuItems(language: Language): OpenTuiMenuItem[] {
  return [
    item("comprehensive", "综合练习", "Full practice", language),
    item("foundation", "基础输入", "Foundation practice", language),
    item("everyday", "日常练习", "Everyday practice", language),
    item("programming", "编程基础", "Programming basics", language),
    item("code", "代码实战", "Code practice", language),
    item("custom", "自建语料库", "My corpus", language),
    item("settings", "设置", "Settings", language),
    item("stats", "统计", "Stats", language),
    item("ansi_palette", "调试色板", "ANSI palette", language),
  ];
}

function customSubmenuItems(state: OpenTuiAppState): OpenTuiMenuItem[] {
  const zh = state.language === "zh";
  const items: OpenTuiMenuItem[] = [];
  for (const library of state.customLibraries ?? []) {
    const wordCount = library.words.filter((word) => word.kind === "word").length;
    const phraseCount = library.words.length - wordCount;
    items.push({
      id: `library_open_${library.slug}`,
      label: library.name,
      hint: zh
        ? `${wordCount} 词 · ${phraseCount} 组 · ${library.sentences.length} 句 · ${library.articles.length} 篇`
        : `${wordCount}w · ${phraseCount}p · ${library.sentences.length}s · ${library.articles.length}a`,
    });
  }
  items.push({
    id: "library_new",
    label: zh ? "新建语料库" : "New library",
    hint: zh ? "输入名称创建" : "create with a name",
  });
  items.push({
    id: "library_manage",
    label: zh ? "管理语料库" : "Manage libraries",
    hint: zh ? "添加 · 编辑 · 删除" : "add · edit · delete",
  });
  return items;
}

export function libraryMenuItems(state: OpenTuiAppState, slug: string): OpenTuiMenuItem[] {
  const zh = state.language === "zh";
  const library = (state.customLibraries ?? []).find((entry) => entry.slug === slug);
  if (library === undefined) {
    return [];
  }
  const wordCount = library.words.filter((word) => word.kind === "word").length;
  const phraseCount = library.words.length - wordCount;
  const items: OpenTuiMenuItem[] = [];
  if (wordCount > 0) {
    items.push({
      id: `library_kind_${slug}:words`,
      label: zh ? "单词练习" : "Words",
      hint: zh ? `${wordCount} 词` : `${wordCount} words`,
    });
  }
  if (phraseCount > 0) {
    items.push({
      id: `library_kind_${slug}:phrases`,
      label: zh ? "词组练习" : "Phrases",
      hint: zh ? `${phraseCount} 条` : `${phraseCount} phrases`,
    });
  }
  if (library.sentences.length > 0) {
    items.push({
      id: `library_kind_${slug}:sentences`,
      label: zh ? "句子练习" : "Sentences",
      hint: zh ? `${library.sentences.length} 句` : `${library.sentences.length} sentences`,
    });
  }
  if (library.articles.length > 0) {
    items.push({
      id: `library_kind_${slug}:articles`,
      label: zh ? "文章练习" : "Articles",
      hint: zh ? `${library.articles.length} 篇` : `${library.articles.length} articles`,
    });
  }
  if (items.length > 0) {
    items.push({
      id: `library_kind_${slug}:mix`,
      label: zh ? "混合练习" : "Mixed",
      hint: zh ? "单词 · 词组 · 句子 · 文章" : "words · phrases · sentences · articles",
    });
  } else {
    // 空库：给出指引而不是一片空白
    items.push({
      id: "library_manage",
      label: zh ? "该语料库还没有内容" : "This library is empty",
      hint: zh ? "回车进入管理，先添加单词、句子或文章" : "press Enter to add words, sentences, or articles",
    });
  }
  return items;
}

export function submenuItems(menu: OpenTuiSubmenu, language: Language): OpenTuiMenuItem[] {
  switch (menu) {
    case "custom":
      return []; // custom submenu items are state-derived; see customSubmenuItems
    case "foundation":
      return [
        item("foundation_home_row", "Home Row", "Home Row", language),
        item("foundation_top_row", "Top Row", "Top Row", language),
        item("foundation_bottom_row", "Bottom Row", "Bottom Row", language),
        item("foundation_number_row", "数字行", "Number Row", language),
        item("foundation_symbols", "符号标点", "Symbols and punctuation", language),
        item("foundation_left_hand", "左手专项", "Left hand", language),
        item("foundation_right_hand", "右手专项", "Right hand", language),
        item("foundation_index_fingers", "食指竖向", "Index columns", language),
        item("foundation_middle_fingers", "中指竖向", "Middle columns", language),
        item("foundation_ring_fingers", "无名指竖向", "Ring columns", language),
        item("foundation_pinky_fingers", "小指专项", "Pinky keys", language),
        item("foundation_horizontal_rolls", "横向连打", "Horizontal rolls", language),
        item("foundation_vertical_ladders", "竖向楼梯", "Vertical ladders", language),
        item("foundation_diagonal_crossovers", "斜向过渡", "Diagonal crossovers", language),
        item("foundation_letter_combinations", "字母组合", "Letter combinations", language),
        item("foundation_capitalization", "大小写基础", "Capitalisation", language),
        item("foundation_mix", "基础综合", "Foundation mix", language),
      ];
    case "everyday":
      return [
        item("everyday_words", "单词", "Words", language),
        item("everyday_sentences", "日常句子", "Everyday sentences", language),
        item("everyday_articles", "文章", "Articles", language),
        item("everyday_word_decomposition", "单词拆分", "Word decomposition", language),
        item("everyday_mix", "日常综合", "Everyday mix", language),
      ];
    case "programming":
      return [
        item("symbols_numbers", "代码基础", "Code input basics", language),
        item("programming_terms", "编程常用词", "Programming terms", language),
        item("naming_styles", "命名形式", "Naming styles", language),
        item("technical_long_words", "技术长词", "Technical long words", language),
        item("builtin_api", "内置 API", "Built-in APIs", language),
        item("programming_basics_mix", "编程基础综合", "Programming basics mix", language),
      ];
    case "code":
      return [
        item("code_blocks", "代码块", "Code blocks", language),
        item("code_functions", "函数块", "Functions", language),
        item("code_file_fragments", "文件片段", "File fragments", language),
        item("code_mix", "代码综合", "Code mix", language),
      ];
  }
}

export function item(
  id: OpenTuiMenuItemId,
  labelZh: string,
  labelEn: string,
  language: Language,
): OpenTuiMenuItem {
  return {
    id,
    label: language === "zh" ? labelZh : labelEn,
    hint: language === "zh" ? labelEn : labelZh,
  };
}

export function submenuTitle(menu: OpenTuiSubmenu): string {
  switch (menu) {
    case "custom":
      return "My corpus";
    case "foundation":
      return "Foundation practice";
    case "everyday":
      return "Everyday practice";
    case "programming":
      return "Programming basics";
    case "code":
      return "Code practice";
  }
}

export function submenuForStandaloneItem(itemId: OpenTuiMenuItemId): OpenTuiSubmenu | undefined {
  switch (itemId) {
    case "foundation_home_row":
    case "foundation_top_row":
    case "foundation_bottom_row":
    case "foundation_number_row":
    case "foundation_symbols":
    case "foundation_left_hand":
    case "foundation_right_hand":
    case "foundation_index_fingers":
    case "foundation_middle_fingers":
    case "foundation_ring_fingers":
    case "foundation_pinky_fingers":
    case "foundation_horizontal_rolls":
    case "foundation_vertical_ladders":
    case "foundation_diagonal_crossovers":
    case "foundation_letter_combinations":
    case "foundation_capitalization":
    case "foundation_mix":
      return "foundation";
    case "everyday_common_500":
    case "everyday_common_1000":
    case "everyday_common_5000":
    case "everyday_words":
    case "everyday_phrases":
    case "everyday_sentences":
    case "everyday_articles":
    case "everyday_word_decomposition":
    case "long_word_breakdown":
    case "everyday_mix":
      return "everyday";
    case "symbols_numbers":
    case "programming_terms":
    case "naming_styles":
    case "technical_long_words":
    case "builtin_api":
    case "programming_basics_mix":
      return "programming";
    case "code_blocks":
    case "code_functions":
    case "code_file_fragments":
    case "code_mix":
      return "code";
    default:
      return undefined;
  }
}

export const everydayLiveOptionSources = new Set([
  "everyday_words",
  "everyday_sentences",
  "everyday_articles",
  "everyday_word_decomposition",
]);

export const wordBreakdownLiveOptionSources = new Set([
  "programming_terms",
  "technical_long_words",
  "long_word_breakdown",
]);

/**
 * Whether a running screen for this source item supports the Ctrl+O live
 * options popup. Single source for both the key handling (startRunner) and
 * the on-screen shortcut hints (renderer) so they can never disagree.
 */
export function liveOptionsAvailableForSource(sourceItem: string): boolean {
  return (
    everydayLiveOptionSources.has(sourceItem) ||
    wordBreakdownLiveOptionSources.has(sourceItem) ||
    (sourceItem.startsWith("library_kind_") && sourceItem.endsWith(":words")) ||
    submenuForStandaloneItem(sourceItem as OpenTuiMenuItemId) === "code"
  );
}

/** Whether Ctrl+R (refresh target) applies to this source item. */
export function targetRefreshAvailableForSource(sourceItem: string): boolean {
  const submenu = submenuForStandaloneItem(sourceItem as OpenTuiMenuItemId);
  return submenu === "foundation" || submenu === "everyday" || submenu === "code";
}

export function menuItemTag(item: { id: string }): string {
  if (item.id === "custom") {
    return "mine";
  }
  if (item.id.startsWith("library_open_")) {
    return "lib";
  }
  if (item.id === "library_new") {
    return "new";
  }
  if (item.id === "library_manage") {
    return "edit";
  }
  if (item.id.startsWith("library_kind_")) {
    return "drill";
  }
  switch (item.id as OpenTuiMenuItemId | OpenTuiSettingsMenuItemId) {
    case "comprehensive":
      return "adaptive";
    case "foundation":
    case "foundation_home_row":
    case "foundation_top_row":
    case "foundation_bottom_row":
    case "foundation_number_row":
    case "foundation_symbols":
    case "foundation_left_hand":
    case "foundation_right_hand":
    case "foundation_index_fingers":
    case "foundation_middle_fingers":
    case "foundation_ring_fingers":
    case "foundation_pinky_fingers":
    case "foundation_horizontal_rolls":
    case "foundation_vertical_ladders":
    case "foundation_diagonal_crossovers":
    case "foundation_letter_combinations":
    case "foundation_capitalization":
    case "foundation_mix":
      return "keys";
    case "everyday":
    case "everyday_mix":
    case "everyday_words":
    case "everyday_common_500":
    case "everyday_common_1000":
    case "everyday_common_5000":
    case "everyday_phrases":
    case "everyday_sentences":
    case "everyday_articles":
    case "everyday_word_decomposition":
    case "long_word_breakdown":
      return "words";
    case "programming":
    case "programming_terms":
    case "naming_styles":
    case "technical_long_words":
      return "symbols";
    case "symbols_numbers":
    case "builtin_api":
    case "programming_basics_mix":
      return "code";
    case "code":
    case "code_blocks":
    case "code_functions":
    case "code_file_fragments":
    case "code_mix":
      return "code";
    case "settings":
      return "prefs";
    case "stats":
      return "stats";
    case "ansi_palette":
      return "debug";
    case "settings-language":
      return "lang";
    case "settings-code-filters":
      return "scope";
    case "settings-code-difficulty":
      return "level";
    case "settings-code-style":
      return "style";
    default:
      return "item";
  }
}

export function menuItemDescription(item: { id: string }): string {
  if (item.id === "custom") {
    return "自建语料库：单词、词组、句子、文章都可自建并练习。";
  }
  if (item.id.startsWith("library_open_")) {
    return "进入该语料库，按单词、词组、句子、文章分项练习。";
  }
  if (item.id === "library_new") {
    return "输入名称创建一个新的自建语料库。";
  }
  if (item.id === "library_manage") {
    return "添加、编辑、删除语料库内容。";
  }
  if (item.id.startsWith("library_kind_")) {
    return "练习该语料库中的所选内容类型。";
  }
  switch (item.id as OpenTuiMenuItemId | OpenTuiSettingsMenuItemId) {
    case "comprehensive":
      return "按今日动态计划练完所有组，弱项会影响后续内容。";
    case "foundation":
      return "Home/top/bottom row、过渡、符号边缘键。";
    case "everyday":
      return "常用词、句子、长词拆解，适合补英文自动化。";
    case "programming":
      return "代码基础、内置 API、命名形式、编程词和技术长词。";
    case "code":
      return "按语言 / 框架范围练完整代码块、函数和文件片段。";
    case "settings":
      return "界面语言、代码语言框架和代码格式化设置。";
    case "stats":
      return "热力图、慢词块、高错键、综合练习完成情况。";
    case "ansi_palette":
      return "临时调色工具，用来检查当前终端 ANSI 色槽。";
    case "foundation_mix":
      return "混合基础键位与手位回稳，补齐当前热区弱项。";
    case "foundation_home_row":
      return "练 asdf / jkl;、Home Row 短词和基础句子。";
    case "foundation_top_row":
      return "练 qwert / yuiop 与 Home Row 的上排过渡。";
    case "foundation_bottom_row":
      return "练 zxcv / bnm,. 与 Home Row 的下排过渡。";
    case "foundation_number_row":
      return "练数字行、年份、序号和常见数字组合。";
    case "foundation_symbols":
      return "练分号、逗号、斜杠、引号和括号等边缘键。";
    case "foundation_left_hand":
      return "练左手单侧移动和左手回稳。";
    case "foundation_right_hand":
      return "练右手单侧移动和右手回稳。";
    case "foundation_index_fingers":
      return "练食指负责的中间键列和跨排移动。";
    case "foundation_middle_fingers":
      return "练中指竖向键列和同指节奏。";
    case "foundation_ring_fingers":
      return "练无名指竖向键列和弱指稳定性。";
    case "foundation_pinky_fingers":
      return "练小指与键盘边缘键位。";
    case "foundation_horizontal_rolls":
      return "练从左到右、从右到左的横向连打。";
    case "foundation_vertical_ladders":
      return "练同指上中下的竖向楼梯。";
    case "foundation_diagonal_crossovers":
      return "练跨排斜向过渡和回到基准键。";
    case "foundation_letter_combinations":
      return "练 th、ing、tion 等高频英文连击。";
    case "foundation_capitalization":
      return "练 Shift、大写开头和专有名词输入。";
    case "everyday_common_500":
    case "everyday_common_1000":
    case "everyday_common_5000":
    case "everyday_words":
      return "按常见度练英文词汇，减少拼写启动时间。";
    case "everyday_phrases":
      return "练常见短语和自然词组节奏。";
    case "everyday_sentences":
      return "练完整句子，补空格、标点和大小写连贯性。";
    case "everyday_articles":
      return "练分级英文短文，同时看段落中文释义。";
    case "everyday_word_decomposition":
      return "先练人工拆分块，再练完整单词。";
    case "long_word_breakdown":
      return "拆开长词再合并输入，建立稳定拼写块。";
    case "everyday_mix":
      return "单词、短语、句子和长词拆解混合复盘。";
    case "symbols_numbers":
      return "练字面值、单行语句和小代码块里的符号、数字、标点与配对结构；API 调用在内置 API 中练。";
    case "builtin_api":
      return "练当前语言生态的高频内置 API 调用。";
    case "programming_terms":
      return "练 selected、pending、enabled 等高频编程词，显示人工维护的编程语境释义。";
    case "naming_styles":
      return "练 camelCase、snake_case、PascalCase 等命名形态。";
    case "technical_long_words":
      return "练 internationalization、serialization 等技术长词拆解。";
    case "programming_basics_mix":
      return "代码基础、内置 API、命名与编程词混合复盘。";
    case "code_blocks":
      return "练完整代码块，保留上下文和缩进节奏。";
    case "code_functions":
      return "练函数级片段，强化参数、返回值和调用结构。";
    case "code_file_fragments":
      return "练文件片段，覆盖 import、配置和局部实现。";
    case "code_mix":
      return "按当前代码筛选范围做代码综合练习。";
    case "settings-language":
      return "切换中文 / English，设置会写入本地偏好。";
    case "settings-code-filters":
      return "限定代码练习的语言、框架和项目范围。";
    case "settings-code-difficulty":
      return "选择代码练习默认抽取难度。";
    case "settings-code-style":
      return "设置格式化、缩进、分号、引号和尾逗号风格。";
    default:
      return "";
  }
}
