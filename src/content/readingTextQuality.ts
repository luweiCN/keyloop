export type ReadingTextQualityIssue =
  | "blank"
  | "control_characters"
  | "non_english_source_text"
  | "source_residue"
  | "heading_or_caption"
  | "leading_fragment_punctuation"
  | "trailing_fragment_punctuation"
  | "missing_terminal_punctuation"
  | "lowercase_fragment_start"
  | "unbalanced_quotes"
  | "unbalanced_brackets"
  | "too_few_sentences"
  | "sentence_fragment";

const sourceResiduePattern =
  /project gutenberg|gutenberg ebook|transcriber'?s note|table of contents|copyright|all rights reserved|footnote|illustration|library of liberal classics|published by|monograph supplement|academy of sciences|national museum|annals/iu;
const headingPattern =
  /^(?:chapter|section|book|part|volume)\s+(?:[ivxlcdm]+|\d+)\.?$/iu;
const terminalPattern = /[.!?]["')\]]*$/u;
const leadingFragmentPattern = /^[,;:!?)}\]]/u;
const trailingFragmentPattern = /[,;:([{]$/u;
const layoutMarkerPattern = /^(?:=+|-{2,}|_{1,})/u;
const inlineMarkupPattern = /[_=]/u;
const incompleteInitialPattern = /\b[A-Z]\.$/u;
const editorialCreditPattern = /\bit is edited by\b/iu;
const controlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const cjkSourcePattern = /[\p{Script=Han}，。？！；：“”‘’（）【】]/u;

export function isCompleteReadingSentence(text: string): boolean {
  return readingSentenceQualityIssues(text).length === 0;
}

export function readingSentenceQualityIssues(text: string): ReadingTextQualityIssue[] {
  const trimmed = normalizeReadingText(text);
  const issues = baseReadingTextQualityIssues(trimmed);
  if (trimmed.length === 0) {
    return issues;
  }
  if (leadingFragmentPattern.test(trimmed)) {
    issues.push("leading_fragment_punctuation");
  }
  if (trailingFragmentPattern.test(trimmed)) {
    issues.push("trailing_fragment_punctuation");
  }
  if (!terminalPattern.test(trimmed)) {
    issues.push("missing_terminal_punctuation");
  }
  if (startsWithLowercaseWord(trimmed)) {
    issues.push("lowercase_fragment_start");
  }
  if (headingPattern.test(trimmed)) {
    issues.push("heading_or_caption");
  }
  if (
    layoutMarkerPattern.test(trimmed) ||
    inlineMarkupPattern.test(trimmed) ||
    incompleteInitialPattern.test(trimmed) ||
    editorialCreditPattern.test(trimmed)
  ) {
    issues.push("source_residue");
  }
  if (!hasBalancedQuotes(trimmed)) {
    issues.push("unbalanced_quotes");
  }
  if (!hasBalancedBrackets(trimmed)) {
    issues.push("unbalanced_brackets");
  }
  return uniqueIssues(issues);
}

export function isCompleteReadingArticleText(text: string): boolean {
  return readingArticleTextQualityIssues(text).length === 0;
}

export function readingArticleTextQualityIssues(text: string): ReadingTextQualityIssue[] {
  const trimmed = normalizeReadingText(text);
  const issues = baseReadingTextQualityIssues(trimmed);
  if (trimmed.length === 0) {
    return issues;
  }
  if (!hasBalancedQuotes(trimmed)) {
    issues.push("unbalanced_quotes");
  }
  if (!hasBalancedBrackets(trimmed)) {
    issues.push("unbalanced_brackets");
  }
  if (!terminalPattern.test(trimmed)) {
    issues.push("missing_terminal_punctuation");
  }
  if (leadingFragmentPattern.test(trimmed)) {
    issues.push("leading_fragment_punctuation");
  }
  if (trailingFragmentPattern.test(trimmed)) {
    issues.push("trailing_fragment_punctuation");
  }
  if (headingPattern.test(trimmed)) {
    issues.push("heading_or_caption");
  }
  const sentences = splitQualitySentences(trimmed);
  if (sentences.length < 3) {
    issues.push("too_few_sentences");
  }
  if (looksLikeCatalogOrExercise(trimmed)) {
    issues.push("source_residue");
  }
  return uniqueIssues(issues);
}

/**
 * 识别非正文页：售卖单价广告（"$X each" 书目页）、编号习题/讨论清单（≥3 个 "N. " 编号项）、
 * 或推荐书单（≥2 个 "书名," by 作者 条目）。锚定售卖语境而非货币符号本身，
 * 避免误伤叙事文中的普通金额（如税收数字 $9,000,000 a year）。
 */
function looksLikeCatalogOrExercise(text: string): boolean {
  if (/\$\s?[\d,.]+\s+each\b/iu.test(text)) {
    return true;
  }
  const numberedItems = (text.match(/\b\d+\.\s/gu) ?? []).length;
  const bylineEntries = (text.match(/"[^"]+,"\s+by\s+[A-Z]/gu) ?? []).length;
  return numberedItems >= 3 || bylineEntries >= 2;
}

function baseReadingTextQualityIssues(text: string): ReadingTextQualityIssue[] {
  const issues: ReadingTextQualityIssue[] = [];
  if (text.length === 0) {
    issues.push("blank");
  }
  if (controlCharacterPattern.test(text)) {
    issues.push("control_characters");
  }
  if (cjkSourcePattern.test(text)) {
    issues.push("non_english_source_text");
  }
  if (sourceResiduePattern.test(text)) {
    issues.push("source_residue");
  }
  return issues;
}

function normalizeReadingText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function startsWithLowercaseWord(text: string): boolean {
  const firstWord = text.replace(/^["'([{]+/u, "").trimStart().match(/[A-Za-z]+/u)?.[0];
  return firstWord !== undefined && /^[a-z]/u.test(firstWord);
}

function hasBalancedQuotes(text: string): boolean {
  return countMatches(text, /"/gu) % 2 === 0 &&
    countMatches(text, /“/gu) === countMatches(text, /”/gu);
}

function hasBalancedBrackets(text: string): boolean {
  const stack: string[] = [];
  const pairs = new Map([
    [")", "("],
    ["]", "["],
    ["}", "{"],
  ]);
  for (const char of text) {
    if (char === "(" || char === "[" || char === "{") {
      stack.push(char);
      continue;
    }
    const expected = pairs.get(char);
    if (expected === undefined) {
      continue;
    }
    if (stack.pop() !== expected) {
      return false;
    }
  }
  return stack.length === 0;
}

function splitQualitySentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?:["')\]]+)?/gu)
    ?.map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0) ?? [];
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function uniqueIssues(issues: readonly ReadingTextQualityIssue[]): ReadingTextQualityIssue[] {
  return [...new Set(issues)];
}
