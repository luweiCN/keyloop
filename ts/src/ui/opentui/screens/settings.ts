import type { OpenTuiAppState } from "../appModel";
import { openTuiFlatSettingsItems, openTuiRouteTitle, selectedFlatSettingsIndex } from "../appModel";
import { TEXT_BOLD, theme } from "../theme";
import { listRow, sectionLabel } from "../components";
import type { OpenTuiRendererKit } from "../kit";

export function renderSettingsMenuScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  const items = openTuiFlatSettingsItems(state);
  const selectedIndex = selectedFlatSettingsIndex(state, items.length);
  return renderSettingsPanel(items, selectedIndex, kit);
}

export function renderSettingsPanel(
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

export function renderSettingsRows(
  items: ReturnType<typeof openTuiFlatSettingsItems>,
  selectedIndex: number,
  kit: OpenTuiRendererKit,
): unknown[] {
  return items.flatMap((item, index) => [
    ...settingsSectionBeforeItem(item, index, kit),
    renderSettingsRow(item, index, index === selectedIndex, kit),
  ]);
}

export function settingsSectionBeforeItem(
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
