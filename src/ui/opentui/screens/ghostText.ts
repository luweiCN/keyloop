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

export async function renderGhostText(
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

export function renderGhostArticleTranslation(
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
