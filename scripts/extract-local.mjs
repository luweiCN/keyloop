#!/usr/bin/env node
/**
 * KeyLoop Corpus V3 — Extract TypeScript functions from locally cloned repos.
 * Repos are cloned at /tmp/keyloop-repos/{owner}_{name}/
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
import { join, resolve, relative } from "path";
import { execSync } from "child_process";

const REPOS_DIR = "/tmp/keyloop-repos";
const OUTPUT_DIR = resolve("content/corpus-v3/raw");

const REPO_META = {
  "angular/angular":  { framework: "angular",  domain: "frontend" },
  "colinhacks/zod":   { framework: "zod",      domain: "library"  },
  "date-fns/date-fns":{ framework: "date-fns", domain: "library"  },
  "effect-TS/effect": { framework: "effect",   domain: "library"  },
  "honojs/hono":      { framework: "hono",     domain: "backend"  },
  "nuxt/nuxt":        { framework: "nuxt",     domain: "frontend" },
  "sveltejs/svelte":  { framework: "svelte",   domain: "frontend" },
  "TanStack/query":   { framework: "tanstack", domain: "frontend" },
  "trpc/trpc":        { framework: "trpc",     domain: "backend"  },
  "vitejs/vite":      { framework: "vite",     domain: "tooling"  },
  "vitest-dev/vitest":{ framework: "vitest",   domain: "tooling"  },
  "vuejs/core":       { framework: "vue",      domain: "frontend" },
};

const SIZE_RANGES = {
  short:  { minLines: 6,  maxLines: 14, minChars: 120,  maxChars: 1100 },
  medium: { minLines: 15, maxLines: 30, minChars: 400,  maxChars: 2600 },
  long:   { minLines: 31, maxLines: 55, minChars: 1200, maxChars: 5000 },
};

function getCommitSha(repoDir) {
  return execSync("git rev-parse HEAD", { cwd: repoDir, encoding: "utf8" }).trim();
}

function findTsFiles(dir, repoDir, results = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" ||
        entry.name === "dist" || entry.name === "build" || entry.name === "__tests__") continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsFiles(fullPath, repoDir, results);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      const relPath = relative(repoDir, fullPath);
      // Only include files under src/ directories
      if (/(?:^|\/)src\//.test(relPath)) {
        // Exclude test files
        if (/(?:test|spec|\.test\.|\.spec\.|bench|benchmark|mock|fixture)/i.test(relPath)) continue;
        const size = statSync(fullPath).size;
        if (size > 200 && size < 80000) {
          results.push({ fullPath, relPath, size });
        }
      }
    }
  }
  return results;
}

// ─── function extraction ─────────────────────────────────────────────

function extractFunctions(source) {
  const lines = source.split("\n");
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") ||
        trimmed.startsWith("*") || trimmed.startsWith("import ") ||
        trimmed.startsWith("export {") || trimmed.startsWith("export type ") ||
        trimmed.startsWith("export interface ") || trimmed.startsWith("export declare ") ||
        trimmed.startsWith("type ") || trimmed.startsWith("interface ")) continue;
    if (!isFunctionStart(trimmed)) continue;
    const endIdx = findFunctionEnd(lines, i);
    if (endIdx < 0) continue;
    const text = lines.slice(i, endIdx + 1).join("\n");
    results.push({ startLine: i + 1, endLine: endIdx + 1, text, lineCount: endIdx - i + 1, charCount: text.length });
  }
  return results;
}

function isFunctionStart(line) {
  if (/\bfunction\s+\w/.test(line)) return true;
  if (/^(?:export\s+)?(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\(|function\b|<[^>]+>\s*\()/.test(line)) return true;
  if (/\bconstructor\s*\(/.test(line)) return true;
  if (/^(?:(?:public|private|protected|static)\s+)*(?:get|set)\s+\w+\s*[({]/.test(line)) return true;
  if (/^(?:(?:public|private|protected|static|async|abstract|override|readonly)\s+)+(?:async\s+)?(?:get\s+|set\s+)?\w+\s*[<{(]/.test(line)) return true;
  if (/^async\s+function\s+/.test(line)) return true;
  return false;
}

function findFunctionEnd(lines, startIdx) {
  // Only track curly braces {} for function body boundary.
  // Skip () and [] — they belong to signatures/expressions, not function body.
  let braceDepth = 0;
  let foundFirst = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    let inStr = false, strCh = "", inTpl = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c], nx = line[c + 1] || "";
      if (inStr) { if (ch === "\\") { c++; continue; } if (ch === strCh) inStr = false; continue; }
      if (inTpl) { if (ch === "\\") { c++; continue; } if (ch === "`") inTpl = false; continue; }
      if (ch === "/" && nx === "/") break;
      if (ch === "/" && nx === "*") { c += 2; while (c < line.length - 1 && !(line[c] === "*" && line[c + 1] === "/")) c++; continue; }
      if (ch === "'" || ch === '"') { inStr = true; strCh = ch; continue; }
      if (ch === "`") { inTpl = true; continue; }
      if (ch === "{") { braceDepth++; foundFirst = true; }
      if (ch === "}") { braceDepth--; if (foundFirst && braceDepth <= 0) return i; }
    }
  }
  return -1;
}

function balancedBraces(text) {
  let open = 0, close = 0, inStr = false, strCh = "", inTpl = false, i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1] || "";
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < text.length - 1 && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
    if (inStr) { if (c === "\\") { i += 2; continue; } if (c === strCh) inStr = false; i++; continue; }
    if (inTpl) { if (c === "\\") { i += 2; continue; } if (c === "`") inTpl = false; i++; continue; }
    if (c === "'" || c === '"') { inStr = true; strCh = c; i++; continue; }
    if (c === "`") { inTpl = true; i++; continue; }
    if (c === "{") open++;
    if (c === "}") close++;
    i++;
  }
  return open === close;
}

function isJunk(text) {
  const stripped = text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (stripped.length < 30) return true;
  if (/^import\s[\s\S]*;\s*$/.test(stripped)) return true;
  return false;
}

function classifySize(lineCount, charCount) {
  for (const [size, range] of Object.entries(SIZE_RANGES)) {
    if (lineCount >= range.minLines && lineCount <= range.maxLines &&
        charCount >= range.minChars && charCount <= range.maxChars) return size;
  }
  return null;
}

// ─── main ────────────────────────────────────────────────────────────

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const buckets = { short: [], medium: [], long: [] };
  const seenHashes = new Set();

  for (const [repoKey, meta] of Object.entries(REPO_META)) {
    const dirName = repoKey.replace(/\//g, "_");
    // Handle special cases for directory naming
    const repoDir = join(REPOS_DIR, dirName === "vitest-dev_vitest" ? "vitest-dev_vitest" : dirName);

    console.log(`\n=== ${repoKey} ===`);
    if (!statSync(repoDir, { throwIfNoEntry: false })) {
      console.log("  SKIP: directory not found");
      continue;
    }

    const sha = getCommitSha(repoDir);
    console.log(`  SHA: ${sha.slice(0, 12)}...`);

    const { framework, domain } = meta;
    const tsFiles = findTsFiles(repoDir, repoDir);

    // Deterministic shuffle
    for (let i = tsFiles.length - 1; i > 0; i--) {
      const j = (i * 7 + 13) % (i + 1);
      [tsFiles[i], tsFiles[j]] = [tsFiles[j], tsFiles[i]];
    }

    // Scan all files to maximize extraction
    const selected = tsFiles;
    console.log(`  Scanning ${selected.length} .ts files`);

    let repoCount = 0;
    let repoPerBucket = { short: 0, medium: 0, long: 0 };
    const MAX_PER_REPO_PER_BUCKET = 15;
    for (const file of selected) {
      const content = readFileSync(file.fullPath, "utf8");
      if (!content || content.length < 50) continue;

      const fns = extractFunctions(content);
      for (const fn of fns) {
        const { text, lineCount, charCount, startLine, endLine } = fn;
        if (lineCount < 6 || lineCount > 55) continue;
        if (charCount < 120 || charCount > 5000) continue;
        if (!balancedBraces(text)) continue;
        if (isJunk(text)) continue;
        const hash = text.replace(/\s+/g, " ").trim().slice(0, 200);
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);
        const size = classifySize(lineCount, charCount);
        if (!size) continue;
        if (buckets[size].length >= 120) continue;
        if (repoPerBucket[size] >= MAX_PER_REPO_PER_BUCKET) continue;
        repoPerBucket[size]++;
        buckets[size].push({
          id: `github:${repoKey}:${file.relPath}:${startLine}-${endLine}`,
          corpus_version: 3, quality: "raw", source_kind: "github", repo: repoKey,
          repo_url: `https://github.com/${repoKey}`,
          source_url: `https://github.com/${repoKey}/blob/${sha}/${file.relPath}#L${startLine}-L${endLine}`,
          commit_sha: sha, file_path: file.relPath, start_line: startLine, end_line: endLine,
          technology_domain: framework, language: "typescript", framework, domain,
          level: "function", difficulty_score: -1, difficulty: "pending",
          size, line_count: lineCount, char_count: charCount, text,
        });
        repoCount++;
      }
    }
    console.log(`  Extracted: ${repoCount} functions`);
    console.log(`  Totals: short=${buckets.short.length} medium=${buckets.medium.length} long=${buckets.long.length}`);
  }

  // Write output
  for (const [size, records] of Object.entries(buckets)) {
    const fname = `typescript_function_${size}_candidates.jsonl`;
    writeFileSync(join(OUTPUT_DIR, fname), records.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
    console.log(`\nWrote ${records.length} records to typescript_function_${size}_candidates.jsonl`);
  }
  console.log(`\nTotal: ${buckets.short.length + buckets.medium.length + buckets.long.length} candidates`);
}

main();
