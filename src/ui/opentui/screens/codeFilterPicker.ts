import type { OpenTuiAppState } from "../appModel";
import { openTuiCodeFilterPickerItems, openTuiRouteTitle } from "../appModel";
import { TEXT_BOLD, theme } from "../theme";
import { emptyState, listRow, vScrollbar } from "../components";
import { codeFilterFacetLabel } from "../labels";
import type { OpenTuiRendererKit } from "../kit";

export const CODE_FILTER_PICKER_DEFAULT_LIST_HEIGHT = 12;

export const CODE_FILTER_PICKER_MIN_LIST_HEIGHT = 6;

export const CODE_FILTER_PICKER_VERTICAL_CHROME_ROWS = 11;

export const CODE_FILTER_PICKER_ROW_HEIGHT = 2;

export function renderCodeFilterPickerScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const filters = state.codeFilters;
  const items = openTuiCodeFilterPickerItems(state);
  const pickerViewportHeight = codeFilterPickerViewportHeight();
  const pickerWindow = codeFilterPickerWindow(items, pickerViewportHeight);
  const query = filters?.query ?? "";
  const selectedCount = filters?.selected.length ?? 0;
  const selectedLabel =
    state.language === "zh" ? `已选 ${selectedCount}` : `${selectedCount} selected`;
  return kit.Box(
    {
      id: "keyloop-code-filter-picker",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    kit.Box(
      {
        id: "keyloop-code-filter-picker-search-panel",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.info,
        paddingX: 1,
        height: 3,
        width: "100%",
        flexShrink: 0,
        bottomTitle: ` ${selectedLabel} `,
        bottomTitleAlignment: "right",
        overflow: "hidden",
      },
      kit.Box(
        {
          id: "keyloop-code-filter-picker-input",
          height: 1,
          width: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: 1,
          overflow: "hidden",
        },
        kit.Text({
          id: "keyloop-code-filter-picker-query-label",
          content: "⌕",
          fg: theme.info,
          attributes: TEXT_BOLD,
          height: 1,
          wrapMode: "none",
        }),
        kit.Text({
          id: "keyloop-code-filter-picker-input-value",
          content:
            query === ""
              ? state.language === "zh"
                ? "输入语言、框架或项目关键词"
                : "type a language, framework, or project"
              : `${query}▏`,
          fg: query === "" ? theme.muted : theme.foreground,
          attributes: query === "" ? undefined : TEXT_BOLD,
          height: 1,
          wrapMode: "none",
          truncate: true,
          flexGrow: 1,
        }),
      ),
    ),
    kit.Box(
      {
        id: "keyloop-code-filter-picker-body",
        flexDirection: "row",
        gap: 1,
        width: "100%",
        flexGrow: 1,
        overflow: "hidden",
      },
      kit.Box(
        {
          id: "keyloop-code-filter-picker-results",
          flexDirection: "row",
          gap: 1,
          width: "100%",
          height: "100%",
          overflow: "hidden",
        },
        kit.Box(
          {
            id: "keyloop-code-filter-picker-list",
            flexDirection: "column",
            gap: 0,
            height: "100%",
            flexGrow: 1,
            overflow: "hidden",
          },
          ...(pickerWindow.items.length === 0
            ? [
                emptyState(
                  "keyloop-code-filter-picker-empty",
                  "⌕",
                  filters === undefined || filters.options.length === 0
                    ? state.language === "zh"
                      ? "没有可用代码范围"
                      : "No code filters available"
                    : state.language === "zh"
                      ? "没有匹配项"
                      : "No matches",
                  state.language === "zh" ? "换个关键词试试" : "Try another keyword",
                  kit,
                ),
              ]
            : pickerWindow.items.map((item) =>
                renderCodeFilterPickerRow(item, state.language, kit),
              )),
        ),
        renderCodeFilterPickerScrollbar(pickerWindow, kit),
      ),
    ),
  );
}

export interface CodeFilterPickerWindow {
  items: ReturnType<typeof openTuiCodeFilterPickerItems>;
  start: number;
  total: number;
  visibleItems: number;
  viewportHeight: number;
}

export function codeFilterPickerViewportHeight(): number {
  const terminalRows = process.stdout.rows;
  if (terminalRows === undefined || terminalRows <= 0) {
    return CODE_FILTER_PICKER_DEFAULT_LIST_HEIGHT;
  }
  return Math.max(
    CODE_FILTER_PICKER_MIN_LIST_HEIGHT,
    terminalRows - CODE_FILTER_PICKER_VERTICAL_CHROME_ROWS,
  );
}

export function codeFilterPickerWindow(
  items: ReturnType<typeof openTuiCodeFilterPickerItems>,
  viewportHeight: number,
): CodeFilterPickerWindow {
  const visibleItems = Math.max(1, Math.floor(viewportHeight / CODE_FILTER_PICKER_ROW_HEIGHT));
  if (items.length <= visibleItems) {
    return { items, start: 0, total: items.length, visibleItems, viewportHeight };
  }
  const activeIndex = Math.max(
    items.findIndex((item) => item.active),
    0,
  );
  const start = Math.min(
    Math.max(activeIndex - Math.floor(visibleItems / 2), 0),
    Math.max(items.length - visibleItems, 0),
  );
  return {
    items: items.slice(start, start + visibleItems),
    start,
    total: items.length,
    visibleItems,
    viewportHeight,
  };
}

export function renderCodeFilterPickerScrollbar(
  pickerWindow: CodeFilterPickerWindow,
  kit: OpenTuiRendererKit,
): unknown {
  return vScrollbar(
    "keyloop-code-filter-picker-scrollbar",
    {
      total: pickerWindow.total,
      visible: pickerWindow.visibleItems,
      start: pickerWindow.start,
      viewportHeight: pickerWindow.viewportHeight,
    },
    kit,
  );
}

export function renderCodeFilterPickerRow(
  item: ReturnType<typeof openTuiCodeFilterPickerItems>[number],
  language: "zh" | "en",
  kit: OpenTuiRendererKit,
): unknown {
  const facetLabel = codeFilterFacetLabel(item.option.facet, language);
  const checkFg = item.selected ? theme.accent : item.active ? theme.foreground : theme.muted;
  return listRow(
    `keyloop-code-filter-picker-row-${item.optionIndex}`,
    item.active,
    { height: 2, gap: 1 },
    kit,
    kit.Text({
      id: `keyloop-code-filter-picker-row-${item.optionIndex}-check`,
      content: item.selected ? "◉" : "○",
      fg: checkFg,
      attributes: item.selected ? TEXT_BOLD : undefined,
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
    }),
    kit.Box(
      {
        id: `keyloop-code-filter-picker-row-${item.optionIndex}-copy`,
        flexDirection: "column",
        flexGrow: 1,
        height: 2,
        overflow: "hidden",
      },
      kit.Box(
        {
          id: `keyloop-code-filter-picker-row-${item.optionIndex}-title`,
          flexDirection: "row",
          gap: 1,
          width: "100%",
          height: 1,
          overflow: "hidden",
        },
        kit.Text({
          id: `keyloop-code-filter-picker-row-${item.optionIndex}-label`,
          content: `${facetLabel}: ${item.option.value}`,
          fg: item.active ? theme.accent : theme.foreground,
          attributes: item.active || item.selected ? TEXT_BOLD : undefined,
          height: 1,
          wrapMode: "none",
          truncate: true,
        }),
        ...(item.pinned
          ? [
              kit.Text({
                id: `keyloop-code-filter-picker-row-${item.optionIndex}-pin`,
                content: "★",
                fg: theme.warning,
                height: 1,
                flexShrink: 0,
                wrapMode: "none",
              }),
            ]
          : []),
      ),
      kit.Text({
        id: `keyloop-code-filter-picker-row-${item.optionIndex}-detail`,
        content:
          language === "zh"
            ? `${facetLabel} · ${item.option.count} 个片段${item.pinned ? " · 已固定" : ""}`
            : `${facetLabel} · ${item.option.count} matches${item.pinned ? " · pinned" : ""}`,
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
        truncate: true,
      }),
    ),
  );
}
