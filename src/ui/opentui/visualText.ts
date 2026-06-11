import { charDisplayWidth, displayWidth } from "./screens/shared";

/**
 * 带偏移跟踪的视觉行分解：词边界换行（超宽词/CJK 串按显示宽度硬切），
 * 渲染与光标移动共用同一份分解结果，保证"虚拟行"语义一致。
 */
export interface VisualLine {
  content: string;
  /** 在原文本中的起始偏移（UTF-16 code unit） */
  start: number;
  /** 内容结束偏移（不含换行符与被消耗的分隔空格） */
  end: number;
  logicalLine: number;
  /** 是否为所在逻辑行的最后一个视觉行（用于 ⏎ 标记） */
  isLogicalEnd: boolean;
}

export function visualizeText(text: string, maxWidth: number): VisualLine[] {
  const safeWidth = Math.max(1, Math.trunc(maxWidth));
  const result: VisualLine[] = [];
  let offset = 0;
  const logicalLines = text.split("\n");
  for (let logical = 0; logical < logicalLines.length; logical += 1) {
    const line = logicalLines[logical] ?? "";
    const segments = visualizeLogicalLine(line, safeWidth, offset, logical);
    result.push(...segments);
    offset += line.length + 1; // 跳过换行符
  }
  return result;
}

function visualizeLogicalLine(
  line: string,
  safeWidth: number,
  base: number,
  logical: number,
): VisualLine[] {
  const segments: { content: string; start: number; end: number }[] = [];
  let content = "";
  let width = 0;
  let segmentStart = 0;
  const flush = (endIndex: number): void => {
    // 行尾分隔空格不渲染也不参与光标定位
    const trimmed = content.replace(/ +$/u, "");
    const removed = content.length - trimmed.length;
    segments.push({ content: trimmed, start: segmentStart, end: endIndex - removed });
    content = "";
    width = 0;
  };
  let index = 0;
  while (index < line.length) {
    if (line[index] === " ") {
      if (width + 1 > safeWidth) {
        // 行宽用尽：分隔空格被消耗，不进下一行
        flush(index);
        index += 1;
        segmentStart = index;
        continue;
      }
      content += " ";
      width += 1;
      index += 1;
      continue;
    }
    // 读取一个词（非空格连续段）
    let wordEnd = index;
    while (wordEnd < line.length && line[wordEnd] !== " ") {
      wordEnd += 1;
    }
    const word = line.slice(index, wordEnd);
    const wordWidth = displayWidth(word);
    if (width + wordWidth <= safeWidth) {
      content += word;
      width += wordWidth;
      index = wordEnd;
      continue;
    }
    if (wordWidth <= safeWidth) {
      // 整词放不下：换行（行尾空格保留在上一行）
      flush(index);
      segmentStart = index;
      content = word;
      width = wordWidth;
      index = wordEnd;
      continue;
    }
    // 超宽词/CJK 串：按字符硬切填满当前行
    let charIndex = index;
    while (charIndex < wordEnd) {
      const codePoint = line.codePointAt(charIndex) ?? 0;
      const char = String.fromCodePoint(codePoint);
      const charWidth = charDisplayWidth(char);
      if (width + charWidth > safeWidth) {
        flush(charIndex);
        segmentStart = charIndex;
      }
      content += char;
      width += charWidth;
      charIndex += char.length;
    }
    index = wordEnd;
  }
  flush(line.length);
  // 行尾分隔空格修剪：内容尾随空格保留与否不影响 offset 语义，这里保留原样
  return segments.map((segment, segmentIndex) => ({
    content: segment.content,
    start: base + segment.start,
    end: base + segment.end,
    logicalLine: logical,
    isLogicalEnd: segmentIndex === segments.length - 1,
  }));
}

export interface CursorVisualPosition {
  line: number;
  /** 行内 code unit 偏移 */
  column: number;
  /** 行内显示列宽（用于跨行保持列位置） */
  displayColumn: number;
}

export function cursorVisualPosition(
  text: string,
  maxWidth: number,
  cursor: number,
): CursorVisualPosition {
  const lines = visualizeText(text, maxWidth);
  const clamped = Math.min(Math.max(cursor, 0), text.length);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const isLast = index === lines.length - 1;
    // 行尾 == 光标时归本行（光标显示在行尾）；落在被消耗区间（分隔空格/换行符）归下一行行首
    if (clamped <= line.end || isLast) {
      if (clamped < line.start) {
        return { line: index, column: 0, displayColumn: 0 };
      }
      const column = Math.min(clamped - line.start, line.content.length);
      return {
        line: index,
        column,
        displayColumn: displayWidth(line.content.slice(0, column)),
      };
    }
  }
  return { line: 0, column: 0, displayColumn: 0 };
}

/** 目标视觉行内与给定显示列最接近的文本偏移 */
export function offsetAtDisplayColumn(line: VisualLine, displayColumn: number): number {
  let width = 0;
  let offset = 0;
  for (const char of line.content) {
    const charWidth = charDisplayWidth(char);
    if (width + charWidth > displayColumn) {
      break;
    }
    width += charWidth;
    offset += char.length;
  }
  return line.start + offset;
}
