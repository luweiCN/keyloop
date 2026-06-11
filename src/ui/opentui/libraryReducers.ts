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
import {
  deleteBeforeCursor,
  insertAtCursor,
  moveCursorDownVisual,
  moveCursorLeft,
  moveCursorLineEnd,
  moveCursorLineStart,
  moveCursorRight,
  moveCursorUpVisual,
  type TextEditState,
} from "./textEdit";
import { detailPopupSize, detailViewBlocks, libraryInputPaneWidth } from "./screens/library";
import { textPaneContentWidth, textPaneMaxScroll } from "./screens/textPane";

export function isArrowLeftEvent(event: OpenTuiKeyEvent): boolean {
  return event.name === "left" || event.name === "arrowleft" || event.sequence === "\x1b[D";
}

export function isArrowRightEvent(event: OpenTuiKeyEvent): boolean {
  return event.name === "right" || event.name === "arrowright" || event.sequence === "\x1b[C";
}

export function isHomeEvent(event: OpenTuiKeyEvent): boolean {
  return event.name === "home" || event.sequence === "\x1b[H" || (event.ctrl && event.name.toLowerCase() === "a");
}

export function isEndEvent(event: OpenTuiKeyEvent): boolean {
  return event.name === "end" || event.sequence === "\x1b[F" || (event.ctrl && event.name.toLowerCase() === "e");
}

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
  const editing: TextEditState = { text: route.text, cursor: route.cursor ?? route.text.length };
  const apply = (next: TextEditState): LibraryReduceResult => ({
    state: withRoute(state, { ...route, text: next.text, cursor: next.cursor }),
  });
  if (isArrowUpEvent(event)) {
    return apply(moveCursorUpVisual(editing, libraryInputPaneWidth()));
  }
  if (isArrowDownEvent(event)) {
    return apply(moveCursorDownVisual(editing, libraryInputPaneWidth()));
  }
  if (isArrowLeftEvent(event)) {
    return apply(moveCursorLeft(editing));
  }
  if (isArrowRightEvent(event)) {
    return apply(moveCursorRight(editing));
  }
  if (isHomeEvent(event)) {
    return apply(moveCursorLineStart(editing));
  }
  if (isEndEvent(event)) {
    return apply(moveCursorLineEnd(editing));
  }
  if (isEnterEvent(event)) {
    return apply(insertAtCursor(editing, "\n"));
  }
  if (isBackspaceEvent(event)) {
    return apply(deleteBeforeCursor(editing));
  }
  const text = inputTextFromEvent(event);
  if (text !== null) {
    return apply(insertAtCursor(editing, text));
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
    | "browse_all"
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
    {
      id: "browse_all",
      label: zh ? "浏览内容" : "Browse entries",
      hint: zh
        ? `${wordCount} 词 · ${sentenceCount} 句 · ${articleCount} 篇 · 搜索 · 编辑 · 删除`
        : `${wordCount}w · ${sentenceCount}s · ${articleCount}a`,
    },
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
    case "browse_all":
      return {
        state: withRoute(state, {
          screen: "library_browse",
          slug: route.slug,
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
  const matches: LibraryBrowseEntry[] = [];
  for (const word of library.words) {
    if (query === "" || fuzzyIncludes(`${word.text} ${word.meaning_zh ?? ""}`, query)) {
      matches.push({ entry_type: "words", id: word.id, entry: word });
    }
  }
  for (const sentence of library.sentences) {
    if (query === "" || fuzzyIncludes(`${sentence.text} ${sentence.translation_zh ?? ""}`, query)) {
      matches.push({ entry_type: "sentences", id: sentence.id, entry: sentence });
    }
  }
  for (const article of library.articles) {
    const haystack = `${article.title} ${article.paragraphs[0]?.text ?? ""}`;
    if (query === "" || fuzzyIncludes(haystack, query)) {
      matches.push({ entry_type: "articles", id: article.id, entry: article });
    }
  }
  return matches;
}

/** 条目的录入格式文本（编辑预填用） */
export function entryEditText(match: LibraryBrowseEntry): string {
  if (match.entry_type === "words") {
    const word = match.entry;
    return word.meaning_zh === undefined ? word.text : `${word.text}: ${word.meaning_zh}`;
  }
  if (match.entry_type === "sentences") {
    const sentence = match.entry;
    return sentence.translation_zh === undefined
      ? sentence.text
      : `${sentence.text}\n${sentence.translation_zh}`;
  }
  const article = match.entry;
  const english = article.paragraphs.map((paragraph) => paragraph.text).join("\n");
  const chinese = article.paragraphs
    .map((paragraph) => paragraph.translation_zh ?? "")
    .filter((line) => line !== "")
    .join("\n");
  return chinese === "" ? english : `${english}\n\n${chinese}`;
}

export function libraryEntryById(
  state: OpenTuiAppState,
  slug: string,
  entryId: string,
): LibraryBrowseEntry | undefined {
  const library = (state.customLibraries ?? []).find((entry) => entry.slug === slug);
  if (library === undefined) {
    return undefined;
  }
  const word = library.words.find((entry) => entry.id === entryId);
  if (word !== undefined) {
    return { entry_type: "words", id: word.id, entry: word };
  }
  const sentence = library.sentences.find((entry) => entry.id === entryId);
  if (sentence !== undefined) {
    return { entry_type: "sentences", id: sentence.id, entry: sentence };
  }
  const article = library.articles.find((entry) => entry.id === entryId);
  if (article !== undefined) {
    return { entry_type: "articles", id: article.id, entry: article };
  }
  return undefined;
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
    return {
      state: withRoute(state, {
        screen: "library_detail",
        slug: route.slug,
        entry_id: match.id,
        return_query: route.query,
        return_index: index,
        scroll: 0,
      }),
    };
  }
  if (event.ctrl && !event.meta && (event.name.toLowerCase() === "x" || event.sequence === "\x18")) {
    const match = matches[index];
    if (match === undefined) {
      return { state };
    }
    return deleteBrowseEntry(state, route, match, index);
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

const DETAIL_DELETE_KEYS = new Set(["d"]);
const DETAIL_EDIT_KEYS = new Set(["e", "m"]);

export function reduceLibraryDetailKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): LibraryReduceResult {
  const route = state.route;
  if (route.screen !== "library_detail") {
    return { state };
  }
  const backToBrowse = (): LibraryReduceResult => ({
    state: withRoute(state, {
      screen: "library_browse",
      slug: route.slug,
      query: route.return_query,
      index: route.return_index,
    }),
  });
  const match = libraryEntryById(state, route.slug, route.entry_id);
  if (match === undefined) {
    return backToBrowse();
  }

  if (route.editing === undefined) {
    // 查看态：↑↓/PgUp/PgDn 滚动，E/M 编辑，D 删除，Enter/Esc 关闭（Esc 由顶层处理）
    const size = detailPopupSize();
    const maxScroll = textPaneMaxScroll(
      detailViewBlocks(match, state.language === "zh"),
      size.paneWidth,
      size.bodyHeight,
    );
    const scrollTo = (target: number): LibraryReduceResult => ({
      state: withRoute(state, {
        ...route,
        scroll: Math.max(0, Math.min(target, maxScroll)),
      }),
    });
    if (isArrowUpEvent(event) || event.name === "wheel_up") {
      return scrollTo(route.scroll - (event.name === "wheel_up" ? 3 : 1));
    }
    if (isArrowDownEvent(event) || event.name === "wheel_down") {
      return scrollTo(route.scroll + (event.name === "wheel_down" ? 3 : 1));
    }
    if (event.name.toLowerCase() === "pageup") {
      return scrollTo(route.scroll - size.bodyHeight);
    }
    if (event.name.toLowerCase() === "pagedown") {
      return scrollTo(route.scroll + size.bodyHeight);
    }
    const key = event.ctrl || event.meta ? "" : event.name.toLowerCase();
    if (DETAIL_EDIT_KEYS.has(key)) {
      const text = entryEditText(match);
      return {
        state: withRoute(state, {
          ...route,
          editing: { text, cursor: text.length },
        }),
      };
    }
    if (DETAIL_DELETE_KEYS.has(key)) {
      const browse = backToBrowse();
      if (browse.state.route.screen !== "library_browse") {
        return browse;
      }
      const deleted = deleteBrowseEntry(
        browse.state,
        browse.state.route,
        match,
        route.return_index,
      );
      return deleted;
    }
    if (isEnterEvent(event)) {
      return backToBrowse();
    }
    return { state };
  }

  // 编辑态
  const editing = route.editing;
  const apply = (next: TextEditState): LibraryReduceResult => ({
    state: withRoute(state, { ...route, editing: { text: next.text, cursor: next.cursor } }),
  });
  if (isSubmitEvent(event)) {
    return saveDetailEdit(state, route, match, editing.text, context);
  }
  if (isArrowUpEvent(event)) {
    return apply(moveCursorUpVisual(editing, textPaneContentWidth(detailPopupSize().paneWidth)));
  }
  if (isArrowDownEvent(event)) {
    return apply(moveCursorDownVisual(editing, textPaneContentWidth(detailPopupSize().paneWidth)));
  }
  if (isArrowLeftEvent(event)) {
    return apply(moveCursorLeft(editing));
  }
  if (isArrowRightEvent(event)) {
    return apply(moveCursorRight(editing));
  }
  if (isHomeEvent(event)) {
    return apply(moveCursorLineStart(editing));
  }
  if (isEndEvent(event)) {
    return apply(moveCursorLineEnd(editing));
  }
  if (isEnterEvent(event)) {
    return apply(insertAtCursor(editing, "\n"));
  }
  if (isBackspaceEvent(event)) {
    return apply(deleteBeforeCursor(editing));
  }
  const text = inputTextFromEvent(event);
  if (text !== null) {
    return apply(insertAtCursor(editing, text));
  }
  return { state };
}

function saveDetailEdit(
  state: OpenTuiAppState,
  route: Extract<OpenTuiAppState["route"], { screen: "library_detail" }>,
  match: LibraryBrowseEntry,
  text: string,
  context: OpenTuiAppSessionContext,
): LibraryReduceResult {
  const libraries = state.customLibraries ?? [];
  const libraryIndex = libraries.findIndex((library) => library.slug === route.slug);
  const library = libraries[libraryIndex];
  if (library === undefined) {
    return { state };
  }
  let payload: LibraryPreviewPayload | null = null;
  if (match.entry_type === "words") {
    const parsed = parseWordLines(text);
    if (parsed.entries.length === 0) {
      return { state };
    }
    payload = {
      kind: "words",
      raw_text: text,
      entries: parsed.entries.map((entry) => {
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
      }),
      error_lines: [],
      editing_id: match.id,
    };
  } else if (match.entry_type === "sentences") {
    const entries = parseSentenceBlocks(text);
    if (entries.length === 0) {
      return { state };
    }
    payload = { kind: "sentences", raw_text: text, entries, editing_id: match.id };
  } else {
    const parsed = parseArticlePaste(text);
    if (parsed.paragraphs.length === 0) {
      return { state };
    }
    payload = {
      kind: "article",
      raw_text: text,
      title: autoArticleTitle(parsed.paragraphs),
      paragraphs: parsed.paragraphs,
      warnings: parsed.warnings,
      editing_id: match.id,
    };
  }
  const updated = applyPreviewToLibrary(library, payload);
  const next: OpenTuiAppState = {
    ...state,
    customLibraries: [
      ...libraries.slice(0, libraryIndex),
      updated,
      ...libraries.slice(libraryIndex + 1),
    ],
    route: {
      screen: "library_browse",
      slug: route.slug,
      query: route.return_query,
      index: route.return_index,
    },
  };
  return { state: next, persist: { kind: "save", library: updated } };
}
