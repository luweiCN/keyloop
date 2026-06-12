import type { PracticeTarget, PracticeTargetAnnotation } from "../domain/model";
import { conciseChineseMeaning } from "./targets";
import type { CustomLibrary, CustomWord } from "./customLibrary";

interface BuildOptions {
  random?: () => number;
  count?: number;
  wordRepeats?: number;
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

/** 与日常练习一致：单词空格连排成一段，渲染层按 word 标注排布；释义只取第一义并去词性 */
function appendWordRun(
  state: AppendState,
  words: readonly CustomWord[],
  wordRepeats = 1,
): void {
  const repeats = normalizedWordRepeats(wordRepeats);
  if (state.text !== "") {
    state.text += "\n";
  }
  for (let index = 0; index < words.length; index += 1) {
    if (index > 0) {
      state.text += " ";
    }
    const word = words[index]!;
    const start = state.text.length;
    state.text += repeatedWordText(word.text, repeats);
    if (word.meaning_zh !== undefined) {
      const meaning = conciseChineseMeaning(word.meaning_zh);
      if (meaning !== "") {
        state.annotations.push({
          start,
          end: state.text.length,
          translation_zh: meaning,
          display: repeats > 1 ? "word_loose" : "word",
          audio_text: word.text,
        });
      }
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
  appendWordRun(state, chosen, options.wordRepeats);
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
    appendLine(
      state,
      phrase.text,
      phrase.meaning_zh === undefined ? undefined : conciseChineseMeaning(phrase.meaning_zh),
    );
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
  if (words.length > 0) {
    appendWordRun(state, words);
  }
  const phrases = shuffled(
    library.words.filter((word) => word.kind === "phrase"),
    random,
  ).slice(0, 3);
  for (const phrase of phrases) {
    appendLine(
      state,
      phrase.text,
      phrase.meaning_zh === undefined ? undefined : conciseChineseMeaning(phrase.meaning_zh),
    );
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

function repeatedWordText(word: string, repeats: number): string {
  return Array.from({ length: repeats }, () => word).join(" ");
}

function normalizedWordRepeats(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(10, Math.max(1, Math.floor(value)));
}
