import type { PracticeTarget, PracticeTargetAnnotation } from "../domain/model";
import type { CustomLibrary, CustomWord } from "./customLibrary";

interface BuildOptions {
  random?: () => number;
  count?: number;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

interface AppendState {
  text: string;
  annotations: PracticeTargetAnnotation[];
}

function appendWordLine(state: AppendState, words: readonly CustomWord[]): void {
  if (state.text !== "") {
    state.text += "\n";
  }
  for (let index = 0; index < words.length; index += 1) {
    if (index > 0) {
      state.text += " ";
    }
    const word = words[index]!;
    const start = state.text.length;
    state.text += word.text;
    if (word.meaning_zh !== undefined) {
      state.annotations.push({
        start,
        end: state.text.length,
        translation_zh: word.meaning_zh,
        display: "word",
      });
    }
  }
}

function appendLine(state: AppendState, text: string, translation: string | undefined): void {
  if (state.text !== "") {
    state.text += "\n";
  }
  const start = state.text.length;
  state.text += text;
  if (translation !== undefined) {
    state.annotations.push({
      start,
      end: state.text.length,
      translation_zh: translation,
      display: "line",
    });
  }
}

function finish(state: AppendState, source: string): PracticeTarget {
  return {
    mode: "words",
    text: state.text,
    source,
    ...(state.annotations.length === 0 ? {} : { annotations: state.annotations }),
  };
}

const WORDS_PER_LINE = 4;

export function buildLibraryWordsTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const count = options.count ?? 16;
  const chosen = shuffled(
    library.words.filter((word) => word.kind === "word"),
    random,
  ).slice(0, count);
  const state: AppendState = { text: "", annotations: [] };
  for (let index = 0; index < chosen.length; index += WORDS_PER_LINE) {
    appendWordLine(state, chosen.slice(index, index + WORDS_PER_LINE));
  }
  return finish(state, `keyloop:library:${library.slug}:words`);
}

export function buildLibraryPhrasesTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const count = options.count ?? 8;
  const chosen = shuffled(
    library.words.filter((word) => word.kind === "phrase"),
    random,
  ).slice(0, count);
  const state: AppendState = { text: "", annotations: [] };
  for (const phrase of chosen) {
    appendLine(state, phrase.text, phrase.meaning_zh);
  }
  return {
    ...finish(state, `keyloop:library:${library.slug}:phrases`),
    space_glyph: "dot" as const,
  };
}

export function buildLibrarySentencesTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const count = options.count ?? 5;
  const chosen = shuffled(library.sentences, random).slice(0, count);
  const state: AppendState = { text: "", annotations: [] };
  for (const sentence of chosen) {
    appendLine(state, sentence.text, sentence.translation_zh);
  }
  return finish(state, `keyloop:library:${library.slug}:sentences`);
}

export function buildLibraryArticleTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const article = shuffled(library.articles, random)[0];
  if (article === undefined) {
    return { mode: "words", text: "", source: `keyloop:library:${library.slug}:articles` };
  }
  const text = article.paragraphs.map((paragraph) => paragraph.text).join("\n");
  const translation = article.paragraphs
    .map((paragraph) => paragraph.translation_zh ?? "")
    .filter((line) => line !== "")
    .join("\n");
  return {
    mode: "words",
    text,
    source: `keyloop:library:${library.slug}:articles:${article.id}`,
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

export function buildLibraryMixTarget(
  library: CustomLibrary,
  options: BuildOptions = {},
): PracticeTarget {
  const random = options.random ?? Math.random;
  const state: AppendState = { text: "", annotations: [] };
  const words = shuffled(
    library.words.filter((word) => word.kind === "word"),
    random,
  ).slice(0, 8);
  for (let index = 0; index < words.length; index += WORDS_PER_LINE) {
    appendWordLine(state, words.slice(index, index + WORDS_PER_LINE));
  }
  const phrases = shuffled(
    library.words.filter((word) => word.kind === "phrase"),
    random,
  ).slice(0, 3);
  for (const phrase of phrases) {
    appendLine(state, phrase.text, phrase.meaning_zh);
  }
  for (const sentence of shuffled(library.sentences, random).slice(0, 2)) {
    appendLine(state, sentence.text, sentence.translation_zh);
  }
  const article = shuffled(library.articles, random)[0];
  const paragraph = article?.paragraphs[0];
  if (paragraph !== undefined) {
    appendLine(state, paragraph.text, paragraph.translation_zh);
  }
  return finish(state, `keyloop:library:${library.slug}:mix`);
}
