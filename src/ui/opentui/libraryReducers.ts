import {
  createCustomLibrary,
  parseArticlePaste,
  parseSentenceBlocks,
  parseWordLines,
  type CustomArticle,
  type CustomLibrary,
  type CustomWord,
} from "../../training/customLibrary";
import { withRoute, type LibraryPreviewPayload, type OpenTuiAppState } from "./appModel";
import type { LibraryPersist, OpenTuiAppSessionContext } from "./appSession";
import type { OpenTuiKeyEvent } from "./kit";
import { isEnterEvent } from "./runnerEvents";

export interface LibraryReduceResult {
  state: OpenTuiAppState;
  persist?: LibraryPersist;
}

export function isBackspaceEvent(event: OpenTuiKeyEvent): boolean {
  return (
    event.name === "backspace" || event.sequence === "\b" || event.sequence === "\x7f"
  );
}

export function printableChar(event: OpenTuiKeyEvent): string | null {
  if (event.ctrl || event.meta) {
    return null;
  }
  const chars = Array.from(event.sequence);
  if (chars.length !== 1) {
    return null;
  }
  const codePoint = chars[0]!.codePointAt(0) ?? 0;
  if (codePoint < 0x20 || codePoint === 0x7f) {
    return null;
  }
  return chars[0]!;
}

export function reduceLibraryCreateKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_create") {
    return { state };
  }
  if (isEnterEvent(event)) {
    const name = route.name.trim();
    if (name === "") {
      return { state };
    }
    const existing = (state.customLibraries ?? []).map((library) => library.slug);
    const library: CustomLibrary = createCustomLibrary(name, existing);
    const next: OpenTuiAppState = {
      ...state,
      customLibraries: [...(state.customLibraries ?? []), library],
      route: { screen: "submenu", menu: "custom", selected_index: 0 },
    };
    return { state: next, persist: { kind: "save", library } };
  }
  if (isBackspaceEvent(event)) {
    return { state: withRoute(state, { ...route, name: route.name.slice(0, -1) }) };
  }
  const char = printableChar(event);
  if (char !== null) {
    return { state: withRoute(state, { ...route, name: route.name + char }) };
  }
  return { state };
}

function isSubmitEvent(event: OpenTuiKeyEvent): boolean {
  return event.ctrl && (event.name.toLowerCase() === "d" || event.sequence === "\x04");
}

export function reduceLibraryInputKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_input") {
    return { state };
  }
  if (route.kind === "article" && route.phase === "title") {
    if (isEnterEvent(event)) {
      return { state: withRoute(state, { ...route, phase: "body" }) };
    }
    if (isBackspaceEvent(event)) {
      return {
        state: withRoute(state, { ...route, article_title: route.article_title.slice(0, -1) }),
      };
    }
    const titleChar = printableChar(event);
    if (titleChar !== null) {
      return {
        state: withRoute(state, { ...route, article_title: route.article_title + titleChar }),
      };
    }
    return { state };
  }
  if (isSubmitEvent(event)) {
    return submitLibraryInput(state, route, context);
  }
  if (isEnterEvent(event)) {
    return { state: withRoute(state, { ...route, text: `${route.text}\n` }) };
  }
  if (isBackspaceEvent(event)) {
    return { state: withRoute(state, { ...route, text: route.text.slice(0, -1) }) };
  }
  const char = printableChar(event);
  if (char !== null) {
    return { state: withRoute(state, { ...route, text: route.text + char }) };
  }
  return { state };
}

function submitLibraryInput(
  state: OpenTuiAppState,
  route: Extract<OpenTuiAppState["route"], { screen: "library_input" }>,
  context: OpenTuiAppSessionContext,
): LibraryReduceResult {
  if (route.kind === "words") {
    const parsed = parseWordLines(route.text);
    if (parsed.entries.length === 0 && parsed.errors.length === 0) {
      return { state };
    }
    const entries = parsed.entries.map((entry) => {
      if (entry.meaning_zh !== undefined) {
        return {
          text: entry.text,
          word_kind: entry.kind,
          meaning_zh: entry.meaning_zh,
          source: "manual" as const,
        };
      }
      const hit = context.dictionary?.lookup(entry.text) ?? null;
      return {
        text: entry.text,
        word_kind: entry.kind,
        ...(hit?.translation_zh === undefined ? {} : { meaning_zh: hit.translation_zh }),
        ...(hit?.phonetic === undefined ? {} : { phonetic: hit.phonetic }),
        source: "dict" as const,
      };
    });
    return {
      state: withRoute(state, {
        screen: "library_preview",
        slug: route.slug,
        payload: {
          kind: "words",
          raw_text: route.text,
          entries,
          error_lines: parsed.errors.map((error) => `第 ${error.line} 行：${error.raw}`),
          ...(route.editing_id === undefined ? {} : { editing_id: route.editing_id }),
        },
      }),
    };
  }
  if (route.kind === "sentences") {
    const entries = parseSentenceBlocks(route.text);
    if (entries.length === 0) {
      return { state };
    }
    return {
      state: withRoute(state, {
        screen: "library_preview",
        slug: route.slug,
        payload: {
          kind: "sentences",
          raw_text: route.text,
          entries,
          ...(route.editing_id === undefined ? {} : { editing_id: route.editing_id }),
        },
      }),
    };
  }
  const parsedArticle = parseArticlePaste(route.text);
  if (parsedArticle.paragraphs.length === 0) {
    return { state };
  }
  return {
    state: withRoute(state, {
      screen: "library_preview",
      slug: route.slug,
      payload: {
        kind: "article",
        raw_text: route.text,
        title: route.article_title.trim(),
        paragraphs: parsedArticle.paragraphs,
        warnings: parsedArticle.warnings,
        ...(route.editing_id === undefined ? {} : { editing_id: route.editing_id }),
      },
    }),
  };
}

export function reduceLibraryPreviewKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_preview") {
    return { state };
  }
  if (isBackspaceEvent(event)) {
    const payload = route.payload;
    return {
      state: withRoute(state, {
        screen: "library_input",
        slug: route.slug,
        kind: payload.kind === "article" ? "article" : payload.kind,
        phase: "body",
        article_title: payload.kind === "article" ? payload.title : "",
        text: payload.raw_text,
        ...(payload.editing_id === undefined ? {} : { editing_id: payload.editing_id }),
      }),
    };
  }
  if (!isEnterEvent(event)) {
    return { state };
  }
  const libraries = state.customLibraries ?? [];
  const index = libraries.findIndex((library) => library.slug === route.slug);
  const library = libraries[index];
  if (library === undefined) {
    return { state };
  }
  const updated = applyPreviewToLibrary(library, route.payload);
  const next: OpenTuiAppState = {
    ...state,
    customLibraries: [...libraries.slice(0, index), updated, ...libraries.slice(index + 1)],
    route: { screen: "library_actions", slug: route.slug, selected_index: 0 },
  };
  return { state: next, persist: { kind: "save", library: updated } };
}

export function applyPreviewToLibrary(
  library: CustomLibrary,
  payload: LibraryPreviewPayload,
): CustomLibrary {
  if (payload.kind === "words") {
    const incoming: CustomWord[] = payload.entries.map((entry) => ({
      id: crypto.randomUUID(),
      text: entry.text,
      kind: entry.word_kind,
      ...(entry.meaning_zh === undefined ? {} : { meaning_zh: entry.meaning_zh }),
      ...(entry.phonetic === undefined ? {} : { phonetic: entry.phonetic }),
      source: entry.source,
    }));
    if (payload.editing_id !== undefined) {
      const keep = library.words.filter((word) => word.id !== payload.editing_id);
      return { ...library, words: [...keep, ...incoming] };
    }
    const seen = new Set(library.words.map((word) => word.text.toLowerCase()));
    const deduped: CustomWord[] = [];
    for (const word of incoming) {
      const key = word.text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(word);
    }
    return { ...library, words: [...library.words, ...deduped] };
  }
  if (payload.kind === "sentences") {
    const incoming = payload.entries.map((entry) => ({ id: crypto.randomUUID(), ...entry }));
    if (payload.editing_id !== undefined) {
      const keep = library.sentences.filter((sentence) => sentence.id !== payload.editing_id);
      return { ...library, sentences: [...keep, ...incoming] };
    }
    return { ...library, sentences: [...library.sentences, ...incoming] };
  }
  const article: CustomArticle = {
    id: payload.editing_id ?? crypto.randomUUID(),
    title: payload.title === "" ? "未命名文章" : payload.title,
    paragraphs: payload.paragraphs,
  };
  if (payload.editing_id !== undefined) {
    return {
      ...library,
      articles: library.articles.map((existing) =>
        existing.id === payload.editing_id ? article : existing,
      ),
    };
  }
  return { ...library, articles: [...library.articles, article] };
}
