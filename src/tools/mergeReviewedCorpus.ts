import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { buildCodeCorpusSnapshot } from "../content/codeCorpus";

interface CandidateRecord {
  idx: number;
  domain: string;
  framework: string;
  level: string;
  difficulty: string;
  score: number | undefined;
  size: string;
  source: string;
  text: string;
}

interface ReviewRecord {
  idx: number;
  tf: number;
  rp: number;
  rv: number;
  verdict?: "accept" | "reject";
  reason?: string;
}

function effectiveVerdict(review: ReviewRecord, framework: string): "accept" | "reject" {
  if (review.verdict === "reject") {
    return "reject";
  }
  if (review.tf <= 4) {
    return "reject";
  }
  if (framework !== "general" && review.rp <= 3) {
    return "reject";
  }
  if (review.tf * 0.5 + review.rp * 0.3 + review.rv * 0.2 < 5) {
    return "reject";
  }
  return "accept";
}

const defaultCellLimit = 30;

function main(): void {
  const candidatesPath = resolve(requiredOption("--candidates"));
  const reviewsDir = resolve(requiredOption("--reviews"));
  const output = resolve(requiredOption("--output"));
  const cellLimit = numericOptionValue("--cell-limit") ?? defaultCellLimit;

  const reviews = new Map<number, ReviewRecord>();
  for (const file of readdirSync(reviewsDir).sort()) {
    if (!file.endsWith(".jsonl")) {
      continue;
    }
    for (const line of readFileSync(join(reviewsDir, file), "utf8").split(/\r?\n/u)) {
      if (line.trim().length === 0) {
        continue;
      }
      const review = JSON.parse(line) as ReviewRecord;
      reviews.set(review.idx, review);
    }
  }

  const accepted: Array<{ weight: number; record: Record<string, unknown> }> = [];
  let total = 0;
  let missing = 0;
  let rejected = 0;
  for (const line of readFileSync(candidatesPath, "utf8").split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }
    total += 1;
    const candidate = JSON.parse(line) as CandidateRecord;
    const review = reviews.get(candidate.idx);
    if (review === undefined) {
      missing += 1;
      continue;
    }
    if (effectiveVerdict(review, candidate.framework) !== "accept") {
      rejected += 1;
      continue;
    }
    accepted.push({
      weight: review.tf * 0.5 + review.rp * 0.3 + review.rv * 0.2,
      record: {
        id: candidate.source,
        technology_domain: candidate.domain,
        level: candidate.level,
        text: candidate.text,
        review_scores: { tf: review.tf, rp: review.rp, rv: review.rv },
      },
    });
  }

  accepted.sort((left, right) => right.weight - left.weight);
  const result = buildCodeCorpusSnapshot(
    accepted.map((entry) => entry.record),
    { cellLimit },
  );

  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "index.json"), `${JSON.stringify(result.index, null, 2)}\n`);
  for (const [path, snippets] of result.shards) {
    const outputPath = join(output, path);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(
      outputPath,
      snippets.map((snippet) => JSON.stringify(snippet)).join("\n") + "\n",
    );
  }

  console.log(`Output: ${output}`);
  console.log(
    [
      `candidates ${total}`,
      `reviewed ${total - missing}`,
      `missing-review ${missing}`,
      `review-rejected ${rejected}`,
      `review-accepted ${accepted.length}`,
      `final kept ${result.stats.kept}`,
      `capped ${result.stats.capped}`,
    ].join(" | "),
  );
}

function requiredOption(name: string): string {
  const value = optionValue(name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function numericOptionValue(name: string): number | undefined {
  const value = optionValue(name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main();
