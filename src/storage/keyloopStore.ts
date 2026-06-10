import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  defaultKeyAggregate,
  defaultUserPreferences,
  parseDailyPracticePlan,
  parseKeyAggregate,
  parseSessionCheckpoint,
  parseSessionRecord,
  parseUserPreferences,
  type DailyPracticePlan,
  type KeyAggregate,
  type KeyEventRecord,
  type SessionCheckpoint,
  type SessionRecord,
  type UserPreferences,
} from "../domain/model";
import {
  emptyPersonalArticlesStore,
  emptyPersonalSentencesStore,
  type PersonalArticleEntry,
  type PersonalArticlesStore,
  type PersonalSentenceEntry,
  type PersonalSentencesStore,
} from "../training/personalCorpus";
import {
  emptyCollectionsStore,
  type CorpusCollectionMeta,
  type CorpusCollectionsStore,
  type PersonalVocabularyEntry,
  type PersonalVocabularyStore,
} from "../training/vocabulary";

export interface DataDirOptions {
  env?: Record<string, string | undefined>;
  homeDir?: string;
}

export interface LoadOrCreateDailyPracticePlanOptions {
  path: string;
  today: string;
  freshPlan: DailyPracticePlan;
  records: SessionRecord[];
  now?: string;
  idFactory?: () => string;
}

interface DailyRunStore {
  runs: StoredDailyRun[];
}

interface StoredDailyRun {
  date: string;
  created_at: string;
  plan: DailyPracticePlan;
}

export function keyloopDataDir(options: DataDirOptions = {}): string {
  const env = options.env ?? process.env;
  const keyloopHome = env.KEYLOOP_HOME?.trim();
  if (keyloopHome !== undefined && keyloopHome.length > 0) {
    return keyloopHome;
  }

  const homeDir = options.homeDir ?? process.env.HOME;
  if (homeDir === undefined || homeDir.trim().length === 0) {
    throw new Error("Could not find home directory");
  }
  return join(homeDir, ".keyloop");
}

export function sessionLogPath(dataDir: string): string {
  return join(dataDir, "sessions.jsonl");
}

export function preferencesPath(dataDir: string): string {
  return join(dataDir, "preferences.json");
}

export function dailyRunsPath(dataDir: string): string {
  return join(dataDir, "daily_runs.json");
}

export function keyStatsPath(dataDir: string): string {
  return join(dataDir, "key_stats.json");
}

export function currentSessionPath(dataDir: string): string {
  return join(dataDir, "current_session.json");
}

export function vocabularyPath(dataDir: string): string {
  return join(dataDir, "vocabulary.json");
}

export function collectionsPath(dataDir: string): string {
  return join(dataDir, "collections.json");
}

export function personalSentencesPath(dataDir: string): string {
  return join(dataDir, "sentences.json");
}

export function personalArticlesPath(dataDir: string): string {
  return join(dataDir, "articles.json");
}

export async function appendSessionToPath(
  record: SessionRecord,
  path: string,
): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record)}\n`, { flag: "a" });
  return path;
}

export async function loadSessionsFromPath(path: string): Promise<SessionRecord[]> {
  if (!(await Bun.file(path).exists())) {
    return [];
  }

  const data = await readFile(path, "utf8");
  const records: SessionRecord[] = [];
  for (const line of data.split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      records.push(parseSessionRecord(JSON.parse(line)));
    } catch (error) {
      console.error(`Skipped invalid session record: ${error}`);
    }
  }
  return records;
}

export async function savePreferencesToPath(
  preferences: UserPreferences,
  path: string,
): Promise<void> {
  await writePrettyJson(path, preferences);
}

export async function loadPreferencesFromPath(path: string): Promise<UserPreferences> {
  const value = await readJsonIfExists(path);
  return value === null ? defaultUserPreferences() : parseUserPreferences(objectStoreValue(value, path));
}

export async function saveVocabularyStoreToPath(
  store: PersonalVocabularyStore,
  path: string,
): Promise<void> {
  await writePrettyJson(path, store);
}

export async function loadVocabularyStoreFromPath(
  path: string,
): Promise<PersonalVocabularyStore> {
  const value = await readJsonIfExists(path);
  return value === null ? emptyVocabularyStore() : parseVocabularyStore(objectStoreValue(value, path));
}

export async function saveCollectionsStoreToPath(
  store: CorpusCollectionsStore,
  path: string,
): Promise<void> {
  await writePrettyJson(path, store);
}

export async function loadCollectionsStoreFromPath(
  path: string,
): Promise<CorpusCollectionsStore> {
  const value = await readJsonIfExists(path);
  if (value === null) {
    return emptyCollectionsStore();
  }
  const object = objectStoreValue(value, path);
  const list = Array.isArray(object.collections) ? object.collections : [];
  return {
    version: 1,
    collections: list.map((item) => parseCollectionMeta(item, path)),
  };
}

export async function savePersonalSentencesStoreToPath(
  store: PersonalSentencesStore,
  path: string,
): Promise<void> {
  await writePrettyJson(path, store);
}

export async function loadPersonalSentencesStoreFromPath(
  path: string,
): Promise<PersonalSentencesStore> {
  const value = await readJsonIfExists(path);
  if (value === null) {
    return emptyPersonalSentencesStore();
  }
  const object = objectStoreValue(value, path);
  const list = Array.isArray(object.entries) ? object.entries : [];
  return { version: 1, entries: list.map((item) => parsePersonalSentence(item, path)) };
}

function parsePersonalSentence(value: unknown, path: string): PersonalSentenceEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${basename(path)} contains an invalid sentence entry`);
  }
  const object = value as Record<string, unknown>;
  if (typeof object.text !== "string" || object.text.trim() === "") {
    throw new Error(`${basename(path)} sentence entry requires text`);
  }
  return {
    id: typeof object.id === "string" ? object.id : "",
    text: object.text,
    ...(typeof object.translation_zh === "string" ? { translation_zh: object.translation_zh } : {}),
    ...(typeof object.collection === "string" ? { collection: object.collection } : {}),
    ...(typeof object.source_note === "string" ? { source_note: object.source_note } : {}),
    created_at: typeof object.created_at === "string" ? object.created_at : new Date(0).toISOString(),
    archived: object.archived === true,
  };
}

export async function savePersonalArticlesStoreToPath(
  store: PersonalArticlesStore,
  path: string,
): Promise<void> {
  await writePrettyJson(path, store);
}

export async function loadPersonalArticlesStoreFromPath(
  path: string,
): Promise<PersonalArticlesStore> {
  const value = await readJsonIfExists(path);
  if (value === null) {
    return emptyPersonalArticlesStore();
  }
  const object = objectStoreValue(value, path);
  const list = Array.isArray(object.entries) ? object.entries : [];
  return { version: 1, entries: list.map((item) => parsePersonalArticle(item, path)) };
}

function parsePersonalArticle(value: unknown, path: string): PersonalArticleEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${basename(path)} contains an invalid article entry`);
  }
  const object = value as Record<string, unknown>;
  if (typeof object.title !== "string" || object.title.trim() === "") {
    throw new Error(`${basename(path)} article entry requires a title`);
  }
  const paragraphs = Array.isArray(object.paragraphs) ? object.paragraphs : [];
  return {
    id: typeof object.id === "string" ? object.id : "",
    title: object.title,
    paragraphs: paragraphs.map((p) => {
      const para = (typeof p === "object" && p !== null ? p : {}) as Record<string, unknown>;
      return {
        text: typeof para.text === "string" ? para.text : "",
        ...(typeof para.translation_zh === "string"
          ? { translation_zh: para.translation_zh }
          : {}),
      };
    }),
    ...(typeof object.collection === "string" ? { collection: object.collection } : {}),
    ...(typeof object.source_note === "string" ? { source_note: object.source_note } : {}),
    created_at: typeof object.created_at === "string" ? object.created_at : new Date(0).toISOString(),
    archived: object.archived === true,
  };
}

function parseCollectionMeta(value: unknown, path: string): CorpusCollectionMeta {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${basename(path)} contains an invalid collection entry`);
  }
  const object = value as Record<string, unknown>;
  if (typeof object.slug !== "string" || object.slug.trim() === "") {
    throw new Error(`${basename(path)} collection entry requires a slug`);
  }
  return {
    slug: object.slug,
    name: typeof object.name === "string" && object.name.trim() !== "" ? object.name : object.slug,
    ...(typeof object.description === "string" ? { description: object.description } : {}),
    created_at: typeof object.created_at === "string" ? object.created_at : new Date(0).toISOString(),
    archived: object.archived === true,
  };
}

export async function saveKeyAggregatesToPath(
  aggregates: KeyAggregate[],
  path: string,
): Promise<void> {
  await writePrettyJson(path, aggregates);
}

export async function loadKeyAggregatesFromPath(path: string): Promise<KeyAggregate[]> {
  const value = await readJsonIfExists(path);
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${basename(path)} must contain a JSON array`);
  }
  return value.map(parseKeyAggregate);
}

export async function saveSessionCheckpointToPath(
  checkpoint: SessionCheckpoint,
  path: string,
): Promise<void> {
  await writePrettyJson(path, checkpoint);
}

export async function loadSessionCheckpointFromPath(
  path: string,
): Promise<SessionCheckpoint | null> {
  const value = await readJsonIfExists(path);
  return value === null ? null : parseSessionCheckpoint(objectStoreValue(value, path));
}

export async function clearSessionCheckpointAtPath(path: string): Promise<void> {
  await rm(path, { force: true });
}

export async function loadOrCreateDailyPracticePlanFromPath(
  options: LoadOrCreateDailyPracticePlanOptions,
): Promise<DailyPracticePlan> {
  const store = await loadDailyRunStore(options.path);
  const completedMs = completedMsForDate(options.records, options.today);
  const latestToday = store.runs
    .filter((entry) => entry.date === options.today)
    .sort((left, right) => right.plan.run_number - left.plan.run_number)[0];

  if (latestToday !== undefined && !dailyRunComplete(latestToday.plan, options.records)) {
    return {
      ...latestToday.plan,
      completed_ms: completedMs,
    };
  }

  const runNumber =
    Math.max(
      0,
      ...store.runs
        .filter((entry) => entry.date === options.today)
        .map((entry) => entry.plan.run_number),
    ) + 1;
  const plan = assignDailyRunMetadata(
    {
      ...options.freshPlan,
      completed_ms: completedMs,
      lessons: options.freshPlan.lessons.map((lesson) => ({ ...lesson })),
    },
    options.today,
    runNumber,
    options.idFactory ?? (() => randomUUID().replaceAll("-", "")),
  );
  store.runs.push({
    date: options.today,
    created_at: options.now ?? new Date().toISOString(),
    plan,
  });
  await saveDailyRunStore(options.path, store);
  return plan;
}

export function observeKeyEvent(
  aggregates: KeyAggregate[],
  event: KeyEventRecord,
  intervalMs: number,
  now: string = new Date().toISOString(),
): void {
  if (event.action === "auto_indent") {
    return;
  }

  const key = keyLabel(event);
  let aggregate = aggregates.find((item) => item.key === key);
  if (aggregate === undefined) {
    aggregate = defaultKeyAggregate({ key });
    aggregates.push(aggregate);
  }

  const previousSamples = aggregate.sample_count;
  aggregate.sample_count += 1;
  if (event.correct && event.action === "insert") {
    aggregate.hit_count += 1;
  } else {
    aggregate.miss_count += 1;
  }

  const filteredInterval = Math.min(intervalMs, 10_000);
  aggregate.avg_ms = rollingAverage(aggregate.avg_ms, previousSamples, filteredInterval);
  aggregate.filtered_avg_ms = rollingAverage(
    aggregate.filtered_avg_ms,
    previousSamples,
    filteredInterval,
  );
  if (filteredInterval > 0) {
    aggregate.fastest_ms =
      aggregate.fastest_ms === 0
        ? filteredInterval
        : Math.min(aggregate.fastest_ms, filteredInterval);
    aggregate.slowest_ms = Math.max(aggregate.slowest_ms, filteredInterval);
  }
  aggregate.error_rate = (aggregate.miss_count / aggregate.sample_count) * 100;
  aggregate.confidence =
    aggregate.filtered_avg_ms > 0 ? 220 / aggregate.filtered_avg_ms : 0;
  aggregate.last_seen_at = now;
}

function assignDailyRunMetadata(
  plan: DailyPracticePlan,
  today: string,
  runNumber: number,
  idFactory: () => string,
): DailyPracticePlan {
  const compactDate = today.replaceAll("-", "");
  const runId = `${compactDate}-${runNumber}-${idFactory()}`;
  return {
    ...plan,
    run_id: runId,
    run_number: runNumber,
    lessons: plan.lessons.map((lesson, index) => ({
      ...lesson,
      id: `${runId}-${String(index + 1).padStart(2, "0")}-${lessonKindSlug(
        lesson.kind,
      )}`,
    })),
  };
}

function dailyRunComplete(plan: DailyPracticePlan, records: SessionRecord[]): boolean {
  if (plan.lessons.length === 0 || plan.run_id.length === 0) {
    return false;
  }
  const completedLessonIds = new Set(
    records
      .filter((record) => record.daily_run_id === plan.run_id)
      .filter((record) => record.completion_state === "completed")
      .map((record) => record.lesson_id),
  );
  return plan.lessons.every((lesson) => completedLessonIds.has(lesson.id));
}

function completedMsForDate(records: SessionRecord[], date: string): number {
  return records
    .filter((record) => localDateString(record.started_at) === date)
    .reduce((sum, record) => sum + record.duration_ms, 0);
}

function localDateString(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadDailyRunStore(path: string): Promise<DailyRunStore> {
  const value = await readJsonIfExists(path);
  if (value === null) {
    return { runs: [] };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${basename(path)} must contain a JSON object`);
  }
  const object = value as Record<string, unknown>;
  if (object.runs !== undefined && !Array.isArray(object.runs)) {
    throw new Error(`${basename(path)} runs must be a JSON array`);
  }
  const runs = Array.isArray(object.runs)
    ? object.runs.map(parseStoredDailyRun)
    : [];
  return { runs };
}

async function saveDailyRunStore(path: string, store: DailyRunStore): Promise<void> {
  await writePrettyJson(path, store);
}

function parseStoredDailyRun(value: unknown): StoredDailyRun {
  const object =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    date: typeof object.date === "string" ? object.date : "",
    created_at: typeof object.created_at === "string" ? object.created_at : "",
    plan: parseDailyPracticePlan(object.plan),
  };
}

function parseVocabularyStore(value: Record<string, unknown>): PersonalVocabularyStore {
  return {
    version: 1,
    entries: Array.isArray(value.entries)
      ? value.entries.map(parsePersonalVocabularyEntry)
      : [],
  };
}

function parsePersonalVocabularyEntry(value: unknown): PersonalVocabularyEntry {
  const object =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const entry: PersonalVocabularyEntry = {
    id: stringValue(object.id),
    text: stringValue(object.text),
    kind: personalVocabularyKind(object.kind),
    parts: stringArray(object.parts),
    aliases: stringArray(object.aliases),
    tags: stringArray(object.tags),
    priority: personalVocabularyPriority(object.priority),
    created_at: stringValue(object.created_at),
    updated_at: stringValue(object.updated_at),
    archived: typeof object.archived === "boolean" ? object.archived : false,
  };
  if (typeof object.meaning_zh === "string") {
    entry.meaning_zh = object.meaning_zh;
  }
  return entry;
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  if (!(await Bun.file(path).exists())) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function emptyVocabularyStore(): PersonalVocabularyStore {
  return {
    version: 1,
    entries: [],
  };
}

function objectStoreValue(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${basename(path)} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

async function writePrettyJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function keyLabel(event: KeyEventRecord): string {
  switch (event.action) {
    case "insert":
      return charLabel(event.expected ?? event.input ?? "extra");
    case "backspace":
      return "backspace";
    case "auto_indent":
      return "auto_indent";
  }
}

function charLabel(value: string): string {
  switch (value) {
    case "\n":
      return "enter";
    case "\t":
      return "tab";
    case " ":
      return "space";
    default:
      return value;
  }
}

function rollingAverage(current: number, previousSamples: number, newValue: number): number {
  if (previousSamples === 0) {
    return newValue;
  }
  return (current * previousSamples + newValue) / (previousSamples + 1);
}

function lessonKindSlug(kind: DailyPracticePlan["lessons"][number]["kind"]): string {
  switch (kind) {
    case "foundation":
      return "foundation";
    case "warmup":
      return "warmup";
    case "chunks":
      return "chunks";
    case "common_words":
      return "common_words";
    case "words":
      return "words";
    case "symbols":
      return "symbols";
    case "naming":
      return "naming";
    case "code_block":
      return "code_block";
  }
}

function personalVocabularyKind(value: unknown): PersonalVocabularyEntry["kind"] {
  return value === "phrase" || value === "identifier" || value === "code_term"
    ? value
    : "word";
}

function personalVocabularyPriority(value: unknown): 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : 2;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
