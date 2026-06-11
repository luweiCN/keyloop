import {
  createCustomLibrary,
  parseArticlePaste,
  parseSentenceBlocks,
  parseWordLines,
  type CustomArticle,
  type CustomLibrary,
  type CustomSentence,
  type CustomWord,
} from "../../training/customLibrary";
import { fuzzyIncludes, withRoute, type LibraryPreviewPayload, type OpenTuiAppState } from "./appModel";
import type { LibraryPersist, OpenTuiAppSessionContext } from "./appSession";
import type { OpenTuiKeyEvent } from "./kit";
import { isArrowDownEvent, isArrowUpEvent, isEnterEvent } from "./runnerEvents";

export interface LibraryReduceResult {
  state: OpenTuiAppState;
  persist?: LibraryPersist;
}

export function isBackspaceEvent(event: OpenTuiKeyEvent): boolean {
  return (
    event.name === "backspace" || event.sequence === "\b" || event.sequence === "\x7f"
  );
}

/**
 * 从按键/粘贴事件提取可输入文本。
 * - 普通按键：sequence 为单个或多个（IME 整句上屏）可打印字符
 * - 合成粘贴事件（name === "paste"）：保留换行（CRLF 归一为 \n），过滤其他控制字符
 * 返回 null 表示该事件不是文本输入。
 */
export function inputTextFromEvent(event: OpenTuiKeyEvent): string | null {
  if (event.ctrl || event.meta) {
    return null;
  }
  const raw = event.name === "paste" ? event.sequence.replaceAll("\r\n", "\n").replaceAll("\r", "\n") : event.sequence;
  if (raw === "") {
    return null;
  }
  const keepNewlines = event.name === "paste";
  let text = "";
  for (const char of raw) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (char === "\n") {
      if (keepNewlines) {
        text += char;
      }
      continue;
    }
    if (char === "\t") {
      text += "  ";
      continue;
    }
    if (codePoint < 0x20 || codePoint === 0x7f) {
      return event.name === "paste" ? (text === "" ? null : text) : null;
    }
    text += char;
  }
  return text === "" ? null : text;
}

function singleLine(text: string): string {
  return text.replaceAll("\n", " ").replaceAll(/\s+/gu, " ");
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
  const text = inputTextFromEvent(event);
  if (text !== null) {
    return { state: withRoute(state, { ...route, name: singleLine(route.name + singleLine(text)) }) };
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
  if (isSubmitEvent(event)) {
    return submitLibraryInput(state, route, context);
  }
  if (isEnterEvent(event)) {
    return { state: withRoute(state, { ...route, text: `${route.text}\n` }) };
  }
  if (isBackspaceEvent(event)) {
    return { state: withRoute(state, { ...route, text: route.text.slice(0, -1) }) };
  }
  const text = inputTextFromEvent(event);
  if (text !== null) {
    return { state: withRoute(state, { ...route, text: route.text + text }) };
  }
  return { state };
}

const AUTO_TITLE_MAX = 48;

function autoArticleTitle(paragraphs: readonly { text: string }[]): string {
  const first = (paragraphs[0]?.text ?? "").trim();
  if (first.length <= AUTO_TITLE_MAX) {
    return first;
  }
  const cut = first.slice(0, AUTO_TITLE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 20 ? cut.slice(0, lastSpace) : cut}…`;
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
        title: autoArticleTitle(parsedArticle.paragraphs),
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


export interface LibraryActionItem {
  id:
    | "add_words"
    | "add_sentences"
    | "add_article"
    | "browse_words"
    | "browse_sentences"
    | "browse_articles"
    | "delete_library";
  label: string;
  hint: string;
}

export function libraryActionItems(state: OpenTuiAppState, slug: string): LibraryActionItem[] {
  const zh = state.language === "zh";
  const library = (state.customLibraries ?? []).find((entry) => entry.slug === slug);
  const wordCount = library?.words.length ?? 0;
  const sentenceCount = library?.sentences.length ?? 0;
  const articleCount = library?.articles.length ?? 0;
  return [
    { id: "add_words", label: zh ? "添加单词 / 词组" : "Add words", hint: zh ? "每行一条，可带释义" : "one per line" },
    { id: "add_sentences", label: zh ? "添加句子" : "Add sentences", hint: zh ? "单次粘贴，英文+翻译交替" : "single paste" },
    { id: "add_article", label: zh ? "添加文章" : "Add article", hint: zh ? "标题 + 整篇粘贴" : "title + paste" },
    { id: "browse_words", label: zh ? "浏览单词与词组" : "Browse words", hint: zh ? `${wordCount} 条 · 搜索 · 编辑 · 删除` : `${wordCount} entries` },
    { id: "browse_sentences", label: zh ? "浏览句子" : "Browse sentences", hint: zh ? `${sentenceCount} 句` : `${sentenceCount} sentences` },
    { id: "browse_articles", label: zh ? "浏览文章" : "Browse articles", hint: zh ? `${articleCount} 篇` : `${articleCount} articles` },
    { id: "delete_library", label: zh ? "删除语料库" : "Delete library", hint: zh ? "整库删除，需确认" : "confirm required" },
  ];
}

export function reduceLibraryManageKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_manage") {
    return { state };
  }
  const libraries = state.customLibraries ?? [];
  const count = libraries.length;
  const index = Math.min(Math.max(route.selected_index ?? 0, 0), Math.max(count - 1, 0));
  if (isArrowDownEvent(event)) {
    return {
      state: withRoute(state, {
        screen: "library_manage",
        selected_index: count === 0 ? 0 : (index + 1) % count,
      }),
    };
  }
  if (isArrowUpEvent(event)) {
    return {
      state: withRoute(state, {
        screen: "library_manage",
        selected_index: count === 0 ? 0 : (index - 1 + count) % count,
      }),
    };
  }
  if (isEnterEvent(event)) {
    const library = libraries[index];
    if (library === undefined) {
      return { state };
    }
    return {
      state: withRoute(state, {
        screen: "library_actions",
        slug: library.slug,
        selected_index: 0,
      }),
    };
  }
  return { state };
}

export function reduceLibraryActionsKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_actions") {
    return { state };
  }
  const items = libraryActionItems(state, route.slug);
  const index = Math.min(Math.max(route.selected_index ?? 0, 0), items.length - 1);
  if (isArrowDownEvent(event)) {
    return {
      state: withRoute(state, { ...route, selected_index: (index + 1) % items.length }),
    };
  }
  if (isArrowUpEvent(event)) {
    return {
      state: withRoute(state, {
        ...route,
        selected_index: (index - 1 + items.length) % items.length,
      }),
    };
  }
  if (!isEnterEvent(event)) {
    return { state };
  }
  const item = items[index];
  if (item === undefined) {
    return { state };
  }
  switch (item.id) {
    case "add_words":
    case "add_sentences":
    case "add_article":
      return {
        state: withRoute(state, {
          screen: "library_input",
          slug: route.slug,
          kind: item.id === "add_words" ? "words" : item.id === "add_sentences" ? "sentences" : "article",
          text: "",
        }),
      };
    case "browse_words":
    case "browse_sentences":
    case "browse_articles":
      return {
        state: withRoute(state, {
          screen: "library_browse",
          slug: route.slug,
          entry_type:
            item.id === "browse_words"
              ? "words"
              : item.id === "browse_sentences"
                ? "sentences"
                : "articles",
          query: "",
          index: 0,
        }),
      };
    case "delete_library":
      return {
        state: withRoute(state, { screen: "library_delete_confirm", slug: route.slug }),
      };
  }
}

export type LibraryBrowseEntry =
  | { entry_type: "words"; id: string; entry: CustomWord }
  | { entry_type: "sentences"; id: string; entry: CustomSentence }
  | { entry_type: "articles"; id: string; entry: CustomArticle };

export function libraryBrowseMatches(state: OpenTuiAppState): LibraryBrowseEntry[] {
  const route = state.route;
  if (route.screen !== "library_browse") {
    return [];
  }
  const library = (state.customLibraries ?? []).find((entry) => entry.slug === route.slug);
  if (library === undefined) {
    return [];
  }
  const query = route.query;
  if (route.entry_type === "words") {
    return library.words
      .filter((word) => query === "" || fuzzyIncludes(`${word.text} ${word.meaning_zh ?? ""}`, query))
      .map((word) => ({ entry_type: "words" as const, id: word.id, entry: word }));
  }
  if (route.entry_type === "sentences") {
    return library.sentences
      .filter(
        (sentence) =>
          query === "" || fuzzyIncludes(`${sentence.text} ${sentence.translation_zh ?? ""}`, query),
      )
      .map((sentence) => ({ entry_type: "sentences" as const, id: sentence.id, entry: sentence }));
  }
  return library.articles
    .filter((article) => query === "" || fuzzyIncludes(article.title, query))
    .map((article) => ({ entry_type: "articles" as const, id: article.id, entry: article }));
}

function editPrefillRoute(
  slug: string,
  match: LibraryBrowseEntry,
): Extract<OpenTuiAppState["route"], { screen: "library_input" }> {
  if (match.entry_type === "words") {
    const word = match.entry;
    return {
      screen: "library_input",
      slug,
      kind: "words",
      text: word.meaning_zh === undefined ? word.text : `${word.text}: ${word.meaning_zh}`,
      editing_id: word.id,
    };
  }
  if (match.entry_type === "sentences") {
    const sentence = match.entry;
    return {
      screen: "library_input",
      slug,
      kind: "sentences",
      text:
        sentence.translation_zh === undefined
          ? sentence.text
          : `${sentence.text}\n${sentence.translation_zh}`,
      editing_id: sentence.id,
    };
  }
  const article = match.entry;
  const english = article.paragraphs.map((paragraph) => paragraph.text).join("\n");
  const chinese = article.paragraphs
    .map((paragraph) => paragraph.translation_zh ?? "")
    .filter((line) => line !== "")
    .join("\n");
  return {
    screen: "library_input",
    slug,
    kind: "article",
    text: chinese === "" ? english : `${english}\n\n${chinese}`,
    editing_id: article.id,
  };
}

export function reduceLibraryBrowseKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_browse") {
    return { state };
  }
  const matches = libraryBrowseMatches(state);
  const index = Math.min(Math.max(route.index, 0), Math.max(matches.length - 1, 0));
  if (isArrowDownEvent(event)) {
    return {
      state: withRoute(state, {
        ...route,
        index: matches.length === 0 ? 0 : (index + 1) % matches.length,
      }),
    };
  }
  if (isArrowUpEvent(event)) {
    return {
      state: withRoute(state, {
        ...route,
        index: matches.length === 0 ? 0 : (index - 1 + matches.length) % matches.length,
      }),
    };
  }
  if (isEnterEvent(event)) {
    const match = matches[index];
    if (match === undefined) {
      return { state };
    }
    return { state: withRoute(state, editPrefillRoute(route.slug, match)) };
  }
  if (event.ctrl && !event.meta && (event.name.toLowerCase() === "x" || event.sequence === "\x18")) {
    const match = matches[index];
    if (match === undefined) {
      return { state };
    }
    return deleteBrowseEntry(state, route, match, index);
  }
  if (event.ctrl && !event.meta && (event.name.toLowerCase() === "n" || event.sequence === "\x0e")) {
    return {
      state: withRoute(state, {
        screen: "library_input",
        slug: route.slug,
        kind: route.entry_type === "articles" ? "article" : route.entry_type,
        text: "",
      }),
    };
  }
  if (isBackspaceEvent(event)) {
    return { state: withRoute(state, { ...route, query: route.query.slice(0, -1), index: 0 }) };
  }
  const text = inputTextFromEvent(event);
  if (text !== null) {
    return { state: withRoute(state, { ...route, query: singleLine(route.query + text), index: 0 }) };
  }
  return { state };
}

function deleteBrowseEntry(
  state: OpenTuiAppState,
  route: Extract<OpenTuiAppState["route"], { screen: "library_browse" }>,
  match: LibraryBrowseEntry,
  index: number,
): LibraryReduceResult {
  const libraries = state.customLibraries ?? [];
  const libraryIndex = libraries.findIndex((library) => library.slug === route.slug);
  const library = libraries[libraryIndex];
  if (library === undefined) {
    return { state };
  }
  const updated: CustomLibrary =
    match.entry_type === "words"
      ? { ...library, words: library.words.filter((word) => word.id !== match.id) }
      : match.entry_type === "sentences"
        ? {
            ...library,
            sentences: library.sentences.filter((sentence) => sentence.id !== match.id),
          }
        : { ...library, articles: library.articles.filter((article) => article.id !== match.id) };
  const next: OpenTuiAppState = {
    ...state,
    customLibraries: [
      ...libraries.slice(0, libraryIndex),
      updated,
      ...libraries.slice(libraryIndex + 1),
    ],
    route: { ...route, index: Math.max(0, index - 1) },
  };
  return { state: next, persist: { kind: "save", library: updated } };
}

export function reduceLibraryDeleteConfirmKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_delete_confirm") {
    return { state };
  }
  if (isBackspaceEvent(event)) {
    return {
      state: withRoute(state, {
        screen: "library_actions",
        slug: route.slug,
        selected_index: 0,
      }),
    };
  }
  if (!isEnterEvent(event)) {
    return { state };
  }
  const libraries = state.customLibraries ?? [];
  const next: OpenTuiAppState = {
    ...state,
    customLibraries: libraries.filter((library) => library.slug !== route.slug),
    route: { screen: "library_manage", selected_index: 0 },
  };
  return { state: next, persist: { kind: "delete", slug: route.slug } };
}
