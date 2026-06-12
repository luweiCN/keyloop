import type { PracticeTarget } from "../domain/model";

export interface LongWordEntry {
  word: string;
  parts: string[];
  aliases?: string[];
  domain: "everyday" | "workplace" | "programming" | "web3";
  tier: number;
  source_id: string;
  note_zh?: string;
}

export interface LongWordBreakdownOptions {
  partRepetitions?: number;
  wordRepetitions?: number;
}

export function buildLongWordBreakdownTarget(
  entry: LongWordEntry,
  options: LongWordBreakdownOptions = {},
): PracticeTarget {
  const wordRepetitions = options.wordRepetitions ?? 2;
  const lines = [repeat(entry.word, wordRepetitions).join(" ")];

  return {
    mode: "words",
    text: lines.join("\n"),
    source: `keyloop:module:word-breakdown:${entry.word}`,
  };
}

function repeat(value: string, count: number): string[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => value);
}
