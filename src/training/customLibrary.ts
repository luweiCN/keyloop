export interface CustomWord {
  id: string;
  text: string;
  kind: "word" | "phrase";
  meaning_zh?: string;
  phonetic?: string;
  source: "dict" | "manual";
}

export interface CustomSentence {
  id: string;
  text: string;
  translation_zh?: string;
}

export interface CustomArticleParagraph {
  text: string;
  translation_zh?: string;
}

export interface CustomArticle {
  id: string;
  title: string;
  paragraphs: CustomArticleParagraph[];
}

export interface CustomLibrary {
  version: 1;
  slug: string;
  name: string;
  created_at: string;
  words: CustomWord[];
  sentences: CustomSentence[];
  articles: CustomArticle[];
}

export function librarySlugFromName(name: string, existing: readonly string[]): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  const base = ascii === "" ? "lib" : ascii;
  if (!existing.includes(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function createCustomLibrary(
  name: string,
  existingSlugs: readonly string[],
  options: { now?: Date } = {},
): CustomLibrary {
  return {
    version: 1,
    slug: librarySlugFromName(name, existingSlugs),
    name: name.trim(),
    created_at: (options.now ?? new Date()).toISOString(),
    words: [],
    sentences: [],
    articles: [],
  };
}

export interface ParsedWordLine {
  text: string;
  kind: "word" | "phrase";
  meaning_zh?: string;
}

export interface WordLineError {
  line: number;
  raw: string;
  reason: "non_ascii";
}

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/u;

export function parseWordLines(input: string): {
  entries: ParsedWordLine[];
  errors: WordLineError[];
} {
  const entries: ParsedWordLine[] = [];
  const errors: WordLineError[] = [];
  const lines = input.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "") {
      continue;
    }
    const colonIndex = colonSplitIndex(trimmed);
    const text = (colonIndex === -1 ? trimmed : trimmed.slice(0, colonIndex)).trim();
    const meaning = colonIndex === -1 ? undefined : trimmed.slice(colonIndex + 1).trim();
    if (text === "" || !PRINTABLE_ASCII.test(text)) {
      errors.push({ line: index + 1, raw: trimmed, reason: "non_ascii" });
      continue;
    }
    entries.push({
      text,
      kind: text.includes(" ") ? "phrase" : "word",
      ...(meaning === undefined || meaning === "" ? {} : { meaning_zh: meaning }),
    });
  }
  return { entries, errors };
}

function colonSplitIndex(line: string): number {
  const half = line.indexOf(":");
  const full = line.indexOf("：");
  if (half === -1) return full;
  if (full === -1) return half;
  return Math.min(half, full);
}

function splitBlocks(input: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const rawLine of input.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push(current);
  }
  return blocks;
}

export function parseSentenceBlocks(
  input: string,
): { text: string; translation_zh?: string }[] {
  return splitBlocks(input).map((block) => {
    const [first, ...rest] = block;
    const translation = rest.join("\n");
    return {
      text: first ?? "",
      ...(translation === "" ? {} : { translation_zh: translation }),
    };
  });
}

export interface ParsedArticlePaste {
  paragraphs: CustomArticleParagraph[];
  warnings: string[];
}

export function parseArticlePaste(input: string): ParsedArticlePaste {
  const blocks = splitBlocks(input);
  const warnings: string[] = [];
  if (blocks.length === 0) {
    return { paragraphs: [], warnings };
  }
  const english = blocks[0] ?? [];
  const chinese = blocks.length > 1 ? (blocks[1] ?? []) : [];
  if (blocks.length > 2) {
    warnings.push(`检测到 ${blocks.length} 个空行分块，仅使用前两块（英文/中文）`);
  }
  if (chinese.length > 0 && chinese.length !== english.length) {
    warnings.push(`英文 ${english.length} 段、翻译 ${chinese.length} 行，数量不一致`);
  }
  const paragraphs = english.map((text, index) => {
    const translation = chinese[index];
    return {
      text,
      ...(translation === undefined ? {} : { translation_zh: translation }),
    };
  });
  return { paragraphs, warnings };
}
