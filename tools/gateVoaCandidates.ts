// Gate, level, and trim VOA candidates into article-corpus shape.
// Usage: bun tools/gateVoaCandidates.ts
import { loadContentLibrary } from "../ts/src/content/library";
import {
  buildReadingVocabularyProfile,
  passesReadingVocabularyLevel,
} from "../ts/src/content/readingVocabulary";
import { isCompleteReadingArticleText } from "../ts/src/content/readingTextQuality";
import type { EverydayLevel } from "../ts/src/domain/model";

const LEVELS: EverydayLevel[] = ["high_school", "cet4", "cet6", "postgraduate", "toefl_ielts"];
const RANGES: Record<string, [number, number]> = {
  short: [80, 140],
  medium: [180, 280],
  long: [380, 600],
};

function decodeEntities(t: string): string {
  return t
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((w) => /[A-Za-z0-9]/u.test(w)).length;
}

interface Candidate {
  url: string;
  title: string;
  section: string;
  paragraphs: string[];
}

const candidates: Candidate[] = JSON.parse(await Bun.file("/tmp/voa_candidates.json").text());
const library = await loadContentLibrary();
const profile = buildReadingVocabularyProfile(library.everyday_words.entries);

interface Gated {
  url: string;
  title: string;
  section: string;
  level: EverydayLevel;
  length: "short" | "medium" | "long";
  trimmed: boolean;
  word_count: number;
  paragraphs: string[];
}

const out: Gated[] = [];
for (const c of candidates) {
  const title = decodeEntities(c.title);
  const paras = c.paragraphs.map(decodeEntities).filter((p) => {
    if ([...p].some((ch) => ch.charCodeAt(0) > 127)) return false; // typability
    return true;
  });
  if (paras.length < 3) continue;

  // accumulate whole paragraphs; remember the last boundary inside each range
  let best: { count: number; words: number; length: string } | null = null;
  let words = 0;
  for (let i = 0; i < paras.length; i += 1) {
    words += wordCount(paras[i]!);
    for (const [length, [lo, hi]] of Object.entries(RANGES)) {
      if (words >= lo && words <= hi) best = { count: i + 1, words, length };
    }
  }
  if (best === null) continue;
  const chosen = paras.slice(0, best.count);
  const text = chosen.join(" ");
  if (!isCompleteReadingArticleText(text)) continue;
  let level: EverydayLevel | null = null;
  for (const lv of LEVELS) {
    if (passesReadingVocabularyLevel(text, lv, profile)) {
      level = lv;
      break;
    }
  }
  if (level === null) continue;
  out.push({
    url: c.url,
    title,
    section: c.section,
    level,
    length: best.length as Gated["length"],
    trimmed: best.count < paras.length,
    word_count: best.words,
    paragraphs: chosen,
  });
}

for (const g of out) {
  console.log(
    `[${g.level}/${g.length}${g.trimmed ? "/trimmed" : ""}] ${g.word_count}w p${g.paragraphs.length} (${g.section}) ${g.title}`,
  );
}
console.log(`\n${out.length} gated candidates`);
await Bun.write("/tmp/voa_gated.json", JSON.stringify(out, null, 1));
