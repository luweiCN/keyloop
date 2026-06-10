#!/usr/bin/env node
/**
 * KeyLoop Corpus V3 — TypeScript function-level candidate extractor.
 * Uses curl with retry for GitHub API. Writes progress incrementally.
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const REPOS = {
  "vuejs/core":       { sha: "48ad452dd61926a59e358da3c74c5ef750ae21c4", framework: "vue",      domain: "frontend" },
  "vitejs/vite":      { sha: "c13a37b53ec673e5a9053355fce3b9c4528fd917", framework: "vite",     domain: "tooling"  },
  "trpc/trpc":        { sha: "c7360d4eb3c89c336468809a293e5cda4b302d4b", framework: "trpc",     domain: "backend"  },
  "honojs/hono":      { sha: "c78932d745cdf6284ae131a156479ac930da0262", framework: "hono",     domain: "backend"  },
  "TanStack/query":   { sha: "4077908fbdb80735715aed349b8a24e9c06a7ded", framework: "tanstack", domain: "frontend" },
  "vitest-dev/vitest":{ sha: "bdd985433e31b7e792483dab8f07a6832960fa55", framework: "vitest",   domain: "tooling"  },
  "colinhacks/zod":   { sha: "bbc68f990c7e6a5e3f506c56fb04bd0279b9c9b5", framework: "zod",      domain: "library"  },
  "effect-TS/effect": { sha: "05d72eab7bac3444ca20d871d4c65a272200ef0e", framework: "effect",   domain: "library"  },
  "nuxt/nuxt":        { sha: "f67cca55abba1688f350d1ae3aa0d23c532d9f0c", framework: "nuxt",     domain: "frontend" },
  "date-fns/date-fns":{ sha: "eefe78408f59540b1cac8e99adad0813e5d9adec", framework: "date-fns", domain: "library"  },
  "angular/angular":  { sha: "255151a41349c519728651739412dbd0f6138e13", framework: "angular",  domain: "frontend" },
  "sveltejs/svelte":  { sha: "71a6515bd648202b2795a80e68e7c9c7ac9ad4ee", framework: "svelte",   domain: "frontend" },
};

const SIZE_RANGES = {
  short:  { minLines: 6,  maxLines: 14, minChars: 120,  maxChars: 1100 },
  medium: { minLines: 15, maxLines: 30, minChars: 400,  maxChars: 2600 },
  long:   { minLines: 31, maxLines: 55, minChars: 1200, maxChars: 5000 },
};

const OUTPUT_DIR = "content/corpus-v3/raw";
const CACHE_DIR = "/tmp/keyloop-corpus-v3/cache";
const TOKEN = execSync("gh auth token", { encoding: "utf8" }).trim();

function curlWithRetry(url, raw = false, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const accept = raw ? "application/vnd.github.v3.raw" : "application/vnd.github.v3+json";
      const out = execSync(
        `curl -sfS --connect-timeout 10 --max-time 30 -H "Authorization: token ${TOKEN}" -H "Accept: ${accept}" "${url}"`,
        { encoding: "utf8", maxBuffer: 100 * 1024 * 1024, timeout: 45000 }
      );
      return raw ? out : JSON.parse(out);
    } catch (e) {
      if (i < retries - 1) {
        const delay = (i + 1) * 2000;
        console.error(`  Retry ${i + 1}/${retries} after ${delay}ms...`);
        execSync(`sleep ${delay / 1000}`);
      }
    }
  }
  return null;
}

function getTree(repo, sha) {
  const cacheFile = join(CACHE_DIR, `${repo.replace(/\//g, '_')}_tree.json`);
  if (existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  const data = curlWithRetry(`https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`);
  if (data?.tree) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(data.tree), "utf8");
    return data.tree;
  }
  return [];
}

function getFileContent(repo, path, sha) {
  const cacheFile = join(CACHE_DIR, `${repo.replace(/\//g, '_')}_${path.replace(/\//g, '_')}`);
  if (existsSync(cacheFile)) {
    return readFileSync(cacheFile, "utf8");
  }
  const content = curlWithRetry(`https://api.github.com/repos/${repo}/contents/${path}?ref=${sha}`, true);
  if (content) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, content, "utf8");
    return content;
  }
  return null;
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
  let open = 0, close = 0, inStr = false, strCh = "", inTpl = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1] || "";
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < text.length - 1 && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
    if (inStr) { if (c === "\\") { i += 2; continue; } if (c === strCh) inStr = false; i++; continue; }
    if (inTpl) { if (c === "\\") { i += 2; continue; } if (c === "`") inTpl = false; i++; continue; }
    if (c === "'" || c === '"') { inStr = true; strCh = c; i++; continue; }
    if (c === "`") { inTpl = true; i++; continue; }
    if (c === "{") open++; if (c === "}") close++;
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
  mkdirSync(CACHE_DIR, { recursive: true });
  const buckets = { short: [], medium: [], long: [] };
  const seenHashes = new Set();

  // Load progress if exists
  const progressFile = join(CACHE_DIR, "progress.json");
  const doneRepos = new Set();
  if (existsSync(progressFile)) {
    const p = JSON.parse(readFileSync(progressFile, "utf8"));
    p.doneRepos?.forEach(r => doneRepos.add(r));
    // Restore buckets
    for (const [size, recs] of Object.entries(p.buckets || {})) {
      buckets[size] = recs;
      recs.forEach(r => seenHashes.add(r.text.replace(/\s+/g, " ").trim().slice(0, 200)));
    }
  }

  for (const [repo, info] of Object.entries(REPOS)) {
    if (doneRepos.has(repo)) {
      console.log(`\n=== ${repo} (cached, skipping) ===`);
      continue;
    }

    console.log(`\n=== ${repo} ===`);
    const { sha, framework, domain } = info;
    console.log(`  SHA: ${sha.slice(0, 12)}...`);

    const tree = getTree(repo, sha);
    if (!tree.length) { console.log("  SKIP: empty tree"); continue; }

    // Pick .ts files
    let tsFiles = tree
      .filter(f => f.type === "blob" && f.path.endsWith(".ts") && !f.path.endsWith(".d.ts"))
      .filter(f => /(?:^|\/)src\//.test(f.path))
      .filter(f => !/(?:test|spec|__tests__|\.test\.|\.spec\.|bench|benchmark|mock|fixture)/i.test(f.path))
      .filter(f => f.size && f.size > 200 && f.size < 80000);

    // Shuffle deterministically
    for (let i = tsFiles.length - 1; i > 0; i--) {
      const j = (i * 7 + 13) % (i + 1);
      [tsFiles[i], tsFiles[j]] = [tsFiles[j], tsFiles[i]];
    }

    // Need more files if some buckets are still low
    const selected = tsFiles.slice(0, 30);
    console.log(`  Selected ${selected.length} of ${tsFiles.length} .ts files`);

    let repoCount = 0;
    let failCount = 0;

    for (const file of selected) {
      if (failCount > 5) { console.log("  Too many failures, stopping repo"); break; }

      const content = getFileContent(repo, file.path, sha);
      if (!content || content.length < 50) { failCount++; continue; }
      failCount = 0; // reset on success

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
        buckets[size].push({
          id: `github:${repo}:${file.path}:${startLine}-${endLine}`,
          corpus_version: 3, quality: "raw", source_kind: "github", repo,
          repo_url: `https://github.com/${repo}`,
          source_url: `https://github.com/${repo}/blob/${sha}/${file.path}#L${startLine}-L${endLine}`,
          commit_sha: sha, file_path: file.path, start_line: startLine, end_line: endLine,
          technology_domain: framework, language: "typescript", framework, domain,
          level: "function", difficulty_score: -1, difficulty: "pending",
          size, line_count: lineCount, char_count: charCount, text,
        });
        repoCount++;
      }
    }

    console.log(`  Extracted: ${repoCount} functions`);
    console.log(`  Totals: short=${buckets.short.length} medium=${buckets.medium.length} long=${buckets.long.length}`);

    // Save progress
    doneRepos.add(repo);
    writeFileSync(progressFile, JSON.stringify({ doneRepos: [...doneRepos], buckets }, null, 2), "utf8");

    // Write intermediate output
    for (const [size, records] of Object.entries(buckets)) {
      const fname = `typescript_function_${size}_candidates.jsonl`;
      writeFileSync(join(OUTPUT_DIR, fname), records.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
    }
  }

  console.log(`\nFinal: short=${buckets.short.length} medium=${buckets.medium.length} long=${buckets.long.length}`);
  const total = buckets.short.length + buckets.medium.length + buckets.long.length;
  console.log(`Total: ${total} candidates`);
}

main();
