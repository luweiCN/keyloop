import type { OpenTuiAppState } from "../appModel";
import { openTuiRouteTitle } from "../appModel";
import {
  ansiTheme,
  isAnsiThemeColor,
  isDefaultBackgroundColor,
  isDefaultForegroundColor,
  theme,
  type AnsiColorName,
  type OpenTuiColorInput,
} from "../theme";
import type { OpenTuiRendererKit } from "../kit";

export const ansiPaletteColors = [
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

export const keyloopSemanticColors = [
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

export function renderAnsiPaletteScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
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

export function renderAnsiPaletteColorRow(color: AnsiColorName, kit: OpenTuiRendererKit): unknown {
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

export function renderSemanticColorRow(
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

export function colorLabel(color: OpenTuiColorInput): string {
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
