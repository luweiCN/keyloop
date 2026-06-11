import type { OpenTuiRendererKit } from "../kit";
import { theme, type OpenTuiColorInput } from "../theme";
import { vScrollbar } from "../components";
import { cursorVisualPosition, visualizeText, type VisualLine } from "../visualText";

/**
 * 统一文本面板：详情查看、详情编辑、内容录入共用。
 * - 词边界软换行（与光标视觉行移动同一分解）
 * - 视窗滚动：编辑态跟随光标行；查看态由 scroll 控制
 * - 右侧贴边、满高滚动条
 */
export interface TextPaneBlock {
  text: string;
  fg: OpenTuiColorInput;
}

export type TextPaneMode =
  | { kind: "view"; blocks: TextPaneBlock[]; scroll: number }
  | { kind: "edit"; text: string; cursor: number };

export interface TextPaneOptions {
  id: string;
  /** 面板总宽（列）；内容宽 = width - 2（滚动条与间隙） */
  width: number;
  /** 可视行数 */
  height: number;
  mode: TextPaneMode;
  /** 逻辑行末尾显示 ⏎（编辑/录入态） */
  markNewlines?: boolean;
}

interface PaneLine {
  content: string;
  fg: OpenTuiColorInput;
}

export function textPaneContentWidth(totalWidth: number): number {
  return Math.max(10, totalWidth - 2);
}

export function renderTextPane(options: TextPaneOptions, kit: OpenTuiRendererKit): unknown {
  const contentWidth = textPaneContentWidth(options.width);
  const height = Math.max(1, options.height);
  const lines: PaneLine[] = [];
  let cursorVisualLine = 0;

  if (options.mode.kind === "view") {
    for (const block of options.mode.blocks) {
      for (const visual of visualizeText(block.text, contentWidth)) {
        lines.push({ content: decorate(visual, options.markNewlines === true), fg: block.fg });
      }
    }
  } else {
    const { text, cursor } = options.mode;
    const position = cursorVisualPosition(text, contentWidth, cursor);
    const visuals = visualizeText(text, contentWidth);
    for (let index = 0; index < visuals.length; index += 1) {
      const visual = visuals[index]!;
      let content = visual.content;
      if (index === position.line) {
        cursorVisualLine = lines.length;
        content = `${content.slice(0, position.column)}▏${content.slice(position.column)}`;
      }
      lines.push({
        content:
          options.markNewlines === true && visual.isLogicalEnd && index < visuals.length - 1
            ? `${content} ⏎`
            : content,
        fg: theme.foreground,
      });
    }
  }

  const total = lines.length;
  const start =
    options.mode.kind === "edit"
      ? clampStart(cursorVisualLine - Math.floor(height / 2), total, height)
      : clampStart(options.mode.scroll, total, height);
  const visible = lines.slice(start, start + height);
  while (visible.length < height) {
    visible.push({ content: "", fg: theme.muted });
  }

  return kit.Box(
    {
      id: options.id,
      flexDirection: "row",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      overflow: "hidden",
      gap: 1,
    },
    kit.Box(
      {
        id: `${options.id}-lines`,
        flexDirection: "column",
        flexGrow: 1,
        height: "100%",
        overflow: "hidden",
      },
      ...visible.map((line, index) =>
        kit.Text({
          id: `${options.id}-line-${index}`,
          content: line.content,
          fg: line.fg,
          height: 1,
          wrapMode: "none",
        }),
      ),
    ),
    vScrollbar(
      `${options.id}-scrollbar`,
      { total, visible: height, start, viewportHeight: height },
      kit,
    ),
  );
}

/** 查看态滚动的上限（供 reducer clamp） */
export function textPaneMaxScroll(
  blocks: TextPaneBlock[],
  totalWidth: number,
  height: number,
): number {
  const contentWidth = textPaneContentWidth(totalWidth);
  let total = 0;
  for (const block of blocks) {
    total += visualizeText(block.text, contentWidth).length;
  }
  return Math.max(0, total - Math.max(1, height));
}

function clampStart(start: number, total: number, height: number): number {
  return Math.max(0, Math.min(start, total - height));
}

function decorate(visual: VisualLine, markNewlines: boolean): string {
  return markNewlines && visual.isLogicalEnd ? `${visual.content}` : visual.content;
}
