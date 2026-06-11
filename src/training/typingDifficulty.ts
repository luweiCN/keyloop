export type TypingDifficulty = "easy" | "medium" | "hard";

export interface TypingDifficultyFeatures {
  nonWhitespaceChars: number;
  symbolDensity: number;
  shiftDensity: number;
  digitDensity: number;
  alnumMixCount: number;
  identifierComplexityPer100: number;
  edgeKeyDensity: number;
  transitionRate: number;
  trickySequenceCount: number;
}

export interface TypingDifficultyDimensionScores {
  symbolDensity: number;
  shiftLoad: number;
  digitAndAlnumMix: number;
  identifierComplexity: number;
  edgeKeyLoad: number;
  inputTransitions: number;
  trickySequences: number;
}

export interface TypingDifficultyResult {
  difficulty: TypingDifficulty;
  score: number;
  reasons: string[];
  features: TypingDifficultyFeatures;
  dimensionScores: TypingDifficultyDimensionScores;
}

const shiftChars = new Set(Array.from('~!@#$%^&*()_+{}|:"<>?'));
const edgeKeyChars = new Set(Array.from("-_=+[]{}\\|;:'\",./<>"));
const trickySequences = [
  "!==",
  "===",
  "=>",
  ">=",
  "<=",
  "==",
  "!=",
  "??",
  "?.",
  "::",
  "->",
  "</>",
  "</",
  "/>",
  "${}",
  "${",
  "[]",
  "{}",
  "()",
  "<>",
  "&&",
  "||",
  "++",
  "--",
  "+=",
  "-=",
] as const;

const identifierPattern = /\b[A-Za-z_$][A-Za-z0-9_$]*(?:-[A-Za-z0-9_$]+)*\b/gu;

export function scoreTypingDifficulty(text: string): TypingDifficultyResult {
  const features = typingDifficultyFeatures(text);
  const dimensionScores = typingDifficultyDimensionScores(features);
  const score = Object.values(dimensionScores).reduce((sum, value) => sum + value, 0);
  return {
    difficulty: typingDifficultyFromScore(score),
    score,
    reasons: typingDifficultyReasons(features, dimensionScores),
    features,
    dimensionScores,
  };
}

export function typingDifficultyFeatures(text: string): TypingDifficultyFeatures {
  const chars = Array.from(text).filter((char) => char !== "\r");
  const nonWhitespace = chars.filter((char) => !/\s/u.test(char));
  const nonWhitespaceChars = nonWhitespace.length;
  const denominator = Math.max(nonWhitespaceChars, 1);
  const symbolCount = nonWhitespace.filter(isSymbolChar).length;
  const shiftCount = nonWhitespace.filter(isShiftChar).length;
  const digitCount = nonWhitespace.filter((char) => /\d/u.test(char)).length;
  const edgeKeyCount = nonWhitespace.filter((char) => edgeKeyChars.has(char)).length;
  const identifiers = Array.from(text.matchAll(identifierPattern), (match) => match[0]);
  const alnumMixCount = identifiers.filter(hasLetterDigitMix).length;
  const identifierComplexity = identifiers.reduce(
    (sum, identifier) => sum + identifierComplexityPoints(identifier),
    0,
  );

  return {
    nonWhitespaceChars,
    symbolDensity: symbolCount / denominator,
    shiftDensity: shiftCount / denominator,
    digitDensity: digitCount / denominator,
    alnumMixCount,
    identifierComplexityPer100: identifierComplexity / Math.max(denominator / 100, 1),
    edgeKeyDensity: edgeKeyCount / denominator,
    transitionRate: transitionRate(nonWhitespace),
    trickySequenceCount: countTrickySequences(text),
  };
}

function typingDifficultyDimensionScores(
  features: TypingDifficultyFeatures,
): TypingDifficultyDimensionScores {
  return {
    symbolDensity: scoreThreshold(features.symbolDensity, 0.12, 0.22),
    shiftLoad: scoreThreshold(features.shiftDensity, 0.08, 0.16),
    digitAndAlnumMix:
      features.digitDensity < 0.03 && features.alnumMixCount <= 1
        ? 0
        : features.digitDensity < 0.08 && features.alnumMixCount <= 3
          ? 1
          : 2,
    identifierComplexity: scoreThreshold(
      features.identifierComplexityPer100,
      3,
      8,
    ),
    edgeKeyLoad: scoreThreshold(features.edgeKeyDensity, 0.06, 0.12),
    inputTransitions: scoreThreshold(features.transitionRate, 0.18, 0.32),
    trickySequences:
      features.trickySequenceCount <= 1
        ? 0
        : features.trickySequenceCount <= 4
          ? 1
          : 2,
  };
}

function typingDifficultyFromScore(score: number): TypingDifficulty {
  if (score <= 5) {
    return "easy";
  }
  if (score <= 8) {
    return "medium";
  }
  return "hard";
}

function typingDifficultyReasons(
  features: TypingDifficultyFeatures,
  scores: TypingDifficultyDimensionScores,
): string[] {
  const reasons: string[] = [];
  if (scores.symbolDensity === 2) {
    reasons.push("high symbol density");
  } else if (scores.symbolDensity === 1) {
    reasons.push("moderate symbol density");
  }
  if (scores.shiftLoad === 2) {
    reasons.push("high shift-key load");
  } else if (scores.shiftLoad === 1) {
    reasons.push("moderate shift-key load");
  }
  if (scores.digitAndAlnumMix === 2) {
    reasons.push("many digits or alphanumeric mixes");
  } else if (scores.digitAndAlnumMix === 1) {
    reasons.push("some digits or alphanumeric mixes");
  }
  if (scores.identifierComplexity === 2) {
    reasons.push("dense complex identifiers");
  } else if (scores.identifierComplexity === 1) {
    reasons.push("mixed identifier casing");
  }
  if (scores.edgeKeyLoad === 2) {
    reasons.push("many edge-key characters");
  } else if (scores.edgeKeyLoad === 1) {
    reasons.push("some edge-key characters");
  }
  if (scores.inputTransitions === 2) {
    reasons.push("frequent input-mode transitions");
  } else if (scores.inputTransitions === 1) {
    reasons.push("some input-mode transitions");
  }
  if (scores.trickySequences > 0) {
    reasons.push("tricky operator sequences");
  }
  if (reasons.length === 0 && features.nonWhitespaceChars > 0) {
    reasons.push("low symbol and transition load");
  }
  return reasons;
}

function scoreThreshold(value: number, medium: number, hard: number): number {
  if (value < medium) {
    return 0;
  }
  if (value < hard) {
    return 1;
  }
  return 2;
}

function isSymbolChar(char: string): boolean {
  return !/[A-Za-z0-9]/u.test(char);
}

function isShiftChar(char: string): boolean {
  return /[A-Z]/u.test(char) || shiftChars.has(char);
}

function hasLetterDigitMix(value: string): boolean {
  return /[A-Za-z]/u.test(value) && /\d/u.test(value);
}

function identifierComplexityPoints(identifier: string): number {
  let points = 0;
  if (identifier.length >= 13) {
    points += 1;
  }
  if (/[a-z][A-Z]/u.test(identifier) || /^[A-Z][a-z]/u.test(identifier)) {
    points += 1;
  }
  if (identifier.includes("_") || identifier.includes("-")) {
    points += 1;
  }
  if (/[A-Z]{2,}/u.test(identifier)) {
    points += 1;
  }
  if (hasLetterDigitMix(identifier)) {
    points += 1;
  }
  return points;
}

function transitionRate(chars: string[]): number {
  const categories = chars.map(charCategory).filter((category) => category !== "other");
  if (categories.length <= 1) {
    return 0;
  }
  let transitions = 0;
  for (let index = 1; index < categories.length; index += 1) {
    if (categories[index] !== categories[index - 1]) {
      transitions += 1;
    }
  }
  return transitions / (categories.length - 1);
}

function charCategory(char: string): "lower" | "upper" | "digit" | "symbol" | "other" {
  if (/[a-z]/u.test(char)) {
    return "lower";
  }
  if (/[A-Z]/u.test(char)) {
    return "upper";
  }
  if (/\d/u.test(char)) {
    return "digit";
  }
  if (isSymbolChar(char)) {
    return "symbol";
  }
  return "other";
}

function countTrickySequences(text: string): number {
  return trickySequences.reduce(
    (sum, sequence) => sum + countOccurrences(text, sequence),
    0,
  );
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = text.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}
