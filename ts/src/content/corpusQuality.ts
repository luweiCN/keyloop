export type CorpusQualityStatus = "accept" | "review" | "reject";

export type CorpusQualityFlag =
  | "empty_text"
  | "comment_only"
  | "license_header"
  | "license_only"
  | "doc_comment"
  | "import_only"
  | "placeholder_only"
  | "prose_only"
  | "no_code_signal"
  | "high_comment_ratio"
  | "doc_marker"
  | "comment_fragment"
  | "unbalanced_delimiters"
  | "syntax_fragment"
  | "line_count_mismatch"
  | "char_count_mismatch"
  | "size_mismatch"
  | "very_long_line"
  | "minified_line";

export interface CorpusQualityInput {
  text?: unknown;
  level?: unknown;
  size?: unknown;
  line_count?: unknown;
  char_count?: unknown;
}

export interface CorpusQualityMetrics {
  lineCount: number;
  charCount: number;
  nonEmptyLineCount: number;
  commentLineCount: number;
  importLineCount: number;
  placeholderLineCount: number;
  codeLineCount: number;
  strongCodeLineCount: number;
  maxLineLength: number;
  commentRatio: number;
  codeSignalRatio: number;
}

export interface CorpusQualityResult {
  status: CorpusQualityStatus;
  flags: CorpusQualityFlag[];
  metrics: CorpusQualityMetrics;
}

interface CorpusLineClassification {
  text: string;
  trimmed: string;
  isComment: boolean;
  isImport: boolean;
  isImportDelimiter: boolean;
  isImportBlockValue: boolean;
  isPlaceholder: boolean;
  hasStrongCodeSignal: boolean;
  hasCodeSignal: boolean;
}

const rejectingFlags = new Set<CorpusQualityFlag>([
  "empty_text",
  "comment_only",
  "license_header",
  "license_only",
  "doc_comment",
  "import_only",
  "placeholder_only",
  "prose_only",
  "no_code_signal",
  "high_comment_ratio",
  "doc_marker",
  "comment_fragment",
  "unbalanced_delimiters",
  "syntax_fragment",
  "minified_line",
]);

const sizeLineLimits = {
  block: {
    short: [3, 8],
    medium: [8, 16],
    long: [15, 28],
  },
  function: {
    short: [6, 16],
    medium: [14, 32],
    long: [28, 50],
  },
  file: {
    short: [20, 60],
    medium: [40, 100],
    long: [80, 160],
  },
} as const;

const sizeCharLimits = {
  block: {
    short: [100, 350],
    medium: [350, 700],
    long: [700, 1100],
  },
  function: {
    short: [250, 550],
    medium: [550, 900],
    long: [900, 1300],
  },
  file: {
    short: [800, 1200],
    medium: [1200, 1700],
    long: [1700, 2500],
  },
} as const;

export function assessCorpusTextQuality(
  input: CorpusQualityInput,
): CorpusQualityResult {
  const text = typeof input.text === "string" ? input.text : "";
  const classifiedLines = classifyCorpusLines(text);
  const nonEmptyLines = classifiedLines.filter((line) => line.trimmed.length > 0);
  const metrics = corpusQualityMetrics(text);
  const flags: CorpusQualityFlag[] = [];

  const addFlag = (flag: CorpusQualityFlag): void => {
    if (!flags.includes(flag)) {
      flags.push(flag);
    }
  };

  if (text.trim().length === 0) {
    addFlag("empty_text");
  }

  if (nonEmptyLines.length > 0 && nonEmptyLines.every((line) => line.isComment)) {
    addFlag("comment_only");
  }
  if (containsLicenseHeader(text)) {
    addFlag("license_header");
  }
  if (looksLicenseOnly(text, nonEmptyLines)) {
    addFlag("license_only");
  }
  if (containsDocComment(nonEmptyLines)) {
    addFlag("doc_comment");
  }
  if (isImportOnly(nonEmptyLines)) {
    addFlag("import_only");
  }
  if (isPlaceholderOnly(nonEmptyLines)) {
    addFlag("placeholder_only");
  }
  if (isProseOnly(text, metrics)) {
    addFlag("prose_only");
  }
  if (metrics.codeLineCount === 0 && nonEmptyLines.length > 0) {
    addFlag("no_code_signal");
  }
  if (
    metrics.nonEmptyLineCount >= 4 &&
    metrics.commentRatio >= 0.5 &&
    metrics.commentLineCount >= 3
  ) {
    addFlag("high_comment_ratio");
  }
  if (containsDocMarker(text)) {
    addFlag("doc_marker");
  }
  if (containsCommentFragment(nonEmptyLines)) {
    addFlag("comment_fragment");
  }
  if (hasUnbalancedDelimiters(text)) {
    addFlag("unbalanced_delimiters");
  }
  if (containsSyntaxFragmentBoundary(nonEmptyLines)) {
    addFlag("syntax_fragment");
  }
  if (
    typeof input.line_count === "number" &&
    input.line_count !== metrics.lineCount
  ) {
    addFlag("line_count_mismatch");
  }
  if (
    typeof input.char_count === "number" &&
    input.char_count !== metrics.charCount
  ) {
    addFlag("char_count_mismatch");
  }
  if (hasSizeMismatch(input.level, input.size, metrics)) {
    addFlag("size_mismatch");
  }
  if (metrics.maxLineLength > 220) {
    addFlag("very_long_line");
  }
  if (metrics.maxLineLength > 500) {
    addFlag("minified_line");
  }

  return {
    status: corpusQualityStatusFromFlags(flags),
    flags,
    metrics,
  };
}

// Flags that are downgraded from reject to review for block-level entries.
// Blocks are partial semantic units extracted from code; they naturally may
// have unbalanced delimiters or fragment boundaries.
const blockReviewFlags = new Set<CorpusQualityFlag>([
  "unbalanced_delimiters",
  "syntax_fragment",
  "comment_fragment",
]);

export function corpusQualityStatusFromFlags(
  flags: readonly CorpusQualityFlag[],
  level?: string,
): CorpusQualityStatus {
  const effectiveRejecting = level === "block"
    ? new Set([...rejectingFlags].filter((f) => !blockReviewFlags.has(f)))
    : rejectingFlags;
  return flags.some((flag) => effectiveRejecting.has(flag)) ? "reject" : flags.length > 0 ? "review" : "accept";
}

export function corpusQualityMetrics(text: string): CorpusQualityMetrics {
  const lines = classifyCorpusLines(text);
  const nonEmptyLines = lines.filter((line) => line.trimmed.length > 0);
  const commentLineCount = nonEmptyLines.filter((line) => line.isComment).length;
  const importLineCount = nonEmptyLines.filter((line) => line.isImport).length;
  const placeholderLineCount = nonEmptyLines.filter(
    (line) => line.isPlaceholder,
  ).length;
  const codeLineCount = nonEmptyLines.filter((line) => line.hasCodeSignal).length;
  const strongCodeLineCount = nonEmptyLines.filter(
    (line) => line.hasStrongCodeSignal,
  ).length;
  const maxLineLength = lines.reduce(
    (max, line) => Math.max(max, line.text.length),
    0,
  );
  const denominator = Math.max(nonEmptyLines.length, 1);

  return {
    lineCount: lines.length,
    charCount: text.length,
    nonEmptyLineCount: nonEmptyLines.length,
    commentLineCount,
    importLineCount,
    placeholderLineCount,
    codeLineCount,
    strongCodeLineCount,
    maxLineLength,
    commentRatio: commentLineCount / denominator,
    codeSignalRatio: codeLineCount / denominator,
  };
}

function classifyCorpusLines(text: string): CorpusLineClassification[] {
  const lines = text.length === 0 ? [] : text.split("\n");
  let inBlockComment = false;
  let inHtmlComment = false;

  return lines.map((line) => {
    const trimmed = line.trim();
    const startsBlockComment = trimmed.startsWith("/*");
    const endsBlockComment = trimmed.includes("*/");
    const startsHtmlComment = trimmed.startsWith("<!--");
    const endsHtmlComment = trimmed.includes("-->");
    const isDirectiveComment = isDirectiveCommentLine(trimmed);
    const isComment =
      trimmed.length > 0 &&
      !isDirectiveComment &&
      (inBlockComment ||
        inHtmlComment ||
        startsBlockComment ||
        startsHtmlComment ||
        isStandaloneCommentLine(trimmed));
    const isPlaceholder = isPlaceholderLine(trimmed);
    const isImport = isImportLikeLine(trimmed);
    const isImportDelimiter = isImportDelimiterLine(trimmed);
    const isImportBlockValue = isImportBlockValueLine(trimmed);
    const hasStrongCodeSignal = detectStrongCodeSignal(
      trimmed,
      isComment,
      isPlaceholder,
    );

    if (inBlockComment) {
      if (endsBlockComment) {
        inBlockComment = false;
      }
    } else if (startsBlockComment && !endsBlockComment) {
      inBlockComment = true;
    }

    if (inHtmlComment) {
      if (endsHtmlComment) {
        inHtmlComment = false;
      }
    } else if (startsHtmlComment && !endsHtmlComment) {
      inHtmlComment = true;
    }

    return {
      text: line,
      trimmed,
      isComment,
      isImport,
      isImportDelimiter,
      isImportBlockValue,
      isPlaceholder,
      hasStrongCodeSignal,
      hasCodeSignal: hasCodeSignal(trimmed, isComment, isPlaceholder),
    };
  });
}

function isStandaloneCommentLine(line: string): boolean {
  const trimmed = line.trim();
  if (isDirectiveCommentLine(trimmed)) {
    return false;
  }
  return (
    /^(\/\*|\*\/|\*(?:\s|$)|\/\/|<!--|-->)/u.test(trimmed) ||
    /^#(?:\s|$|todo\b|note\b|region\b|endregion\b)/iu.test(trimmed)
  );
}

function isDirectiveCommentLine(trimmed: string): boolean {
  return (
    /^#!\//u.test(trimmed) ||
    /^\/\/\s*SPDX-License-Identifier:/u.test(trimmed) ||
    /^\/\/go:build\s+/u.test(trimmed) ||
    /^\/\/\s*\+build\s+/u.test(trimmed) ||
    /^\/\/\/\s*<reference\s+/u.test(trimmed)
  );
}

function isImportOnly(lines: CorpusLineClassification[]): boolean {
  const meaningfulLines = lines.filter(
    (line) => !line.isComment && !line.isImportDelimiter,
  );
  return (
    meaningfulLines.length > 0 &&
    meaningfulLines.every((line) => line.isImport || line.isImportBlockValue)
  );
}

function isImportLikeLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^(import\b|export\s+(?:\{|\*|type\s+\{)|from\s+\S+\s+import\b|require\()/u.test(
      trimmed,
    ) ||
    /^\}\s+from\s+["'][^"']+["'];?$/u.test(trimmed) ||
    /^(?:const|let|var)\s+[\w${}\s,]+\s*=\s*require\(/u.test(trimmed) ||
    /^(use\s+[\w:>{},\s*]+;?|extern\s+crate\b|pub\s+use\b)/u.test(trimmed) ||
    /^(using\s+[\w.]+;|#include\s*[<"]|@import\b|package\s+[\w.]+;?)$/u.test(
      trimmed,
    )
  );
}

function isImportDelimiterLine(trimmed: string): boolean {
  return /^[{}();,\s]+$/u.test(trimmed);
}

function isImportBlockValueLine(trimmed: string): boolean {
  const value = trimmed.replace(/,$/u, "").trim();
  return (
    /^["'][^"']+["']$/u.test(value) ||
    /^type\s+[A-Za-z_$][\w$]*(?:\s+as\s+[A-Za-z_$][\w$]*)?$/u.test(value) ||
    /^[A-Za-z_$][\w$]*(?:\s+as\s+[A-Za-z_$][\w$]*)?$/u.test(value)
  );
}

function isPlaceholderOnly(lines: CorpusLineClassification[]): boolean {
  return lines.length > 0 && lines.every((line) => line.isPlaceholder);
}

function isPlaceholderLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^(\.\.\.|…|\/\/\s*\.\.\.|\/\*\s*\.\.\.\s*\*\/|<!--\s*\.\.\.\s*-->)$/u.test(
      trimmed,
    ) ||
    /^(\/\/|#|<!--)?\s*(todo|fixme):?\s+(implement|add|fill|your code here|placeholder)/iu.test(
      trimmed,
    )
  );
}

function looksLicenseOnly(
  text: string,
  nonEmptyLines: CorpusLineClassification[],
): boolean {
  if (nonEmptyLines.length === 0) {
    return false;
  }
  const lower = text.toLowerCase();
  const hasLicenseSignal =
    lower.includes("@license") ||
    lower.includes("copyright") ||
    lower.includes("license file") ||
    lower.includes("licensed under") ||
    lower.includes("all rights reserved");
  return (
    hasLicenseSignal &&
    nonEmptyLines.every((line) => line.isComment || line.isPlaceholder)
  );
}

function containsLicenseHeader(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("@license") ||
    lower.includes("copyright") ||
    lower.includes("license file") ||
    lower.includes("licensed under") ||
    lower.includes("all rights reserved")
  );
}

function containsDocComment(lines: CorpusLineClassification[]): boolean {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trimmed.length === 0) {
      continue;
    }
    if (isDirectiveCommentLine(line.trimmed)) {
      continue;
    }
    if (
      /^\/\*\*/u.test(line.trimmed) ||
      /^\/\*!/u.test(line.trimmed) ||
      /^\/\/[!/]/u.test(line.trimmed) ||
      /^["']{3}/u.test(line.trimmed)
    ) {
      return true;
    }
    if (isGoDocComment(lines, index)) {
      return true;
    }
  }
  return false;
}

function isGoDocComment(
  lines: readonly CorpusLineClassification[],
  index: number,
): boolean {
  const line = lines[index];
  if (line === undefined) {
    return false;
  }
  const commentMatch = /^\/\/\s+([A-Z][A-Za-z0-9_]*)\b/u.exec(line.trimmed);
  if (commentMatch === null) {
    return false;
  }
  const documentedName = commentMatch[1];
  if (documentedName === undefined) {
    return false;
  }
  const nextCodeLine = lines
    .slice(index + 1)
    .find((candidate) => candidate.trimmed.length > 0 && !candidate.isComment);
  if (nextCodeLine === undefined) {
    return false;
  }
  return new RegExp(
    `^(?:type|func|const|var)\\s+${escapeRegExp(documentedName)}\\b`,
    "u",
  ).test(nextCodeLine.trimmed);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function containsDocMarker(text: string): boolean {
  return /#(?:end)?docregion\b|#(?:end)?region\b|<\s*snip\s*>|<\/\s*snip\s*>/iu.test(
    text,
  );
}

function containsCommentFragment(lines: CorpusLineClassification[]): boolean {
  return lines.some((line) => /^(\*\/|\/\*|\*(?:\s|$))/u.test(line.trimmed));
}

function hasUnbalancedDelimiters(text: string): boolean {
  const expectedClosers: string[] = [];
  let quote: "'" | "\"" | "`" | undefined;
  let escaped = false;

  for (const ch of Array.from(text)) {
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }

    if (ch === "'" || ch === "\"" || ch === "`") {
      quote = ch;
      continue;
    }

    const closer = closerForOpener(ch);
    if (closer !== undefined) {
      expectedClosers.push(closer);
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      if (expectedClosers.pop() !== ch) {
        return true;
      }
    }
  }

  return expectedClosers.length > 0;
}

function containsSyntaxFragmentBoundary(lines: CorpusLineClassification[]): boolean {
  const first = lines.find((line) => line.trimmed.length > 0);
  const last = lastNonEmptyLine(lines);
  if (first === undefined || last === undefined) {
    return false;
  }
  return startsWithSyntaxFragment(first.trimmed) || endsWithSyntaxFragment(last.trimmed);
}

function lastNonEmptyLine(
  lines: readonly CorpusLineClassification[],
): CorpusLineClassification | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line !== undefined && line.trimmed.length > 0) {
      return line;
    }
  }
  return undefined;
}

function startsWithSyntaxFragment(value: string): boolean {
  return /^(?:case\b|default\s*:|else\b|catch\b|finally\b|[)\]},.;:])/u.test(value);
}

function endsWithSyntaxFragment(value: string): boolean {
  return /(?:[{[(,=?:]|=>|\|\||&&|[+\-*/%]=?)$/u.test(value.trim());
}

function closerForOpener(value: string): string | undefined {
  switch (value) {
    case "(":
      return ")";
    case "[":
      return "]";
    case "{":
      return "}";
    default:
      return undefined;
  }
}

function hasCodeSignal(
  trimmed: string,
  isComment: boolean,
  isPlaceholder: boolean,
): boolean {
  if (trimmed.length === 0 || isComment || isPlaceholder) {
    return false;
  }
  if (looksLikeProseLine(trimmed)) {
    return false;
  }
  return (
    detectStrongCodeSignal(trimmed, isComment, isPlaceholder) ||
    isImportLikeLine(trimmed) ||
    /\b(?:function|const|let|var|return|if|else|for|while|switch|case|try|catch|await|async|def|lambda|public|private|protected|static|fn|impl|match|SELECT|FROM|WHERE|CREATE|INSERT|UPDATE|DELETE|modifier|event)\b/u.test(
      trimmed,
    ) ||
    /[{};]/u.test(trimmed)
  );
}

function detectStrongCodeSignal(
  trimmed: string,
  isComment: boolean,
  isPlaceholder: boolean,
): boolean {
  if (trimmed.length === 0 || isComment || isPlaceholder) {
    return false;
  }
  if (isDirectiveCommentLine(trimmed)) {
    return true;
  }
  return (
    isImportLikeLine(trimmed) ||
    /<\/?[A-Za-z][\w:-]*(?:\s|>|\/>)/u.test(trimmed) ||
    /^\s*(?:export\s+(?:default\s+)?|pub\s+|public\s+|private\s+|abstract\s+)?(?:class|interface|type|struct|enum|contract)\s+[A-Za-z_$][\w$]*/u.test(
      trimmed,
    ) ||
    /(?:=>|::|->|===|!==|&&|\|\||\$\{|@\w|\[[^\]]+\]=|\([^)]+\)=)/u.test(
      trimmed,
    ) ||
    /^[.#][A-Za-z_-][\w-]*(?:\s|[:.{#>])/u.test(trimmed) ||
    /^[\w-]+\s*:\s*[^;]+;?$/u.test(trimmed) ||
    /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\(/u.test(trimmed) ||
    /^\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=/u.test(trimmed)
  );
}

function isProseOnly(text: string, metrics: CorpusQualityMetrics): boolean {
  const wordCount = text.match(/[A-Za-z]{2,}/gu)?.length ?? 0;
  return (
    metrics.nonEmptyLineCount >= 3 &&
    wordCount >= 25 &&
    metrics.strongCodeLineCount === 0
  );
}

function looksLikeProseLine(trimmed: string): boolean {
  const wordCount = trimmed.match(/[A-Za-z]{2,}/gu)?.length ?? 0;
  const hasStrongCodeSyntax =
    /(?:=>|::|->|\$\{|@\w|<\/?[A-Za-z][\w:-]*(?:\s|>|\/>)|[{}=])/u.test(
      trimmed,
    ) ||
    /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\(/u.test(trimmed);
  if (/^[-*]\s+\w/u.test(trimmed) && !hasStrongCodeSyntax) {
    return true;
  }
  return wordCount >= 7 && /[.!?,;:]$/u.test(trimmed) && !hasStrongCodeSyntax;
}

function hasSizeMismatch(
  level: unknown,
  size: unknown,
  metrics: Pick<CorpusQualityMetrics, "lineCount" | "charCount">,
): boolean {
  if (
    level !== "block" &&
    level !== "function" &&
    level !== "file"
  ) {
    return false;
  }
  if (size !== "short" && size !== "medium" && size !== "long") {
    return false;
  }
  const [minLines, maxLines] = sizeLineLimits[level][size];
  const [minChars, maxChars] = sizeCharLimits[level][size];
  return (
    metrics.lineCount < minLines ||
    metrics.lineCount > maxLines ||
    metrics.charCount < minChars ||
    metrics.charCount > maxChars
  );
}
