import type { OpenTuiAppState } from "../appModel";
import { openTuiMenuItems } from "../appModel";
import { TEXT_BOLD, theme } from "../theme";
import { badge, listRow, vScrollbar } from "../components";
import type { OpenTuiRendererKit } from "../kit";
import type { MenuCardItem } from "./shared";

export const MENU_ITEM_STRIDE = 3;

export const MENU_ITEM_HEIGHT = 2;

export const MENU_DEFAULT_VISIBLE_ITEMS = 8;

export const MENU_MIN_VISIBLE_ITEMS = 4;

export const MENU_VERTICAL_CHROME_ROWS = 7;

export interface MenuViewport {
  items: MenuCardItem[];
  startIndex: number;
  visibleItems: number;
  viewportHeight: number;
  totalCount: number;
}

export function renderMenuScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  const items = openTuiMenuItems(state);
  const selectedIndex = selectedMenuIndex(state, items.length);
  return renderMenuPanel(items, selectedIndex, kit);
}

export function renderMenuPanel(
  items: MenuCardItem[],
  selectedIndex: number,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: "keyloop-menu-screen",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      height: "100%",
    },
    kit.Box(
      {
        id: "keyloop-menu-panel",
        flexDirection: "column",
        gap: 0,
        flexGrow: 1,
        height: "100%",
        overflow: "hidden",
      },
      renderMenuCardList(items, selectedIndex, kit),
    ),
  );
}

export function renderMenuCardList(
  items: MenuCardItem[],
  selectedIndex: number,
  kit: OpenTuiRendererKit,
): unknown {
  const viewport = menuViewport(items, selectedIndex, menuViewportHeight());
  return kit.Box(
    {
      id: "keyloop-menu-card-list",
      flexDirection: "row",
      gap: 1,
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    kit.Box(
      {
        id: "keyloop-menu-list",
        flexDirection: "column",
        gap: 1,
        flexGrow: 1,
        height: "100%",
        overflow: "hidden",
      },
      ...renderMenuItems(viewport.items, selectedIndex, kit, viewport.startIndex),
    ),
    renderMenuScrollbar(viewport, kit),
  );
}

export function renderMenuItems(
  items: MenuCardItem[],
  selectedIndex: number,
  kit: OpenTuiRendererKit,
  startIndex = 0,
): unknown[] {
  return items.map((item, index) => {
    const itemIndex = startIndex + index;
    return renderMenuItemCard(item, itemIndex, itemIndex === selectedIndex, kit);
  });
}

export function menuViewportHeight(): number {
  const terminalRows = process.stdout.rows;
  if (terminalRows === undefined || terminalRows <= 0) {
    return MENU_DEFAULT_VISIBLE_ITEMS * MENU_ITEM_STRIDE;
  }
  return Math.max(
    MENU_MIN_VISIBLE_ITEMS * MENU_ITEM_STRIDE,
    terminalRows - MENU_VERTICAL_CHROME_ROWS,
  );
}

export function menuViewport(
  items: MenuCardItem[],
  selectedIndex: number,
  viewportHeight: number,
): MenuViewport {
  const totalCount = items.length;
  const visibleItems = Math.min(
    totalCount,
    Math.max(1, Math.floor((viewportHeight + 1) / MENU_ITEM_STRIDE)),
  );
  if (visibleItems === 0) {
    return { items: [], startIndex: 0, visibleItems: 0, viewportHeight, totalCount };
  }
  const clampedSelectedIndex = Math.min(Math.max(selectedIndex, 0), totalCount - 1);
  const maxStartIndex = Math.max(totalCount - visibleItems, 0);
  const preferredStartIndex = clampedSelectedIndex - Math.floor(visibleItems / 2);
  const startIndex = Math.min(Math.max(preferredStartIndex, 0), maxStartIndex);
  return {
    items: items.slice(startIndex, startIndex + visibleItems),
    startIndex,
    visibleItems,
    viewportHeight,
    totalCount,
  };
}

export function renderMenuScrollbar(viewport: MenuViewport, kit: OpenTuiRendererKit): unknown {
  return vScrollbar(
    "keyloop-menu-scrollbar",
    {
      total: viewport.totalCount,
      visible: viewport.visibleItems,
      start: viewport.startIndex,
      viewportHeight: viewport.viewportHeight,
      minThumbHeight: MENU_ITEM_HEIGHT,
    },
    kit,
  );
}

export function renderMenuItemCard(
  item: MenuCardItem,
  index: number,
  selected: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const tag = menuItemTag(item);
  return listRow(
    `keyloop-menu-item-${item.id}`,
    selected,
    { height: MENU_ITEM_HEIGHT, gap: 1 },
    kit,
    kit.Text({
      id: `keyloop-menu-item-${item.id}-number`,
      content: ` ${index + 1} `,
      fg: selected ? theme.black : theme.muted,
      bg: selected ? theme.accent : undefined,
      attributes: TEXT_BOLD,
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
    }),
    kit.Box(
      {
        id: `keyloop-menu-item-${item.id}-copy`,
        flexDirection: "column",
        flexGrow: 1,
        height: MENU_ITEM_HEIGHT,
        overflow: "hidden",
      },
      kit.Text({
        id: `keyloop-menu-item-${item.id}-label`,
        content: item.label,
        fg: selected ? theme.accent : theme.foreground,
        attributes: TEXT_BOLD,
        height: 1,
        wrapMode: "none",
        truncate: true,
      }),
      kit.Text({
        id: `keyloop-menu-item-${item.id}-description`,
        content: menuItemDescription(item),
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
        truncate: true,
      }),
    ),
    badge(`keyloop-menu-item-${item.id}-tag`, tag, kit, {
      tone: "info",
      variant: selected ? "solid" : "soft",
    }),
  );
}

export function selectedMenuIndex(state: OpenTuiAppState, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }
  if (state.route.screen !== "main_menu" && state.route.screen !== "submenu") {
    return 0;
  }
  return Math.min(
    Math.max(Math.trunc(state.route.selected_index ?? 0), 0),
    Math.max(itemCount - 1, 0),
  );
}

export function menuItemTag(item: MenuCardItem): string {
  switch (item.id) {
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
  }
}

export function menuItemDescription(item: MenuCardItem): string {
  switch (item.id) {
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
  }
}
