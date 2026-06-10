import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Language, Parser, type Node as TreeSitterNode } from "web-tree-sitter";

import { scoreTypingDifficulty } from "../training/typingDifficulty";
import { assessCorpusTextQuality } from "./corpusQuality";
import { normalizeSnippetText } from "./snippets";

export type CorpusV4Level = "block" | "function" | "file";
export type CorpusV4Size = "short" | "medium" | "long";

export interface CorpusV4SourceOptions {
  repo: string;
  repoUrl: string;
  commitSha: string;
  relativePath: string;
  technologyDomain: string;
  language: string;
  framework: string;
  licenseSpdx: string;
}

export interface CorpusV4Record {
  id: string;
  corpus_version: 4;
  quality: "candidate";
  source_kind: "github";
  repo: string;
  repo_url: string;
  source_url: string;
  commit: string;
  commit_sha: string;
  file_path: string;
  start_line: number;
  end_line: number;
  technology_domain: string;
  language: string;
  framework: string;
  domain: string;
  level: CorpusV4Level;
  difficulty: "easy" | "medium" | "hard";
  difficulty_score: number;
  difficulty_reasons: string[];
  size: CorpusV4Size;
  line_count: number;
  char_count: number;
  shape: string[];
  text: string;
  license_spdx: string;
}

interface Candidate {
  node: TreeSitterNode;
  level: CorpusV4Level;
  shape: string[];
}

const lineLimits = {
  block: { short: [3, 8], medium: [8, 16], long: [15, 28] },
  function: { short: [6, 16], medium: [14, 32], long: [28, 50] },
  file: { short: [20, 60], medium: [40, 100], long: [80, 160] },
} as const;

const charLimits = {
  block: { short: [100, 350], medium: [350, 700], long: [700, 1100] },
  function: { short: [250, 550], medium: [550, 900], long: [900, 1300] },
  file: { short: [800, 1200], medium: [1200, 1700], long: [1700, 2500] },
} as const;

let parserReady: Promise<Parser> | undefined;

export async function collectTypeScriptCorpusV4FromSource(
  source: string,
  options: CorpusV4SourceOptions,
): Promise<CorpusV4Record[]> {
  const parser = await typeScriptParser();
  const tree = parser.parse(source);
  if (tree === null) {
    return [];
  }
  const root = tree.rootNode;
  if (hasParseError(root)) {
    return [];
  }

  const candidates = [
    ...functionCandidates(root),
    ...blockCandidates(root),
    ...fileCandidates(root, source),
  ];
  const records: CorpusV4Record[] = [];
  const seenText = new Set<string>();

  for (const candidate of candidates) {
    const rawText = source.slice(candidate.node.startIndex, candidate.node.endIndex);
    const normalized = normalizeSnippetText(rawText);
    if (!isUsableText(normalized)) {
      continue;
    }
    if (candidate.level === "block" && looksLikeCompleteCallable(candidate.node)) {
      continue;
    }
    if (candidate.level === "function" && primaryCallableUnitCount(candidate.node) !== 1) {
      continue;
    }
    const size = sizeFor(candidate.level, normalized);
    if (size === undefined) {
      continue;
    }
    const quality = assessCorpusTextQuality({
      text: normalized,
      level: candidate.level,
      size,
      line_count: normalized.split("\n").length,
      char_count: normalized.length,
    });
    if (quality.status === "reject") {
      continue;
    }
    if (quality.metrics.maxLineLength > 140) {
      continue;
    }
    const normalizedKey = normalizedTextKey(normalized);
    if (seenText.has(normalizedKey)) {
      continue;
    }
    seenText.add(normalizedKey);
    const scored = scoreTypingDifficulty(normalized);
    const startLine = candidate.node.startPosition.row + 1;
    const endLine = candidate.node.endPosition.row + 1;
    const lineCount = normalized.split("\n").length;
    records.push({
      id: [
        "v4",
        options.technologyDomain.toLowerCase(),
        options.repo.replace(/[^A-Za-z0-9]+/gu, "-").toLowerCase(),
        options.relativePath.replace(/[^A-Za-z0-9]+/gu, "-").toLowerCase(),
        startLine,
        endLine,
      ].join("-"),
      corpus_version: 4,
      quality: "candidate",
      source_kind: "github",
      repo: options.repo,
      repo_url: options.repoUrl,
      source_url: `${options.repoUrl}/blob/${options.commitSha}/${options.relativePath}#L${startLine}-L${endLine}`,
      commit: options.commitSha,
      commit_sha: options.commitSha,
      file_path: options.relativePath,
      start_line: startLine,
      end_line: endLine,
      technology_domain: options.technologyDomain,
      language: options.language,
      framework: options.framework,
      domain: options.technologyDomain,
      level: candidate.level,
      difficulty: scored.difficulty,
      difficulty_score: scored.score,
      difficulty_reasons: scored.reasons,
      size,
      line_count: lineCount,
      char_count: normalized.length,
      shape: candidate.shape,
      text: normalized,
      license_spdx: options.licenseSpdx,
    });
  }

  return records;
}

export async function collectTypeScriptCorpusV4FromFile(
  filePath: string,
  repoRoot: string,
  options: Omit<CorpusV4SourceOptions, "relativePath">,
): Promise<CorpusV4Record[]> {
  const source = await readFile(filePath, "utf8");
  return collectTypeScriptCorpusV4FromSource(source, {
    ...options,
    relativePath: relative(repoRoot, filePath),
  });
}

async function typeScriptParser(): Promise<Parser> {
  parserReady ??= (async () => {
    await Parser.init();
    const parser = new Parser();
    const language = await Language.load(typeScriptGrammarPath());
    parser.setLanguage(language);
    return parser;
  })();
  return parserReady;
}

function typeScriptGrammarPath(): string {
  const candidates = [
    resolve("node_modules/@opentui/core/assets/typescript/tree-sitter-typescript.wasm"),
  ];
  try {
    candidates.push(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../node_modules/@opentui/core/assets/typescript/tree-sitter-typescript.wasm",
      ),
    );
  } catch {
    // Bundled runtime paths may not be file-backed.
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("tree-sitter TypeScript grammar wasm not found");
}

function functionCandidates(root: TreeSitterNode): Candidate[] {
  const candidates: Candidate[] = [];
  walk(root, (node) => {
    const declaration = declarationNode(node);
    if (declaration === undefined) {
      return;
    }
    if (isCallableDeclaration(declaration)) {
      candidates.push({ node, level: "function", shape: ["function", declaration.type] });
    }
  });
  return topLevelUnique(candidates);
}

function blockCandidates(root: TreeSitterNode): Candidate[] {
  const candidates: Candidate[] = [];
  walk(root, (node) => {
    const declaration = declarationNode(node);
    const type = declaration?.type ?? node.type;
    if (isCallableDeclaration(declaration ?? node)) {
      return;
    }
    if (isBlockCandidateType(type)) {
      candidates.push({ node, level: "block", shape: ["block", type] });
    }
  });
  return topLevelUnique(candidates);
}

function fileCandidates(root: TreeSitterNode, source: string): Candidate[] {
  if (root.startIndex !== 0 || root.endIndex !== source.length) {
    return [];
  }
  return [{ node: root, level: "file", shape: ["file"] }];
}

function declarationNode(node: TreeSitterNode): TreeSitterNode | undefined {
  if (node.type !== "export_statement") {
    return node;
  }
  return node.namedChildren.find((child) => child !== null && child.type !== "export") ?? undefined;
}

function isCallableDeclaration(node: TreeSitterNode | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  if (
    node.type === "function_declaration" ||
    node.type === "method_definition" ||
    node.type === "generator_function_declaration"
  ) {
    return true;
  }
  if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
    return node.descendantsOfType(["arrow_function", "function"]).some((child) => child !== null);
  }
  return false;
}

function isBlockCandidateType(type: string): boolean {
  return (
    type === "if_statement" ||
    type === "for_statement" ||
    type === "for_in_statement" ||
    type === "for_of_statement" ||
    type === "while_statement" ||
    type === "do_statement" ||
    type === "switch_statement" ||
    type === "try_statement"
  );
}

function looksLikeCompleteCallable(node: TreeSitterNode): boolean {
  return isCallableDeclaration(declarationNode(node));
}

function primaryCallableUnitCount(node: TreeSitterNode): number {
  const declaration = declarationNode(node);
  if (declaration === undefined) {
    return 0;
  }
  if (
    declaration.type === "function_declaration" ||
    declaration.type === "method_definition" ||
    declaration.type === "generator_function_declaration"
  ) {
    return 1;
  }
  if (declaration.type !== "lexical_declaration" && declaration.type !== "variable_declaration") {
    return 0;
  }
  return declaration.namedChildren.filter((child) => {
    if (child === null || child.type !== "variable_declarator") {
      return false;
    }
    return child.namedChildren.some((grandchild) =>
      grandchild !== null &&
      (grandchild.type === "arrow_function" || grandchild.type === "function")
    );
  }).length;
}

function hasParseError(node: TreeSitterNode): boolean {
  if (node.isError || node.isMissing) {
    return true;
  }
  return node.children.some((child) => child !== null && hasParseError(child));
}

function topLevelUnique(candidates: Candidate[]): Candidate[] {
  const result: Candidate[] = [];
  for (const candidate of candidates) {
    if (
      candidates.some((other) =>
        other !== candidate &&
        other.level === candidate.level &&
        other.node.startIndex <= candidate.node.startIndex &&
        other.node.endIndex >= candidate.node.endIndex &&
        (other.node.startIndex !== candidate.node.startIndex || other.node.endIndex !== candidate.node.endIndex)
      )
    ) {
      continue;
    }
    result.push(candidate);
  }
  return result;
}

function walk(node: TreeSitterNode, visit: (node: TreeSitterNode) => void): void {
  visit(node);
  for (const child of node.children) {
    if (child !== null) {
      walk(child, visit);
    }
  }
}

function sizeFor(level: CorpusV4Level, text: string): CorpusV4Size | undefined {
  const lineCount = text.split("\n").length;
  const charCount = text.length;
  for (const size of ["short", "medium", "long"] as const) {
    const [minLines, maxLines] = lineLimits[level][size];
    const [minChars, maxChars] = charLimits[level][size];
    if (
      lineCount >= minLines &&
      lineCount <= maxLines &&
      charCount >= minChars &&
      charCount <= maxChars
    ) {
      return size;
    }
  }
  return undefined;
}

function isUsableText(text: string): boolean {
  if (text.length === 0 || !/[A-Za-z_$]/u.test(text)) {
    return false;
  }
  if (text.startsWith("*/") || text.startsWith("* ")) {
    return false;
  }
  if (/^\s*(?:import|export)\s+[^;\n]+;?\s*$/u.test(text)) {
    return false;
  }
  return true;
}

function normalizedTextKey(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
