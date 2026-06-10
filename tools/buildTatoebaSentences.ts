// Build leveled everyday sentences from the Tatoeba eng-cmn pair export.
// Usage: bun tools/buildTatoebaSentences.ts /tmp/cmn.txt
import { loadContentLibrary } from "../ts/src/content/library";
import {
  buildReadingVocabularyProfile,
  passesReadingVocabularyLevel,
} from "../ts/src/content/readingVocabulary";
import { isCompleteReadingSentence } from "../ts/src/content/readingTextQuality";
import type { EverydayLevel } from "../ts/src/domain/model";

const LEVELS: EverydayLevel[] = ["high_school", "cet4", "cet6", "postgraduate", "toefl_ielts"];
const PER_BUCKET = 40; // per level x length

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((w) => /[A-Za-z0-9]/u.test(w)).length;
}

function lengthClass(n: number): "short" | "medium" | "long" | null {
  if (n >= 6 && n <= 12) return "short";
  if (n >= 13 && n <= 22) return "medium";
  if (n >= 23 && n <= 35) return "long";
  return null;
}

const file = process.argv[2] ?? "/tmp/cmn.txt";
const library = await loadContentLibrary();
const profile = buildReadingVocabularyProfile(library.everyday_words.entries);
const existing = new Set(
  library.everyday_sentences.entries.map((e) => e.text.toLowerCase().trim()),
);

interface Candidate {
  text: string;
  zh: string;
  level: EverydayLevel;
  length: "short" | "medium" | "long";
}

const seen = new Set<string>();
const buckets = new Map<string, Candidate[]>();
let total = 0;
let kept = 0;

for (const line of (await Bun.file(file).text()).split("\n")) {
  const parts = line.split("\t");
  if (parts.length < 2) continue;
  total += 1;
  const text = parts[0]!.trim();
  const zh = parts[1]!.trim();
  if (!text || !zh) continue;
  if ([...text].some((c) => c.charCodeAt(0) > 127)) continue; // typable ASCII only
  if (!/[一-鿿]/u.test(zh)) continue;
  const lc = lengthClass(wordCount(text));
  if (lc === null) continue;
  const key = text.toLowerCase();
  if (seen.has(key) || existing.has(key)) continue;
  if (!isCompleteReadingSentence(text)) continue;
  // classify: lowest level whose vocabulary covers the sentence
  let level: EverydayLevel | null = null;
  for (const lv of LEVELS) {
    if (passesReadingVocabularyLevel(text, lv, profile)) {
      level = lv;
      break;
    }
  }
  if (level === null) continue;
  seen.add(key);
  kept += 1;
  const bucket = `${level}/${lc}`;
  if (!buckets.has(bucket)) buckets.set(bucket, []);
  buckets.get(bucket)!.push({ text, zh, level, length: lc });
}

console.log(`pairs=${total} eligible=${kept}`);
for (const lv of LEVELS) {
  const row = ["short", "medium", "long"].map(
    (l) => `${l}:${buckets.get(`${lv}/${l}`)?.length ?? 0}`,
  );
  console.log(` ${lv.padEnd(14)}${row.join("  ")}`);
}

// deterministic shuffle (mulberry32) then take quota
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260610);
const picked: Candidate[] = [];
for (const [, list] of buckets) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  picked.push(...list.slice(0, PER_BUCKET));
}
console.log(`picked=${picked.length}`);

const entries = picked.map((c) => ({
  text: c.text,
  translation_zh: c.zh,
  level: c.level,
  length: c.length,
  source_id: "tatoeba:eng-cmn",
  source_title: "Tatoeba sentence pairs (eng-cmn)",
}));
await Bun.write("/tmp/tatoeba_sentences.json", JSON.stringify(entries));
console.log("written /tmp/tatoeba_sentences.json");
