import type { OpenTuiAppState, OpenTuiMenuItem, OpenTuiSettingsMenuItem } from "./appModel";
import {
  openTuiCodeFilterPickerItems,
  openTuiFlatSettingsItems,
  openTuiMenuItems,
  openTuiRouteLines,
  openTuiRouteTitle,
  selectedFlatSettingsIndex,
} from "./appModel";
import type {
  EverydayEnglishSettings,
  KeyEventRecord,
  Mode,
  PracticeTargetAnnotation,
  PracticeTargetCodeBlock,
  SpeedUnit,
} from "../../domain/model";
import { speedFromWpm, speedUnitLabel } from "../../report/stats";
import { heatLevelFromRatio, heatScaleColor } from "../heatScale";
import { highlightCodeSyntax } from "./syntaxHighlight";
import {
  TEXT_BOLD,
  ansiTheme,
  isAnsiColorName,
  isAnsiThemeColor,
  isDefaultBackgroundColor,
  isDefaultForegroundColor,
  theme,
  toneColor,
  type AnsiColorName,
  type OpenTuiColorInput,
  type Tone,
} from "./theme";
import {
  badge,
  divider,
  emptyState,
  keyHintBar,
  listRow,
  meterBar,
  modal,
  panel,
  sectionLabel,
  statCell,
  tabStrip,
  vScrollbar,
  type KeyHint,
} from "./components";

type OpenTuiCoreModule = typeof import("@opentui/core");
type OpenTuiBoxProps = Record<string, unknown>;
type OpenTuiTextProps = Record<string, unknown> & {
  content: string;
  fg?: OpenTuiColorInput | undefined;
  bg?: OpenTuiColorInput | undefined;
};

const colorPropNames = new Set([
  "fg",
  "bg",
  "borderColor",
  "focusedBorderColor",
  "backgroundColor",
  "foregroundColor",
  "textColor",
  "cursorColor",
  "selectionBg",
  "selectionFg",
  "tabIndicatorColor",
]);

export interface OpenTuiRendererKit {
  createCliRenderer(options: { exitOnCtrlC: boolean }): Promise<OpenTuiRenderer>;
  Box(props: OpenTuiBoxProps, ...children: unknown[]): unknown;
  ScrollBox?: ((props: OpenTuiBoxProps, ...children: unknown[]) => unknown) | undefined;
  Text(props: OpenTuiTextProps): unknown;
}

export interface OpenTuiRenderer {
  root: {
    add(...nodes: unknown[]): void;
    remove?(id: string): void;
  };
  keyInput?: OpenTuiKeyInput;
  requestRender?: () => void;
  renderState?: (state: OpenTuiAppState) => Promise<void>;
  idle?: () => Promise<void>;
  destroy?: () => void;
}

export interface OpenTuiKeyInput {
  on(event: "keypress", handler: (event: OpenTuiKeyEvent) => void): void;
  off(event: "keypress", handler: (event: OpenTuiKeyEvent) => void): void;
}

export interface OpenTuiKeyEvent {
  name: string;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
}

export async function loadOpenTuiKit(): Promise<OpenTuiRendererKit> {
  const core = await import("@opentui/core");
  const Box = core.Box as (props: OpenTuiBoxProps, ...children: unknown[]) => unknown;
  const ScrollBox = core.ScrollBox as (props: OpenTuiBoxProps, ...children: unknown[]) => unknown;
  const Text = core.Text as (props: OpenTuiTextProps) => unknown;
  return {
    createCliRenderer: core.createCliRenderer,
    Box: (props, ...children) => Box(definedProps(resolveColorProps(props, core)), ...children),
    ScrollBox: (props, ...children) =>
      ScrollBox(definedProps(resolveColorProps(props, core)), ...children),
    Text: (props) => Text(definedProps(resolveColorProps(props, core)) as OpenTuiTextProps),
  };
}

function definedProps(props: OpenTuiBoxProps): OpenTuiBoxProps {
  return Object.fromEntries(
    Object.entries(props).filter((entry): entry is [string, unknown] => entry[1] !== undefined),
  );
}

function resolveColorProps(props: OpenTuiBoxProps, core: OpenTuiCoreModule): OpenTuiBoxProps {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      colorPropNames.has(key) ? resolveColorValue(value, core) : value,
    ]),
  );
}

function resolveColorValue(value: unknown, core: OpenTuiCoreModule): unknown {
  if (isAnsiThemeColor(value)) {
    return core.RGBA.fromIndex(value.slot);
  }
  if (isDefaultForegroundColor(value)) {
    return core.RGBA.defaultForeground();
  }
  if (isDefaultBackgroundColor(value)) {
    return core.RGBA.defaultBackground();
  }
  return value;
}

export async function renderOpenTuiAppOnce(
  state: OpenTuiAppState,
  kit?: OpenTuiRendererKit,
): Promise<OpenTuiRenderer> {
  const resolvedKit = kit ?? (await loadOpenTuiKit());
  const renderer = await resolvedKit.createCliRenderer({ exitOnCtrlC: true });
  renderer.root.add(await renderRoute(state, resolvedKit));
  let destroyed = false;
  const originalDestroy = renderer.destroy;
  renderer.destroy = (): void => {
    destroyed = true;
    originalDestroy?.call(renderer);
  };
  let renderQueue: Promise<void> = Promise.resolve();
  renderer.renderState = async (nextState: OpenTuiAppState): Promise<void> => {
    renderQueue = renderQueue.then(async () => {
      if (destroyed) {
        return;
      }
      const nextRoute = await renderRoute(nextState, resolvedKit);
      if (destroyed) {
        return;
      }
      renderer.root.remove?.(OPEN_TUI_ROOT_ID);
      renderer.root.add(nextRoute);
      await renderer.idle?.();
      renderer.requestRender?.();
    });
    await renderQueue;
  };
  await renderer.idle?.();
  return renderer;
}

const OPEN_TUI_ROOT_ID = "keyloop-open-tui-root";

const MIN_GHOST_TEXT_WRAP_COLUMNS = 24;
const GHOST_TEXT_FRAME_RESERVED_COLUMNS = 8;
const GHOST_TEXT_LINE_NUMBER_COLUMNS = 4;
const APP_FRAME_WIDTH = 96;
const CODE_FILTER_PICKER_DEFAULT_LIST_HEIGHT = 12;
const CODE_FILTER_PICKER_MIN_LIST_HEIGHT = 6;
const CODE_FILTER_PICKER_VERTICAL_CHROME_ROWS = 11;
const CODE_FILTER_PICKER_ROW_HEIGHT = 2;
const MENU_ITEM_STRIDE = 3;
const MENU_ITEM_HEIGHT = 2;
const MENU_DEFAULT_VISIBLE_ITEMS = 8;
const MENU_MIN_VISIBLE_ITEMS = 4;
const MENU_VERTICAL_CHROME_ROWS = 7;
const DIAGNOSTIC_LABEL_WIDTH = 8;
const DIAGNOSTIC_KEY_CELL_WIDTH = 3;

type SyntaxKind =
  | "plain"
  | "keyword"
  | "function"
  | "type"
  | "property"
  | "string"
  | "operator";

interface GhostSegment {
  text: string;
  state: "typed" | "wrong" | "pending" | "cursor";
  syntax: SyntaxKind;
  syntaxFg?: string | null | undefined;
}

interface GhostVisualRow {
  sourceLineIndex: number;
  continuation: boolean;
  segments: GhostSegment[];
}

interface GhostWordColumn {
  srcStartCol: number;
  srcEndCol: number;
  translation: string;
}

interface GhostWordBlockRow {
  segments: GhostSegment[];
  meaning: string;
}

interface TargetLineRange {
  start: number;
  end: number;
}

type GhostCell = Omit<GhostSegment, "text"> & { text: string };
type MenuCardItem = OpenTuiMenuItem | OpenTuiSettingsMenuItem;

type RunningRoute = Extract<OpenTuiAppState["route"], { screen: "running" }>;
type CompleteRoute = Extract<OpenTuiAppState["route"], { screen: "complete" }>;
type PracticeOptionsRoute = Extract<OpenTuiAppState["route"], { screen: "practice_options" }>;
type LiveMetrics = NonNullable<RunningRoute["live"]>["metrics"];
type HighlightRows = Awaited<ReturnType<typeof highlightCodeSyntax>>;

interface MenuViewport {
  items: MenuCardItem[];
  startIndex: number;
  visibleItems: number;
  viewportHeight: number;
  totalCount: number;
}

async function renderRoute(state: OpenTuiAppState, kit: OpenTuiRendererKit): Promise<unknown> {
  switch (state.route.screen) {
    case "main_menu":
    case "submenu":
      return renderAppFrame(state, renderMenuScreen(state, kit), kit);
    case "running":
      return renderAppFrame(state, await renderRunningScreen(state, kit), kit);
    case "exit_confirmation":
      return renderAppFrame(state, await renderExitConfirmationScreen(state, kit), kit);
    case "code_settings_confirmation":
      return renderAppFrame(state, await renderCodeSettingsConfirmationScreen(state, kit), kit);
    case "practice_options":
      return renderAppFrame(state, await renderPracticeOptionsScreen(state, kit), kit);
    case "complete":
      return renderAppFrame(state, await renderCompleteScreen(state, kit), kit);
    case "ansi_palette":
      return renderAppFrame(state, renderAnsiPaletteScreen(state, kit), kit);
    case "settings":
      return renderAppFrame(
        state,
        state.route.view === "menu"
          ? renderSettingsMenuScreen(state, kit)
          : state.route.view === "code_filters"
            ? renderCodeFilterPickerScreen(state, kit)
          : renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit),
        kit,
      );
    case "stats":
      return renderAppFrame(state, renderStatsScreen(state, kit), kit);
    case "summary":
      return renderAppFrame(
        state,
        renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit),
        kit,
      );
  }
}

const statsViews = [
  "overview",
  "today",
  "comprehensive",
  "modules",
  "keys",
  "tokens",
  "code",
  "daily",
] as const;

function statsViewLabel(view: (typeof statsViews)[number], zh: boolean): string {
  switch (view) {
    case "overview":
      return zh ? "总览" : "Overview";
    case "today":
      return zh ? "今日" : "Today";
    case "comprehensive":
      return zh ? "综合" : "Daily plan";
    case "modules":
      return zh ? "模块" : "Modules";
    case "keys":
      return zh ? "键位" : "Keys";
    case "tokens":
      return zh ? "词块" : "Tokens";
    case "code":
      return zh ? "代码" : "Code";
    case "daily":
      return zh ? "按日" : "By day";
  }
}

function renderStatsScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  if (state.route.screen !== "stats") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const zh = state.language === "zh";
  const activeView = state.route.view;
  const lines = openTuiRouteLines(state);
  const hasData =
    state.route.records.length > 0 ||
    (activeView === "keys" && (state.route.keyAggregates?.length ?? 0) > 0);
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
      statsViews.map((view) => ({
        id: view,
        label: statsViewLabel(view, zh),
        active: view === activeView,
      })),
      kit,
    ),
    !hasData
      ? emptyState(
          "keyloop-stats-empty",
          "◌",
          zh ? "还没有练习记录" : "No sessions yet",
          zh ? "完成一次练习后这里会显示统计数据" : "Finish a session to see stats here",
          kit,
        )
      : renderPanel(
          "keyloop-route-panel",
          statsViewLabel(activeView, zh),
          lines,
          kit,
          { flexGrow: 1 },
        ),
  );
}

function renderAppFrame(
  state: OpenTuiAppState,
  content: unknown,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: OPEN_TUI_ROOT_ID,
      backgroundColor: theme.background,
      paddingX: 1,
      flexDirection: "column",
      gap: 0,
      width: APP_FRAME_WIDTH,
      marginLeft: "auto",
      marginRight: "auto",
      height: "100%",
    },
    renderTopbar(state, kit),
    divider("keyloop-topbar-rule", kit),
    kit.Box(
      {
        id: "keyloop-app-content",
        flexDirection: "column",
        gap: 1,
        flexGrow: 1,
        width: "100%",
        overflow: "hidden",
      },
      content,
    ),
    divider("keyloop-hintbar-rule", kit),
    keyHintBar("keyloop-hintbar", routeHints(state), kit),
  );
}

function renderTopbar(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  return kit.Box(
    {
      id: "keyloop-topbar",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
      height: 1,
    },
    kit.Box(
      { id: "keyloop-route", flexDirection: "row", gap: 1 },
      kit.Text({
        content: "▌KeyLoop",
        fg: theme.accent,
        attributes: TEXT_BOLD,
        id: "keyloop-brand",
        height: 1,
        wrapMode: "none",
      }),
      kit.Text({
        content: `› ${routeCrumb(state)}`,
        fg: theme.muted,
        id: "keyloop-route-crumb",
        height: 1,
        wrapMode: "none",
        truncate: true,
      }),
    ),
    kit.Box(
      {
        id: "keyloop-topbar-today-duration",
        flexDirection: "row",
        gap: 1,
        alignItems: "center",
        height: 1,
        flexShrink: 0,
      },
      kit.Text({
        id: "keyloop-topbar-today-duration-label",
        content: state.language === "zh" ? "今日" : "Today",
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
      }),
      kit.Text({
        id: "keyloop-topbar-today-duration-value",
        content: todayDurationValue(state),
        fg: theme.brightCyan,
        height: 1,
        wrapMode: "none",
      }),
    ),
  );
}

function routeHints(state: OpenTuiAppState): KeyHint[] {
  const zh = state.language === "zh";
  switch (state.route.screen) {
    case "main_menu":
      return [
        { key: "↑↓", label: zh ? "选择" : "select" },
        { key: "1-9", label: zh ? "直达" : "jump" },
        { key: "Enter", label: zh ? "进入" : "open" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
    case "submenu":
      return [
        { key: "↑↓", label: zh ? "选择" : "select" },
        { key: "1-9", label: zh ? "直达" : "jump" },
        { key: "Enter", label: zh ? "开始" : "start" },
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
    case "settings":
      if (state.route.view === "code_filters") {
        return [
          { key: "↑↓", label: zh ? "选择" : "select" },
          { key: "Enter/→", label: zh ? "选中" : "toggle" },
          { key: "←", label: zh ? "清除" : "clear" },
          { key: "Ctrl+P", label: zh ? "固定常用" : "pin" },
          { key: "Esc", label: zh ? "返回" : "back" },
        ];
      }
      if (state.route.view === "menu") {
        return [
          { key: "↑↓", label: zh ? "选择" : "select" },
          { key: "←→", label: zh ? "调整" : "adjust" },
          { key: "Enter", label: zh ? "打开" : "open" },
          { key: "Esc", label: zh ? "返回" : "back" },
        ];
      }
      return [{ key: "Esc", label: zh ? "返回" : "back" }];
    case "stats":
      return [
        { key: "Tab", label: zh ? "切换视图" : "next view" },
        ...(state.route.view === "keys"
          ? [{ key: "S", label: zh ? "排序" : "sort" }]
          : []),
        ...(state.route.view === "daily"
          ? [{ key: "←→", label: zh ? "切换日期" : "change day" }]
          : []),
        { key: "Esc", label: zh ? "返回" : "back" },
      ];
    case "running":
      return runningHints(state.route, zh);
    case "exit_confirmation":
      return [
        { key: "Enter", label: zh ? "确认退出" : "confirm exit" },
        { key: "Esc", label: zh ? "返回练习" : "keep typing" },
      ];
    case "code_settings_confirmation":
      return [
        { key: "Enter", label: zh ? "刷新本组" : "refresh group" },
        { key: "Esc", label: zh ? "取消" : "cancel" },
      ];
    case "practice_options":
      return [
        { key: "↑↓", label: zh ? "选择" : "select" },
        { key: "←→", label: zh ? "调整" : "adjust" },
        { key: "Enter", label: zh ? "继续" : "resume" },
        { key: "Esc", label: zh ? "关闭" : "close" },
      ];
    case "complete":
      return [
        { key: "Enter", label: zh
          ? state.route.result_visible
            ? "关闭结果"
            : "继续"
          : state.route.result_visible
            ? "close result"
            : "continue" },
        { key: "R", label: zh ? "重练" : "repeat" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
    case "summary":
    case "ansi_palette":
      return [
        { key: "Esc", label: zh ? "返回" : "back" },
        { key: "Q", label: zh ? "退出" : "quit" },
      ];
  }
}

function runningHints(route: RunningRoute, zh: boolean): KeyHint[] {
  const paused = route.live?.paused === true;
  const hints: KeyHint[] = [
    { key: "Ctrl+P", label: zh ? (paused ? "继续" : "暂停") : paused ? "resume" : "pause" },
    { key: "Ctrl+N", label: zh ? "重打" : "retry" },
  ];
  const mode = route.target.mode;
  const source = route.source_item;
  if (mode === "code" || source.startsWith("everyday_")) {
    hints.push({ key: "Ctrl+O", label: zh ? "选项" : "options" });
  }
  if (mode === "code" || source.startsWith("foundation") || source.startsWith("everyday_")) {
    hints.push({ key: "Ctrl+R", label: zh ? "重开" : "refresh" });
  }
  hints.push({ key: "Esc", label: zh ? "退出" : "exit" });
  return hints;
}

function todayDurationValue(state: OpenTuiAppState): string {
  const liveElapsedMs =
    state.route.screen === "running" || state.route.screen === "exit_confirmation"
      ? state.route.live?.elapsed_ms ?? 0
      : state.route.screen === "complete"
        ? state.route.live?.elapsed_ms ?? state.route.record.duration_ms
        : 0;
  return formatElapsedTime((state.today_elapsed_ms ?? 0) + liveElapsedMs);
}

function renderMenuScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  const items = openTuiMenuItems(state);
  const selectedIndex = selectedMenuIndex(state, items.length);
  return renderMenuPanel(items, selectedIndex, kit);
}

function renderSettingsMenuScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  const items = openTuiFlatSettingsItems(state);
  const selectedIndex = selectedFlatSettingsIndex(state, items.length);
  return renderSettingsPanel(items, selectedIndex, kit);
}

function renderMenuPanel(
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

function renderSettingsPanel(
  items: ReturnType<typeof openTuiFlatSettingsItems>,
  selectedIndex: number,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: "keyloop-settings-screen",
      flexDirection: "column",
      gap: 1,
    },
    kit.Box(
      {
        id: "keyloop-settings-list",
        flexDirection: "column",
        gap: 0,
        width: "100%",
        flexGrow: 1,
        overflow: "hidden",
      },
      ...renderSettingsRows(items, selectedIndex, kit),
    ),
  );
}

function renderSettingsRows(
  items: ReturnType<typeof openTuiFlatSettingsItems>,
  selectedIndex: number,
  kit: OpenTuiRendererKit,
): unknown[] {
  return items.flatMap((item, index) => [
    ...settingsSectionBeforeItem(item, index, kit),
    renderSettingsRow(item, index, index === selectedIndex, kit),
  ]);
}

function settingsSectionBeforeItem(
  item: ReturnType<typeof openTuiFlatSettingsItems>[number],
  index: number,
  kit: OpenTuiRendererKit,
): unknown[] {
  if (index === 0) {
    return [sectionLabel("keyloop-settings-section-global", "Global", kit)];
  }
  if (item.kind === "code_filters") {
    return [
      kit.Box({ id: "keyloop-settings-section-code-spacer", width: "100%", height: 1 }),
      sectionLabel("keyloop-settings-section-code", "Code settings", kit),
    ];
  }
  return [];
}

function renderSettingsRow(
  item: ReturnType<typeof openTuiFlatSettingsItems>[number],
  index: number,
  selected: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  return listRow(
    `keyloop-settings-row-${index}`,
    selected,
    { height: 1, gap: 1 },
    kit,
    kit.Text({
      id: `keyloop-settings-row-${index}-marker`,
      content: String(index + 1).padStart(2, "0"),
      fg: selected ? theme.accent : theme.muted,
      attributes: selected ? TEXT_BOLD : undefined,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: `keyloop-settings-row-${index}-label`,
      content: item.label,
      fg: selected ? theme.accent : theme.foreground,
      attributes: selected ? TEXT_BOLD : undefined,
      height: 1,
      wrapMode: "none",
      truncate: true,
      flexGrow: 1,
    }),
    kit.Text({
      id: `keyloop-settings-row-${index}-value`,
      content: item.value,
      fg: selected ? theme.warning : theme.muted,
      attributes: selected ? TEXT_BOLD : undefined,
      height: 1,
      wrapMode: "none",
      truncate: true,
    }),
  );
}

function renderCodeFilterPickerScreen(
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

interface CodeFilterPickerWindow {
  items: ReturnType<typeof openTuiCodeFilterPickerItems>;
  start: number;
  total: number;
  visibleItems: number;
  viewportHeight: number;
}

function codeFilterPickerViewportHeight(): number {
  const terminalRows = process.stdout.rows;
  if (terminalRows === undefined || terminalRows <= 0) {
    return CODE_FILTER_PICKER_DEFAULT_LIST_HEIGHT;
  }
  return Math.max(
    CODE_FILTER_PICKER_MIN_LIST_HEIGHT,
    terminalRows - CODE_FILTER_PICKER_VERTICAL_CHROME_ROWS,
  );
}

function codeFilterPickerWindow(
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

function renderCodeFilterPickerScrollbar(
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

function renderCodeFilterPickerRow(
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

function codeFilterFacetLabel(facet: "language" | "framework" | "project", language: "zh" | "en"): string {
  switch (facet) {
    case "language":
      return language === "zh" ? "语言" : "language";
    case "framework":
      return language === "zh" ? "框架" : "framework";
    case "project":
      return language === "zh" ? "项目" : "project";
  }
}

function renderMenuCardList(
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

function renderMenuItems(
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

function menuViewportHeight(): number {
  const terminalRows = process.stdout.rows;
  if (terminalRows === undefined || terminalRows <= 0) {
    return MENU_DEFAULT_VISIBLE_ITEMS * MENU_ITEM_STRIDE;
  }
  return Math.max(
    MENU_MIN_VISIBLE_ITEMS * MENU_ITEM_STRIDE,
    terminalRows - MENU_VERTICAL_CHROME_ROWS,
  );
}

function menuViewport(
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

function renderMenuScrollbar(viewport: MenuViewport, kit: OpenTuiRendererKit): unknown {
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

function renderMenuItemCard(
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

const ansiPaletteColors = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const satisfies readonly AnsiColorName[];

const keyloopSemanticColors = [
  ["foreground", theme.foreground],
  ["white", theme.white],
  ["keyword", theme.magenta],
  ["function", theme.blue],
  ["property", theme.blue],
  ["type", theme.cyan],
  ["operator", theme.cyan],
  ["string", theme.yellow],
  ["comment", theme.accent],
  ["typed", theme.accent],
  ["pending", theme.muted],
  ["cursor.bg", theme.cursor],
  ["wrong.bg", theme.red],
] as const;

function renderAnsiPaletteScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  const ScrollBox = kit.ScrollBox ?? kit.Box;
  return kit.Box(
    {
      id: "keyloop-ansi-palette",
      border: true,
      borderStyle: "rounded",
      borderColor: theme.border,
      title: ` ${openTuiRouteTitle(state)} `,
      paddingX: 1,
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
    },
    kit.Text({
      content:
        state.language === "zh"
          ? "临时颜色选择辅助，选完后会移除。"
          : "Temporary color selection aid. Remove after choosing the palette.",
      fg: theme.muted,
      id: "keyloop-palette-note",
    }),
    kit.Text({
      content:
        state.language === "zh"
          ? "滚动查看全部 ANSI 槽位"
          : "Scroll to inspect every ANSI slot",
      fg: theme.muted,
      id: "keyloop-palette-scroll-hint",
    }),
    ScrollBox(
      {
        id: "keyloop-palette-scrollbox",
        flexDirection: "column",
        gap: 1,
        width: "100%",
        flexGrow: 1,
        scrollY: true,
        scrollX: false,
        overflow: "hidden",
        viewportCulling: false,
      },
      kit.Text({
        content: "Terminal ANSI slots",
        fg: theme.accent,
        id: "keyloop-palette-ansi-title",
      }),
      ...ansiPaletteColors.map((color) => renderAnsiPaletteColorRow(color, kit)),
      kit.Text({
        content: "KeyLoop semantics",
        fg: theme.accent,
        id: "keyloop-palette-semantics-title",
      }),
      ...keyloopSemanticColors.map(([name, color]) => renderSemanticColorRow(name, color, kit)),
    ),
  );
}

function renderAnsiPaletteColorRow(color: AnsiColorName, kit: OpenTuiRendererKit): unknown {
  const token = ansiTheme[color];
  return kit.Box(
    {
      id: `keyloop-palette-row-${color}`,
      flexDirection: "row",
      gap: 1,
      height: 1,
      width: "100%",
    },
    kit.Text({
      content: "  ",
      bg: token,
      id: `keyloop-palette-swatch-${color}`,
    }),
    kit.Text({
      content: `${String(token.slot).padStart(2, "0")} ${color}`.padEnd(18, " "),
      fg: token,
      id: `keyloop-palette-token-${color}`,
    }),
    kit.Text({
      content: "The quick brown fox 0123456789 {} =>",
      fg: token,
      id: `keyloop-palette-sample-${color}`,
      truncate: true,
    }),
  );
}

function renderSemanticColorRow(
  name: string,
  color: OpenTuiColorInput,
  kit: OpenTuiRendererKit,
): unknown {
  const label = colorLabel(color);
  return kit.Box(
    {
      id: `keyloop-palette-semantic-row-${name}`,
      flexDirection: "row",
      gap: 1,
      height: 1,
      width: "100%",
    },
    kit.Text({
      content: "  ",
      bg: color,
      id: `keyloop-palette-semantic-swatch-${name}`,
    }),
    kit.Text({
      content: `${name} -> ${label}`.padEnd(24, " "),
      fg: color,
      id: `keyloop-palette-semantic-${name}`,
    }),
    kit.Text({
      content: "KeyLoop color role preview",
      fg: color,
      id: `keyloop-palette-semantic-sample-${name}`,
      truncate: true,
    }),
  );
}

function colorLabel(color: OpenTuiColorInput): string {
  if (isAnsiThemeColor(color)) {
    return color.name;
  }
  if (isDefaultBackgroundColor(color)) {
    return "defaultBackground";
  }
  if (isDefaultForegroundColor(color)) {
    return "defaultForeground";
  }
  return color;
}

async function renderRunningScreen(
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

function renderPracticeOverview(
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
      ? codeStatusContent(route.target, input, state.language)
      : everydayStatusContent(route.source_item, state.everydaySettings, state.language);
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
            kit.Text({
              id: "keyloop-practice-code-status",
              content: contentStatus,
              fg: theme.info,
              height: 1,
              truncate: true,
            }),
          ]),
    ),
    renderPracticeTimeStack(state, kit),
  );
}

function everydayStatusContent(
  sourceItem: string,
  settings: OpenTuiAppState["everydaySettings"],
  language: OpenTuiAppState["language"],
): string | undefined {
  if (settings === undefined) {
    return undefined;
  }
  const zh = language === "zh";
  switch (sourceItem) {
    case "everyday_words":
      return zh
        ? `词库 ${everydayWordRangeStatusLabel(settings.word_range, language)} · 每组 ${settings.word_count} 词`
        : `Range ${everydayWordRangeStatusLabel(settings.word_range, language)} · ${settings.word_count} words/group`;
    case "everyday_sentences":
      return zh
        ? `词汇量 ${everydayLevelStatusLabel(settings.sentence_level, language)} · 长度 ${everydayLengthStatusLabel(settings.sentence_length, language)} · 每组 ${settings.sentence_count} 句`
        : `Vocabulary ${everydayLevelStatusLabel(settings.sentence_level, language)} · Length ${everydayLengthStatusLabel(settings.sentence_length, language)} · ${settings.sentence_count} sentences/group`;
    case "everyday_articles":
      return zh
        ? `词汇量 ${everydayLevelStatusLabel(settings.article_level, language)} · 长度 ${everydayLengthStatusLabel(settings.article_length, language)}`
        : `Vocabulary ${everydayLevelStatusLabel(settings.article_level, language)} · Length ${everydayLengthStatusLabel(settings.article_length, language)}`;
    case "everyday_word_decomposition":
      return zh
        ? `词汇量 ${everydayLevelStatusLabel(settings.decomposition_level, language)} · 每组 ${settings.decomposition_word_count} 词 · 拆分×${settings.decomposition_part_repeats} · 全词×${settings.decomposition_word_repeats}`
        : `Vocabulary ${everydayLevelStatusLabel(settings.decomposition_level, language)} · ${settings.decomposition_word_count} words/group · parts ×${settings.decomposition_part_repeats} · whole ×${settings.decomposition_word_repeats}`;
    default:
      return undefined;
  }
}

function everydayWordRangeStatusLabel(
  value: EverydayEnglishSettings["word_range"],
  language: OpenTuiAppState["language"],
): string {
  const labels =
    language === "zh"
      ? {
          "200": "基础 200",
          "1000": "常用 1000",
          "5000": "进阶 5000",
          "10000": "扩展 10000",
        }
      : {
          "200": "Basic 200",
          "1000": "Common 1000",
          "5000": "Advanced 5000",
          "10000": "Extended 10000",
        };
  return labels[value];
}

function everydayLevelStatusLabel(
  value: EverydayEnglishSettings["sentence_level"],
  language: OpenTuiAppState["language"],
): string {
  if (language !== "zh") {
    const labels: Record<string, string> = {
      high_school: "High school",
      cet4: "CET-4",
      cet6: "CET-6",
      postgraduate: "Postgraduate",
      toefl_ielts: "TOEFL/IELTS",
    };
    return labels[value] ?? value;
  }
  const labels: Record<string, string> = {
    high_school: "高中",
    cet4: "四级",
    cet6: "六级",
    postgraduate: "考研",
    toefl_ielts: "托福雅思",
  };
  return labels[value] ?? value;
}

function everydayLengthStatusLabel(
  value: EverydayEnglishSettings["sentence_length"],
  language: OpenTuiAppState["language"],
): string {
  if (language !== "zh") {
    return titleCase(value);
  }
  const labels: Record<string, string> = {
    short: "短",
    medium: "中",
    long: "长",
    mixed: "混合",
  };
  return labels[value] ?? value;
}

function renderPracticeTimeStack(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
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

function renderTimeValueRow(
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

function pauseStateLabel(language: OpenTuiAppState["language"]): string {
  return language === "zh" ? "⏸ 已暂停" : "⏸ Paused";
}

function groupDurationLabel(language: OpenTuiAppState["language"]): string {
  return language === "zh" ? "本组用时" : "Group";
}

function codeStatusContent(
  target: RunningRoute["target"],
  input: string,
  language: OpenTuiAppState["language"],
): string {
  const blocks = target.code_blocks ?? [];
  const currentBlock = currentCodeBlock(blocks, input);
  const blockIndex =
    currentBlock === undefined ? -1 : blocks.findIndex((block) => block === currentBlock);
  const blockLabel =
    currentBlock === undefined || blockIndex < 0
      ? language === "zh"
        ? "代码块"
        : "Code block"
      : language === "zh"
        ? `代码块 ${blockIndex + 1}/${Math.max(blocks.length, 1)}`
        : `Block ${blockIndex + 1}/${Math.max(blocks.length, 1)}`;
  const scope = codeBlockScopeLabel(currentBlock);
  const difficulty = codeDifficultyStatusText(currentBlock?.difficulty, language);
  const size = codeSizeStatusText(currentBlock?.size, language);
  const meta = [scope, difficulty, size].filter((item) => item.length > 0).join(" · ");
  return meta.length > 0 ? `${blockLabel}  ${meta}` : blockLabel;
}

function currentCodeBlock(
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

function codeBlockScopeLabel(
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

function codeFacetLabel(value: string): string {
  const aliases: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    nextjs: "Next.js",
    nestjs: "NestJS",
    nuxt: "Nuxt",
    vue: "Vue",
    react: "React",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    sass: "Sass",
    less: "LESS",
    php: "PHP",
    sql: "SQL",
    rust: "Rust",
    go: "Go",
    python: "Python",
    java: "Java",
    csharp: "C#",
    cpp: "C++",
    solidity: "Solidity",
    tailwind: "Tailwind",
    hardhat: "Hardhat",
    foundry: "Foundry",
    fastify: "Fastify",
    fastapi: "FastAPI",
    django: "Django",
    rails: "Rails",
    laravel: "Laravel",
    angular: "Angular",
    astro: "Astro",
    svelte: "Svelte",
    hono: "Hono",
    gin: "Gin",
    axum: "Axum",
  };
  return aliases[value] ?? value.split("-").map(titleCase).join("-");
}

function codeDifficultyStatusValue(
  value: string | undefined,
  language: OpenTuiAppState["language"],
): string {
  if (value === undefined) {
    return "";
  }
  if (language !== "zh") {
    return titleCase(value);
  }
  const labels: Record<string, string> = {
    adaptive: "自适应",
    all: "全部",
    easy: "简单",
    medium: "中等",
    hard: "困难",
  };
  return labels[value] ?? value;
}

function codeDifficultyStatusText(
  value: string | undefined,
  language: OpenTuiAppState["language"],
): string {
  const label = codeDifficultyStatusValue(value, language);
  if (label.length === 0) {
    return "";
  }
  return language === "zh" ? `难度：${label}` : `Difficulty: ${label}`;
}

function codeSizeStatusValue(
  value: string | undefined,
  language: OpenTuiAppState["language"],
): string {
  if (value === undefined) {
    return "";
  }
  if (language !== "zh") {
    return titleCase(value);
  }
  const labels: Record<string, string> = {
    adaptive: "自适应",
    short: "短",
    medium: "中等",
    long: "长",
  };
  return labels[value] ?? value;
}

function codeSizeStatusText(
  value: string | undefined,
  language: OpenTuiAppState["language"],
): string {
  const label = codeSizeStatusValue(value, language);
  if (label.length === 0) {
    return "";
  }
  return language === "zh" ? `长度：${label}` : `Length: ${label}`;
}

function titleCase(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function renderLiveMetrics(
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

function renderPracticeDataPanel(
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

function progressDetailLine(data: GroupProgressData, language: OpenTuiAppState["language"]): string {
  return language === "zh"
    ? `正确 ${data.correct}/${data.total} · 退格 ${data.backspaces}`
    : `correct ${data.correct}/${data.total} · backspace ${data.backspaces}`;
}

interface MetricBarItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: Tone;
}

function renderMetricBar(
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

function renderMetricSegment(
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

async function renderGhostText(
  targetText: string,
  inputText: string,
  targetMode: Mode,
  source: string,
  codeBlocks: PracticeTargetCodeBlock[] | undefined,
  annotations: PracticeTargetAnnotation[] | undefined,
  kit: OpenTuiRendererKit,
  completedTitle?: string,
): Promise<unknown> {
  const syntaxRows =
    targetMode === "code"
      ? await highlightCodeSyntax(targetText, { source, blocks: codeBlocks })
      : undefined;
  const showLineNumbers = targetMode === "code";
  const wrapColumns = ghostTextWrapColumns(showLineNumbers);
  const wordColumns = ghostWordColumnRows(targetText, annotations);
  const lineTranslations = ghostLineTranslationRows(targetText, annotations);
  const sourceRows = ghostRows(targetText, inputText, syntaxRows, targetMode === "code");
  const articleTranslation = renderGhostArticleTranslation(annotations, wrapColumns, kit);
  const children: unknown[] = [];
  let visualIndex = 0;
  for (let sourceLineIndex = 0; sourceLineIndex < sourceRows.length; sourceLineIndex += 1) {
    const row = sourceRows[sourceLineIndex] ?? [];
    const columns = wordColumns.get(sourceLineIndex);
    if (columns !== undefined && columns.length > 0) {
      for (const blockRow of wrapGhostWordBlock(row, columns, wrapColumns)) {
        children.push(
          renderGhostVisualLine(
            { sourceLineIndex, continuation: false, segments: blockRow.segments },
            visualIndex,
            showLineNumbers,
            kit,
          ),
        );
        children.push(renderGhostMeaningLine(visualIndex, blockRow.meaning, kit));
        visualIndex += 1;
      }
      continue;
    }
    for (const visualRow of wrapGhostRows([row], wrapColumns)) {
      children.push(
        renderGhostVisualLine(
          { ...visualRow, sourceLineIndex },
          visualIndex,
          showLineNumbers,
          kit,
        ),
      );
      visualIndex += 1;
    }
    const translation = lineTranslations.get(sourceLineIndex);
    if (translation !== undefined) {
      children.push(renderGhostLineTranslation(visualIndex - 1, translation, wrapColumns, kit));
    }
  }
  const completed = completedTitle !== undefined;
  return kit.Box(
    {
      id: "keyloop-ghost-text",
      border: true,
      borderStyle: "rounded",
      borderColor: completed ? theme.accent : targetMode === "code" ? theme.info : theme.border,
      title: targetMode === "code" ? " 代码 " : " 跟打文本 ",
      bottomTitle: completed ? ` ${completedTitle} ` : undefined,
      bottomTitleAlignment: completed ? "right" : undefined,
      backgroundColor: theme.background,
      paddingX: 1,
      flexGrow: 1,
      flexDirection: "column",
      overflow: "hidden",
    },
    ...children,
    ...(articleTranslation === undefined ? [] : [articleTranslation]),
  );
}

function renderGhostVisualLine(
  row: GhostVisualRow,
  lineIndex: number,
  showLineNumbers: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: `keyloop-ghost-line-${lineIndex}`,
      flexDirection: "row",
      flexWrap: "no-wrap",
      width: "100%",
      height: 1,
      overflow: "hidden",
      backgroundColor: theme.background,
    },
    ...(showLineNumbers
      ? [
          kit.Text({
            content: row.continuation ? "  " : String(row.sourceLineIndex + 1).padStart(2, "0"),
            fg: theme.muted,
            id: `keyloop-ghost-line-number-${lineIndex}`,
            height: 1,
            wrapMode: "none",
          }),
          kit.Text({ content: "  ", fg: theme.muted, height: 1, wrapMode: "none" }),
        ]
      : []),
    ...row.segments.map((segment, segmentIndex) =>
      kit.Text({
        content: segment.text,
        fg: segmentColor(segment),
        bg: segmentBg(segment),
        id: `keyloop-ghost-${segment.state}-${lineIndex}-${segmentIndex}`,
        height: 1,
        wrapMode: "none",
      }),
    ),
  );
}

function renderGhostMeaningLine(
  visualIndex: number,
  content: string,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Text({
    id: `keyloop-ghost-meaning-line-${visualIndex}`,
    content,
    fg: theme.muted,
    height: 1,
    truncate: true,
    wrapMode: "none",
  });
}

function wrapGhostWordBlock(
  row: GhostSegment[],
  columns: readonly GhostWordColumn[],
  maxColumns: number,
): GhostWordBlockRow[] {
  const cells = ghostCells(row);
  const cellWidth = columns.reduce(
    (width, column) =>
      Math.max(width, column.srcEndCol - column.srcStartCol, displayWidth(column.translation)),
    1,
  );
  const columnWidth = Math.min(cellWidth + 1, Math.max(maxColumns, 2));
  const wordsPerRow = Math.max(1, Math.floor((maxColumns + 1) / columnWidth));
  const blockRows: GhostWordBlockRow[] = [];
  for (let start = 0; start < columns.length; start += wordsPerRow) {
    const group = columns.slice(start, start + wordsPerRow);
    const nextGroupStartCol = columns[start + wordsPerRow]?.srcStartCol ?? cells.length;
    blockRows.push({
      segments: ghostWordGroupSegments(cells, group, nextGroupStartCol, columnWidth),
      meaning: ghostWordGroupMeaning(group, columnWidth, maxColumns),
    });
  }
  return blockRows;
}

function ghostWordGroupSegments(
  cells: readonly GhostCell[],
  group: readonly GhostWordColumn[],
  nextGroupStartCol: number,
  columnWidth: number,
): GhostSegment[] {
  const out: GhostCell[] = [];
  for (let index = 0; index < group.length; index += 1) {
    const column = group[index];
    if (column === undefined) {
      continue;
    }
    const srcEnd = group[index + 1]?.srcStartCol ?? nextGroupStartCol;
    out.push(...cells.slice(column.srcStartCol, srcEnd));
    if (index < group.length - 1) {
      const padTo = (index + 1) * columnWidth;
      while (out.length < padTo) {
        out.push({ text: " ", state: "pending", syntax: "plain" });
      }
    }
  }
  return ghostSegmentsFromCells(out);
}

function ghostWordGroupMeaning(
  group: readonly GhostWordColumn[],
  columnWidth: number,
  maxColumns: number,
): string {
  let content = "";
  for (let index = 0; index < group.length; index += 1) {
    const column = group[index];
    if (column === undefined) {
      continue;
    }
    const colStart = index * columnWidth;
    const limit = Math.min(columnWidth - 1, maxColumns - colStart);
    const translation = truncateToDisplayWidth(column.translation, Math.max(limit, 0));
    if (translation.length === 0) {
      continue;
    }
    content += " ".repeat(colStart - displayWidth(content)) + translation;
  }
  return content;
}

function renderGhostLineTranslation(
  visualIndex: number,
  translation: string,
  maxColumns: number,
  kit: OpenTuiRendererKit,
): unknown {
  const lines = wrapToDisplayWidth(translation, maxColumns);
  return kit.Box(
    {
      id: `keyloop-ghost-line-translation-${visualIndex}`,
      flexDirection: "column",
      width: "100%",
      flexShrink: 0,
    },
    ...lines.map((line, index) =>
      kit.Text({
        id: `keyloop-ghost-line-translation-${visualIndex}-${index}`,
        content: line,
        fg: theme.muted,
        height: 1,
        truncate: true,
        wrapMode: "none",
      }),
    ),
  );
}

function renderGhostArticleTranslation(
  annotations: readonly PracticeTargetAnnotation[] | undefined,
  maxColumns: number,
  kit: OpenTuiRendererKit,
): unknown | undefined {
  const article = (annotations ?? []).find(
    (annotation) => annotation.display === "article",
  );
  const translation = article?.translation_zh.replace(/\s+/gu, " ").trim();
  if (translation === undefined || translation.length === 0) {
    return undefined;
  }
  const lines = wrapToDisplayWidth(translation, maxColumns);
  return kit.Box(
    {
      id: "keyloop-ghost-article-translation",
      flexDirection: "column",
      width: "100%",
      marginTop: 1,
      flexShrink: 0,
    },
    ...lines.map((line, index) =>
      kit.Text({
        id: `keyloop-ghost-article-translation-${index}`,
        content: line,
        fg: theme.muted,
        height: 1,
        truncate: true,
        wrapMode: "none",
      }),
    ),
  );
}

function ghostWordColumnRows(
  targetText: string,
  annotations: readonly PracticeTargetAnnotation[] | undefined,
): Map<number, GhostWordColumn[]> {
  const rows = new Map<number, GhostWordColumn[]>();
  if (annotations === undefined || annotations.length === 0) {
    return rows;
  }
  const lineRanges = targetLineRanges(targetText);
  for (const annotation of annotations) {
    if ((annotation.display ?? "line") !== "word") {
      continue;
    }
    const translation = annotation.translation_zh.trim();
    const text = targetText.slice(annotation.start, annotation.end).replace(/\s+/gu, " ").trim();
    if (text.length === 0 || translation.length === 0) {
      continue;
    }
    const sourceLineIndex = sourceLineIndexForAnnotation(lineRanges, annotation);
    if (sourceLineIndex === undefined) {
      continue;
    }
    const lineStart = lineRanges[sourceLineIndex]?.start ?? 0;
    const existing = rows.get(sourceLineIndex) ?? [];
    existing.push({
      srcStartCol: annotation.start - lineStart,
      srcEndCol: annotation.end - lineStart,
      translation,
    });
    rows.set(sourceLineIndex, existing);
  }
  for (const columns of rows.values()) {
    columns.sort((a, b) => a.srcStartCol - b.srcStartCol);
  }
  return rows;
}

function ghostLineTranslationRows(
  targetText: string,
  annotations: readonly PracticeTargetAnnotation[] | undefined,
): Map<number, string> {
  const rows = new Map<number, string>();
  if (annotations === undefined || annotations.length === 0) {
    return rows;
  }
  const lineRanges = targetLineRanges(targetText);
  for (const annotation of annotations) {
    if ((annotation.display ?? "line") !== "line") {
      continue;
    }
    const translation = annotation.translation_zh.replace(/\s+/gu, " ").trim();
    if (translation.length === 0) {
      continue;
    }
    const sourceLineIndex = sourceLineIndexForAnnotation(lineRanges, annotation);
    if (sourceLineIndex === undefined || rows.has(sourceLineIndex)) {
      continue;
    }
    rows.set(sourceLineIndex, translation);
  }
  return rows;
}

function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += charDisplayWidth(char);
  }
  return width;
}

function charDisplayWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

function truncateToDisplayWidth(text: string, maxWidth: number): string {
  let width = 0;
  let result = "";
  for (const char of text) {
    const charWidth = charDisplayWidth(char);
    if (width + charWidth > maxWidth) {
      break;
    }
    result += char;
    width += charWidth;
  }
  return result;
}

function wrapToDisplayWidth(text: string, maxWidth: number): string[] {
  const safeWidth = Math.max(1, Math.trunc(maxWidth));
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const char of text) {
    const charWidth = charDisplayWidth(char);
    if (width + charWidth > safeWidth) {
      lines.push(line);
      line = "";
      width = 0;
    }
    line += char;
    width += charWidth;
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines;
}

function targetLineRanges(text: string): TargetLineRange[] {
  const ranges: TargetLineRange[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") {
      continue;
    }
    ranges.push({ start, end: index });
    start = index + 1;
  }
  ranges.push({ start, end: text.length });
  return ranges;
}

function sourceLineIndexForAnnotation(
  lineRanges: readonly TargetLineRange[],
  annotation: PracticeTargetAnnotation,
): number | undefined {
  const index = lineRanges.findIndex(
    (range) => annotation.start >= range.start && annotation.end <= range.end,
  );
  return index < 0 ? undefined : index;
}

function renderDiagnostics(
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

function renderDiagnosticKeyRow(
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

function renderDiagnosticKeyCell(
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

interface GroupProgressData {
  correct: number;
  total: number;
  typed: number;
  backspaces: number;
  progress: number;
}

function groupProgressForTarget(
  targetText: string,
  inputText: string,
  backspaces: number,
): GroupProgressData {
  const correct = countCorrectPrefix(targetText, inputText);
  const total = Array.from(targetText).length;
  const progress = progressPercent(correct, total);
  const typed = Array.from(inputText).length;
  return { correct, total, typed, backspaces, progress };
}

function renderGroupProgressPanel(
  data: GroupProgressData,
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
  options: { framed?: boolean } = {},
): unknown {
  const framed = options.framed ?? true;
  if (!framed) {
    return meterBar("keyloop-group-progress-bar", data.progress, 72, kit);
  }
  return panel(
    "keyloop-group-progress",
    {
      title: language === "zh" ? "本组进度" : "Group progress",
      bottomTitle: progressDetailLine(data, language),
      height: 4,
      width: "100%",
    },
    kit,
    meterBar("keyloop-group-progress-bar", data.progress, 72, kit),
  );
}

async function renderCompleteScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): Promise<unknown> {
  if (state.route.screen !== "complete") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  if (state.route.target !== undefined) {
    const target = completedSnapshotTarget(state.route);
    const runningState: OpenTuiAppState = {
      ...state,
      route: {
        screen: "running",
        target,
        source_item: state.route.source_item,
        ...(state.route.lesson === undefined ? {} : { lesson: state.route.lesson }),
        live: completedSnapshotLive(state.route.live, state.route.record),
      },
    };
    const runningScreen = await renderRunningScreen(runningState, kit, { completed: true });
    if (!state.route.result_visible) {
      return runningScreen;
    }
    return kit.Box(
      {
        id: "keyloop-complete-with-popup",
        position: "relative",
        flexDirection: "column",
        flexGrow: 1,
        width: "100%",
        height: "100%",
        overflow: "hidden",
      },
      runningScreen,
      renderCompletionOverlay(state, kit),
    );
  }
  return renderCompletionPopup(state, kit);
}

async function renderExitConfirmationScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): Promise<unknown> {
  if (state.route.screen !== "exit_confirmation") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const runningState: OpenTuiAppState = {
    ...state,
    route: {
      screen: "running",
      target: state.route.target,
      source_item: state.route.source_item,
      ...(state.route.lesson === undefined ? {} : { lesson: state.route.lesson }),
      ...(state.route.live === undefined ? {} : { live: state.route.live }),
    },
  };
  return kit.Box(
    {
      id: "keyloop-exit-confirmation-with-popup",
      position: "relative",
      flexDirection: "column",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    await renderRunningScreen(runningState, kit),
    renderExitConfirmationOverlay(state, kit),
  );
}

async function renderCodeSettingsConfirmationScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): Promise<unknown> {
  if (state.route.screen !== "code_settings_confirmation") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const runningState: OpenTuiAppState = {
    ...state,
    route: {
      screen: "running",
      target: state.route.target,
      source_item: state.route.source_item,
      ...(state.route.lesson === undefined ? {} : { lesson: state.route.lesson }),
      ...(state.route.live === undefined ? {} : { live: state.route.live }),
    },
  };
  return kit.Box(
    {
      id: "keyloop-code-settings-confirmation-with-popup",
      position: "relative",
      flexDirection: "column",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    await renderRunningScreen(runningState, kit),
    renderCodeSettingsConfirmationOverlay(state, kit),
  );
}

async function renderPracticeOptionsScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): Promise<unknown> {
  if (state.route.screen !== "practice_options") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const runningState: OpenTuiAppState = {
    ...state,
    route: {
      screen: "running",
      target: state.route.target,
      source_item: state.route.source_item,
      ...(state.route.lesson === undefined ? {} : { lesson: state.route.lesson }),
      ...(state.route.live === undefined ? {} : { live: state.route.live }),
    },
  };
  return kit.Box(
    {
      id: "keyloop-practice-options-with-popup",
      position: "relative",
      flexDirection: "column",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    await renderRunningScreen(runningState, kit),
    renderPracticeOptionsOverlay(state.route, state.language, kit),
  );
}

function renderPracticeOptionsOverlay(
  route: PracticeOptionsRoute,
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown {
  return renderCenteredModalOverlay(
    "keyloop-practice-options-overlay",
    "56%",
    "58%",
    renderPracticeOptionsPopup(route, language, kit),
    kit,
  );
}

function renderPracticeOptionsPopup(
  route: PracticeOptionsRoute,
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown {
  return renderModalPopup(
    "keyloop-practice-options",
    language === "zh" ? "练习选项" : "Practice options",
    language === "zh" ? "↑↓ 选择 · ←→ 调整 · Enter 继续 · Esc 关闭" : "↑↓ select · ←→ adjust · Enter resume · Esc close",
    "info",
    kit,
    {
      popupChildren: route.practice_options.items.map((item, index) =>
        renderPracticeOptionRow(item, index, index === route.practice_options.selected_index, kit),
      ),
    },
  );
}

function renderPracticeOptionRow(
  item: PracticeOptionsRoute["practice_options"]["items"][number],
  index: number,
  selected: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  return listRow(
    `keyloop-practice-option-row-${index}`,
    selected,
    { height: 1, gap: 1 },
    kit,
    kit.Text({
      id: `keyloop-practice-option-row-${index}-label`,
      content: item.label,
      fg: selected ? theme.accent : theme.foreground,
      attributes: selected ? TEXT_BOLD : undefined,
      height: 1,
      wrapMode: "none",
      flexGrow: 1,
    }),
    kit.Text({
      id: `keyloop-practice-option-row-${index}-value`,
      content: selected ? `‹ ${item.value} ›` : item.value,
      fg: selected ? theme.warning : theme.muted,
      attributes: selected ? TEXT_BOLD : undefined,
      height: 1,
      wrapMode: "none",
    }),
  );
}

function renderCodeSettingsConfirmationOverlay(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  return renderCenteredModalOverlay(
    "keyloop-code-settings-confirmation-overlay",
    "64%",
    "45%",
    renderCodeSettingsConfirmationPopup(state, kit),
    kit,
  );
}

function renderCodeSettingsConfirmationPopup(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const lines = openTuiRouteLines(state);
  return renderModalPopup(
    "keyloop-code-settings-confirmation",
    openTuiRouteTitle(state),
    state.language === "zh" ? "Enter 刷新本组 · Esc 取消" : "Enter refresh · Esc cancel",
    "warn",
    kit,
    {
      popupChildren: [
        kit.Text({
          content: lines[0] ?? "",
          fg: theme.foreground,
          id: "keyloop-code-settings-confirmation-message",
          height: 1,
          truncate: true,
        }),
        kit.Text({
          content: lines[1] ?? "",
          fg: theme.muted,
          id: "keyloop-code-settings-confirmation-warning",
          height: 1,
          truncate: true,
        }),
      ],
    },
  );
}

function renderExitConfirmationOverlay(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  return renderCenteredModalOverlay(
    "keyloop-exit-confirmation-overlay",
    "64%",
    "45%",
    renderExitConfirmationPopup(state, kit),
    kit,
  );
}

function renderExitConfirmationPopup(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const lines = openTuiRouteLines(state);
  return renderModalPopup(
    "keyloop-exit-confirmation",
    openTuiRouteTitle(state),
    state.language === "zh" ? "Enter 确认退出 · Esc 返回练习" : "Enter confirm exit · Esc keep typing",
    "bad",
    kit,
    {
      popupChildren: [
        kit.Text({
          content: lines[0] ?? "",
          fg: theme.foreground,
          id: "keyloop-exit-confirmation-message",
          height: 1,
          truncate: true,
        }),
        kit.Text({
          content: lines[1] ?? "",
          fg: theme.muted,
          id: "keyloop-exit-confirmation-warning",
          height: 1,
          truncate: true,
        }),
      ],
    },
  );
}

function completedSnapshotTarget(route: CompleteRoute): RunningRoute["target"] {
  const target: RunningRoute["target"] = {
    mode: route.record.mode,
    text: route.record.target_text,
    source: route.record.source.length > 0 ? route.record.source : (route.target?.source ?? ""),
  };
  if (route.target?.text === route.record.target_text) {
    if (route.target.code_blocks !== undefined) {
      target.code_blocks = route.target.code_blocks;
    }
    if (route.target.annotations !== undefined) {
      target.annotations = route.target.annotations;
    }
  }
  return target;
}

function completedSnapshotLive(
  live: RunningRoute["live"] | undefined,
  record: Extract<OpenTuiAppState["route"], { screen: "complete" }>["record"],
): NonNullable<RunningRoute["live"]> {
  return {
    input: record.target_text,
    elapsed_ms: live?.elapsed_ms ?? record.duration_ms,
    key_events: record.key_events,
    metrics: {
      wpm: record.wpm,
      raw_wpm: record.raw_wpm,
      accuracy: record.accuracy,
      errors: record.error_count,
      backspaces: record.backspace_count,
    },
  };
}

function renderCompletionOverlay(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  return renderCenteredModalOverlay(
    "keyloop-complete-overlay",
    "94%",
    "80%",
    renderCompletionPopup(state, kit),
    kit,
  );
}

function renderCenteredModalOverlay(
  id: string,
  width: string,
  maxHeight: string,
  modal: unknown,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id,
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: "100%",
      height: "100%",
      zIndex: 10,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    kit.Box(
      {
        id: `${id}-viewport`,
        flexDirection: "column",
        width,
        maxHeight,
        overflow: "hidden",
      },
      modal,
    ),
  );
}

function renderCompletionPopup(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  if (state.route.screen !== "complete") {
    return renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit);
  }
  const record = state.route.record;
  const next = completionNextLine(state.route, state.language);
  const speedUnit = state.speed_unit ?? "wpm";
  const metricLabel = speedUnitLabel(speedUnit);
  return renderModalPopup(
    "keyloop-complete",
    openTuiRouteTitle(state),
    state.language === "zh"
      ? "Enter 关闭 · R 重练 · Q 退出"
      : "Enter close · R repeat · Q quit",
    "good",
    kit,
    {
      shellId: "keyloop-complete-popup",
      panelId: "keyloop-complete-card",
      popupChildren: [
        kit.Text({
          content:
            state.language === "zh"
              ? `模式 ${record.mode} · 模块 ${record.module}`
              : `Mode ${record.mode} · Module ${record.module}`,
          fg: theme.muted,
        }),
        kit.Box(
          {
            id: "keyloop-complete-stat-row",
            flexDirection: "row",
            gap: 2,
            width: "100%",
            height: 2,
            overflow: "hidden",
          },
          statCell(
            "keyloop-complete-stat-wpm",
            metricLabel,
            speedFromWpm(record.wpm, speedUnit).toFixed(1),
            "good",
            kit,
          ),
          statCell(
            "keyloop-complete-stat-raw",
            state.language === "zh" ? `原始 ${metricLabel}` : `Raw ${metricLabel}`,
            speedFromWpm(record.raw_wpm, speedUnit).toFixed(1),
            "neutral",
            kit,
          ),
          statCell(
            "keyloop-complete-stat-accuracy",
            state.language === "zh" ? "准确" : "Accuracy",
            `${record.accuracy.toFixed(1)}%`,
            "warn",
            kit,
          ),
          statCell(
            "keyloop-complete-stat-errors",
            state.language === "zh" ? "错误" : "Errors",
            String(record.error_count),
            "bad",
            kit,
          ),
        ),
        renderCompletionDetails(record, state.language, kit),
        ...renderCompletionKeyDiagnostics(record, state.language, kit),
        ...(next === undefined
          ? []
          : [kit.Text({ content: next, fg: theme.cyan, id: "keyloop-complete-next" })]),
      ],
    },
  );
}

function renderCompletionDetails(
  record: CompleteRoute["record"],
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: "keyloop-complete-details",
      flexDirection: "row",
      gap: 2,
      width: "100%",
      overflow: "hidden",
    },
    kit.Text({
      content:
        language === "zh"
          ? `用时 ${formatElapsedTime(record.duration_ms)}`
          : `Time ${formatElapsedTime(record.duration_ms)}`,
      fg: theme.muted,
      id: "keyloop-complete-duration",
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      content:
        language === "zh"
          ? `正确字符 ${record.correct_chars}/${record.target_len}`
          : `Correct chars ${record.correct_chars}/${record.target_len}`,
      fg: theme.muted,
      id: "keyloop-complete-chars",
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
  );
}

function renderCompletionKeyDiagnostics(
  record: CompleteRoute["record"],
  language: OpenTuiAppState["language"],
  kit: OpenTuiRendererKit,
): unknown[] {
  const summary = buildKeyDiagnostics(record.target_text, record.key_events);
  const rows = [
    renderCompletionKeySpeedRow(
      "slow",
      language === "zh" ? "慢" : "Slow",
      summary.slow_keys,
      kit,
    ),
    renderCompletionKeySpeedRow(
      "fast",
      language === "zh" ? "快" : "Fast",
      summary.fast_keys,
      kit,
    ),
    renderCompletionKeyErrorRow(
      language === "zh" ? "错" : "Err",
      summary.error_keys,
      kit,
    ),
  ].filter((row): row is unknown => row !== undefined);
  if (rows.length === 0) {
    return [];
  }
  return [
    kit.Box(
      {
        id: "keyloop-complete-key-diagnostics",
        flexDirection: "column",
        gap: 0,
        width: "100%",
        overflow: "hidden",
      },
      ...rows,
    ),
  ];
}

function renderCompletionKeySpeedRow(
  kind: "slow" | "fast",
  label: string,
  items: readonly KeyDiagnosticItem[],
  kit: OpenTuiRendererKit,
): unknown | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return kit.Box(
    {
      id: `keyloop-complete-key-${kind}-row`,
      flexDirection: "row",
      width: "100%",
      minHeight: 1,
      overflow: "hidden",
    },
    kit.Text({
      id: `keyloop-complete-key-${kind}-label`,
      content: `${label} `,
      fg: theme.foreground,
      height: 1,
      wrapMode: "none",
    }),
    kit.Box(
      {
        id: `keyloop-complete-key-${kind}-grid`,
        flexDirection: "row",
        flexWrap: "wrap",
        flexGrow: 1,
        overflow: "hidden",
      },
      ...items.map((item) =>
        kit.Box(
          {
            id: `keyloop-complete-key-${kind}-cell-${diagnosticKeyId(item.label)}`,
            flexDirection: "row",
            width: 16,
            height: 1,
            overflow: "hidden",
          },
          kit.Text({
            id: `keyloop-complete-key-${kind}-${diagnosticKeyId(item.label)}`,
            content: ` ${item.label} `,
            fg: theme.foreground,
            bg: heatScaleColor("success", item.speed_level),
            height: 1,
            wrapMode: "none",
          }),
          kit.Text({
            id: `keyloop-complete-key-${kind}-${diagnosticKeyId(item.label)}-speed`,
            content: ` ${formatKeyWpm(item.wpm)} WPM  `,
            fg: theme.muted,
            height: 1,
            wrapMode: "none",
          }),
        ),
      ),
    ),
  );
}

function renderCompletionKeyErrorRow(
  label: string,
  items: readonly KeyDiagnosticItem[],
  kit: OpenTuiRendererKit,
): unknown | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return kit.Box(
    {
      id: "keyloop-complete-key-error-row",
      flexDirection: "row",
      width: "100%",
      minHeight: 1,
      overflow: "hidden",
    },
    kit.Text({
      id: "keyloop-complete-key-error-label",
      content: `${label} `,
      fg: theme.foreground,
      height: 1,
      wrapMode: "none",
    }),
    kit.Box(
      {
        id: "keyloop-complete-key-error-grid",
        flexDirection: "row",
        flexWrap: "wrap",
        flexGrow: 1,
        overflow: "hidden",
      },
      ...items.map((item) =>
        kit.Box(
          {
            id: `keyloop-complete-key-error-cell-${diagnosticKeyId(item.label)}`,
            flexDirection: "row",
            width: 16,
            height: 1,
            overflow: "hidden",
          },
          kit.Text({
            id: `keyloop-complete-key-error-${diagnosticKeyId(item.label)}`,
            content: ` ${item.label} `,
            fg: theme.foreground,
            bg: heatScaleColor("danger", item.error_level),
            height: 1,
            wrapMode: "none",
          }),
          kit.Text({
            id: `keyloop-complete-key-error-${diagnosticKeyId(item.label)}-count`,
            content: ` ×${item.error_count}  `,
            fg: theme.muted,
            height: 1,
            wrapMode: "none",
          }),
        ),
      ),
    ),
  );
}

function formatKeyWpm(value: number | undefined): string {
  return value === undefined ? "--" : value.toFixed(1);
}

function renderModalPopup(
  idPrefix: string,
  title: string,
  bottomTitle: string | undefined,
  tone: Tone,
  kit: OpenTuiRendererKit,
  options: {
    shellId?: string;
    panelId?: string;
    popupChildren: unknown[];
  },
): unknown {
  return kit.Box(
    {
      id: options.shellId ?? `${idPrefix}-popup-shell`,
      flexDirection: "column",
      gap: 1,
      width: "100%",
      maxHeight: "100%",
    },
    modal(
      options.panelId ?? `${idPrefix}-popup`,
      { title, tone, ...(bottomTitle === undefined ? {} : { bottomTitle }) },
      kit,
      ...options.popupChildren,
    ),
  );
}

function completionNextLine(
  route: CompleteRoute,
  language: OpenTuiAppState["language"],
): string | undefined {
  if (route.record.daily_run_id === "" || route.source_item !== "comprehensive") {
    return undefined;
  }
  if (route.next_lesson === undefined) {
    return language === "zh" ? "今日综合练习完成" : "Daily plan complete";
  }
  return language === "zh"
    ? `下一组：${route.next_lesson.module}`
    : `Next: ${route.next_lesson.module}`;
}

function renderPanel(
  id: string,
  title: string,
  lines: string[],
  kit: OpenTuiRendererKit,
  options: {
    bottomTitle?: string;
    height?: number;
    width?: number | string;
    flexGrow?: number;
    gap?: number;
  } = {},
): unknown {
  const props: OpenTuiBoxProps = {
    id,
    border: true,
    borderStyle: "rounded",
    borderColor: theme.border,
    title: ` ${title} `,
    paddingX: 1,
    flexDirection: "column",
    gap: options.gap ?? 1,
  };
  if (options.height !== undefined) {
    props.height = options.height;
  }
  if (options.width !== undefined) {
    props.width = options.width;
  }
  if (options.flexGrow !== undefined) {
    props.flexGrow = options.flexGrow;
  }
  if (options.bottomTitle !== undefined) {
    props.bottomTitle = options.bottomTitle;
    props.bottomTitleAlignment = "right";
  }
  return kit.Box(
    props,
    ...lines.map((line, index) =>
      kit.Text({
        content: line,
        fg: index === 0 ? theme.foreground : theme.muted,
        id: `${id}-line-${index}`,
        height: 1,
        truncate: true,
      }),
    ),
  );
}

function ghostRows(
  targetText: string,
  inputText: string,
  highlightedRows: HighlightRows | undefined,
  allowFallbackSyntax = false,
): GhostSegment[][] {
  const target = Array.from(targetText);
  const input = Array.from(inputText);
  const syntax = highlightedRows === undefined && allowFallbackSyntax ? syntaxKinds(targetText) : undefined;
  const highlightedColors =
    highlightedRows === undefined ? undefined : highlightedRows.map(highlightedRowColors);
  const rows: GhostSegment[][] = [[]];
  let lineIndex = 0;
  let columnIndex = 0;
  for (let index = 0; index < target.length; index += 1) {
    const expected = target[index];
    if (expected === "\n") {
      appendGhostSegment(rows[lineIndex] ?? [], {
        text: "⏎",
        state: index === input.length ? "cursor" : ghostState(expected, input[index]),
        syntax: "plain",
      });
      lineIndex += 1;
      columnIndex = 0;
      rows[lineIndex] = [];
      continue;
    }
    if (expected === undefined) {
      continue;
    }
    const actual = input[index];
    const state = index === input.length ? "cursor" : ghostState(expected, actual);
    appendGhostSegment(rows[lineIndex] ?? [], {
      text: expected,
      state,
      syntax: syntax?.[index] ?? "plain",
      syntaxFg: highlightedFg(highlightedColors, lineIndex, columnIndex),
    });
    columnIndex += 1;
  }
  return rows;
}

function wrapGhostRows(rows: GhostSegment[][], maxColumns: number): GhostVisualRow[] {
  const safeMaxColumns = Math.max(1, Math.trunc(maxColumns));
  const visualRows: GhostVisualRow[] = [];
  for (let sourceLineIndex = 0; sourceLineIndex < rows.length; sourceLineIndex += 1) {
    const row = rows[sourceLineIndex] ?? [];
    if (row.length === 0) {
      visualRows.push({ sourceLineIndex, continuation: false, segments: [] });
      continue;
    }

    const cells = ghostCells(row);
    let start = 0;
    let continuation = false;
    while (start < cells.length) {
      const hardEnd = Math.min(start + safeMaxColumns, cells.length);
      const end =
        hardEnd >= cells.length ? cells.length : preferredGhostWrapEnd(cells, start, hardEnd);
      visualRows.push({
        sourceLineIndex,
        continuation,
        segments: ghostSegmentsFromCells(cells.slice(start, end)),
      });
      start = end;
      continuation = true;
    }
  }
  return visualRows;
}

function ghostCells(row: GhostSegment[]): GhostCell[] {
  return row.flatMap((segment) =>
    Array.from(segment.text).map((text) => ({
      text,
      state: segment.state,
      syntax: segment.syntax,
      syntaxFg: segment.syntaxFg,
    })),
  );
}

function ghostSegmentsFromCells(cells: GhostCell[]): GhostSegment[] {
  const segments: GhostSegment[] = [];
  for (const cell of cells) {
    appendGhostSegment(segments, cell);
  }
  return segments;
}

function preferredGhostWrapEnd(cells: GhostCell[], start: number, hardEnd: number): number {
  const maxColumns = hardEnd - start;
  const minBreakColumns = Math.min(maxColumns, Math.max(12, Math.floor(maxColumns * 0.6)));
  for (let index = hardEnd - 1; index > start; index -= 1) {
    if (index + 1 - start >= minBreakColumns && isGhostWhitespace(cells[index]?.text)) {
      return index + 1;
    }
  }
  for (let index = hardEnd - 1; index > start; index -= 1) {
    if (index + 1 - start >= minBreakColumns && isGhostWrapBoundary(cells[index]?.text)) {
      return index + 1;
    }
  }
  return hardEnd;
}

function isGhostWhitespace(text: string | undefined): boolean {
  return text === " " || text === "\t";
}

function isGhostWrapBoundary(text: string | undefined): boolean {
  return text !== undefined && ",;:.)}]}>+-=*/|&?!".includes(text);
}

function ghostTextWrapColumns(showLineNumbers: boolean): number {
  const terminalColumns = process.stdout.columns;
  const frameColumns =
    terminalColumns === undefined || terminalColumns <= 0
      ? APP_FRAME_WIDTH
      : Math.min(terminalColumns, APP_FRAME_WIDTH);
  if (terminalColumns === undefined || terminalColumns <= 0) {
    return Math.max(
      MIN_GHOST_TEXT_WRAP_COLUMNS,
      frameColumns -
        GHOST_TEXT_FRAME_RESERVED_COLUMNS -
        (showLineNumbers ? GHOST_TEXT_LINE_NUMBER_COLUMNS : 0),
    );
  }
  const reservedColumns =
    GHOST_TEXT_FRAME_RESERVED_COLUMNS + (showLineNumbers ? GHOST_TEXT_LINE_NUMBER_COLUMNS : 0);
  return Math.max(MIN_GHOST_TEXT_WRAP_COLUMNS, frameColumns - reservedColumns);
}

function highlightedRowColors(row: HighlightRows[number]): Array<string | null> {
  return row.flatMap((token) => Array.from(token.text).map(() => token.fg ?? null));
}

function highlightedFg(
  colors: Array<Array<string | null>> | undefined,
  lineIndex: number,
  columnIndex: number,
): string | null | undefined {
  if (colors === undefined) {
    return undefined;
  }
  return colors[lineIndex]?.[columnIndex] ?? null;
}

function ghostState(
  expected: string,
  actual: string | undefined,
): GhostSegment["state"] {
  if (actual === undefined) {
    return "pending";
  }
  return actual === expected ? "typed" : "wrong";
}

function appendGhostSegment(row: GhostSegment[], segment: GhostSegment): void {
  const previous = row[row.length - 1];
  if (
    previous !== undefined &&
    previous.state === segment.state &&
    previous.syntax === segment.syntax &&
    previous.syntaxFg === segment.syntaxFg
  ) {
    previous.text += segment.text;
    return;
  }
  row.push({ ...segment });
}

function syntaxKinds(text: string): SyntaxKind[] {
  const chars = Array.from(text);
  const kinds = chars.map((): SyntaxKind => "plain");
  markRegex(kinds, text, /`[^`]*`|"[^"]*"|'[^']*'/g, "string");
  markRegex(
    kinds,
    text,
    /\b(?:export|async|function|const|let|return|type|null|true|false|await|Promise)\b/g,
    "keyword",
  );
  markRegex(kinds, text, /\b[A-Z][A-Za-z0-9_]*\b/g, "type");
  markRegex(kinds, text, /\b[A-Za-z_$][A-Za-z0-9_$]*(?=\()/g, "function");
  markRegex(kinds, text, /(?<=\.)[A-Za-z_$][A-Za-z0-9_$]*/g, "property");
  markRegex(kinds, text, /=>|!==|===|==|!=|>=|<=|\?\?=|\?\?|\+=|-=|[{}()[\]<>:=;,.+*/|&!?_-]/g, "operator");
  return kinds;
}

function markRegex(kinds: SyntaxKind[], text: string, regex: RegExp, kind: SyntaxKind): void {
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0;
    const matched = match[0] ?? "";
    for (let offset = 0; offset < matched.length; offset += 1) {
      kinds[start + offset] = kind;
    }
  }
}

function routeCrumb(state: OpenTuiAppState): string {
  switch (state.route.screen) {
    case "main_menu":
      return state.language === "zh" ? "练习菜单 · 今日自适应计划" : "Practice menu · adaptive plan";
    case "submenu":
      return `${openTuiRouteTitle(state)} › ${state.language === "zh" ? "选择练习" : "choose lesson"}`;
    case "running":
      return `${openTuiRouteTitle(state)} › ${state.route.lesson?.module ?? state.route.source_item}`;
    case "complete":
      return `${openTuiRouteTitle(state)} › ${state.route.record.module}`;
    case "settings":
    case "stats":
    case "exit_confirmation":
    case "code_settings_confirmation":
    case "practice_options":
    case "summary":
    case "ansi_palette":
      return openTuiRouteTitle(state);
  }
}

function runningTitlePrefix(sourceItem: string): string {
  if (sourceItem.startsWith("foundation")) {
    return "基础练习";
  }
  return sourceItem.startsWith("code") ? "代码实战" : "练习中";
}

function selectedMenuIndex(state: OpenTuiAppState, itemCount: number): number {
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

function selectedSettingsMenuIndex(state: OpenTuiAppState, itemCount: number): number {
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

function segmentColor(segment: GhostSegment): OpenTuiColorInput | undefined {
  if (segment.state === "cursor") {
    return theme.black;
  }
  if (segment.state === "wrong") {
    return theme.white;
  }
  if (segment.state === "pending") {
    return theme.muted;
  }
  if (segment.syntaxFg !== undefined) {
    return segment.syntaxFg === null ? theme.foreground : colorFromSyntaxToken(segment.syntaxFg);
  }
  switch (segment.syntax) {
    case "keyword":
      return theme.magenta;
    case "function":
      return theme.blue;
    case "type":
      return theme.cyan;
    case "property":
      return theme.blue;
    case "string":
      return theme.yellow;
    case "operator":
      return theme.cyan;
    case "plain":
      return theme.accent;
  }
}

function segmentBg(segment: GhostSegment): OpenTuiColorInput | undefined {
  if (segment.state === "wrong") {
    return theme.red;
  }
  return segment.state === "cursor" ? theme.cursor : undefined;
}

function colorFromSyntaxToken(color: string): OpenTuiColorInput | undefined {
  if (color === "foreground") {
    return theme.foreground;
  }
  return isAnsiColorName(color) ? ansiTheme[color] : color;
}

function countCorrectPrefix(targetText: string, inputText: string): number {
  const target = Array.from(targetText);
  const input = Array.from(inputText);
  return input.reduce((count, actual, index) => count + (actual === target[index] ? 1 : 0), 0);
}

function progressPercent(correct: number, total: number): number {
  if (total === 0) {
    return 100;
  }
  return Math.round((correct / total) * 100);
}

function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface KeyDiagnostics {
  baseline_wpm?: number;
  keys: KeyDiagnosticItem[];
  fast_keys: KeyDiagnosticItem[];
  slow_keys: KeyDiagnosticItem[];
  error_keys: KeyDiagnosticItem[];
}

interface KeyDiagnosticItem {
  label: string;
  median_ms: number | undefined;
  wpm: number | undefined;
  sample_count: number;
  error_count: number;
  speed_level: number;
  error_level: number;
}

const keySpeedWpmCeiling = 120;

function buildKeyDiagnostics(targetText: string, events: readonly KeyEventRecord[]): KeyDiagnostics {
  const labels = targetKeyLabels(targetText);
  const stats = new Map<string, { samples: number[]; errors: number }>();
  for (const label of labels) {
    stats.set(label, { samples: [], errors: 0 });
  }

  let previousTypingEvent: KeyEventRecord | undefined;
  for (const event of events) {
    if (event.action === "backspace") {
      previousTypingEvent = event;
      continue;
    }
    if (event.action !== "insert") {
      continue;
    }
    const label = keyDiagnosticLabel(event.expected ?? event.input);
    if (label === undefined) {
      previousTypingEvent = event;
      continue;
    }
    const entry = stats.get(label) ?? { samples: [], errors: 0 };
    stats.set(label, entry);
    if (!event.correct) {
      entry.errors += 1;
    } else if (previousTypingEvent !== undefined) {
      const delay = event.at_ms - previousTypingEvent.at_ms;
      if (isValidKeyDelay(delay)) {
        entry.samples.push(delay);
      }
    }
    previousTypingEvent = event;
  }

  const baseKeys = labels.map((label) => {
    const entry = stats.get(label);
    const medianMs = median(entry?.samples ?? []);
    const wpm = medianMs === undefined ? undefined : delayMsToKeyWpm(medianMs);
    return {
      label,
      median_ms: medianMs,
      wpm,
      sample_count: entry?.samples.length ?? 0,
      error_count: entry?.errors ?? 0,
      speed_level: wpm === undefined ? 0 : heatLevelFromRatio(wpm / keySpeedWpmCeiling),
      error_level: 0,
    };
  });
  const maxErrorCount = Math.max(0, ...baseKeys.map((item) => item.error_count));
  const keys = baseKeys.map((item) => ({
    ...item,
    error_level:
      item.error_count > 0 && maxErrorCount > 0
        ? Math.max(1, heatLevelFromRatio(item.error_count / maxErrorCount))
        : 0,
  }));
  const sampleWpms = keys
    .map((item) => item.wpm)
    .filter((value): value is number => value !== undefined);
  const baselineWpm = medianFloat(sampleWpms);
  const slowKeys =
    baselineWpm === undefined
      ? []
      : keys
          .filter(
            (item) =>
              item.wpm !== undefined &&
              item.sample_count > 0 &&
              item.wpm <= baselineWpm * 0.75,
          )
          .sort(compareSlowKeyItems)
          .slice(0, 4);
  const fastKeys =
    baselineWpm === undefined
      ? []
      : keys
          .filter(
            (item) =>
              item.wpm !== undefined &&
              item.sample_count > 0 &&
              item.wpm >= baselineWpm * 1.25,
          )
          .sort(compareFastKeyItems)
          .slice(0, 4);
  const errorKeys = keys
    .filter((item) => item.error_count > 0)
    .sort(
      (left, right) =>
        right.error_count - left.error_count || compareKeyLabels(left.label, right.label),
    )
    .slice(0, 4);
  return {
    ...(baselineWpm === undefined ? {} : { baseline_wpm: baselineWpm }),
    keys,
    fast_keys: fastKeys,
    slow_keys: slowKeys,
    error_keys: errorKeys,
  };
}

function targetKeyLabels(text: string): string[] {
  const labels = new Set<string>();
  for (const char of Array.from(text)) {
    const label = keyDiagnosticLabel(char);
    if (label !== undefined) {
      labels.add(label);
    }
  }
  return [...labels].sort(compareKeyLabels);
}

function keyDiagnosticLabel(value: string | null): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value === " " || value === "\n" || value === "\t" || value.trim().length === 0) {
    return undefined;
  }
  if (/^[a-z]$/u.test(value)) {
    return value.toUpperCase();
  }
  return value;
}

function compareKeyLabels(left: string, right: string): number {
  return keyLabelRank(left) - keyLabelRank(right) || left.localeCompare(right);
}

function keyLabelRank(label: string): number {
  const upper = label.toUpperCase();
  if (/^[A-Z]$/u.test(upper)) {
    return upper.codePointAt(0) ?? 0;
  }
  if (/^[0-9]$/u.test(label)) {
    return 1_000 + (label.codePointAt(0) ?? 0);
  }
  const symbolOrder = "{}[]()<>=+-*/%&|!?:;.,_'\"`~@#$^\\";
  const symbolIndex = symbolOrder.indexOf(label);
  if (symbolIndex >= 0) {
    return 2_000 + symbolIndex;
  }
  return 3_000 + (label.codePointAt(0) ?? 0);
}

function isValidKeyDelay(delay: number): boolean {
  return Number.isFinite(delay) && delay >= 40 && delay <= 12_000;
}

function delayMsToKeyWpm(delayMs: number): number {
  return Math.round((12_000 / delayMs) * 10) / 10;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value === undefined) {
    return undefined;
  }
  if (sorted.length % 2 === 1) {
    return Math.round(value);
  }
  const previous = sorted[middle - 1];
  return previous === undefined ? Math.round(value) : Math.round((previous + value) / 2);
}

function medianFloat(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value === undefined) {
    return undefined;
  }
  const medianValue =
    sorted.length % 2 === 1 ? value : ((sorted[middle - 1] ?? value) + value) / 2;
  return Math.round(medianValue * 10) / 10;
}

function compareSlowKeyItems(left: KeyDiagnosticItem, right: KeyDiagnosticItem): number {
  return (
    (left.wpm ?? Number.POSITIVE_INFINITY) - (right.wpm ?? Number.POSITIVE_INFINITY) ||
    right.error_count - left.error_count ||
    compareKeyLabels(left.label, right.label)
  );
}

function compareFastKeyItems(left: KeyDiagnosticItem, right: KeyDiagnosticItem): number {
  return (
    (right.wpm ?? 0) - (left.wpm ?? 0) ||
    left.error_count - right.error_count ||
    compareKeyLabels(left.label, right.label)
  );
}

function diagnosticKeyRows(items: readonly KeyDiagnosticItem[], perRow: number): KeyDiagnosticItem[][] {
  const rows: KeyDiagnosticItem[][] = [];
  for (let index = 0; index < items.length; index += perRow) {
    rows.push(items.slice(index, index + perRow));
  }
  return rows;
}

function diagnosticKeyId(label: string): string {
  if (/^[A-Za-z0-9]$/u.test(label)) {
    return label.toUpperCase();
  }
  return `u${Array.from(label)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "0")
    .join("-")}`;
}

function menuItemTag(item: MenuCardItem): string {
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

function menuItemDescription(item: MenuCardItem): string {
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
