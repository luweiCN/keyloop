#!/usr/bin/env node
/**
 * KeyLoop Corpus V3 — Extract functions from pre-saved .ts source files.
 * Files are saved in /tmp/keyloop-sources/ as {repo}__{path}.ts
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const SOURCE_DIR = "/tmp/keyloop-sources";
const OUTPUT_DIR = "content/corpus-v3/raw";

const SIZE_RANGES = {
  short:  { minLines: 6,  maxLines: 14, minChars: 120,  maxChars: 1100 },
  medium: { minLines: 15, maxLines: 30, minChars: 400,  maxChars: 2600 },
  long:   { minLines: 31, maxLines: 55, minChars: 1200, maxChars: 5000 },
};

const REPO_META = {
  "vuejs/core":       { framework: "vue",      domain: "frontend", sha: "48ad452dd61926a59e358da3c74c5ef750ae21c4" },
  "vitejs/vite":      { framework: "vite",     domain: "tooling",  sha: "c13a37b53ec673e5a9053355fce3b9c4528fd917" },
  "trpc/trpc":        { framework: "trpc",     domain: "backend",  sha: "c7360d4eb3c89c336468809a293e5cda4b302d4b" },
  "honojs/hono":      { framework: "hono",     domain: "backend",  sha: "c78932d745cdf6284ae131a156479ac930da0262" },
  "TanStack/query":   { framework: "tanstack", domain: "frontend", sha: "4077908fbdb80735715aed349b8a24e9c06a7ded" },
  "vitest-dev/vitest":{ framework: "vitest",   domain: "tooling",  sha: "bdd985433e31b7e792483dab8f07a6832960fa55" },
  "colinhacks/zod":   { framework: "zod",      domain: "library",  sha: "bbc68f990c7e6a5e3f506c56fb04bd0279b9c9b5" },
  "effect-TS/effect": { framework: "effect",   domain: "library",  sha: "05d72eab7bac3444ca20d871d4c65a272200ef0e" },
  "nuxt/nuxt":        { framework: "nuxt",     domain: "frontend", sha: "f67cca55abba1688f350d1ae3aa0d23c532d9f0c" },
  "date-fns/date-fns":{ framework: "date-fns", domain: "library",  sha: "eefe78408f59540b1cac8e99adad0813e5d9adec" },
  "angular/angular":  { framework: "angular",  domain: "frontend", sha: "255151a41349c519728651739412dbd0f6138e13" },
  "sveltejs/svelte":  { framework: "svelte",   domain: "frontend", sha: "71a6515bd648202b2795a80e68e7c9c7ac9ad4ee" },
};

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
  let depth = 0, foundFirst = false;
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
      if ("{([".includes(ch)) { depth++; foundFirst = true; }
      if ("})]".includes(ch)) { depth--; if (foundFirst && depth <= 0) return i; }
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
    if (c === "{") open++; if (c === "}") close++; i++;
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

  const files = readdirSync(SOURCE_DIR).filter(f => f.endsWith(".ts.raw") || f.endsWith(".ts"));
  console.log(`Found ${files.length} source files in ${SOURCE_DIR}`);

  for (const fname of files) {
    // Parse repo and path from filename: {repo}__{path}
    const content = readFileSync(join(SOURCE_DIR, fname), "utf8");
    if (!content || content.length < 50) continue;

    // Extract repo and path from filename
    // Format: vuejs_core__packages_reactivity_src_computed.ts
    const parts = fname.replace(/\.(ts|raw)$/, "").split("__");
    const repoKey = parts[0].replace(/_/g, "/");
    const filePath = parts.slice(1).join("/").replace(/_/g, "/") + ".ts";
    const meta = REPO_META[repoKey];
    if (!meta) {
      console.log(`  Unknown repo: ${repoKey} from ${fname}`);
      continue;
    }

    const fns = extractFunctions(content);
    let count = 0;
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
      const { sha, framework, domain } = meta;
      buckets[size].push({
        id: `github:${repoKey}:${filePath}:${startLine}-${endLine}`,
        corpus_version: 3, quality: "raw", source_kind: "github", repo: repoKey,
        repo_url: `https://github.com/${repoKey}`,
        source_url: `https://github.com/${repoKey}/blob/${sha}/${filePath}#L${startLine}-L${endLine}`,
        commit_sha: sha, file_path: filePath, start_line: startLine, end_line: endLine,
        technology_domain: framework, language: "typescript", framework, domain,
        level: "function", difficulty_score: -1, difficulty: "pending",
        size, line_count: lineCount, char_count: charCount, text,
      });
      count++;
    }
    if (count > 0) console.log(`  ${fname}: +${count} functions`);
  }

  for (const [size, records] of Object.entries(buckets)) {
    const fname = `typescript_function_${size}_candidates.jsonl`;
    const fpath = join(OUTPUT_DIR, fname);
    writeFileSync(fpath, records.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
    console.log(`Wrote ${records.length} records to ${fpath}`);
  }
  console.log(`Total: ${buckets.short.length + buckets.medium.length + buckets.long.length}`);
}

main();
