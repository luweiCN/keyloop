import type { OpenTuiAppState } from "../appModel";
import type {
  Mode,
  PracticeTargetAnnotation,
  PracticeTargetCodeBlock,
} from "../../../domain/model";
import { highlightCodeSyntax } from "../syntaxHighlight";
import {
  ansiTheme,
  isAnsiColorName,
  theme,
  type OpenTuiColorInput,
} from "../theme";
import type { OpenTuiRendererKit } from "../kit";
import { APP_FRAME_WIDTH } from "./appFrame";
import {
  displayWidth,
  truncateToDisplayWidth,
  wrapToDisplayWidth,
} from "./shared";
import { vScrollbar } from "../components";
import { injectUiEvent, WHEEL_DOWN_EVENT, WHEEL_UP_EVENT } from "../uiEventBus";

export const MIN_GHOST_TEXT_WRAP_COLUMNS = 24;

export const GHOST_TEXT_FRAME_RESERVED_COLUMNS = 8;

export const GHOST_TEXT_LINE_NUMBER_COLUMNS = 4;

export type SyntaxKind =
  | "plain"
  | "keyword"
  | "function"
  | "type"
  | "property"
  | "string"
  | "operator";

export interface GhostSegment {
  text: string;
  state: "typed" | "wrong" | "pending" | "cursor";
  syntax: SyntaxKind;
  syntaxFg?: string | null | undefined;
}

export interface GhostVisualRow {
  sourceLineIndex: number;
  continuation: boolean;
  segments: GhostSegment[];
}

export interface GhostWordColumn {
  srcStartCol: number;
  srcEndCol: number;
  translation: string;
  loose?: boolean;
}

export interface GhostWordBlockRow {
  segments: GhostSegment[];
  meaning: string;
}

export interface TargetLineRange {
  start: number;
  end: number;
}

export type GhostCell = Omit<GhostSegment, "text"> & { text: string };

export type HighlightRows = Awaited<ReturnType<typeof highlightCodeSyntax>>;

/** 单个可视行的描述（不含 kit 节点）——渲染与计数共用，保证行数永不漂移。 */
type GhostRowDescriptor =
  | { kind: "line"; sourceLineIndex: number; continuation: boolean; segments: GhostSegment[]; visualIndex: number; hasCursor: boolean }
  | { kind: "meaning"; visualIndex: number; meaning: string }
  | { kind: "translation"; anchorVisualIndex: number; translation: string }
  | { kind: "article_spacer"; rowIndex: number }
  | { kind: "article_line"; rowIndex: number; text: string }
  | { kind: "article_header"; rowIndex: number; text: string };

/** 文章整篇翻译的清洗文本（display=article 的注解），无则 undefined。 */
function articleTranslationText(
  annotations: readonly PracticeTargetAnnotation[] | undefined,
): string | undefined {
  const article = (annotations ?? []).find(
    (annotation) => annotation.display === "article",
  );
  const translation = article?.translation_zh.replace(/\s+/gu, " ").trim();
  return translation === undefined || translation.length === 0 ? undefined : translation;
}

/** 每个 target 源行的起始字符 offset（用于把行映射到所属文章注解） */
function lineStartOffsets(text: string): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}

function articleIndexForOffset(
  offset: number,
  articles: readonly PracticeTargetAnnotation[],
): number {
  return articles.findIndex((article) => offset >= article.start && offset < article.end);
}

/** 换篇分隔行文本：「──── 标题 · 当前/总数 ────」（不依赖语言） */
function articleHeaderText(
  article: PracticeTargetAnnotation,
  current: number,
  total: number,
): string {
  const title = (article.source_title ?? "").trim();
  const label = title.length > 0 ? `${title} · ${current}/${total}` : `${current}/${total}`;
  return `──── ${label} ────`;
}

function pushArticleTranslation(
  plan: GhostRowDescriptor[],
  article: PracticeTargetAnnotation,
  wrapColumns: number,
): void {
  const translation = article.translation_zh.replace(/\s+/gu, " ").trim();
  if (translation.length === 0) {
    return;
  }
  plan.push({ kind: "article_spacer", rowIndex: plan.length });
  for (const line of wrapToDisplayWidth(translation, wrapColumns)) {
    plan.push({ kind: "article_line", rowIndex: plan.length, text: line });
  }
}

/**
 * 同步构建所有可视行描述符（含换行、词块释义、整句翻译）。语法高亮只影响段落颜色、
 * 不影响行数，因此计数时传 undefined 即可。本函数不依赖 kit，可在无渲染器的
 * 完成页直接用于计算可滚动行数。
 */
function buildGhostRowPlan(
  targetText: string,
  inputText: string,
  targetMode: Mode,
  annotations: PracticeTargetAnnotation[] | undefined,
  spaceGlyph: "dot" | undefined,
  syntaxRows: HighlightRows | undefined,
): GhostRowDescriptor[] {
  const wrapColumns = ghostTextWrapColumns(targetMode === "code");
  const wordColumns = ghostWordColumnRows(targetText, annotations);
  const lineTranslations = ghostLineTranslationRows(targetText, annotations);
  const sourceRows = ghostRows(targetText, inputText, syntaxRows, targetMode === "code", {
    spaceDot: spaceGlyph === "dot",
  });
  const plan: GhostRowDescriptor[] = [];
  const segmentsHaveCursor = (segments: GhostSegment[]): boolean =>
    segments.some((segment) => segment.state === "cursor");
  const articleAnnotations = (annotations ?? [])
    .filter((annotation) => annotation.display === "article")
    .slice()
    .sort((left, right) => left.start - right.start);
  const multiArticle = articleAnnotations.length >= 2;
  const lineStarts = multiArticle ? lineStartOffsets(targetText) : [];
  let currentArticle = -1;
  let visualIndex = 0;
  for (let sourceLineIndex = 0; sourceLineIndex < sourceRows.length; sourceLineIndex += 1) {
    const row = sourceRows[sourceLineIndex] ?? [];
    if (multiArticle) {
      const articleIndex = articleIndexForOffset(
        lineStarts[sourceLineIndex] ?? 0,
        articleAnnotations,
      );
      if (articleIndex !== currentArticle) {
        if (currentArticle !== -1) {
          pushArticleTranslation(plan, articleAnnotations[currentArticle]!, wrapColumns);
        }
        if (articleIndex !== -1) {
          plan.push({
            kind: "article_header",
            rowIndex: plan.length,
            text: articleHeaderText(
              articleAnnotations[articleIndex]!,
              articleIndex + 1,
              articleAnnotations.length,
            ),
          });
        }
        currentArticle = articleIndex;
      }
    }
    const columns = wordColumns.get(sourceLineIndex);
    if (columns !== undefined && columns.length > 0) {
      const looseBlock = columns.some((column) => column.loose === true);
      const blockRows = looseBlock
        ? wrapGhostWordBlockLoose(row, columns, wrapColumns)
        : wrapGhostWordBlock(row, columns, wrapColumns);
      for (const blockRow of blockRows) {
        plan.push({
          kind: "line",
          sourceLineIndex,
          continuation: false,
          segments: blockRow.segments,
          visualIndex,
          hasCursor: segmentsHaveCursor(blockRow.segments),
        });
        if (!looseBlock || blockRow.meaning.length > 0) {
          plan.push({ kind: "meaning", visualIndex, meaning: blockRow.meaning });
        }
        visualIndex += 1;
      }
      continue;
    }
    for (const visualRow of wrapGhostRows([row], wrapColumns)) {
      plan.push({
        kind: "line",
        sourceLineIndex,
        continuation: visualRow.continuation,
        segments: visualRow.segments,
        visualIndex,
        hasCursor: segmentsHaveCursor(visualRow.segments),
      });
      visualIndex += 1;
    }
    const translation = lineTranslations.get(sourceLineIndex);
    if (translation !== undefined) {
      plan.push({ kind: "translation", anchorVisualIndex: visualIndex - 1, translation });
    }
  }
  // 文章整篇翻译并入 plan（而非游离 append），这样它参与计数与窗口滚动：
  // 否则文章模式复盘时 maxStart 偏小、翻译滚不到底
  if (multiArticle) {
    // 多篇拼接：收尾最后一篇翻译（每篇标题分隔行已在其正文前插入）
    if (currentArticle !== -1) {
      pushArticleTranslation(plan, articleAnnotations[currentArticle]!, wrapColumns);
    }
  } else {
    const article = articleTranslationText(annotations);
    if (article !== undefined) {
      const articleLines = wrapToDisplayWidth(article, wrapColumns);
      plan.push({ kind: "article_spacer", rowIndex: plan.length });
      for (const line of articleLines) {
        plan.push({ kind: "article_line", rowIndex: plan.length, text: line });
      }
    }
  }
  return plan;
}

function renderGhostRowDescriptor(
  descriptor: GhostRowDescriptor,
  showLineNumbers: boolean,
  wrapColumns: number,
  kit: OpenTuiRendererKit,
): unknown {
  switch (descriptor.kind) {
    case "line":
      return renderGhostVisualLine(
        {
          sourceLineIndex: descriptor.sourceLineIndex,
          continuation: descriptor.continuation,
          segments: descriptor.segments,
        },
        descriptor.visualIndex,
        showLineNumbers,
        kit,
      );
    case "meaning":
      return renderGhostMeaningLine(descriptor.visualIndex, descriptor.meaning, kit);
    case "translation":
      return renderGhostLineTranslation(
        descriptor.anchorVisualIndex,
        descriptor.translation,
        wrapColumns,
        kit,
      );
    case "article_spacer":
      return kit.Box({
        id: `keyloop-ghost-article-spacer-${descriptor.rowIndex}`,
        height: 1,
        width: "100%",
      });
    case "article_line":
      return kit.Text({
        id: `keyloop-ghost-article-translation-${descriptor.rowIndex}`,
        content: descriptor.text,
        fg: theme.muted,
        height: 1,
        truncate: true,
        wrapMode: "none",
      });
    case "article_header":
      return kit.Text({
        id: `keyloop-ghost-article-header-${descriptor.rowIndex}`,
        content: descriptor.text,
        fg: theme.accent,
        height: 1,
        truncate: true,
        wrapMode: "none",
      });
  }
}

/** 跟打区可视总行数（供完成态滚动复盘 clamp 用）。不需要 kit。 */
export function ghostVisualRowCount(
  targetText: string,
  inputText: string,
  targetMode: Mode,
  annotations: PracticeTargetAnnotation[] | undefined,
  spaceGlyph: "dot" | undefined,
): number {
  return buildGhostRowPlan(targetText, inputText, targetMode, annotations, spaceGlyph, undefined)
    .length;
}

export async function renderGhostText(
  targetText: string,
  inputText: string,
  targetMode: Mode,
  source: string,
  codeBlocks: PracticeTargetCodeBlock[] | undefined,
  annotations: PracticeTargetAnnotation[] | undefined,
  kit: OpenTuiRendererKit,
  completedTitle?: string,
  spaceGlyph?: "dot",
  /** 完成态复盘：窗口起始行（用户用滚轮/方向键控制）；undefined 时按光标自动跟随 */
  reviewScroll?: number,
): Promise<unknown> {
  const syntaxRows =
    targetMode === "code"
      ? await highlightCodeSyntax(targetText, { source, blocks: codeBlocks })
      : undefined;
  const showLineNumbers = targetMode === "code";
  const wrapColumns = ghostTextWrapColumns(showLineNumbers);
  const plan = buildGhostRowPlan(
    targetText,
    inputText,
    targetMode,
    annotations,
    spaceGlyph,
    syntaxRows,
  );
  const entries = plan.map((descriptor) => ({
    node: renderGhostRowDescriptor(descriptor, showLineNumbers, wrapColumns, kit),
    hasCursor: descriptor.kind === "line" && descriptor.hasCursor,
  }));
  const completed = completedTitle !== undefined;

  // 视口窗口：长内容只渲染窗口内的行——既把每键渲染成本从 O(全文) 降为 O(视口)，
  // 也实现自动翻页。打字时跟随光标；完成态由 reviewScroll 控制（默认停在底部，
  // 这样刚打完的最后几行可见，再向上滚动复盘）。
  const viewportRows = ghostViewportRows();
  const maxStart =
    Number.isFinite(viewportRows) && entries.length > viewportRows
      ? entries.length - (viewportRows as number)
      : 0;
  let slice: { start: number; end: number };
  if (reviewScroll !== undefined) {
    const start = Math.min(Math.max(Math.round(reviewScroll), 0), maxStart);
    slice = { start, end: Math.min(start + (viewportRows as number), entries.length) };
  } else if (completed && maxStart > 0) {
    slice = { start: maxStart, end: entries.length };
  } else {
    const cursorIndex = entries.findIndex((entry) => entry.hasCursor);
    slice = ghostViewportSlice(entries.length, cursorIndex, viewportRows);
  }
  const children: unknown[] = entries.slice(slice.start, slice.end).map((entry) => entry.node);
  const hiddenAbove = slice.start;
  const hiddenBelow = entries.length - slice.end;
  const clipped = hiddenAbove > 0 || hiddenBelow > 0;
  const progressHint = clipped
    ? ` ↑${hiddenAbove} · ${slice.start + 1}-${slice.end}/${entries.length} 行 · ↓${hiddenBelow} `
    : undefined;
  // 完成态优先显示"本组完成"标题，但若内容被裁剪则改显滚动位置（提示可滚动复盘）
  const bottomTitle = clipped ? progressHint : completed ? ` ${completedTitle} ` : undefined;

  const contentColumn = kit.Box(
    {
      id: "keyloop-ghost-content",
      flexDirection: "column",
      flexGrow: 1,
      // 滚动条贴右边框：内容列只在无滚动条时补右内边距
      paddingLeft: 1,
      paddingRight: clipped ? 0 : 1,
      overflow: "hidden",
    },
    ...children,
  );
  // picker 风格滚动条（实心色块），贴右边框
  const scrollbar = clipped
    ? vScrollbar(
        "keyloop-ghost-scrollbar",
        {
          total: entries.length,
          visible: children.length,
          start: slice.start,
          viewportHeight: children.length,
        },
        kit,
      )
    : undefined;
  // 完成态复盘：鼠标滚轮注入合成事件，与方向键走同一条滚动路径
  const wheelProps =
    reviewScroll !== undefined
      ? {
          onMouseScroll: (event: { scroll?: { direction: string } }) => {
            const direction = event.scroll?.direction;
            if (direction === "up") {
              injectUiEvent(WHEEL_UP_EVENT);
            } else if (direction === "down") {
              injectUiEvent(WHEEL_DOWN_EVENT);
            }
          },
        }
      : {};

  return kit.Box(
    {
      id: "keyloop-ghost-text",
      border: true,
      borderStyle: "rounded",
      borderColor: completed ? theme.accent : targetMode === "code" ? theme.info : theme.border,
      title: targetMode === "code" ? " 代码 " : " 跟打文本 ",
      bottomTitle,
      bottomTitleAlignment: bottomTitle !== undefined ? "right" : undefined,
      backgroundColor: theme.background,
      flexGrow: 1,
      flexDirection: "row",
      overflow: "hidden",
      ...wheelProps,
    },
    contentColumn,
    ...(scrollbar === undefined ? [] : [scrollbar]),
  );
}

/** 跟打区可视行数：按终端高度扣除界面 chrome；非 TTY（测试）不限制 */
export function ghostViewportRows(): number {
  const rows =
    typeof process === "undefined" ? undefined : process.stdout?.rows;
  if (rows === undefined || !Number.isFinite(rows) || rows <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  // 标题/指标面板/训练诊断/快捷键提示/边框等固定占用，保守取 22 行，
  // 宁可视口略小也不能让光标行被 box 裁掉（否则表现为"滚动卡住"）
  return Math.max(rows - 22, 8);
}

/**
 * 纯函数：给定总行数、光标行与视口高度，计算渲染窗口。
 * 光标行固定在窗口顶部第 N 行处，且尾部不做"贴底"截停——
 * 这样无论终端实际能显示多少行（chrome 估算永远不精确），
 * 光标行都在窗口前部、必然可见，最后一行也总能滚上来。
 */
export function ghostViewportSlice(
  totalRows: number,
  cursorIndex: number,
  viewportRows: number,
): { start: number; end: number } {
  if (!Number.isFinite(viewportRows) || totalRows <= viewportRows) {
    return { start: 0, end: totalRows };
  }
  const anchor = cursorIndex < 0 ? 0 : cursorIndex;
  const cursorTopOffset = Math.min(Math.floor(viewportRows * 0.4), 12);
  const start = Math.max(anchor - cursorTopOffset, 0);
  return { start, end: Math.min(start + viewportRows, totalRows) };
}

export function renderGhostVisualLine(
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

export function renderGhostMeaningLine(
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

export function wrapGhostWordBlock(
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

export function wrapGhostWordBlockLoose(
  row: GhostSegment[],
  columns: readonly GhostWordColumn[],
  maxColumns: number,
): GhostWordBlockRow[] {
  const cells = ghostCells(row);
  const items = columns.map((column, index) =>
    ghostLooseWordItem(cells, column, columns[index + 1]),
  );
  const safeMaxColumns = Math.max(1, Math.trunc(maxColumns));
  const blockRows: GhostWordBlockRow[] = [];
  let current: GhostLooseWordItem[] = [];
  let currentWidth = 0;

  for (const item of items) {
    if (ghostLooseWordItemWidth(item) > safeMaxColumns) {
      if (current.length > 0) {
        blockRows.push(ghostLooseWordBlockRow(current, safeMaxColumns));
        current = [];
        currentWidth = 0;
      }
      for (const chunk of splitLooseWordItem(item, safeMaxColumns)) {
        blockRows.push(ghostLooseWordBlockRow([chunk], safeMaxColumns));
      }
      continue;
    }
    const itemWidth = ghostLooseWordItemWidth(item);
    const nextWidth = current.length === 0 ? itemWidth : currentWidth + itemWidth;
    if (current.length > 0 && nextWidth > safeMaxColumns) {
      blockRows.push(ghostLooseWordBlockRow(current, safeMaxColumns));
      current = [item];
      currentWidth = itemWidth;
      continue;
    }
    current.push(item);
    currentWidth = nextWidth;
  }

  if (current.length > 0) {
    blockRows.push(ghostLooseWordBlockRow(current, safeMaxColumns));
  }

  return blockRows;
}

interface GhostLooseWordItem {
  cells: GhostCell[];
  separatorCells: GhostCell[];
  translation: string;
  width: number;
}

function ghostLooseWordItemWidth(item: GhostLooseWordItem): number {
  return item.width + item.separatorCells.length;
}

function ghostLooseWordItem(
  cells: readonly GhostCell[],
  column: GhostWordColumn,
  nextColumn: GhostWordColumn | undefined,
): GhostLooseWordItem {
  const itemCells = cells.slice(column.srcStartCol, column.srcEndCol);
  const separatorCells =
    nextColumn === undefined ? [] : cells.slice(column.srcEndCol, nextColumn.srcStartCol);
  return ghostLooseWordItemFromCells(itemCells, separatorCells, column.translation);
}

function ghostLooseWordItemFromCells(
  itemCells: GhostCell[],
  separatorCells: GhostCell[],
  translation: string,
): GhostLooseWordItem {
  const textWidth = ghostCellTextWidth(itemCells);
  const translationWidth = displayWidth(translation);
  return {
    cells: itemCells,
    separatorCells,
    translation,
    width: Math.max(1, textWidth, translationWidth),
  };
}

function splitLooseWordItem(
  item: GhostLooseWordItem,
  maxColumns: number,
): GhostLooseWordItem[] {
  const safeMaxColumns = Math.max(1, Math.trunc(maxColumns));
  const chunks: GhostLooseWordItem[] = [];
  let start = 0;

  while (start < item.cells.length) {
    const hardEnd = Math.min(start + safeMaxColumns, item.cells.length);
    const split = looseWordItemSplitPoint(item.cells, start, hardEnd);
    const chunkCells = item.cells.slice(start, split.end);
    const separatorCells = split.nextStart >= item.cells.length
      ? item.separatorCells
      : item.cells.slice(split.end, split.nextStart);
    const translation = split.nextStart >= item.cells.length ? item.translation : "";
    chunks.push(ghostLooseWordItemFromCells(chunkCells, separatorCells, translation));
    start = split.nextStart;
  }

  return chunks;
}

function looseWordItemSplitPoint(
  cells: readonly GhostCell[],
  start: number,
  hardEnd: number,
): { end: number; nextStart: number } {
  if (hardEnd >= cells.length) {
    return { end: cells.length, nextStart: cells.length };
  }

  const whitespaceBefore = lastGhostWhitespaceIndex(cells, start, hardEnd);
  if (whitespaceBefore !== undefined) {
    return {
      end: whitespaceBefore,
      nextStart: skipGhostWhitespace(cells, whitespaceBefore),
    };
  }

  const whitespaceAfter = firstGhostWhitespaceIndex(cells, hardEnd);
  if (whitespaceAfter !== undefined) {
    return {
      end: whitespaceAfter,
      nextStart: skipGhostWhitespace(cells, whitespaceAfter),
    };
  }

  return { end: cells.length, nextStart: cells.length };
}

function lastGhostWhitespaceIndex(
  cells: readonly GhostCell[],
  start: number,
  hardEnd: number,
): number | undefined {
  for (let index = hardEnd - 1; index > start; index -= 1) {
    if (isGhostWhitespace(cells[index]?.text)) {
      return index;
    }
  }
  return undefined;
}

function firstGhostWhitespaceIndex(
  cells: readonly GhostCell[],
  start: number,
): number | undefined {
  for (let index = start; index < cells.length; index += 1) {
    if (isGhostWhitespace(cells[index]?.text)) {
      return index;
    }
  }
  return undefined;
}

function skipGhostWhitespace(
  cells: readonly GhostCell[],
  start: number,
): number {
  let index = start;
  while (isGhostWhitespace(cells[index]?.text)) {
    index += 1;
  }
  return index;
}

function ghostCellTextWidth(cells: readonly GhostCell[]): number {
  return displayWidth(cells.map((cell) => cell.text).join(""));
}

function ghostLooseWordBlockRow(
  items: readonly GhostLooseWordItem[],
  maxColumns: number,
): GhostWordBlockRow {
  const out: GhostCell[] = [];
  let meaning = "";
  let colStart = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    out.push(...item.cells);
    const itemTextWidth = ghostCellTextWidth(item.cells);
    const itemWidth = Math.max(1, item.width);
    const padding = Math.max(itemWidth - itemTextWidth, 0);
    for (let pad = 0; pad < padding; pad += 1) {
      out.push({ text: " ", state: "pending", syntax: "plain" });
    }

    const limit = Math.max(Math.min(itemWidth, maxColumns - colStart), 0);
    const translation = truncateToDisplayWidth(item.translation, limit);
    if (translation.length > 0) {
      meaning += " ".repeat(Math.max(colStart - displayWidth(meaning), 0)) + translation;
    }
    const separatorCells = looseSeparatorCellsForRowItem(item, index, items.length);
    out.push(...separatorCells);
    colStart += itemWidth + separatorCells.length;
  }

  return {
    segments: ghostSegmentsFromCells(out),
    meaning,
  };
}

function looseSeparatorCellsForRowItem(
  item: GhostLooseWordItem,
  index: number,
  itemCount: number,
): GhostCell[] {
  if (index < itemCount - 1) {
    return item.separatorCells;
  }
  return item.separatorCells.some((cell) => cell.state !== "pending")
    ? item.separatorCells
    : [];
}

export function ghostWordGroupSegments(
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

export function ghostWordGroupMeaning(
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

export function renderGhostLineTranslation(
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

export function ghostWordColumnRows(
  targetText: string,
  annotations: readonly PracticeTargetAnnotation[] | undefined,
): Map<number, GhostWordColumn[]> {
  const rows = new Map<number, GhostWordColumn[]>();
  if (annotations === undefined || annotations.length === 0) {
    return rows;
  }
  const lineRanges = targetLineRanges(targetText);
  for (const annotation of annotations) {
    const display = annotation.display ?? "line";
    if (display !== "word" && display !== "word_loose") {
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
      ...(display === "word_loose" ? { loose: true } : {}),
    });
    rows.set(sourceLineIndex, existing);
  }
  for (const columns of rows.values()) {
    columns.sort((a, b) => a.srcStartCol - b.srcStartCol);
  }
  return rows;
}

export function ghostLineTranslationRows(
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

export function targetLineRanges(text: string): TargetLineRange[] {
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

export function sourceLineIndexForAnnotation(
  lineRanges: readonly TargetLineRange[],
  annotation: PracticeTargetAnnotation,
): number | undefined {
  const index = lineRanges.findIndex(
    (range) => annotation.start >= range.start && annotation.end <= range.end,
  );
  return index < 0 ? undefined : index;
}

export function ghostRows(
  targetText: string,
  inputText: string,
  highlightedRows: HighlightRows | undefined,
  allowFallbackSyntax = false,
  options: { spaceDot?: boolean } = {},
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
      text: options.spaceDot === true && expected === " " ? "·" : expected,
      state,
      syntax: syntax?.[index] ?? "plain",
      syntaxFg: highlightedFg(highlightedColors, lineIndex, columnIndex),
    });
    columnIndex += 1;
  }
  return rows;
}

export function wrapGhostRows(rows: GhostSegment[][], maxColumns: number): GhostVisualRow[] {
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

export function ghostCells(row: GhostSegment[]): GhostCell[] {
  return row.flatMap((segment) =>
    Array.from(segment.text).map((text) => ({
      text,
      state: segment.state,
      syntax: segment.syntax,
      syntaxFg: segment.syntaxFg,
    })),
  );
}

export function ghostSegmentsFromCells(cells: GhostCell[]): GhostSegment[] {
  const segments: GhostSegment[] = [];
  for (const cell of cells) {
    appendGhostSegment(segments, cell);
  }
  return segments;
}

export function preferredGhostWrapEnd(cells: GhostCell[], start: number, hardEnd: number): number {
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

export function isGhostWhitespace(text: string | undefined): boolean {
  return text === " " || text === "\t";
}

export function isGhostWrapBoundary(text: string | undefined): boolean {
  return text !== undefined && ",;:.)}]}>+-=*/|&?!".includes(text);
}

export function ghostTextWrapColumns(showLineNumbers: boolean): number {
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

export function highlightedRowColors(row: HighlightRows[number]): Array<string | null> {
  return row.flatMap((token) => Array.from(token.text).map(() => token.fg ?? null));
}

export function highlightedFg(
  colors: Array<Array<string | null>> | undefined,
  lineIndex: number,
  columnIndex: number,
): string | null | undefined {
  if (colors === undefined) {
    return undefined;
  }
  return colors[lineIndex]?.[columnIndex] ?? null;
}

export function ghostState(
  expected: string,
  actual: string | undefined,
): GhostSegment["state"] {
  if (actual === undefined) {
    return "pending";
  }
  return actual === expected ? "typed" : "wrong";
}

export function appendGhostSegment(row: GhostSegment[], segment: GhostSegment): void {
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

export function syntaxKinds(text: string): SyntaxKind[] {
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

export function markRegex(kinds: SyntaxKind[], text: string, regex: RegExp, kind: SyntaxKind): void {
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0;
    const matched = match[0] ?? "";
    for (let offset = 0; offset < matched.length; offset += 1) {
      kinds[start + offset] = kind;
    }
  }
}

export function segmentColor(segment: GhostSegment): OpenTuiColorInput | undefined {
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

export function segmentBg(segment: GhostSegment): OpenTuiColorInput | undefined {
  if (segment.state === "wrong") {
    return theme.red;
  }
  return segment.state === "cursor" ? theme.cursor : undefined;
}

export function colorFromSyntaxToken(color: string): OpenTuiColorInput | undefined {
  if (color === "foreground") {
    return theme.foreground;
  }
  return isAnsiColorName(color) ? ansiTheme[color] : color;
}
