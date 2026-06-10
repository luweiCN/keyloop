import type { OpenTuiRendererKit } from "./renderer";
import { TEXT_BOLD, theme, toneColor, type OpenTuiColorInput, type Tone } from "./theme";

type BoxProps = Record<string, unknown>;

export interface KeyHint {
  readonly key: string;
  readonly label: string;
}

/**
 * Bottom shortcut bar shared by every screen: `↑↓ 选择 · Enter 确认 · Esc 返回`.
 * Keys render bold in the accent color, labels muted, separators dim.
 */
export function keyHintBar(id: string, hints: readonly KeyHint[], kit: OpenTuiRendererKit): unknown {
  return kit.Box(
    {
      id,
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    ...hints.flatMap((hint, index) => [
      ...(index === 0
        ? []
        : [
            kit.Text({
              id: `${id}-separator-${index - 1}`,
              content: "·",
              fg: theme.border,
              height: 1,
              wrapMode: "none",
            }),
          ]),
      kit.Text({
        id: `${id}-key-${index}`,
        content: hint.key,
        fg: theme.accent,
        attributes: TEXT_BOLD,
        height: 1,
        wrapMode: "none",
      }),
      kit.Text({
        id: `${id}-label-${index}`,
        content: hint.label,
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
      }),
    ]),
  );
}

export interface PanelOptions {
  readonly title?: string;
  readonly borderColor?: OpenTuiColorInput;
  readonly bottomTitle?: string;
  readonly height?: number | string;
  readonly width?: number | string;
  readonly flexGrow?: number;
  readonly gap?: number;
  readonly paddingX?: number;
  readonly flexDirection?: "row" | "column";
  readonly alignItems?: string;
  readonly overflow?: string;
}

/** Rounded panel — the single bordered container style used across the app. */
export function panel(
  id: string,
  options: PanelOptions,
  kit: OpenTuiRendererKit,
  ...children: unknown[]
): unknown {
  const props: BoxProps = {
    id,
    border: true,
    borderStyle: "rounded",
    borderColor: options.borderColor ?? theme.border,
    title: options.title === undefined ? undefined : ` ${options.title} `,
    bottomTitle: options.bottomTitle === undefined ? undefined : ` ${options.bottomTitle} `,
    bottomTitleAlignment: options.bottomTitle === undefined ? undefined : "right",
    paddingX: options.paddingX ?? 1,
    flexDirection: options.flexDirection ?? "column",
    alignItems: options.alignItems,
    gap: options.gap ?? 0,
    height: options.height,
    width: options.width,
    flexGrow: options.flexGrow,
    overflow: options.overflow ?? "hidden",
  };
  return kit.Box(props, ...children);
}

export interface ModalOptions {
  readonly title: string;
  readonly tone?: Tone;
  readonly bottomTitle?: string;
}

/** Centered dialog body — double border in the tone color over the app background. */
export function modal(
  id: string,
  options: ModalOptions,
  kit: OpenTuiRendererKit,
  ...children: unknown[]
): unknown {
  return kit.Box(
    {
      id,
      border: true,
      borderStyle: "double",
      borderColor: toneColor(options.tone ?? "info"),
      backgroundColor: theme.background,
      title: ` ${options.title} `,
      bottomTitle: options.bottomTitle === undefined ? undefined : ` ${options.bottomTitle} `,
      bottomTitleAlignment: options.bottomTitle === undefined ? undefined : "right",
      padding: 1,
      flexDirection: "column",
      gap: 1,
      width: "100%",
      maxHeight: "100%",
      overflow: "hidden",
    },
    ...children,
  );
}

export interface ListRowOptions {
  readonly height?: number;
  readonly gap?: number;
}

/**
 * Selection row shared by menus, settings, and option pickers: a `▌` accent
 * rail marks the selected row so every list reads the same way.
 */
export function listRow(
  id: string,
  selected: boolean,
  options: ListRowOptions,
  kit: OpenTuiRendererKit,
  ...children: unknown[]
): unknown {
  const height = options.height ?? 1;
  return kit.Box(
    {
      id,
      flexDirection: "row",
      alignItems: "center",
      gap: options.gap ?? 1,
      width: "100%",
      height,
      flexShrink: 0,
      overflow: "hidden",
    },
    kit.Box(
      {
        id: `${id}-rail`,
        flexDirection: "column",
        width: 1,
        height,
        flexShrink: 0,
        overflow: "hidden",
      },
      ...Array.from({ length: height }, (_, line) =>
        kit.Text({
          id: `${id}-rail-${line}`,
          content: selected ? "▌" : " ",
          fg: theme.accent,
          height: 1,
          wrapMode: "none",
        }),
      ),
    ),
    ...children,
  );
}

export interface MeterBarOptions {
  readonly tone?: Tone;
  readonly showPercent?: boolean;
}

/** Character progress meter: `█████░░░░░ 42%`. */
export function meterBar(
  id: string,
  percent: number,
  width: number,
  kit: OpenTuiRendererKit,
  options: MeterBarOptions = {},
): unknown {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);
  return kit.Box(
    {
      id,
      flexDirection: "row",
      alignItems: "center",
      height: 1,
      flexShrink: 0,
      overflow: "hidden",
    },
    kit.Text({
      id: `${id}-fill`,
      content: "█".repeat(filled),
      fg: toneColor(options.tone ?? "good"),
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: `${id}-track`,
      content: "░".repeat(Math.max(width - filled, 0)),
      fg: theme.muted,
      height: 1,
      wrapMode: "none",
    }),
    ...(options.showPercent === false
      ? []
      : [
          kit.Text({
            id: `${id}-percent`,
            content: ` ${clamped}%`,
            fg: theme.muted,
            height: 1,
            wrapMode: "none",
          }),
        ]),
  );
}

export interface BadgeOptions {
  readonly tone?: Tone;
  readonly variant?: "solid" | "soft";
}

/** Small tag: solid renders inverse (` tag ` on tone bg), soft renders tinted text. */
export function badge(
  id: string,
  label: string,
  kit: OpenTuiRendererKit,
  options: BadgeOptions = {},
): unknown {
  const tone = toneColor(options.tone ?? "info");
  if (options.variant === "solid") {
    return kit.Text({
      id,
      content: ` ${label} `,
      fg: theme.black,
      bg: tone,
      attributes: TEXT_BOLD,
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
    });
  }
  return kit.Text({
    id,
    content: `‹${label}›`,
    fg: tone,
    height: 1,
    flexShrink: 0,
    wrapMode: "none",
  });
}

/** Label-over-value stat block used on completion and live metrics. */
export function statCell(
  id: string,
  label: string,
  value: string,
  tone: Tone,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id,
      flexDirection: "column",
      gap: 0,
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,
      overflow: "hidden",
    },
    kit.Text({
      id: `${id}-label`,
      content: label,
      fg: theme.muted,
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
    kit.Text({
      id: `${id}-value`,
      content: value,
      fg: toneColor(tone),
      attributes: TEXT_BOLD,
      height: 1,
      truncate: true,
      wrapMode: "none",
    }),
  );
}

/** Centered placeholder for screens without data yet. */
export function emptyState(
  id: string,
  icon: string,
  title: string,
  hint: string,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 1,
      width: "100%",
      flexGrow: 1,
      overflow: "hidden",
    },
    kit.Text({
      id: `${id}-icon`,
      content: icon,
      fg: theme.accent,
      attributes: TEXT_BOLD,
      wrapMode: "none",
    }),
    kit.Text({
      id: `${id}-title`,
      content: title,
      fg: theme.foreground,
      attributes: TEXT_BOLD,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: `${id}-hint`,
      content: hint,
      fg: theme.muted,
      height: 1,
      wrapMode: "none",
    }),
  );
}

export interface ScrollbarMetrics {
  readonly total: number;
  readonly visible: number;
  readonly start: number;
  readonly viewportHeight: number;
  readonly minThumbHeight?: number;
}

/** Vertical scrollbar shared by every scrolling list. Renders empty when nothing overflows. */
export function vScrollbar(id: string, metrics: ScrollbarMetrics, kit: OpenTuiRendererKit): unknown {
  if (metrics.total <= metrics.visible || metrics.visible <= 0) {
    return kit.Box({ id, width: 1, height: "100%" });
  }
  const thumbHeight = Math.max(
    metrics.minThumbHeight ?? 1,
    Math.floor((metrics.visible / metrics.total) * metrics.viewportHeight),
  );
  const scrollRange = Math.max(metrics.total - metrics.visible, 1);
  const thumbTravel = Math.max(metrics.viewportHeight - thumbHeight, 0);
  const thumbTop = Math.min(thumbTravel, Math.floor((metrics.start / scrollRange) * thumbTravel));
  const bottomHeight = Math.max(metrics.viewportHeight - thumbTop - thumbHeight, 0);
  return kit.Box(
    {
      id,
      flexDirection: "column",
      width: 1,
      height: "100%",
      flexShrink: 0,
      backgroundColor: theme.border,
      overflow: "hidden",
    },
    ...(thumbTop > 0 ? [kit.Box({ id: `${id}-before`, width: 1, flexGrow: thumbTop })] : []),
    kit.Box({
      id: `${id}-thumb`,
      width: 1,
      minHeight: 1,
      flexGrow: thumbHeight,
      backgroundColor: theme.accent,
    }),
    ...(bottomHeight > 0 ? [kit.Box({ id: `${id}-after`, width: 1, flexGrow: bottomHeight })] : []),
  );
}

/** Thin horizontal rule. */
export function divider(id: string, kit: OpenTuiRendererKit): unknown {
  return kit.Box({
    id,
    border: ["top"],
    borderStyle: "single",
    borderColor: theme.border,
    width: "100%",
    height: 1,
    flexShrink: 0,
  });
}

/** Section heading inside lists: `── label ──`. */
export function sectionLabel(id: string, label: string, kit: OpenTuiRendererKit): unknown {
  return kit.Box(
    {
      id,
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      width: "100%",
      height: 1,
      flexShrink: 0,
      overflow: "hidden",
    },
    kit.Text({
      id: `${id}-prefix`,
      content: "──",
      fg: theme.border,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: `${id}-label`,
      content: label,
      fg: theme.info,
      attributes: TEXT_BOLD,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: `${id}-rule`,
      content: "──",
      fg: theme.border,
      height: 1,
      wrapMode: "none",
    }),
  );
}

/** Tab strip for multi-view screens (stats): active view inverse, others muted. */
export function tabStrip(
  id: string,
  tabs: readonly { id: string; label: string; active: boolean }[],
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id,
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    ...tabs.map((tab) =>
      kit.Text({
        id: `${id}-tab-${tab.id}`,
        content: ` ${tab.label} `,
        fg: tab.active ? theme.black : theme.muted,
        bg: tab.active ? theme.accent : undefined,
        attributes: tab.active ? TEXT_BOLD : undefined,
        height: 1,
        wrapMode: "none",
      }),
    ),
  );
}
