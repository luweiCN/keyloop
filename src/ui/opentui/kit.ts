import type { OpenTuiAppState } from "./appModel";
import {
  isAnsiThemeColor,
  isDefaultBackgroundColor,
  isDefaultForegroundColor,
  type OpenTuiColorInput,
} from "./theme";

export type OpenTuiCoreModule = typeof import("@opentui/core");

export type OpenTuiBoxProps = Record<string, unknown>;

export type OpenTuiTextProps = Record<string, unknown> & {
  content: string;
  fg?: OpenTuiColorInput | undefined;
  bg?: OpenTuiColorInput | undefined;
};

export const colorPropNames = new Set([
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
    getRenderable?(id: string): unknown;
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

export function definedProps(props: OpenTuiBoxProps): OpenTuiBoxProps {
  return Object.fromEntries(
    Object.entries(props).filter((entry): entry is [string, unknown] => entry[1] !== undefined),
  );
}

export function resolveColorProps(props: OpenTuiBoxProps, core: OpenTuiCoreModule): OpenTuiBoxProps {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      colorPropNames.has(key) ? resolveColorValue(value, core) : value,
    ]),
  );
}

export function resolveColorValue(value: unknown, core: OpenTuiCoreModule): unknown {
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
