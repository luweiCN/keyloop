import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

import {
  collectTypeScriptCorpusV4FromFile,
  type CorpusV4Level,
  type CorpusV4Record,
} from "../content/corpusV4Collector";

interface RepoConfig {
  name: string;
  owner: string;
  repo: string;
  root: string;
  commitSha: string;
  framework: string;
  licenseSpdx: string;
}

const repoConfigs: RepoConfig[] = [
  {
    name: "typescript",
    owner: "microsoft",
    repo: "TypeScript",
    root: "/tmp/keyloop-corpus-v4-repos/typescript",
    commitSha: "7539c04d94b5adc924efb3f8fef90e4de18d39d3",
    framework: "typescript",
    licenseSpdx: "Apache-2.0",
  },
  {
    name: "vite",
    owner: "vitejs",
    repo: "vite",
    root: "/tmp/keyloop-corpus-v4-repos/vite",
    commitSha: "c13a37b53ec673e5a9053355fce3b9c4528fd917",
    framework: "vite",
    licenseSpdx: "MIT",
  },
  {
    name: "playwright",
    owner: "microsoft",
    repo: "playwright",
    root: "/tmp/keyloop-corpus-v4-repos/playwright",
    commitSha: "ae106c05e5a40486ab5b9704234c32f0499e9719",
    framework: "playwright",
    licenseSpdx: "Apache-2.0",
  },
];

const outputRoot = "content/corpus-v4/raw/typescript";
const maxFileBytes = 180_000;
const maxRecordsPerLevel: Record<CorpusV4Level, number> = {
  block: 80,
  function: 80,
  file: 80,
};
const allowedExtensions = new Set([".ts", ".tsx"]);
const forbiddenPathParts = [
  "node_modules",
  "vendor",
  "dist",
  "build",
  "generated",
  ".generated",
  "__generated__",
  "snapshot",
  "snapshots",
  "fixtures",
  "lock",
  "test",
  "tests",
  "__tests__",
  "__test__",
  "spec",
  "specs",
  "unittest",
  "unittests",
  "docs",
  "doc",
  "documentation",
  "playground",
  "example",
  "examples",
  "sample",
  "samples",
  "demo",
];

async function main(): Promise<void> {
  await mkdir(outputRoot, { recursive: true });
  for (const repo of repoConfigs) {
    const files = await sourceFiles(repo.root);
    const recordsByLevel: Record<CorpusV4Level, CorpusV4Record[]> = {
      block: [],
      function: [],
      file: [],
    };
    const seenSourceRanges = new Set<string>();
    const seenTexts = new Set<string>();
    for (const file of files) {
      if (levelQuotasFilled(recordsByLevel)) {
        break;
      }
      const collected = await collectTypeScriptCorpusV4FromFile(file, repo.root, {
        repo: `${repo.owner}/${repo.repo}`,
        repoUrl: `https://github.com/${repo.owner}/${repo.repo}`,
        commitSha: repo.commitSha,
        technologyDomain: "typescript",
        language: "TypeScript",
        framework: repo.framework,
        licenseSpdx: repo.licenseSpdx,
      });
      for (const record of collected) {
        if (recordsByLevel[record.level].length >= maxRecordsPerLevel[record.level]) {
          continue;
        }
        const rangeKey = `${record.file_path}:${record.start_line}-${record.end_line}`;
        if (seenSourceRanges.has(rangeKey)) {
          continue;
        }
        const textKey = normalizedTextKey(record.text);
        if (seenTexts.has(textKey)) {
          continue;
        }
        seenSourceRanges.add(rangeKey);
        seenTexts.add(textKey);
        recordsByLevel[record.level].push(record);
      }
    }
    const records = [
      ...recordsByLevel.block,
      ...recordsByLevel.function,
      ...recordsByLevel.file,
    ];
    const outputPath = join(outputRoot, `${repo.owner}--${repo.repo}.jsonl`);
    await writeFile(
      outputPath,
      records.map((record, index) => JSON.stringify({ ...record, id: `${record.id}-${String(index + 1).padStart(4, "0")}` })).join("\n") + "\n",
    );
    console.log(`${repo.owner}/${repo.repo}: ${records.length} records -> ${outputPath}`);
  }
}

function levelQuotasFilled(recordsByLevel: Record<CorpusV4Level, CorpusV4Record[]>): boolean {
  return (Object.keys(maxRecordsPerLevel) as CorpusV4Level[]).every(
    (level) => recordsByLevel[level].length >= maxRecordsPerLevel[level],
  );
}

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walk(root, files);
  files.sort((left, right) => scorePath(left) - scorePath(right) || left.localeCompare(right));
  return files;
}

async function walk(path: string, files: string[]): Promise<void> {
  const metadata = await stat(path).catch(() => null);
  if (metadata === null) {
    return;
  }
  if (metadata.isDirectory()) {
    if (isForbiddenPath(path)) {
      return;
    }
    const entries = await readdir(path);
    for (const entry of entries) {
      await walk(join(path, entry), files);
    }
    return;
  }
  if (!metadata.isFile() || metadata.size > maxFileBytes || !allowedExtensions.has(extname(path))) {
    return;
  }
  if (isForbiddenPath(path) || path.endsWith(".d.ts")) {
    return;
  }
  const text = await readFile(path, "utf8").catch(() => "");
  if (text.trim().length === 0) {
    return;
  }
  files.push(path);
}

function isForbiddenPath(path: string): boolean {
  const parts = path.split(/[\\/]/u).map((part) => part.toLowerCase());
  return parts.some((part) => forbiddenPathParts.includes(part)) || basename(path).toLowerCase().includes(".test.");
}

function scorePath(path: string): number {
  const relativePath = relative(process.cwd(), path);
  let score = 0;
  if (relativePath.includes("/src/")) score -= 20;
  if (relativePath.includes("/packages/")) score -= 10;
  if (relativePath.includes("/compiler/")) score -= 5;
  if (relativePath.includes("/server/")) score -= 5;
  if (relativePath.includes("/shared/")) score -= 4;
  if (relativePath.includes("/utils/")) score -= 3;
  return score;
}

function normalizedTextKey(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

await main();
