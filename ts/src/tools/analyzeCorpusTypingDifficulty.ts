import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  assessCorpusTextQuality,
  type CorpusQualityFlag,
  type CorpusQualityMetrics,
  type CorpusQualityStatus,
} from "../content/corpusQuality";
import {
  scoreTypingDifficulty,
  type TypingDifficulty,
  type TypingDifficultyResult,
} from "../training/typingDifficulty";

interface CorpusRecord {
  id?: unknown;
  technology_domain?: unknown;
  level?: unknown;
  difficulty?: unknown;
  size?: unknown;
  typing_difficulty?: unknown;
  line_count?: unknown;
  char_count?: unknown;
  text?: unknown;
}

interface ReportSample {
  id: string;
  technology_domain: string;
  level: string;
  coding_difficulty: string;
  typing_difficulty: TypingDifficulty;
  typing_score: number;
  reasons: string[];
  text_preview: string;
}

interface QualitySample extends ReportSample {
  quality_status: CorpusQualityStatus;
  quality_flags: CorpusQualityFlag[];
  quality_metrics: CorpusQualityMetrics;
}

interface MismatchSample extends ReportSample {
  existing_typing_difficulty: string;
}

interface CoverageShortfall {
  technology_domain: string;
  level: "block" | "function" | "file";
  difficulty: "easy" | "medium" | "hard";
  size: "short" | "medium" | "long";
  target: number;
  actual: number;
  missing: number;
}

interface Report {
  input: string;
  total_lines: number;
  parsed_records: number;
  invalid_json: number;
  missing_text: number;
  typing_difficulty_counts: Record<TypingDifficulty, number>;
  typing_difficulty_counts_after_quality_gate: Record<TypingDifficulty, number>;
  score_histogram: Record<string, number>;
  by_domain: Record<string, Record<TypingDifficulty, number>>;
  by_level: Record<string, Record<TypingDifficulty, number>>;
  by_domain_level: Record<string, Record<TypingDifficulty, number>>;
  content_red_flags: {
    comment_only: number;
    import_only: number;
    comment_only_samples: ReportSample[];
    import_only_samples: ReportSample[];
  };
  quality_gate: {
    status_counts: Record<CorpusQualityStatus, number>;
    flag_counts: Partial<Record<CorpusQualityFlag, number>>;
    reject_samples: QualitySample[];
    review_samples: QualitySample[];
    samples_by_flag: Partial<Record<CorpusQualityFlag, QualitySample[]>>;
  };
  coverage_after_quality_gate: {
    accepted_records: number;
    target_per_cell: number;
    complete_cells: number;
    shortfall_cells: CoverageShortfall[];
  };
  existing_typing_difficulty_mismatches: {
    count: number;
    samples: MismatchSample[];
  };
  top_hard_samples: ReportSample[];
  top_easy_samples: ReportSample[];
}

const defaultInput = "content/corpus-v4/final";
const defaultOutput = "content/corpus-v4/reports/typing_difficulty_report.json";

async function main(): Promise<void> {
  const input = resolve(optionValue("--input") ?? defaultInput);
  const output = resolve(optionValue("--output") ?? defaultOutput);
  const report = await analyzeCorpus(input);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  printSummary(report, output);
}

async function analyzeCorpus(input: string): Promise<Report> {
  const report = emptyReport(input);
  const hardSamples: ReportSample[] = [];
  const easySamples: ReportSample[] = [];
  const acceptedCoverageCounts: Record<string, number> = {};
  const seenDomains = new Set<string>();

  for (const line of await readJsonlLines(input)) {
    if (line.trim().length === 0) {
      continue;
    }
    report.total_lines += 1;
    let record: CorpusRecord;
    try {
      record = JSON.parse(line) as CorpusRecord;
    } catch {
      report.invalid_json += 1;
      continue;
    }
    report.parsed_records += 1;

    if (typeof record.text !== "string" || record.text.length === 0) {
      report.missing_text += 1;
      continue;
    }

    const result = scoreTypingDifficulty(record.text);
    const sample = reportSample(record, result);
    const quality = assessCorpusTextQuality(record);
    const qualitySample = qualityReportSample(sample, quality);
    seenDomains.add(sample.technology_domain);
    increment(report.typing_difficulty_counts, result.difficulty);
    increment(report.score_histogram, String(result.score));
    incrementNested(report.by_domain, sample.technology_domain, result.difficulty);
    incrementNested(report.by_level, sample.level, result.difficulty);
    incrementNested(
      report.by_domain_level,
      `${sample.technology_domain}:${sample.level}`,
      result.difficulty,
    );

    increment(report.quality_gate.status_counts, quality.status);
    if (quality.status === "reject") {
      pushLimited(report.quality_gate.reject_samples, qualitySample, 30);
    } else if (quality.status === "review") {
      pushLimited(report.quality_gate.review_samples, qualitySample, 30);
    } else {
      increment(report.typing_difficulty_counts_after_quality_gate, result.difficulty);
      pushTopSample(hardSamples, sample, "hard");
      pushTopSample(easySamples, sample, "easy");
      const coverageKey = coverageCellKey(record);
      if (coverageKey !== undefined) {
        acceptedCoverageCounts[coverageKey] =
          (acceptedCoverageCounts[coverageKey] ?? 0) + 1;
      }
    }
    for (const flag of quality.flags) {
      incrementPartial(report.quality_gate.flag_counts, flag);
      const samples = report.quality_gate.samples_by_flag[flag] ?? [];
      pushLimited(samples, qualitySample, 10);
      report.quality_gate.samples_by_flag[flag] = samples;
    }

    if (
      typeof record.typing_difficulty === "string" &&
      record.typing_difficulty !== result.difficulty
    ) {
      report.existing_typing_difficulty_mismatches.count += 1;
      pushLimited(
        report.existing_typing_difficulty_mismatches.samples,
        {
          ...sample,
          existing_typing_difficulty: record.typing_difficulty,
        },
        20,
      );
    }
  }

  report.top_hard_samples = hardSamples;
  report.top_easy_samples = easySamples;
  report.content_red_flags.comment_only =
    report.quality_gate.flag_counts.comment_only ?? 0;
  report.content_red_flags.import_only =
    report.quality_gate.flag_counts.import_only ?? 0;
  report.content_red_flags.comment_only_samples =
    report.quality_gate.samples_by_flag.comment_only ?? [];
  report.content_red_flags.import_only_samples =
    report.quality_gate.samples_by_flag.import_only ?? [];
  report.coverage_after_quality_gate = coverageAfterQualityGate(
    Array.from(seenDomains).sort(),
    acceptedCoverageCounts,
  );
  return report;
}

async function readJsonlLines(path: string): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) {
    return readJsonlFileLines(path);
  }

  const lines: string[] = [];
  for (const file of await jsonlFiles(path)) {
    lines.push(...await readJsonlFileLines(file));
  }
  return lines;
}

async function jsonlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await jsonlFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(path);
    }
  }
  return files;
}

async function readJsonlFileLines(path: string): Promise<string[]> {
  return (await readFile(path, "utf8")).split(/\r?\n/u);
}

function emptyReport(input: string): Report {
  return {
    input,
    total_lines: 0,
    parsed_records: 0,
    invalid_json: 0,
    missing_text: 0,
    typing_difficulty_counts: { easy: 0, medium: 0, hard: 0 },
    typing_difficulty_counts_after_quality_gate: { easy: 0, medium: 0, hard: 0 },
    score_histogram: {},
    by_domain: {},
    by_level: {},
    by_domain_level: {},
    content_red_flags: {
      comment_only: 0,
      import_only: 0,
      comment_only_samples: [],
      import_only_samples: [],
    },
    quality_gate: {
      status_counts: { accept: 0, review: 0, reject: 0 },
      flag_counts: {},
      reject_samples: [],
      review_samples: [],
      samples_by_flag: {},
    },
    coverage_after_quality_gate: {
      accepted_records: 0,
      target_per_cell: 30,
      complete_cells: 0,
      shortfall_cells: [],
    },
    existing_typing_difficulty_mismatches: {
      count: 0,
      samples: [],
    },
    top_hard_samples: [],
    top_easy_samples: [],
  };
}

function reportSample(
  record: CorpusRecord,
  result: TypingDifficultyResult,
): ReportSample {
  const text = typeof record.text === "string" ? record.text : "";
  return {
    id: stringValue(record.id, "unknown"),
    technology_domain: stringValue(record.technology_domain, "unknown"),
    level: stringValue(record.level, "unknown"),
    coding_difficulty: stringValue(record.difficulty, "unknown"),
    typing_difficulty: result.difficulty,
    typing_score: result.score,
    reasons: result.reasons,
    text_preview: preview(text),
  };
}

function qualityReportSample(
  sample: ReportSample,
  quality: ReturnType<typeof assessCorpusTextQuality>,
): QualitySample {
  return {
    ...sample,
    quality_status: quality.status,
    quality_flags: quality.flags,
    quality_metrics: quality.metrics,
  };
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function increment<T extends string>(counts: Record<T, number>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function incrementPartial<T extends string>(
  counts: Partial<Record<T, number>>,
  key: T,
): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function incrementNested(
  root: Record<string, Record<TypingDifficulty, number>>,
  outer: string,
  difficulty: TypingDifficulty,
): void {
  const counts = root[outer] ?? { easy: 0, medium: 0, hard: 0 };
  counts[difficulty] += 1;
  root[outer] = counts;
}

function pushLimited<T>(items: T[], item: T, limit: number): void {
  if (items.length < limit) {
    items.push(item);
  }
}

function pushTopSample(
  samples: ReportSample[],
  sample: ReportSample,
  mode: "hard" | "easy",
): void {
  samples.push(sample);
  samples.sort((left, right) =>
    mode === "hard"
      ? right.typing_score - left.typing_score
      : left.typing_score - right.typing_score,
  );
  if (samples.length > 20) {
    samples.pop();
  }
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function preview(text: string): string {
  return text.replace(/\s+/gu, " ").trim().slice(0, 180);
}

function coverageCellKey(record: CorpusRecord): string | undefined {
  const domain = stringValue(record.technology_domain, "");
  const level = stringValue(record.level, "");
  const difficulty = stringValue(record.difficulty, "");
  const size = stringValue(record.size, "");
  if (
    domain.length === 0 ||
    !isLevel(level) ||
    !isDifficulty(difficulty) ||
    !isSize(size)
  ) {
    return undefined;
  }
  return `${domain}:${level}:${difficulty}:${size}`;
}

function coverageAfterQualityGate(
  domains: string[],
  counts: Record<string, number>,
): Report["coverage_after_quality_gate"] {
  const shortfallCells: CoverageShortfall[] = [];
  let completeCells = 0;
  let acceptedRecords = 0;

  for (const value of Object.values(counts)) {
    acceptedRecords += value;
  }
  for (const domain of domains) {
    for (const level of ["block", "function", "file"] as const) {
      for (const difficulty of ["easy", "medium", "hard"] as const) {
        for (const size of ["short", "medium", "long"] as const) {
          const actual = counts[`${domain}:${level}:${difficulty}:${size}`] ?? 0;
          if (actual >= 30) {
            completeCells += 1;
          } else {
            shortfallCells.push({
              technology_domain: domain,
              level,
              difficulty,
              size,
              target: 30,
              actual,
              missing: 30 - actual,
            });
          }
        }
      }
    }
  }

  return {
    accepted_records: acceptedRecords,
    target_per_cell: 30,
    complete_cells: completeCells,
    shortfall_cells: shortfallCells,
  };
}

function isLevel(value: string): value is "block" | "function" | "file" {
  return value === "block" || value === "function" || value === "file";
}

function isDifficulty(value: string): value is "easy" | "medium" | "hard" {
  return value === "easy" || value === "medium" || value === "hard";
}

function isSize(value: string): value is "short" | "medium" | "long" {
  return value === "short" || value === "medium" || value === "long";
}

function printSummary(report: Report, output: string): void {
  const total = Math.max(report.parsed_records - report.missing_text, 1);
  const counts = report.typing_difficulty_counts;
  console.log(`Input: ${report.input}`);
  console.log(`Output: ${output}`);
  console.log(
    `Parsed: ${report.parsed_records} | Invalid JSON: ${report.invalid_json} | Missing text: ${report.missing_text}`,
  );
  console.log(
    `Typing difficulty: easy ${percent(counts.easy, total)} (${counts.easy}), medium ${percent(
      counts.medium,
      total,
    )} (${counts.medium}), hard ${percent(counts.hard, total)} (${counts.hard})`,
  );
  const acceptedTotal = Math.max(report.coverage_after_quality_gate.accepted_records, 1);
  const acceptedCounts = report.typing_difficulty_counts_after_quality_gate;
  console.log(
    `Accepted typing difficulty: easy ${percent(
      acceptedCounts.easy,
      acceptedTotal,
    )} (${acceptedCounts.easy}), medium ${percent(
      acceptedCounts.medium,
      acceptedTotal,
    )} (${acceptedCounts.medium}), hard ${percent(
      acceptedCounts.hard,
      acceptedTotal,
    )} (${acceptedCounts.hard})`,
  );
  console.log(
    `Red flags: comment_only ${report.content_red_flags.comment_only}, import_only ${report.content_red_flags.import_only}`,
  );
  console.log(
    `Quality gate: accept ${report.quality_gate.status_counts.accept}, review ${report.quality_gate.status_counts.review}, reject ${report.quality_gate.status_counts.reject}`,
  );
  console.log(
    `Coverage after quality gate: ${report.coverage_after_quality_gate.complete_cells} complete cells, ${report.coverage_after_quality_gate.shortfall_cells.length} shortfall cells`,
  );
}

function percent(count: number, total: number): string {
  return `${((count / total) * 100).toFixed(1)}%`;
}

await main();
