import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  buildCodeCorpusSnapshot,
  type BuildCodeCorpusSnapshotStats,
} from "../content/codeCorpus";

interface GeneratedCodeCorpusStats extends BuildCodeCorpusSnapshotStats {
  input: string;
  cellLimit: number;
}

const defaultInput = "content/corpus-v4/final";
const defaultOutput = "ts/content/code";
const defaultCellLimit = 30;

async function main(): Promise<void> {
  const input = resolve(optionValue("--input") ?? defaultInput);
  const output = resolve(optionValue("--output") ?? defaultOutput);
  const cellLimit = numericOptionValue("--cell-limit") ?? defaultCellLimit;
  const records = await readJsonlInput(input);
  const result = buildCodeCorpusSnapshot(records, { cellLimit });
  const stats: GeneratedCodeCorpusStats = {
    ...result.stats,
    input,
    cellLimit,
  };

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "index.json"), `${JSON.stringify(result.index, null, 2)}\n`);
  for (const [path, snippets] of result.shards) {
    const outputPath = join(output, path);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      snippets.map((snippet) => JSON.stringify(snippet)).join("\n") + "\n",
    );
  }
  printSummary(output, stats);
}

async function readJsonlInput(path: string): Promise<unknown[]> {
  const info = await stat(path);
  if (!info.isDirectory()) {
    return readJsonlFile(path);
  }

  const records: unknown[] = [];
  for (const file of await jsonlFiles(path)) {
    records.push(...await readJsonlFile(file));
  }
  return records;
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

async function readJsonlFile(path: string): Promise<unknown[]> {
  const records: unknown[] = [];
  const raw = await readFile(path, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      records.push(JSON.parse(line) as unknown);
    } catch {
      records.push(undefined);
    }
  }
  return records;
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

function printSummary(output: string, stats: GeneratedCodeCorpusStats): void {
  console.log(`Output: ${output}`);
  console.log(
    [
      `Total ${stats.total}`,
      `kept ${stats.kept}`,
      `accept ${stats.accepted}`,
      `review ${stats.review}`,
      `reject ${stats.rejected}`,
      `duplicate ${stats.duplicate}`,
      `capped ${stats.capped}`,
      `invalid ${stats.invalidMetadata}`,
    ].join(" | "),
  );
}

await main();
