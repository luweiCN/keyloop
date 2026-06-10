import type { OpenTuiAppState } from "../appModel";
import { openTuiMenuItems } from "../appModel";
import { TEXT_BOLD, theme } from "../theme";
import { badge, listRow, vScrollbar, type KeyHint } from "../components";
import type { OpenTuiRendererKit } from "../kit";
import type { MenuCardItem } from "./shared";
import { menuItemDescription, menuItemTag } from "../menuItems";

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
  if (
    state.route.screen !== "main_menu" &&
    state.route.screen !== "submenu" &&
    state.route.screen !== "library_menu"
  ) {
    return 0;
  }
  return Math.min(
    Math.max(Math.trunc(state.route.selected_index ?? 0), 0),
    Math.max(itemCount - 1, 0),
  );
}

/** Shortcut hints for the main menu and submenus; lives next to the screen it describes. */
export function menuHints(screen: "main_menu" | "submenu", zh: boolean): KeyHint[] {
  return [
    { key: "↑↓", label: zh ? "选择" : "select" },
    { key: "1-9", label: zh ? "直达" : "jump" },
    screen === "main_menu"
      ? { key: "Enter", label: zh ? "进入" : "open" }
      : { key: "Enter", label: zh ? "开始" : "start" },
    screen === "main_menu"
      ? { key: "Q", label: zh ? "退出" : "quit" }
      : { key: "Esc", label: zh ? "返回" : "back" },
  ];
}
