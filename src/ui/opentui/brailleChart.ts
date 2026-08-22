export interface BrailleTrendPoint {
  readonly value: number;
  readonly label: string;
}

export type BrailleTrendMode = "braille" | "dots";
export type BrailleTrendTone = "empty" | "line" | "point" | "selected";

export interface BrailleTrendChartOptions {
  readonly width: number;
  readonly height: number;
  readonly selectedIndex?: number;
  readonly mode?: BrailleTrendMode;
}

export interface BrailleTrendRun {
  readonly content: string;
  readonly tone: BrailleTrendTone;
}

export interface BrailleTrendRow {
  readonly label: string;
  readonly runs: readonly BrailleTrendRun[];
}

export interface TerminalBrailleTrendChart {
  readonly rows: readonly BrailleTrendRow[];
  readonly axis: string;
  readonly labels: string;
  readonly min: number;
  readonly max: number;
  readonly selectedIndex: number | null;
}

interface PlotCell {
  char: string;
  tone: BrailleTrendTone;
}

interface SubpixelPoint {
  readonly x: number;
  readonly y: number;
}

const BRAILLE_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
] as const;

export function buildBrailleTrendChart(
  points: readonly BrailleTrendPoint[],
  options: BrailleTrendChartOptions,
): TerminalBrailleTrendChart {
  const width = Math.max(5, Math.trunc(options.width));
  const height = Math.max(3, Math.trunc(options.height));
  const finitePoints = points.filter((point) => Number.isFinite(point.value));
  const values = finitePoints.map((point) => point.value);
  const { min, max, step } = chartBounds(values);
  const selectedIndex = normalizedSelectedIndex(
    options.selectedIndex,
    finitePoints.length,
  );
  const cells = emptyCells(width, height);
  const subpixelPoints = pointPositions(finitePoints, width, height, min, max);

  if ((options.mode ?? "braille") === "braille") {
    paintBrailleLine(cells, subpixelPoints, width, height);
    paintBraillePoints(cells, subpixelPoints, selectedIndex);
  } else {
    paintDotPoints(cells, subpixelPoints, selectedIndex);
  }

  const middleRow = Math.floor((height - 1) / 2);
  const rows = cells.map((row, index) => ({
    label:
      index === 0 || index === middleRow || index === height - 1
        ? formatTick(max - (index / (height - 1)) * (max - min), step)
        : "",
    runs: groupRuns(row),
  }));

  return {
    rows,
    axis: `└${"─".repeat(width)}`,
    labels: pointLabels(finitePoints, subpixelPoints, width),
    min,
    max,
    selectedIndex,
  };
}

function emptyCells(width: number, height: number): PlotCell[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      char: " ",
      tone: "empty" as const,
    })),
  );
}

function normalizedSelectedIndex(
  selectedIndex: number | undefined,
  pointCount: number,
): number | null {
  if (pointCount === 0) {
    return null;
  }
  const candidate = selectedIndex ?? pointCount - 1;
  return Math.max(0, Math.min(pointCount - 1, Math.trunc(candidate)));
}

function pointPositions(
  points: readonly BrailleTrendPoint[],
  width: number,
  height: number,
  min: number,
  max: number,
): SubpixelPoint[] {
  const subpixelWidth = width * 2;
  const subpixelHeight = height * 4;
  return points.map((point, index) => ({
    x:
      points.length === 1
        ? Math.floor((subpixelWidth - 1) / 2)
        : Math.round((index / (points.length - 1)) * (subpixelWidth - 1)),
    y: Math.round(((max - point.value) / (max - min)) * (subpixelHeight - 1)),
  }));
}

function paintBrailleLine(
  cells: PlotCell[][],
  points: readonly SubpixelPoint[],
  width: number,
  height: number,
): void {
  const masks = Array.from({ length: height }, () => new Uint8Array(width));
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) {
      continue;
    }
    const previous = points[index - 1];
    if (previous === undefined) {
      setBrailleDot(masks, point.x, point.y, width, height);
      continue;
    }
    drawSubpixelLine(masks, previous, point, width, height);
  }

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const row = cells[rowIndex];
    const maskRow = masks[rowIndex];
    if (row === undefined || maskRow === undefined) {
      continue;
    }
    for (let column = 0; column < width; column += 1) {
      const mask = maskRow[column] ?? 0;
      const cell = row[column];
      if (mask === 0 || cell === undefined) {
        continue;
      }
      cell.char = String.fromCodePoint(0x2800 + mask);
      cell.tone = "line";
    }
  }
}

function drawSubpixelLine(
  masks: Uint8Array[],
  from: SubpixelPoint,
  to: SubpixelPoint,
  width: number,
  height: number,
): void {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    setBrailleDot(
      masks,
      Math.round(from.x + (to.x - from.x) * progress),
      Math.round(from.y + (to.y - from.y) * progress),
      width,
      height,
    );
  }
}

function setBrailleDot(
  masks: Uint8Array[],
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (x < 0 || y < 0 || x >= width * 2 || y >= height * 4) {
    return;
  }
  const column = Math.floor(x / 2);
  const rowIndex = Math.floor(y / 4);
  const row = masks[rowIndex];
  const bit = BRAILLE_BITS[x % 2]?.[y % 4];
  if (row === undefined || bit === undefined) {
    return;
  }
  row[column] = (row[column] ?? 0) | bit;
}

function paintBraillePoints(
  cells: PlotCell[][],
  points: readonly SubpixelPoint[],
  selectedIndex: number | null,
): void {
  points.forEach((point, index) => {
    paintPointCell(
      cells,
      Math.floor(point.x / 2),
      Math.floor(point.y / 4),
      index === selectedIndex,
    );
  });
}

function paintDotPoints(
  cells: PlotCell[][],
  points: readonly SubpixelPoint[],
  selectedIndex: number | null,
): void {
  points.forEach((point, index) => {
    const row = Math.round(
      (point.y / Math.max(cells.length * 4 - 1, 1)) *
        Math.max(cells.length - 1, 1),
    );
    paintPointCell(
      cells,
      Math.floor(point.x / 2),
      row,
      index === selectedIndex,
    );
  });
}

function paintPointCell(
  cells: PlotCell[][],
  column: number,
  rowIndex: number,
  selected: boolean,
): void {
  const cell = cells[rowIndex]?.[column];
  if (cell === undefined || (cell.tone === "selected" && !selected)) {
    return;
  }
  cell.char = selected ? "◆" : "●";
  cell.tone = selected ? "selected" : "point";
}

function groupRuns(cells: readonly PlotCell[]): BrailleTrendRun[] {
  const runs: Array<{ content: string; tone: BrailleTrendTone }> = [];
  for (const cell of cells) {
    const previous = runs.at(-1);
    if (previous?.tone === cell.tone) {
      previous.content += cell.char;
    } else {
      runs.push({ content: cell.char, tone: cell.tone });
    }
  }
  return runs;
}

function pointLabels(
  points: readonly BrailleTrendPoint[],
  positions: readonly SubpixelPoint[],
  width: number,
): string {
  const cells = Array<string>(width).fill(" ");
  if (points.length === 0) {
    return cells.join("");
  }
  const indexes = [
    ...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  ];
  for (const index of indexes) {
    const position = positions[index];
    const point = points[index];
    if (position === undefined || point === undefined) {
      continue;
    }
    const label = point.label.trim().slice(0, 5) || String(index + 1);
    const idealStart =
      Math.floor(position.x / 2) - Math.floor(label.length / 2);
    const start = Math.max(0, Math.min(width - label.length, idealStart));
    for (let offset = 0; offset < label.length; offset += 1) {
      const character = label[offset];
      if (character !== undefined) {
        cells[start + offset] = character;
      }
    }
  }
  return cells.join("");
}

function chartBounds(values: readonly number[]): {
  min: number;
  max: number;
  step: number;
} {
  if (values.length === 0) {
    return { min: 0, max: 1, step: 0.5 };
  }

  let rawMin = Math.min(...values);
  let rawMax = Math.max(...values);
  if (rawMin === rawMax) {
    const padding = Math.max(1, Math.abs(rawMin) * 0.03);
    rawMin -= padding;
    rawMax += padding;
  }
  const step = niceStep((rawMax - rawMin) / 2);
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  return max === min ? { min, max: min + step, step } : { min, max, step };
}

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function formatTick(value: number, step: number): string {
  if (step >= 1) {
    return Math.round(value).toString();
  }
  const precision = Math.min(2, Math.max(1, Math.ceil(-Math.log10(step))));
  return value.toFixed(precision);
}
