import type { OpenTuiAppState } from "../appModel";
import {
  openTuiFlatSettingsItems,
  openTuiRouteTitle,
  selectedFlatSettingsIndex,
  type OpenTuiSettingsView,
} from "../appModel";
import { TEXT_BOLD, theme } from "../theme";
import { listRow, panel, sectionLabel, type KeyHint } from "../components";
import type { OpenTuiRendererKit } from "../kit";

export function renderSettingsMenuScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  const items = openTuiFlatSettingsItems(state);
  const selectedIndex = selectedFlatSettingsIndex(state, items.length);
  return renderSettingsPanel(items, selectedIndex, state.language === "zh", kit);
}

export function renderYoudaoTtsSettingsScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  const zh = state.language === "zh";
  const selectedIndex =
    state.route.screen === "settings" && state.route.view === "youdao_tts"
      ? Math.min(Math.max(state.route.selected_index ?? 0, 0), 3)
      : 0;
  const appKey =
    state.route.screen === "settings" && state.route.view === "youdao_tts"
      ? state.route.youdao_app_key_input ?? ""
      : "";
  const appSecret =
    state.route.screen === "settings" && state.route.view === "youdao_tts"
      ? state.route.youdao_app_secret_input ?? ""
      : "";
  const message =
    state.route.screen === "settings" && state.route.view === "youdao_tts"
      ? state.route.youdao_message
      : undefined;
  const secret = appSecret.length === 0 ? "" : "•".repeat(Math.min(appSecret.length, 12));

  return panel(
    "keyloop-youdao-settings",
    { title: openTuiRouteTitle(state), width: "100%", flexGrow: 1, gap: 1, paddingX: 1 },
    kit,
    renderYoudaoField(
      "keyloop-youdao-field-app-key",
      zh ? "有道智云 App Key" : "Youdao App Key",
      appKey,
      zh ? "未填写" : "empty",
      selectedIndex === 0,
      kit,
    ),
    renderYoudaoField(
      "keyloop-youdao-field-app-secret",
      zh ? "有道智云 App Secret" : "Youdao App Secret",
      secret,
      zh ? "未填写" : "empty",
      selectedIndex === 1,
      kit,
    ),
    renderYoudaoAction(
      "keyloop-youdao-action-save",
      zh ? "保存到 macOS 钥匙串" : "Save to macOS Keychain",
      selectedIndex === 2,
      "save",
      kit,
    ),
    renderYoudaoAction(
      "keyloop-youdao-action-clear",
      zh ? "清除 macOS 钥匙串配置" : "Clear macOS Keychain credentials",
      selectedIndex === 3,
      "clear",
      kit,
    ),
    ...(message === undefined || message === ""
      ? []
      : [
          kit.Text({
            id: "keyloop-youdao-message",
            content: message,
            fg: theme.info,
            height: 1,
            truncate: true,
            wrapMode: "none",
          }),
        ]),
  );
}

export function renderSettingsPanel(
  items: ReturnType<typeof openTuiFlatSettingsItems>,
  selectedIndex: number,
  zh: boolean,
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
      ...renderSettingsRows(items, selectedIndex, zh, kit),
    ),
  );
}

export function renderSettingsRows(
  items: ReturnType<typeof openTuiFlatSettingsItems>,
  selectedIndex: number,
  zh: boolean,
  kit: OpenTuiRendererKit,
): unknown[] {
  return items.flatMap((item, index) => [
    ...settingsSectionBeforeItem(item, index, zh, kit),
    renderSettingsRow(item, index, index === selectedIndex, kit),
  ]);
}

export function settingsSectionBeforeItem(
  item: ReturnType<typeof openTuiFlatSettingsItems>[number],
  index: number,
  zh: boolean,
  kit: OpenTuiRendererKit,
): unknown[] {
  if (index === 0) {
    return [sectionLabel("keyloop-settings-section-global", zh ? "全局设置" : "Global", kit)];
  }
  if (item.kind === "code_filters") {
    return [
      kit.Box({ id: "keyloop-settings-section-code-spacer", width: "100%", height: 1 }),
      sectionLabel("keyloop-settings-section-code", zh ? "代码设置" : "Code settings", kit),
    ];
  }
  if (item.kind === "word_audio") {
    return [
      kit.Box({ id: "keyloop-settings-section-words-spacer", width: "100%", height: 1 }),
      sectionLabel("keyloop-settings-section-words", zh ? "单词与发音" : "Words & audio", kit),
    ];
  }
  if (item.kind === "module_foundation") {
    return [
      kit.Box({ id: "keyloop-settings-section-comprehensive-spacer", width: "100%", height: 1 }),
      sectionLabel(
        "keyloop-settings-section-comprehensive",
        zh ? "综合训练" : "Comprehensive training",
        kit,
      ),
    ];
  }
  if (item.kind === "goal_enabled") {
    return [
      kit.Box({ id: "keyloop-settings-section-goal-spacer", width: "100%", height: 1 }),
      sectionLabel("keyloop-settings-section-goal", zh ? "目标训练" : "Goal training", kit),
    ];
  }
  return [];
}

export function renderSettingsRow(
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

function renderYoudaoField(
  id: string,
  label: string,
  value: string,
  placeholder: string,
  selected: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const empty = value.length === 0;
  return listRow(
    `${id}-row`,
    selected,
    { height: 3, gap: 1 },
    kit,
    kit.Box(
      {
        id: `${id}-label-box`,
        flexDirection: "column",
        justifyContent: "center",
        width: 27,
        height: 3,
        flexShrink: 0,
        overflow: "hidden",
      },
      kit.Text({
        id: `${id}-label`,
        content: label,
        fg: selected ? theme.foreground : theme.muted,
        attributes: selected ? TEXT_BOLD : undefined,
        height: 1,
        truncate: true,
        wrapMode: "none",
      }),
    ),
    kit.Box(
      {
        id: `${id}-input`,
        border: true,
        borderStyle: "single",
        borderColor: selected ? theme.accent : theme.border,
        flexDirection: "row",
        alignItems: "center",
        paddingX: 1,
        height: 3,
        flexGrow: 1,
        overflow: "hidden",
      },
      kit.Text({
        id: `${id}-value`,
        content: empty ? placeholder : value,
        fg: empty ? theme.muted : theme.foreground,
        height: 1,
        truncate: true,
        wrapMode: "none",
      }),
      kit.Text({
        id: `${id}-cursor`,
        content: selected ? "▌" : "",
        fg: theme.cursor,
        height: 1,
        wrapMode: "none",
      }),
    ),
  );
}

function renderYoudaoAction(
  id: string,
  label: string,
  selected: boolean,
  action: "save" | "clear",
  kit: OpenTuiRendererKit,
): unknown {
  const tone = action === "save" ? theme.accent : theme.danger;
  return listRow(
    `${id}-row`,
    selected,
    { height: 1, gap: 1 },
    kit,
    kit.Text({
      id: `${id}-spacer`,
      content: "",
      width: 27,
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
    }),
    kit.Text({
      id: `${id}-button`,
      content: `[ ${label} ]`,
      fg: selected ? theme.black : tone,
      bg: selected ? tone : undefined,
      attributes: selected ? TEXT_BOLD : undefined,
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
  );
}

export function selectedSettingsMenuIndex(state: OpenTuiAppState, itemCount: number): number {
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

export function settingsHints(view: OpenTuiSettingsView, zh: boolean): KeyHint[] {
  if (view === "code_filters") {
    return [
      { key: "↑↓", label: zh ? "选择" : "select" },
      { key: "Enter/→", label: zh ? "选中" : "toggle" },
      { key: "←", label: zh ? "清除" : "clear" },
      { key: "Ctrl+P", label: zh ? "固定常用" : "pin" },
      { key: "Esc", label: zh ? "返回" : "back" },
    ];
  }
  if (view === "menu") {
    return [
      { key: "↑↓", label: zh ? "选择" : "select" },
      { key: "←→", label: zh ? "调整" : "adjust" },
      { key: "Enter", label: zh ? "打开" : "open" },
      { key: "Esc", label: zh ? "返回" : "back" },
    ];
  }
  if (view === "youdao_tts") {
    return [
      { key: "输入/粘贴", label: zh ? "填当前字段" : "fill field" },
      { key: "↑↓", label: zh ? "切换字段" : "switch field" },
      { key: "Enter", label: zh ? "保存/清除" : "save/clear" },
      { key: "Esc", label: zh ? "返回" : "back" },
    ];
  }
  return [{ key: "Esc", label: zh ? "返回" : "back" }];
}
