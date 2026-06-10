import type { EverydayWordEntry } from "./library";
import type { EverydayLevel } from "../domain/model";

export const readingLevelOrder = [
  "high_school",
  "cet4",
  "cet6",
  "postgraduate",
  "toefl_ielts",
] as const satisfies readonly EverydayLevel[];

export interface ReadingVocabularyProfile {
  allowedByLevel: ReadonlyMap<EverydayLevel, ReadonlySet<string>>;
}

export interface ReadingVocabularyCoverage {
  checkedTokenCount: number;
  coveredTokenCount: number;
  uniqueCheckedTokenCount: number;
  uniqueCoveredTokenCount: number;
  properNounCount: number;
  coverage: number;
  uniqueCoverage: number;
  unknownWords: string[];
}

export interface ReadingVocabularyThreshold {
  minCoverage: number;
  minUniqueCoverage: number;
}

const commonFunctionWords = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "also",
  "am",
  "among",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "done",
  "down",
  "during",
  "each",
  "either",
  "every",
  "for",
  "from",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "least",
  "less",
  "many",
  "may",
  "me",
  "might",
  "mine",
  "more",
  "most",
  "much",
  "must",
  "my",
  "myself",
  "neither",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "onto",
  "only",
  "or",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "shall",
  "she",
  "should",
  "so",
  "some",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "up",
  "us",
  "very",
  "was",
  "we",
  "were",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "whose",
  "will",
  "with",
  "without",
  "would",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
]);

const contractionParts = new Map<string, readonly string[]>([
  ["can't", ["can", "not"]],
  ["couldn't", ["could", "not"]],
  ["didn't", ["did", "not"]],
  ["doesn't", ["does", "not"]],
  ["don't", ["do", "not"]],
  ["hadn't", ["had", "not"]],
  ["hasn't", ["has", "not"]],
  ["haven't", ["have", "not"]],
  ["he'd", ["he", "would"]],
  ["he'll", ["he", "will"]],
  ["he's", ["he", "is"]],
  ["i'd", ["i", "would"]],
  ["i'll", ["i", "will"]],
  ["i'm", ["i", "am"]],
  ["i've", ["i", "have"]],
  ["isn't", ["is", "not"]],
  ["it'll", ["it", "will"]],
  ["it's", ["it", "is"]],
  ["she'd", ["she", "would"]],
  ["she'll", ["she", "will"]],
  ["she's", ["she", "is"]],
  ["that's", ["that", "is"]],
  ["there's", ["there", "is"]],
  ["they'd", ["they", "would"]],
  ["they'll", ["they", "will"]],
  ["they're", ["they", "are"]],
  ["they've", ["they", "have"]],
  ["wasn't", ["was", "not"]],
  ["we'd", ["we", "would"]],
  ["we'll", ["we", "will"]],
  ["we're", ["we", "are"]],
  ["we've", ["we", "have"]],
  ["weren't", ["were", "not"]],
  ["won't", ["will", "not"]],
  ["wouldn't", ["would", "not"]],
  ["you'd", ["you", "would"]],
  ["you'll", ["you", "will"]],
  ["you're", ["you", "are"]],
  ["you've", ["you", "have"]],
]);

const thresholds: Record<EverydayLevel, ReadingVocabularyThreshold> = {
  high_school: { minCoverage: 0.85, minUniqueCoverage: 0.72 },
  cet4: { minCoverage: 0.82, minUniqueCoverage: 0.7 },
  cet6: { minCoverage: 0.84, minUniqueCoverage: 0.72 },
  postgraduate: { minCoverage: 0.83, minUniqueCoverage: 0.74 },
  toefl_ielts: { minCoverage: 0.85, minUniqueCoverage: 0.78 },
};

export function buildReadingVocabularyProfile(
  entries: readonly EverydayWordEntry[],
): ReadingVocabularyProfile {
  const allowedByLevel = new Map<EverydayLevel, ReadonlySet<string>>();
  for (const level of readingLevelOrder) {
    const maxLevelIndex = readingLevelOrder.indexOf(level);
    allowedByLevel.set(
      level,
      new Set([
        ...commonFunctionWords,
        ...entries
          .filter((entry) => readingLevelOrder.indexOf(entry.level) <= maxLevelIndex)
          .map((entry) => normalizeWord(entry.word)),
      ]),
    );
  }
  return { allowedByLevel };
}

export function readingVocabularyThreshold(
  level: EverydayLevel,
): ReadingVocabularyThreshold {
  return thresholds[level];
}

export function readingVocabularyCoverage(
  text: string,
  level: EverydayLevel,
  profile: ReadingVocabularyProfile,
): ReadingVocabularyCoverage {
  const allowed = profile.allowedByLevel.get(level);
  if (allowed === undefined) {
    throw new Error(`missing reading vocabulary profile for level: ${level}`);
  }
  const checked: string[] = [];
  let properNounCount = 0;

  for (const token of rawWordTokens(text)) {
    if (isIgnorableProperNoun(text, token)) {
      properNounCount += 1;
      continue;
    }
    checked.push(...normalizeToken(token.raw));
  }

  const covered = checked.filter((word) => allowed.has(word));
  const uniqueChecked = [...new Set(checked)];
  const uniqueCovered = uniqueChecked.filter((word) => allowed.has(word));
  return {
    checkedTokenCount: checked.length,
    coveredTokenCount: covered.length,
    uniqueCheckedTokenCount: uniqueChecked.length,
    uniqueCoveredTokenCount: uniqueCovered.length,
    properNounCount,
    coverage: checked.length === 0 ? 0 : covered.length / checked.length,
    uniqueCoverage:
      uniqueChecked.length === 0 ? 0 : uniqueCovered.length / uniqueChecked.length,
    unknownWords: uniqueChecked.filter((word) => !allowed.has(word)).slice(0, 20),
  };
}

export function passesReadingVocabularyLevel(
  text: string,
  level: EverydayLevel,
  profile: ReadingVocabularyProfile,
): boolean {
  const coverage = readingVocabularyCoverage(text, level, profile);
  const threshold = readingVocabularyThreshold(level);
  return (
    coverage.coverage >= threshold.minCoverage &&
    coverage.uniqueCoverage >= threshold.minUniqueCoverage
  );
}

function rawWordTokens(text: string): Array<{ raw: string; index: number }> {
  return [...text.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/gu)].map((match) => ({
    raw: match[0],
    index: match.index ?? 0,
  }));
}

function normalizeToken(raw: string): string[] {
  const normalized = normalizeWord(raw).replace(/'s$/u, "");
  const contraction = contractionParts.get(normalized);
  if (contraction !== undefined) {
    return [...contraction];
  }
  if (normalized.length <= 1 && normalized !== "a" && normalized !== "i") {
    return [];
  }
  return [normalized];
}

function normalizeWord(word: string): string {
  return word.toLowerCase().trim();
}

function isIgnorableProperNoun(
  text: string,
  token: { raw: string; index: number },
): boolean {
  if (!/^[A-Z]/u.test(token.raw) || token.index === 0) {
    return false;
  }
  const before = text.slice(0, token.index);
  if (/[.!?]["')\]]?\s*$/u.test(before)) {
    return false;
  }
  return true;
}
