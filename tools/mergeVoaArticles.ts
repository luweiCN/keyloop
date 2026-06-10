// Merge translated VOA articles into the everyday articles corpus.
// Usage: bun tools/mergeVoaArticles.ts
import { loadContentLibrary } from "../ts/src/content/library";
import {
  buildReadingVocabularyProfile,
  passesReadingVocabularyLevel,
} from "../ts/src/content/readingVocabulary";
import { isCompleteReadingArticleText } from "../ts/src/content/readingTextQuality";
import type { EverydayLevel } from "../ts/src/domain/model";
import { spawnSync } from "node:child_process";

const LEVELS: EverydayLevel[] = ["high_school", "cet4", "cet6", "postgraduate", "toefl_ielts"];
const RANGES: [string, number, number][] = [
  ["short", 80, 140],
  ["medium", 180, 280],
  ["long", 380, 600],
];

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((w) => /[A-Za-z0-9]/u.test(w)).length;
}

// load TRIM/ZH from the three python translation files via python json dump
const py = spawnSync(
  "python3",
  [
    "-c",
    `
import json, sys
sys.path.insert(0, 'tools')
import voa_translations_part1 as p1, voa_translations_part2 as p2, voa_translations_part3 as p3
trim, zh = {}, {}
for m in (p1, p2, p3):
    trim.update(m.TRIM); zh.update(m.ZH)
json.dump({"trim": {k: list(v) for k, v in trim.items()}, "zh": zh}, sys.stdout, ensure_ascii=False)
`,
  ],
  { encoding: "utf8", cwd: process.cwd() },
);
if (py.status !== 0) {
  console.error(py.stderr);
  process.exit(1);
}
const { trim, zh } = JSON.parse(py.stdout) as {
  trim: Record<string, [number, number]>;
  zh: Record<string, string[]>;
};

const selected = JSON.parse(await Bun.file("/tmp/voa_selected.json").text()) as {
  url: string;
  title: string;
  paragraphs: string[];
}[];

const library = await loadContentLibrary();
const profile = buildReadingVocabularyProfile(library.everyday_words.entries);

const entries: unknown[] = [];
const problems: string[] = [];
for (const art of selected) {
  const t = trim[art.title];
  const translations = zh[art.title];
  if (!t || !translations) {
    problems.push(`no trim/zh: ${art.title}`);
    continue;
  }
  const paras = art.paragraphs.slice(t[0], t[1]);
  if (paras.length !== translations.length) {
    problems.push(`para count mismatch: ${art.title} en=${paras.length} zh=${translations.length}`);
    continue;
  }
  const text = paras.join(" ");
  const words = wordCount(text);
  const range = RANGES.find(([, lo, hi]) => words >= lo && words <= hi);
  if (!range) {
    problems.push(`out of range: ${art.title} ${words}w`);
    continue;
  }
  if (!isCompleteReadingArticleText(text)) {
    problems.push(`incomplete article text: ${art.title}`);
    continue;
  }
  let level: EverydayLevel | null = null;
  for (const lv of LEVELS) {
    if (passesReadingVocabularyLevel(text, lv, profile)) {
      level = lv;
      break;
    }
  }
  if (level === null) {
    problems.push(`fails vocabulary gate: ${art.title}`);
    continue;
  }
  entries.push({
    title: art.title,
    level,
    length: range[0],
    source_id: "voa:learning-english",
    paragraphs: paras.map((p, i) => ({ text: p, translation_zh: translations[i] })),
  });
  console.log(`ok [${level}/${range[0]}] ${words}w ${art.title}`);
}

for (const p of problems) console.log("PROBLEM:", p);
console.log(`\n${entries.length} articles ready`);
if (problems.length === 0) {
  await Bun.write("/tmp/voa_articles_final.json", JSON.stringify(entries));
  console.log("written /tmp/voa_articles_final.json");
}
