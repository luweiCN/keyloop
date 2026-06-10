import { randomUUID } from "node:crypto";

import type { PracticeTarget } from "../domain/model";

export interface PersonalSentenceEntry {
  id: string;
  text: string;
  translation_zh?: string;
  collection?: string;
  source_note?: string;
  created_at: string;
  archived: boolean;
}

export interface PersonalArticleParagraph {
  text: string;
  translation_zh?: string;
}

export interface PersonalArticleEntry {
  id: string;
  title: string;
  paragraphs: PersonalArticleParagraph[];
  collection?: string;
  source_note?: string;
  created_at: string;
  archived: boolean;
}

export interface PersonalSentencesStore {
  version: 1;
  entries: PersonalSentenceEntry[];
}

export interface PersonalArticlesStore {
  version: 1;
  entries: PersonalArticleEntry[];
}

export function emptyPersonalSentencesStore(): PersonalSentencesStore {
  return { version: 1, entries: [] };
}

export function emptyPersonalArticlesStore(): PersonalArticlesStore {
  return { version: 1, entries: [] };
}

export interface CreateEntryOptions {
  now?: string;
  idFactory?: () => string;
}

export function createPersonalSentenceEntry(
  input: {
    text: string;
    translation_zh?: string;
    collection?: string;
    source_note?: string;
  },
  options: CreateEntryOptions = {},
): PersonalSentenceEntry {
  const text = input.text.trim();
  if (text === "") {
    throw new Error("sentence text must not be empty");
  }
  return {
    id: (options.idFactory ?? randomUUID)(),
    text,
    ...(input.translation_zh === undefined || input.translation_zh.trim() === ""
      ? {}
      : { translation_zh: input.translation_zh.trim() }),
    ...(input.collection === undefined ? {} : { collection: input.collection }),
    ...(input.source_note === undefined ? {} : { source_note: input.source_note }),
    created_at: options.now ?? new Date().toISOString(),
    archived: false,
  };
}

export function createPersonalArticleEntry(
  input: {
    title: string;
    paragraphs: PersonalArticleParagraph[];
    collection?: string;
    source_note?: string;
  },
  options: CreateEntryOptions = {},
): PersonalArticleEntry {
  const title = input.title.trim();
  const paragraphs = input.paragraphs
    .map((p) => ({
      text: p.text.trim(),
      ...(p.translation_zh === undefined || p.translation_zh.trim() === ""
        ? {}
        : { translation_zh: p.translation_zh.trim() }),
    }))
    .filter((p) => p.text !== "");
  if (title === "") {
    throw new Error("article title must not be empty");
  }
  if (paragraphs.length === 0) {
    throw new Error("article must contain at least one paragraph");
  }
  return {
    id: (options.idFactory ?? randomUUID)(),
    title,
    paragraphs,
    ...(input.collection === undefined ? {} : { collection: input.collection }),
    ...(input.source_note === undefined ? {} : { source_note: input.source_note }),
    created_at: options.now ?? new Date().toISOString(),
    archived: false,
  };
}

/**
 * Parse a plain-text or markdown file into an article: an optional leading
 * `# Title` line, paragraphs separated by blank lines. A paragraph starting
 * with `> ` is treated as the Chinese translation of the previous paragraph.
 */
export function parseArticleFile(
  raw: string,
  fallbackTitle: string,
): { title: string; paragraphs: PersonalArticleParagraph[] } {
  const blocks = raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "");
  let title = fallbackTitle;
  if (blocks[0]?.startsWith("# ")) {
    title = blocks[0].slice(2).trim();
    blocks.shift();
  }
  const paragraphs: PersonalArticleParagraph[] = [];
  for (const block of blocks) {
    const text = block.split("\n").map((line) => line.trim()).join(" ");
    if (text.startsWith("> ")) {
      const previous = paragraphs[paragraphs.length - 1];
      if (previous !== undefined && previous.translation_zh === undefined) {
        previous.translation_zh = text.slice(2).trim();
        continue;
      }
    }
    paragraphs.push({ text });
  }
  return { title, paragraphs };
}

function shuffleInPlace<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap] as T, items[index] as T];
  }
}

export function buildPersonalSentencesTarget(
  entries: readonly PersonalSentenceEntry[],
  options: { count?: number; random?: () => number } = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const count = options.count ?? 5;
  const pool = entries.filter((entry) => !entry.archived);
  const selected = [...pool];
  shuffleInPlace(selected, random);
  const chosen = selected.slice(0, count);
  let text = "";
  const annotations: NonNullable<PracticeTarget["annotations"]> = [];
  for (let index = 0; index < chosen.length; index += 1) {
    const entry = chosen[index]!;
    if (index > 0) {
      text += "\n";
    }
    const start = text.length;
    text += entry.text;
    if (entry.translation_zh !== undefined) {
      annotations.push({
        start,
        end: text.length,
        translation_zh: entry.translation_zh,
        ...(entry.source_note === undefined ? {} : { source_title: entry.source_note }),
        display: "line",
      });
    }
  }
  return {
    mode: "words",
    text,
    source: "keyloop:custom:sentences",
    ...(annotations.length === 0 ? {} : { annotations }),
  };
}

export function buildPersonalArticleTarget(
  entries: readonly PersonalArticleEntry[],
  options: { random?: () => number } = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const pool = entries.filter((entry) => !entry.archived);
  const candidates = [...pool];
  shuffleInPlace(candidates, random);
  const article = candidates[0];
  if (article === undefined) {
    return { mode: "words", text: "", source: "keyloop:custom:articles" };
  }
  const text = article.paragraphs.map((p) => p.text).join("\n");
  const translation = article.paragraphs
    .map((p) => p.translation_zh ?? "")
    .filter((line) => line !== "")
    .join("\n");
  return {
    mode: "words",
    text,
    source: `keyloop:custom:articles:${article.id}`,
    ...(translation === ""
      ? {}
      : {
          annotations: [
            {
              start: 0,
              end: text.length,
              translation_zh: translation,
              source_title: article.title,
              display: "article" as const,
            },
          ],
        }),
  };
}
