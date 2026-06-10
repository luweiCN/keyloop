import { randomUUID } from "node:crypto";

import type { PracticeTarget, SessionRecord } from "../domain/model";

export interface PersonalVocabularyEntry {
  id: string;
  text: string;
  kind: "word" | "phrase" | "identifier" | "code_term";
  parts?: string[];
  aliases?: string[];
  meaning_zh?: string;
  tags: string[];
  priority: 1 | 2 | 3;
  created_at: string;
  updated_at: string;
  archived: boolean;
}

export interface PersonalVocabularyStore {
  version: 1;
  entries: PersonalVocabularyEntry[];
}

export interface LongWordEntry {
  word: string;
  parts: string[];
  aliases?: string[];
  domain: "everyday" | "workplace" | "programming" | "web3";
  tier: number;
  source_id: string;
  note_zh?: string;
}

export interface RankedPersonalVocabulary {
  entry: PersonalVocabularyEntry;
  score: number;
  recent_error_count: number;
  avg_start_delay_ms: number;
  avg_duration_ms: number;
  practiced: boolean;
}

export interface RankPersonalVocabularyOptions {
  now?: Date;
  historyDays?: number;
  limit?: number;
}

export interface LongWordBreakdownOptions {
  partRepetitions?: number;
  wordRepetitions?: number;
}

export type PersonalVocabularyKind = PersonalVocabularyEntry["kind"];
export type PersonalVocabularyPriority = PersonalVocabularyEntry["priority"];

export interface CreatePersonalVocabularyEntryInput {
  text: string;
  kind?: PersonalVocabularyKind;
  parts?: string[];
  aliases?: string[];
  meaning_zh?: string;
  tags?: string[];
  priority?: PersonalVocabularyPriority;
}

export interface PersonalVocabularyEntryOptions {
  now?: string;
  idFactory?: () => string;
}

const DEFAULT_HISTORY_DAYS = 21;
const NEVER_PRACTICED_BONUS = 800;

export function createPersonalVocabularyEntry(
  input: CreatePersonalVocabularyEntryInput,
  options: PersonalVocabularyEntryOptions = {},
): PersonalVocabularyEntry {
  const text = input.text.trim();
  if (text.length === 0) {
    throw new Error("Vocabulary text cannot be empty");
  }

  const now = options.now ?? new Date().toISOString();
  const entry: PersonalVocabularyEntry = {
    id: options.idFactory?.() ?? randomUUID().replaceAll("-", ""),
    text,
    kind: input.kind ?? "word",
    parts: normalizeStringList(input.parts),
    aliases: normalizeStringList(input.aliases),
    tags: normalizeStringList(input.tags),
    priority: input.priority ?? 2,
    created_at: now,
    updated_at: now,
    archived: false,
  };
  const meaningZh = input.meaning_zh?.trim();
  if (meaningZh !== undefined && meaningZh.length > 0) {
    entry.meaning_zh = meaningZh;
  }
  return entry;
}

export function upsertPersonalVocabularyEntry(
  store: PersonalVocabularyStore,
  entry: PersonalVocabularyEntry,
  now: string = entry.updated_at,
): PersonalVocabularyStore {
  const entryKey = vocabularyTextKey(entry.text);
  let replaced = false;
  const entries = store.entries.map((item) => {
    if (item.id === entry.id) {
      replaced = true;
      return entry;
    }
    if (!item.archived && vocabularyTextKey(item.text) === entryKey) {
      return {
        ...item,
        archived: true,
        updated_at: now,
      };
    }
    return item;
  });

  if (!replaced) {
    entries.push(entry);
  }

  return {
    version: 1,
    entries,
  };
}

export function archivePersonalVocabularyEntry(
  store: PersonalVocabularyStore,
  id: string,
  now: string = new Date().toISOString(),
): PersonalVocabularyStore {
  let found = false;
  const entries = store.entries.map((entry) => {
    if (entry.id !== id) {
      return entry;
    }
    found = true;
    return {
      ...entry,
      archived: true,
      updated_at: now,
    };
  });

  if (!found) {
    throw new Error(`Vocabulary entry not found: ${id}`);
  }

  return {
    version: 1,
    entries,
  };
}

export function importPersonalVocabularyEntries(
  values: unknown,
  options: PersonalVocabularyEntryOptions = {},
): PersonalVocabularyEntry[] {
  if (!Array.isArray(values)) {
    throw new Error("Vocabulary import file must contain an array");
  }
  return values.map((value) =>
    createPersonalVocabularyEntry(importEntryInput(value), options),
  );
}

export function rankPersonalVocabulary(
  entries: PersonalVocabularyEntry[],
  records: SessionRecord[] = [],
  options: RankPersonalVocabularyOptions = {},
): RankedPersonalVocabulary[] {
  const now = options.now ?? new Date();
  const historyDays = options.historyDays ?? DEFAULT_HISTORY_DAYS;
  const cutoffMs = now.getTime() - historyDays * 24 * 60 * 60 * 1000;
  const recentRecords = records.filter((record) => {
    const startedAtMs = Date.parse(record.started_at);
    return Number.isFinite(startedAtMs) && startedAtMs >= cutoffMs;
  });

  const ranked = entries
    .filter((entry) => !entry.archived && entry.text.trim().length > 0)
    .map((entry) => rankEntry(entry, records, recentRecords))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      const priorityDelta = right.entry.priority - left.entry.priority;
      return priorityDelta !== 0
        ? priorityDelta
        : left.entry.text.localeCompare(right.entry.text);
    });

  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}

export function buildLongWordBreakdownTarget(
  entry: LongWordEntry,
  options: LongWordBreakdownOptions = {},
): PracticeTarget {
  const partRepetitions = options.partRepetitions ?? 1;
  const wordRepetitions = options.wordRepetitions ?? 2;
  const parts = entry.parts.length === 0 ? [entry.word] : entry.parts;
  const lines = [
    parts.flatMap((part) => repeat(part, partRepetitions)).join(" "),
    repeat(entry.word, wordRepetitions).join(" "),
  ];
  const alias = entry.aliases?.find((value) => value.trim().length > 0)?.trim();
  if (alias !== undefined) {
    lines.push(`${alias} ${entry.word}`);
  }

  return {
    mode: "words",
    text: lines.join("\n"),
    source: `keyloop:module:word-breakdown:${entry.word}`,
  };
}

function rankEntry(
  entry: PersonalVocabularyEntry,
  allRecords: SessionRecord[],
  recentRecords: SessionRecord[],
): RankedPersonalVocabulary {
  const practiced = allRecords.some((record) => record.target_text.includes(entry.text));
  let recentErrorCount = 0;
  let delaySum = 0;
  let durationSum = 0;
  let timingSamples = 0;

  for (const record of recentRecords) {
    let tokenStatMatched = false;
    if (record.token_stats.length > 0) {
      for (const stat of record.token_stats) {
        if (stat.token !== entry.text) {
          continue;
        }
        tokenStatMatched = true;
        recentErrorCount += stat.errors;
        delaySum += stat.start_delay_ms;
        durationSum += stat.duration_ms;
        timingSamples += 1;
      }
    }
    if (!tokenStatMatched) {
      recentErrorCount += record.error_tokens[entry.text] ?? 0;
    }
  }

  const avgStartDelayMs = timingSamples === 0 ? 0 : delaySum / timingSamples;
  const avgDurationMs = timingSamples === 0 ? 0 : durationSum / timingSamples;
  const score =
    entry.priority * 500 +
    (practiced ? 0 : NEVER_PRACTICED_BONUS) +
    recentErrorCount * 1000 +
    avgStartDelayMs +
    avgDurationMs / 2;

  return {
    entry,
    score,
    recent_error_count: recentErrorCount,
    avg_start_delay_ms: avgStartDelayMs,
    avg_duration_ms: avgDurationMs,
    practiced,
  };
}

function repeat(value: string, count: number): string[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => value);
}

function importEntryInput(value: unknown): CreatePersonalVocabularyEntryInput {
  if (typeof value === "string") {
    return { text: value };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Vocabulary import entries must be strings or objects");
  }

  const object = value as Record<string, unknown>;
  const text = stringField(object.text);
  if (text === undefined) {
    throw new Error("Vocabulary import entry requires text");
  }

  const input: CreatePersonalVocabularyEntryInput = { text };
  const kind = personalVocabularyKind(object.kind);
  if (kind !== undefined) {
    input.kind = kind;
  }
  const parts = stringArrayField(object.parts);
  if (parts !== undefined) {
    input.parts = parts;
  }
  const aliases = stringArrayField(object.aliases);
  if (aliases !== undefined) {
    input.aliases = aliases;
  }
  const tags = stringArrayField(object.tags);
  if (tags !== undefined) {
    input.tags = tags;
  }
  const priority = personalVocabularyPriority(object.priority);
  if (priority !== undefined) {
    input.priority = priority;
  }
  const meaningZh = stringField(object.meaning_zh);
  if (meaningZh !== undefined) {
    input.meaning_zh = meaningZh;
  }
  return input;
}

function personalVocabularyKind(value: unknown): PersonalVocabularyKind | undefined {
  return value === "word" ||
    value === "phrase" ||
    value === "identifier" ||
    value === "code_term"
    ? value
    : undefined;
}

function personalVocabularyPriority(
  value: unknown,
): PersonalVocabularyPriority | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayField(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function normalizeStringList(values: string[] | undefined): string[] {
  return values?.map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
}

function vocabularyTextKey(value: string): string {
  return value.trim().toLowerCase();
}
