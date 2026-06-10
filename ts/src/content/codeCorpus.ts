import { accessSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assessCorpusTextQuality } from "./corpusQuality";
import {
  codeSnippetFromBuiltin,
  isExcludedCodeSnippetText,
  languageFromSource,
  matchesCodeConfig,
  normalizeSnippetText,
  type BuiltinCodeSnippet,
  type CodeSnippetDifficulty,
  type CodeSnippetLevel,
  type CodeSnippetPickerOptions,
} from "./snippets";
import {
  defaultCodePracticeConfig,
  type CodePracticeConfig,
  type CodePracticeFacet,
  type CodePracticeOption,
} from "../domain/model";
import {
  scoreTypingDifficulty,
  type TypingDifficulty,
} from "../training/typingDifficulty";

export interface BuildCodeCorpusSnapshotOptions {
  cellLimit?: number;
}

export interface BuildCodeCorpusSnapshotResult {
  snippets: BuiltinCodeSnippet[];
  stats: BuildCodeCorpusSnapshotStats;
  index: CodeCorpusIndex;
  shards: Map<string, BuiltinCodeSnippet[]>;
}

export interface BuildCodeCorpusSnapshotStats {
  total: number;
  accepted: number;
  review: number;
  rejected: number;
  duplicate: number;
  capped: number;
  invalidMetadata: number;
  kept: number;
}

export interface CodeCorpus {
  root: string;
  index: CodeCorpusIndex;
}

export interface CodeCorpusIndex {
  schema: "keyloop.code_corpus";
  schema_version: 1;
  cell_limit: number;
  stats: BuildCodeCorpusSnapshotStats;
  shards: CodeCorpusShardIndex[];
}

export interface CodeCorpusShardIndex {
  path: string;
  language: string;
  level: CodeSnippetLevel;
  difficulty: CodeSnippetDifficulty;
  size: CodeCorpusSize;
  count: number;
  frameworks: Record<string, number>;
  projects: Record<string, number>;
}

export interface ResolveCodeContentRootOptions {
  moduleUrl?: string;
  execPath?: string;
  argv1?: string;
  env?: Record<string, string | undefined>;
  exists?: (path: string) => boolean;
}

export type CodeCorpusSize = "short" | "medium" | "long" | "unknown";

const defaultCellLimit = 30;
const codeContentMarkerFile = join("code", "index.json");
const generatedProject = "keyloop-corpus";
const generalFramework = "general";

const codeFrameworkFacets = new Set([
  "angular",
  "astro",
  "aspnet-core",
  "axum",
  "django",
  "express",
  "fastapi",
  "fastify",
  "flask",
  "foundry",
  "gin",
  "hardhat",
  "hono",
  "koa",
  "ktor",
  "laravel",
  "nestjs",
  "nextjs",
  "nuxt",
  "rails",
  "react",
  "spring",
  "spring-boot",
  "svelte",
  "symfony",
  "tailwind",
  "vue",
]);

const codeFrameworkAliases: Record<string, string> = {
  "asp.net-core": "aspnet-core",
  "aspnet_core": "aspnet-core",
  "next.js": "nextjs",
  "next-js": "nextjs",
  "nuxt.js": "nuxt",
  "ruby-on-rails": "rails",
  "spring_boot": "spring-boot",
  "spring_framework": "spring",
  "spring-framework": "spring",
};

const corpusSizeLineLimits = {
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

const corpusSizeCharLimits = {
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

export function buildCodeCorpusSnapshot(
  records: Iterable<unknown>,
  options: BuildCodeCorpusSnapshotOptions = {},
): BuildCodeCorpusSnapshotResult {
  const cellLimit = Math.max(1, Math.floor(options.cellLimit ?? defaultCellLimit));
  const snippets: BuiltinCodeSnippet[] = [];
  const stats = emptyStats();
  const seenTexts = new Set<string>();
  const cellCounts = new Map<string, number>();
  const shards = new Map<string, BuiltinCodeSnippet[]>();

  for (const record of records) {
    stats.total += 1;
    if (!isRecord(record)) {
      stats.invalidMetadata += 1;
      continue;
    }

    const text = normalizeSnippetText(stringField(record.text) ?? "");
    const level = codeSnippetLevel(record.level);
    const domain = codeDomainForRecord(record);
    const framework = domain === undefined ? undefined : codeFrameworkFromDomain(domain);
    const syntaxLanguage = syntaxLanguageForRecord(record);
    const source =
      stringField(record.id) ??
      stringField(record.source_url) ??
      `keyloop:corpus-v4:${stats.total}`;
    const size = corpusSizeForText(level, text);

    if (
      text.length === 0 ||
      level === undefined ||
      domain === undefined ||
      framework === undefined ||
      size === "unknown"
    ) {
      stats.invalidMetadata += 1;
      continue;
    }

    const quality = assessCorpusTextQuality({ text, level, size });
    if (quality.status === "reject") {
      stats.rejected += 1;
      continue;
    }
    if (quality.status === "review") {
      stats.review += 1;
      continue;
    }
    stats.accepted += 1;

    if (seenTexts.has(text)) {
      stats.duplicate += 1;
      continue;
    }
    seenTexts.add(text);

    const typing = scoreTypingDifficulty(text);
    const difficulty = typing.difficulty as CodeSnippetDifficulty;
    const cellKey = `${domain}:${level}:${difficulty}:${size}`;
    const cellCount = cellCounts.get(cellKey) ?? 0;
    if (cellCount >= cellLimit) {
      stats.capped += 1;
      continue;
    }
    cellCounts.set(cellKey, cellCount + 1);

    snippets.push({
      text,
      source,
      language: domain,
      ...(syntaxLanguage === undefined ? {} : { syntax_language: syntaxLanguage }),
      framework,
      project: generatedProject,
      level,
      difficulty,
      score: typing.score,
    });
    const snippet = snippets[snippets.length - 1];
    if (snippet !== undefined) {
      const path = shardPath(domain, level, difficulty, size);
      const shard = shards.get(path) ?? [];
      shard.push(snippet);
      shards.set(path, shard);
    }
  }

  stats.kept = snippets.length;
  return {
    snippets,
    stats,
    index: buildCodeCorpusIndex(shards, stats, cellLimit),
    shards,
  };
}

export function loadCodeCorpus(
  options: ResolveCodeContentRootOptions = {},
): CodeCorpus {
  const contentRoot = resolveCodeContentRoot(options);
  const root = join(contentRoot, "code");
  return {
    root,
    index: JSON.parse(readFileSync(join(root, "index.json"), "utf8")) as CodeCorpusIndex,
  };
}

export function resolveCodeContentRoot(
  options: ResolveCodeContentRootOptions = {},
): string {
  const candidates = codeContentRootCandidates(options);
  const exists = options.exists ?? codeContentRootExists;
  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? join(process.cwd(), "ts", "content");
}

export function codeCorpusPracticeOptions(corpus: CodeCorpus): CodePracticeOption[] {
  return [
    ...sortedOptions(
      "language",
      countBy(
        corpus.index.shards.flatMap((shard): Array<[string, number]> =>
          isCodeFrameworkDomain(shard.language) ? [] : [[shard.language, shard.count]],
        ),
      ),
    ),
    ...sortedOptions("framework", mergeFacetCounts(corpus.index.shards, "frameworks")),
  ];
}

export function pickCodeCorpusSnippetsExcludingByDifficulty(
  corpus: CodeCorpus,
  planFocus: string[],
  codeConfig: Partial<CodePracticeConfig>,
  count: number,
  excludedTexts: Set<string>,
  difficulty?: string,
  options: CodeSnippetPickerOptions = {},
): BuiltinCodeSnippet[] {
  const config = defaultCodePracticeConfig(codeConfig);
  const random = options.random ?? Math.random;
  let candidates = codeCorpusCandidates(
    corpus,
    config,
    count,
    excludedTexts,
    planFocus,
    random,
    difficulty,
  );
  if (candidates.length < count && difficulty !== undefined) {
    candidates = codeCorpusCandidates(
      corpus,
      config,
      count,
      excludedTexts,
      planFocus,
      random,
    );
  }

  shuffleInPlace(candidates, random);
  const focus = planFocus.map((item) => item.toLowerCase());
  if (focus.length > 0) {
    candidates.sort(
      (left, right) => focusHitCount(right.text, focus) - focusHitCount(left.text, focus),
    );
  }
  return candidates.slice(0, count);
}

function codeCorpusCandidates(
  corpus: CodeCorpus,
  config: CodePracticeConfig,
  count: number,
  excludedTexts: Set<string>,
  planFocus: string[],
  random: () => number,
  difficulty?: string,
): BuiltinCodeSnippet[] {
  const shards = codeCorpusShardCandidates(corpus.index.shards, config, difficulty);
  shuffleInPlace(shards, random);

  const candidates: BuiltinCodeSnippet[] = [];
  const shouldReadAll = planFocus.length > 0;
  for (const shard of shards) {
    for (const snippet of readCodeCorpusShard(corpus, shard)) {
      const codeSnippet = codeSnippetFromBuiltin(snippet);
      if (
        matchesCodeConfig(codeSnippet, config) &&
        !isExcludedCodeSnippetText(codeSnippet.text, excludedTexts) &&
        (difficulty === undefined || codeSnippet.difficulty === difficulty)
      ) {
        candidates.push(snippet);
      }
    }
    if (!shouldReadAll && candidates.length >= count * 4) {
      break;
    }
  }
  return candidates;
}

function emptyStats(): BuildCodeCorpusSnapshotStats {
  return {
    total: 0,
    accepted: 0,
    review: 0,
    rejected: 0,
    duplicate: 0,
    capped: 0,
    invalidMetadata: 0,
    kept: 0,
  };
}

function buildCodeCorpusIndex(
  shards: Map<string, BuiltinCodeSnippet[]>,
  stats: BuildCodeCorpusSnapshotStats,
  cellLimit: number,
): CodeCorpusIndex {
  return {
    schema: "keyloop.code_corpus",
    schema_version: 1,
    cell_limit: cellLimit,
    stats,
    shards: [...shards.entries()]
      .map(([path, snippets]) => shardIndex(path, snippets))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function shardIndex(path: string, snippets: BuiltinCodeSnippet[]): CodeCorpusShardIndex {
  const first = snippets[0];
  if (first === undefined || first.difficulty === undefined) {
    throw new Error(`empty or invalid code corpus shard: ${path}`);
  }
  return {
    path,
    language: first.language,
    level: first.level,
    difficulty: first.difficulty,
    size: sizeFromShardPath(path),
    count: snippets.length,
    frameworks: countBy(
      snippets.flatMap((snippet): Array<[string, number]> =>
        snippet.framework === generalFramework ? [] : [[snippet.framework, 1]],
      ),
    ),
    projects: {},
  };
}

function shardPath(
  language: string,
  level: CodeSnippetLevel,
  difficulty: TypingDifficulty,
  size: CodeCorpusSize,
): string {
  return join(
    "snippets",
    pathSegment(language),
    level,
    difficulty,
    `${size}.jsonl`,
  ).replace(/\\/gu, "/");
}

function pathSegment(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-|-$/gu, "");
  return normalized.length > 0 ? normalized : "unknown";
}

function normalizedFacet(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    "c++": "cpp",
    "c#": "csharp",
    "javascript jsx": "jsx",
    "typescript jsx": "tsx",
  };
  return aliases[normalized] ?? pathSegment(normalized);
}

function codeDomainForRecord(record: Record<string, unknown>): string | undefined {
  return codeDomainFacet(
    stringField(record.technology_domain) ?? stringField(record.domain),
  );
}

function codeDomainFacet(value: string | undefined): string | undefined {
  const normalized = normalizedFacet(value);
  if (normalized === undefined) {
    return undefined;
  }
  return codeFrameworkAliases[normalized] ?? normalized;
}

function codeFrameworkFromDomain(domain: string): string {
  return isCodeFrameworkDomain(domain) ? domain : generalFramework;
}

function isCodeFrameworkDomain(domain: string): boolean {
  return codeFrameworkFacets.has(codeFrameworkAliases[domain] ?? domain);
}

function syntaxLanguageForRecord(record: Record<string, unknown>): string | undefined {
  const path =
    stringField(record.file_path) ??
    pathFromSourceUrl(stringField(record.source_url)) ??
    pathFromSourceUrl(stringField(record.id));
  if (path === undefined) {
    return undefined;
  }
  const language = languageFromSource(path);
  return language === "code" ? undefined : language;
}

function pathFromSourceUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.pathname;
  } catch {
    return value.split("#")[0]?.split("?")[0];
  }
}

function sizeFromShardPath(path: string): CodeCorpusSize {
  const fileName = path.split("/").at(-1) ?? "";
  const value = fileName.replace(/\.jsonl$/u, "");
  return corpusSize(value);
}

function codeContentRootCandidates(options: ResolveCodeContentRootOptions): string[] {
  const env = options.env ?? process.env;
  const candidates: string[] = [];
  const envRoot = env.KEYLOOP_TS_CONTENT_ROOT?.trim();
  if (envRoot !== undefined && envRoot.length > 0) {
    candidates.push(resolve(envRoot));
  }

  const moduleUrl = options.moduleUrl ?? import.meta.url;
  try {
    candidates.push(
      join(dirname(dirname(dirname(fileURLToPath(moduleUrl)))), "content"),
    );
  } catch {
    // Non-file module URLs cannot identify the repository root.
  }

  addPathAdjacentTsContentCandidates(candidates, options.argv1 ?? process.argv[1]);
  addPathAdjacentTsContentCandidates(candidates, options.execPath ?? process.execPath);
  candidates.push(join(process.cwd(), "ts", "content"));
  return [...new Set(candidates)];
}

function addPathAdjacentTsContentCandidates(
  candidates: string[],
  path: string | undefined,
): void {
  if (path === undefined || path.length === 0) {
    return;
  }
  const base = dirname(resolve(path));
  candidates.push(join(base, "ts", "content"));
  candidates.push(join(base, "..", "ts", "content"));
  candidates.push(join(base, "..", "..", "ts", "content"));
}

function codeContentRootExists(path: string): boolean {
  try {
    accessSync(join(path, codeContentMarkerFile));
    return true;
  } catch {
    return false;
  }
}

function codeCorpusShardCandidates(
  shards: CodeCorpusShardIndex[],
  config: CodePracticeConfig,
  difficulty?: string,
): CodeCorpusShardIndex[] {
  return shards
    .filter((shard) => config.level === undefined || shard.level === config.level)
    .filter((shard) => config.size === undefined || shard.size === config.size)
    .filter((shard) => difficulty === undefined || shard.difficulty === difficulty)
    .filter((shard) => shardMatchesCodeConfig(shard, config));
}

function shardMatchesCodeConfig(
  shard: CodeCorpusShardIndex,
  config: CodePracticeConfig,
): boolean {
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
      matchesAny(shard.language, config.languages) ||
      matchesAnyCount(shard.frameworks, config.frameworks) ||
      matchesAnyCount(shard.projects, config.projects)
    );
  }
  return (
    matchesOptional(shard.language, config.language, config.languages) &&
    matchesOptionalCount(shard.frameworks, config.framework, config.frameworks) &&
    matchesOptionalCount(shard.projects, config.project, config.projects)
  );
}

function readCodeCorpusShard(
  corpus: CodeCorpus,
  shard: CodeCorpusShardIndex,
): BuiltinCodeSnippet[] {
  const raw = readFileSync(join(corpus.root, shard.path), "utf8");
  const snippets: BuiltinCodeSnippet[] = [];
  for (const line of raw.split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }
    snippets.push(JSON.parse(line) as BuiltinCodeSnippet);
  }
  return snippets;
}

function matchesOptional(value: string, expected: string | undefined, expectedMany: string[]): boolean {
  return (
    (expected === undefined || equalsIgnoreCase(value, expected)) &&
    (expectedMany.length === 0 || matchesAny(value, expectedMany))
  );
}

function matchesOptionalCount(
  values: Record<string, number>,
  expected: string | undefined,
  expectedMany: string[],
): boolean {
  return (
    (expected === undefined || hasCountKey(values, expected)) &&
    (expectedMany.length === 0 || matchesAnyCount(values, expectedMany))
  );
}

function matchesAny(value: string, expectedMany: string[]): boolean {
  return expectedMany.some((expected) => equalsIgnoreCase(value, expected));
}

function matchesAnyCount(values: Record<string, number>, expectedMany: string[]): boolean {
  return expectedMany.some((expected) => hasCountKey(values, expected));
}

function hasCountKey(values: Record<string, number>, expected: string): boolean {
  return Object.keys(values).some((value) => equalsIgnoreCase(value, expected));
}

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sortedOptions(
  facet: CodePracticeFacet,
  counts: Record<string, number>,
): CodePracticeOption[] {
  return Object.entries(counts)
    .map(([value, count]) => ({ facet, value, count }))
    .sort((left, right) =>
      right.count === left.count ? left.value.localeCompare(right.value) : right.count - left.count,
    );
}

function mergeFacetCounts(
  shards: CodeCorpusShardIndex[],
  key: "frameworks" | "projects",
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const shard of shards) {
    for (const [value, count] of Object.entries(shard[key])) {
      counts[value] = (counts[value] ?? 0) + count;
    }
  }
  return counts;
}

function countBy(values: Array<[string, number]>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [value, count] of values) {
    counts[value] = (counts[value] ?? 0) + count;
  }
  return counts;
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

function focusHitCount(text: string, focus: string[]): number {
  const lower = text.toLowerCase();
  return focus.filter((term) => lower.includes(term)).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function codeSnippetLevel(value: unknown): CodeSnippetLevel | undefined {
  return value === "block" || value === "function" || value === "file"
    ? value
    : undefined;
}

function corpusSize(value: unknown): CodeCorpusSize {
  return value === "short" || value === "medium" || value === "long" ? value : "unknown";
}

function corpusSizeForText(
  level: CodeSnippetLevel | undefined,
  text: string,
): CodeCorpusSize {
  if (level === undefined) {
    return "unknown";
  }
  const lineCount = text.split(/\r?\n/u).length;
  const charCount = Array.from(text).length;
  return bestCorpusSize(level, lineCount, charCount);
}

function bestCorpusSize(
  level: CodeSnippetLevel,
  lineCount: number,
  charCount: number,
): CodeCorpusSize {
  const sizes = ["short", "medium", "long"] as const;
  let bestSize: CodeCorpusSize = "unknown";
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (const size of sizes) {
    const linePenalty = rangePenalty(lineCount, corpusSizeLineLimits[level][size]);
    const charPenalty = rangePenalty(charCount, corpusSizeCharLimits[level][size]);
    const penalty = linePenalty + charPenalty;
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestSize = size;
    }
  }
  return bestSize;
}

function rangePenalty(value: number, range: readonly [number, number]): number {
  const [min, max] = range;
  if (value < min) {
    return min - value;
  }
  if (value > max) {
    return value - max;
  }
  return 0;
}
