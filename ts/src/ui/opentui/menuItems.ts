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
  | "operators_brackets_quotes"
  | "programming_terms"
  | "naming_styles"
  | "technical_long_words"
  | "my_vocabulary"
  | "programming_basics_mix"
  | "code_blocks"
  | "code_functions"
  | "code_file_fragments"
  | "code_mix"
  | "custom_my_words"
  | `custom_tag_${string}`;

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
    case "settings":
    case "stats":
    case "running":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "complete":
    case "summary":
    case "ansi_palette":
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

export interface CustomCorpusSummary {
  totalWords: number;
  collections: { slug: string; name: string; wordCount: number }[];
}

function customSubmenuItems(state: OpenTuiAppState): OpenTuiMenuItem[] {
  const summary = state.customCorpus;
  const zh = state.language === "zh";
  const items: OpenTuiMenuItem[] = [
    {
      id: "custom_my_words",
      label: zh ? "我的单词" : "My words",
      hint: `${summary?.totalWords ?? 0}${zh ? " 词" : " words"}`,
    },
  ];
  for (const collection of summary?.collections ?? []) {
    items.push({
      id: `custom_tag_${collection.slug}`,
      label: collection.name,
      hint: `${collection.wordCount}${zh ? " 词" : " words"}`,
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
        item(
          "operators_brackets_quotes",
          "符号与括号",
          "Operators, brackets, and quotes",
          language,
        ),
        item("programming_terms", "编程常用词", "Programming terms", language),
        item("naming_styles", "命名形式", "Naming styles", language),
        item("technical_long_words", "技术长词", "Technical long words", language),
        item("my_vocabulary", "我的词库", "My vocabulary", language),
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
    case "operators_brackets_quotes":
    case "programming_terms":
    case "naming_styles":
    case "technical_long_words":
    case "my_vocabulary":
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

/**
 * Whether a running screen for this source item supports the Ctrl+O live
 * options popup. Single source for both the key handling (startRunner) and
 * the on-screen shortcut hints (renderer) so they can never disagree.
 */
export function liveOptionsAvailableForSource(sourceItem: string): boolean {
  return (
    everydayLiveOptionSources.has(sourceItem) ||
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
  if (item.id === "custom_my_words") {
    return "words";
  }
  if (item.id.startsWith("custom_tag_")) {
    return "topic";
  }
  switch (item.id as Exclude<OpenTuiMenuItemId, `custom_tag_${string}`> | OpenTuiSettingsMenuItemId) {
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
    case "programming_basics_mix":
    case "operators_brackets_quotes":
    case "programming_terms":
    case "naming_styles":
    case "technical_long_words":
    case "my_vocabulary":
      return "symbols";
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
    return "我的单词和主题词库，练你自己收集的语料。";
  }
  if (item.id === "custom_my_words") {
    return "练你添加的全部词条，按弱项优先排序。";
  }
  if (item.id.startsWith("custom_tag_")) {
    return "按主题词库练习，keyloop corpus import 可批量导入。";
  }
  switch (item.id as Exclude<OpenTuiMenuItemId, `custom_tag_${string}`> | OpenTuiSettingsMenuItemId) {
    case "comprehensive":
      return "按今日动态计划练完所有组，弱项会影响后续内容。";
    case "foundation":
      return "Home/top/bottom row、过渡、符号边缘键。";
    case "everyday":
      return "常用词、句子、长词拆解，适合补英文自动化。";
    case "programming":
      return "操作符、括号、命名、技术长词和个人词库。";
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
    case "operators_brackets_quotes":
      return "集中练括号、引号、比较、箭头和常用操作符。";
    case "programming_terms":
      return "练 selected、pending、enabled 等高频编程业务词。";
    case "naming_styles":
      return "练 camelCase、snake_case、PascalCase 等命名形态。";
    case "technical_long_words":
      return "练 internationalization、serialization 等技术长词拆解。";
    case "my_vocabulary":
      return "练你自己添加的业务词、实体名和易错词。";
    case "programming_basics_mix":
      return "编程词、符号、命名和个人词库综合练习。";
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
