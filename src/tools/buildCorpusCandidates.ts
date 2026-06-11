import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

const defaultOutput = "content/corpus-rebuild/candidates.jsonl";
const defaultCellLimit = 45;

function main(): void {
  const inputs = optionValues("--input").map((path) => resolve(path));
  if (inputs.length === 0) {
    throw new Error("at least one --input directory is required");
  }
  const output = resolve(optionValue("--output") ?? defaultOutput);
  const cellLimit = numericOptionValue("--cell-limit") ?? defaultCellLimit;

  const result = buildCodeCorpusSnapshot(streamRecords(inputs), { cellLimit });

  const candidates: CandidateRecord[] = [];
  for (const [path, snippets] of result.shards) {
    const size = path.split("/").at(-1)?.replace(".jsonl", "") ?? "unknown";
    for (const snippet of snippets) {
      candidates.push({
        idx: candidates.length,
        domain: snippet.language,
        framework: snippet.framework,
        level: snippet.level,
        difficulty: snippet.difficulty ?? "unknown",
        score: snippet.score,
        size,
        source: snippet.source,
        text: snippet.text,
      });
    }
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    candidates.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n",
  );

  const stats = result.stats;
  console.log(`Output: ${output}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(
    [
      `Total ${stats.total}`,
      `accept ${stats.accepted}`,
      `review ${stats.review}`,
      `reject ${stats.rejected}`,
      `duplicate ${stats.duplicate}`,
      `capped ${stats.capped}`,
      `invalid ${stats.invalidMetadata}`,
      `kept ${stats.kept}`,
    ].join(" | "),
  );
}

function* streamRecords(roots: string[]): Generator<unknown> {
  for (const root of roots) {
    for (const file of jsonlFiles(root)) {
      const raw = readFileSync(file, "utf8");
      for (const line of raw.split(/\r?\n/u)) {
        if (line.trim().length === 0) {
          continue;
        }
        try {
          yield JSON.parse(line) as unknown;
        } catch {
          yield undefined;
        }
      }
    }
  }
}

function jsonlFiles(root: string): string[] {
  if (!statSync(root).isDirectory()) {
    return [root];
  }
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...jsonlFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(path);
    }
  }
  return files;
}

function optionValues(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name) {
      const value = process.argv[index + 1];
      if (value !== undefined) {
        values.push(value);
      }
    }
  }
  return values;
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
