import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import {
  defaultCodePracticeConfig,
  type CodePracticeConfig,
  type CodePracticeFacet,
  type CodePracticeOption,
  type CodePracticeLevel,
  type CodePracticeSize,
} from "../domain/model";

export interface BuiltinCodeSnippet {
  text: string;
  source: string;
  language: string;
  syntax_language?: string;
  framework: string;
  project: string;
  level: CodeSnippetLevel;
  difficulty?: CodeSnippetDifficulty;
  score?: number;
}

export type CodeSnippetLevel = "block" | "function" | "file";
export type CodeSnippetDifficulty = "easy" | "medium" | "hard";

export interface CodeSnippet {
  text: string;
  source: string;
  difficulty: string;
  score: number;
  language: string;
  syntax_language?: string;
  framework: string;
  project: string;
  level: CodeSnippetLevel;
}

export interface CodeSnippetPickerOptions {
  random?: () => number;
}

interface IgnoreRule {
  basePath: string;
  pattern: string;
  negative: boolean;
  directoryOnly: boolean;
  anchored: boolean;
  hasSlash: boolean;
}

const supportedExtensions = new Set([
  "rs",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "java",
  "rb",
  "php",
  "swift",
  "kt",
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "vue",
  "svelte",
  "sol",
]);

export function codeSnippetFromBuiltin(snippet: BuiltinCodeSnippet): CodeSnippet {
  return makeSnippetWithMeta(
    normalizeSnippetText(snippet.text),
    snippet.source,
    snippet.language,
    snippet.framework,
    snippet.project,
    snippet.level,
    snippet.difficulty,
    snippet.score,
    snippet.syntax_language,
  );
}

export function makeSnippet(text: string, source: string): CodeSnippet {
  return makeSnippetWithMeta(
    text,
    source,
    languageFromSource(source),
    "local",
    "local-repo",
    "block",
  );
}

export function makeSnippetWithMeta(
  text: string,
  source: string,
  language: string,
  framework: string,
  project: string,
  level: CodeSnippetLevel,
  presetDifficulty?: CodeSnippetDifficulty,
  presetScore?: number,
  syntaxLanguage?: string,
): CodeSnippet {
  const len = Array.from(text).length;
  const symbolCount = Array.from(text).filter(
    (ch) => !/[A-Za-z0-9]/u.test(ch) && !/\s/u.test(ch),
  ).length;
  const lines = text.split(/\r?\n/u).length;
  const computedScore = Math.floor(len / 8) + symbolCount * 2 + lines * 4;
  const score = presetScore ?? computedScore;
  const difficulty: CodeSnippetDifficulty =
    presetDifficulty ?? (score <= 16 ? "easy" : score <= 34 ? "medium" : "hard");

  return {
    text,
    source,
    difficulty,
    score,
    language,
    ...(syntaxLanguage === undefined ? {} : { syntax_language: syntaxLanguage }),
    framework,
    project,
    level,
  };
}

export function normalizeSnippetText(text: string): string {
  const lines = normalizeIndent(text.split(/\r?\n/u).map((line) => trimEnd(line)));
  return normalizePartiallyStrippedBlockIndent(lines).join("\n");
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function snippetsFromFile(content: string, relativePath: string): CodeSnippet[] {
  const lines = content.split(/\r?\n/u);
  const snippets: CodeSnippet[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!isCandidateLine(line)) {
      continue;
    }

    const source = `${relativePath}:${index + 1}`;
    if (opensBlockOrCallback(line)) {
      const text = captureBlock(lines, index);
      if (Array.from(text).length <= 240) {
        if (isAscii(text)) {
          snippets.push(makeSnippet(text, source));
        }
        continue;
      }
    }

    if (isAscii(line)) {
      snippets.push(makeSnippet(line, source));
    }
  }

  return snippets;
}

export async function extractSnippets(repoPath: string): Promise<CodeSnippet[]> {
  const snippets: CodeSnippet[] = [];
  const root = repoPath;
  const rootMetadata = await stat(root);
  if (!rootMetadata.isDirectory()) {
    throw new Error(`${root} is not a directory`);
  }

  await walkRepo(root, async (path) => {
    if (!isSupportedSourcePath(path)) {
      return;
    }
    const metadata = await stat(path).catch(() => null);
    if (metadata === null || !metadata.isFile() || metadata.size > 200_000) {
      return;
    }
    const bytes = await readFile(path).catch(() => null);
    const content = bytes === null ? null : decodeUtf8(bytes);
    if (content === null) {
      return;
    }
    const relativePath = relative(root, path) || path;
    snippets.push(...snippetsFromFile(content, relativePath));
  });

  snippets.sort((left, right) => {
    const rankDelta = difficultyRank(left.difficulty) - difficultyRank(right.difficulty);
    return rankDelta === 0 ? right.score - left.score : rankDelta;
  });
  const seen = new Set<string>();
  return snippets.filter((snippet) => {
    if (seen.has(snippet.text)) {
      return false;
    }
    seen.add(snippet.text);
    return true;
  });
}

export function pickCodeSnippetsExcludingByDifficulty(
  snippets: CodeSnippet[],
  planFocus: string[],
  codeConfig: Partial<CodePracticeConfig>,
  count: number,
  excludedTexts: Set<string>,
  difficulty?: string,
  options: CodeSnippetPickerOptions = {},
): CodeSnippet[] {
  const config = defaultCodePracticeConfig(codeConfig);
  const focus = planFocus.map((item) => item.toLowerCase());
  let candidates = codeCandidates(snippets, config, excludedTexts, difficulty);
  if (candidates.length < count && difficulty !== undefined) {
    candidates = codeCandidates(snippets, config, excludedTexts);
  }
  shuffleInPlace(candidates, options.random ?? Math.random);

  if (focus.length > 0) {
    candidates.sort(
      (left, right) => focusHitCount(right.text, focus) - focusHitCount(left.text, focus),
    );
  }

  const selected = candidates
    .filter(
      (snippet) =>
        focus.length === 0 ||
        focus.some((term) => snippet.text.toLowerCase().includes(term)),
    )
    .slice(0, count);

  if (selected.length >= count) {
    return selected;
  }

  for (const snippet of candidates) {
    if (selected.length >= count) {
      break;
    }
    if (!selected.some((picked) => picked.text === snippet.text)) {
      selected.push(snippet);
    }
  }
  return selected;
}

export function pickBuiltinCode(
  snippets: BuiltinCodeSnippet[],
  planFocus: string[],
  codeConfig: Partial<CodePracticeConfig>,
  count: number,
): CodeSnippet[] {
  return pickBuiltinCodeExcludingByDifficulty(
    snippets,
    planFocus,
    codeConfig,
    count,
    new Set(),
  );
}

export function pickBuiltinCodeExcludingByDifficulty(
  snippets: BuiltinCodeSnippet[],
  planFocus: string[],
  codeConfig: Partial<CodePracticeConfig>,
  count: number,
  excludedTexts: Set<string>,
  difficulty?: string,
  options: CodeSnippetPickerOptions = {},
): CodeSnippet[] {
  const config = defaultCodePracticeConfig(codeConfig);
  let candidates = snippets
    .map(codeSnippetFromBuiltin)
    .filter((snippet) => matchesCodeConfig(snippet, config))
    .filter((snippet) => matchesCodeSize(snippet.text, config.size))
    .filter((snippet) => !isExcludedCodeSnippetText(snippet.text, excludedTexts))
    .filter((snippet) => (difficulty === undefined ? true : snippet.difficulty === difficulty));

  if (candidates.length < count && difficulty !== undefined) {
    candidates = snippets
      .map(codeSnippetFromBuiltin)
      .filter((snippet) => matchesCodeConfig(snippet, config))
      .filter((snippet) => matchesCodeSize(snippet.text, config.size))
      .filter((snippet) => !isExcludedCodeSnippetText(snippet.text, excludedTexts));
  }

  shuffleInPlace(candidates, options.random ?? Math.random);
  candidates.sort(
    (left, right) =>
      focusHitCount(right.text, planFocus) - focusHitCount(left.text, planFocus),
  );
  return candidates.slice(0, count);
}

export function codePracticeOptions(snippets: BuiltinCodeSnippet[]): CodePracticeOption[] {
  return [
    ...sortedOptions("language", countBy(snippets.map((snippet) => snippet.language))),
    ...sortedOptions("framework", countBy(snippets.map((snippet) => snippet.framework))),
  ];
}

export function matchesCodeConfig(
  snippet: CodeSnippet,
  configInput: Partial<CodePracticeConfig>,
): boolean {
  const config = defaultCodePracticeConfig(configInput);
  if (!matchesCodeLevel(snippet.level, config.level)) {
    return false;
  }

  const hasTagFilters =
    config.language !== undefined ||
    config.framework !== undefined ||
    config.project !== undefined ||
    config.languages.length > 0 ||
    config.frameworks.length > 0 ||
    config.projects.length > 0;
  if (!hasTagFilters) {
    return true;
  }

  if (config.match_any) {
    return (
      matchesAny(snippet.language, config.languages) ||
      matchesAny(snippet.framework, config.frameworks) ||
      matchesAny(snippet.project, config.projects)
    );
  }

  return (
    matchesOptional(snippet.language, config.language, config.languages) &&
    matchesOptional(snippet.framework, config.framework, config.frameworks) &&
    matchesOptional(snippet.project, config.project, config.projects)
  );
}

export function isSupportedSourcePath(path: string): boolean {
  const fileName = path.split(/[\\/]/u).at(-1) ?? "";
  if (
    fileName.endsWith(".min.js") ||
    fileName.endsWith(".lock") ||
    fileName === "package-lock.json" ||
    fileName === "pnpm-lock.yaml" ||
    fileName === "yarn.lock"
  ) {
    return false;
  }

  const extension = extname(fileName).replace(/^\./u, "").toLowerCase();
  return supportedExtensions.has(extension);
}

export function languageFromSource(source: string): string {
  const path = source.split(":")[0] ?? source;
  const extension = extname(path).replace(/^\./u, "").toLowerCase();
  return languageFromExtension(extension);
}

export function codeSnippetExclusionKey(text: string): string {
  return normalizeSnippetText(text).replace(/\s+/gu, "");
}

export function isExcludedCodeSnippetText(text: string, excludedTexts: Set<string>): boolean {
  return excludedTexts.has(text) || excludedTexts.has(codeSnippetExclusionKey(text));
}

function codeCandidates(
  snippets: CodeSnippet[],
  codeConfig: CodePracticeConfig,
  excludedTexts: Set<string>,
  difficulty?: string,
): CodeSnippet[] {
  return snippets
    .filter((snippet) => isPracticeCodeBlock(snippet.text))
    .filter((snippet) => matchesCodeConfig(snippet, codeConfig))
    .filter((snippet) => matchesCodeSize(snippet.text, codeConfig.size))
    .filter((snippet) => !isExcludedCodeSnippetText(snippet.text, excludedTexts))
    .filter((snippet) => (difficulty === undefined ? true : snippet.difficulty === difficulty));
}

function isPracticeCodeBlock(text: string): boolean {
  return isAscii(text) && text.split(/\r?\n/u).filter((line) => line.trim().length > 0).length >= 2;
}

function shuffleInPlace<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(clamp(random(), 0, 0.999999999) * (index + 1));
    const current = items[index];
    const replacement = items[swapIndex];
    if (current === undefined || replacement === undefined) {
      continue;
    }
    items[index] = replacement;
    items[swapIndex] = current;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function matchesCodeLevel(
  snippetLevel: CodeSnippetLevel,
  selected: CodePracticeLevel | undefined,
): boolean {
  return selected === undefined || snippetLevel === selected;
}

function matchesCodeSize(text: string, selected: CodePracticeSize | undefined): boolean {
  return selected === undefined || inferredCodeSize(text) === selected;
}

function inferredCodeSize(text: string): CodePracticeSize {
  const lineCount = text.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
  const charCount = Array.from(text).length;
  if (lineCount <= 5 && charCount <= 240) {
    return "short";
  }
  if (lineCount <= 14 && charCount <= 720) {
    return "medium";
  }
  return "long";
}

function matchesOptional(value: string, expected: string | undefined, expectedMany: string[]): boolean {
  return (
    (expected === undefined || equalsIgnoreCase(value, expected)) &&
    (expectedMany.length === 0 || matchesAny(value, expectedMany))
  );
}

function matchesAny(value: string, expectedMany: string[]): boolean {
  return expectedMany.some((expected) => equalsIgnoreCase(value, expected));
}

function sortedOptions(
  facet: CodePracticeFacet,
  counts: Map<string, number>,
): CodePracticeOption[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ facet, value, count }))
    .sort((left, right) =>
      right.count === left.count ? left.value.localeCompare(right.value) : right.count - left.count,
    );
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function captureBlock(lines: string[], start: number): string {
  const rawBlock: string[] = [];
  let braceBalance = 0;
  let parenBalance = 0;

  for (const line of lines.slice(start, start + 14)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 && rawBlock.length > 0) {
      break;
    }

    braceBalance += charCount(trimmed, "{");
    braceBalance -= charCount(trimmed, "}");
    parenBalance += charCount(trimmed, "(");
    parenBalance -= charCount(trimmed, ")");
    rawBlock.push(trimEnd(line));

    if (
      rawBlock.length > 1 &&
      braceBalance <= 0 &&
      parenBalance <= 0 &&
      (trimmed.endsWith("}") || trimmed.endsWith("};") || trimmed.endsWith(");"))
    ) {
      break;
    }
  }

  return normalizeIndent(rawBlock).join("\n");
}

function normalizeIndent(lines: string[]): string[] {
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  const minIndent =
    nonEmpty.length === 0
      ? 0
      : Math.min(...nonEmpty.map((line) => leadingSpaceCount(line)));
  return lines.map((line) => Array.from(line).slice(minIndent).join(""));
}

function normalizePartiallyStrippedBlockIndent(lines: string[]): string[] {
  const firstIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstIndex === -1) {
    return lines;
  }

  const lastIndex = lastNonEmptyLineIndex(lines);
  if (lastIndex <= firstIndex) {
    return lines;
  }

  const firstLine = lines[firstIndex] ?? "";
  const lastLine = lines[lastIndex] ?? "";
  const lastIndent = leadingSpaceCount(lastLine);
  if (
    leadingSpaceCount(firstLine) !== 0 ||
    lastIndent <= 0 ||
    !opensDelimitedBlock(firstLine.trim()) ||
    !isStandaloneClosingLine(lastLine.trim())
  ) {
    return lines;
  }

  return lines.map((line, index) =>
    index > firstIndex && line.trim().length > 0 ? stripLeadingIndent(line, lastIndent) : line,
  );
}

function lastNonEmptyLineIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if ((lines[index] ?? "").trim().length > 0) {
      return index;
    }
  }
  return -1;
}

function opensDelimitedBlock(line: string): boolean {
  return /[\[{(]$/u.test(line);
}

function isStandaloneClosingLine(line: string): boolean {
  return /^[\]})]+[;,)]*$/u.test(line);
}

function stripLeadingIndent(line: string, count: number): string {
  const chars = Array.from(line);
  let removable = 0;
  while (removable < count && removable < chars.length && /^[\t ]$/u.test(chars[removable] ?? "")) {
    removable += 1;
  }
  return chars.slice(removable).join("");
}

function leadingSpaceCount(value: string): number {
  let count = 0;
  for (const ch of Array.from(value)) {
    if (ch !== " " && ch !== "\t") {
      break;
    }
    count += 1;
  }
  return count;
}

function isCandidateLine(line: string): boolean {
  if (line.length < 12 || line.length > 140) {
    return false;
  }
  if (
    line.startsWith("//") ||
    line.startsWith("/*") ||
    line.startsWith("*") ||
    line.startsWith("#")
  ) {
    return false;
  }

  const hasCodeSignal = [
    "const ",
    "let ",
    "var ",
    "function ",
    "return ",
    "import ",
    "export ",
    "if ",
    "for ",
    "while ",
    "=>",
    "useState",
    "useEffect",
    "className",
    "async ",
    "await ",
  ].some((needle) => line.includes(needle));

  return (
    hasCodeSignal ||
    Array.from(line).filter((ch) => "(){}[]<>=!&|_.".includes(ch)).length >= 4
  );
}

function opensBlockOrCallback(line: string): boolean {
  return line.endsWith("{") || line.includes("=>") || line.includes("function ");
}

async function walkRepo(
  root: string,
  visit: (path: string) => Promise<void>,
  directory: string = root,
  inheritedRules: IgnoreRule[] = [],
): Promise<void> {
  const rules = [...inheritedRules, ...(await loadIgnoreRules(root, directory))];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = normalizeRelativePath(relative(root, path));
    if (isIgnored(relativePath, entry.isDirectory(), rules)) {
      continue;
    }
    if (entry.isDirectory()) {
      await walkRepo(root, visit, path, rules);
    } else if (entry.isFile()) {
      await visit(path);
    }
  }
}

async function loadIgnoreRules(root: string, directory: string): Promise<IgnoreRule[]> {
  const basePath = normalizeRelativePath(relative(root, directory));
  const ignoreFiles = [join(directory, ".gitignore")];
  if (directory === root) {
    ignoreFiles.push(join(root, ".git", "info", "exclude"));
  }
  ignoreFiles.push(join(directory, ".ignore"));

  const rules: IgnoreRule[] = [];
  for (const file of ignoreFiles) {
    const content = await readFile(file, "utf8").catch(() => null);
    if (content === null) {
      continue;
    }
    rules.push(...parseIgnoreRules(content, basePath));
  }
  return rules;
}

function parseIgnoreRules(content: string, basePath: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    let line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    let negative = false;
    if (line.startsWith("!")) {
      negative = true;
      line = line.slice(1);
    }
    if (line.length === 0) {
      continue;
    }

    const anchored = line.startsWith("/");
    if (anchored) {
      line = line.replace(/^\/+/u, "");
    }
    const directoryOnly = line.endsWith("/");
    if (directoryOnly) {
      line = line.replace(/\/+$/u, "");
    }
    if (line.length === 0) {
      continue;
    }

    rules.push({
      basePath,
      pattern: normalizeRelativePath(line),
      negative,
      directoryOnly,
      anchored,
      hasSlash: line.includes("/"),
    });
  }
  return rules;
}

function isIgnored(relativePath: string, isDirectory: boolean, rules: IgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (matchesIgnoreRule(relativePath, isDirectory, rule)) {
      ignored = !rule.negative;
    }
  }
  return ignored;
}

function matchesIgnoreRule(
  relativePath: string,
  isDirectory: boolean,
  rule: IgnoreRule,
): boolean {
  const localPath = pathWithinBase(relativePath, rule.basePath);
  if (localPath === undefined || localPath.length === 0) {
    return false;
  }
  if (rule.directoryOnly && !isDirectory) {
    return false;
  }

  if (rule.anchored || rule.hasSlash) {
    return wildcardMatch(localPath, rule.pattern);
  }

  return localPath.split("/").some((segment) => wildcardMatch(segment, rule.pattern));
}

function pathWithinBase(relativePath: string, basePath: string): string | undefined {
  if (basePath.length === 0) {
    return relativePath;
  }
  if (relativePath === basePath) {
    return "";
  }
  const prefix = `${basePath}/`;
  return relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : undefined;
}

function wildcardMatch(value: string, pattern: string): boolean {
  return globToRegExp(pattern).test(value);
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const ch = pattern[index];
    if (ch === "*") {
      const next = pattern[index + 1];
      if (next === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (ch === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(ch ?? "");
    }
  }
  source += "$";
  return new RegExp(source, "u");
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

function normalizeRelativePath(path: string): string {
  return path.split(/[\\/]+/u).filter(Boolean).join("/");
}

function languageFromExtension(extension: string): string {
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "rs":
      return "rust";
    case "sol":
      return "solidity";
    case "css":
      return "css";
    case "scss":
    case "sass":
      return "scss";
    case "less":
      return "less";
    case "html":
      return "html";
    case "vue":
      return "vue";
    case "svelte":
      return "svelte";
    case "py":
      return "python";
    case "go":
      return "go";
    case "java":
      return "java";
    case "rb":
      return "ruby";
    case "php":
      return "php";
    case "swift":
      return "swift";
    case "kt":
      return "kotlin";
    default:
      return extension.length > 0 ? extension : "code";
  }
}

function difficultyRank(value: string): number {
  switch (value) {
    case "medium":
      return 0;
    case "easy":
      return 1;
    default:
      return 2;
  }
}

function focusHitCount(text: string, focus: string[]): number {
  return focus.filter((term) => text.toLowerCase().includes(term.toLowerCase())).length;
}

function charCount(value: string, target: string): number {
  return Array.from(value).filter((ch) => ch === target).length;
}

function trimEnd(value: string): string {
  return value.replace(/\s+$/u, "");
}

function isAscii(value: string): boolean {
  return /^[\x00-\x7F]*$/u.test(value);
}

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
