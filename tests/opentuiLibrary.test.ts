import { describe, expect, test } from "bun:test";

import { createOpenTuiInitialState, type CustomLibrary, type OpenTuiAppState } from "../src/index";
import type { OpenTuiRoute } from "../src/ui/opentui/appModel";
import type { OpenTuiKeyEvent } from "../src/ui/opentui/kit";
import { reduceLibraryCreateKey } from "../src/ui/opentui/libraryReducers";

export function keyEvent(name: string, sequence: string): OpenTuiKeyEvent {
  return { name, sequence, ctrl: false, meta: false };
}

export function stateAt(
  route: OpenTuiRoute,
  options: { customLibraries?: CustomLibrary[] } = {},
): OpenTuiAppState {
  const base = createOpenTuiInitialState("zh", {
    customLibraries: options.customLibraries ?? [],
  });
  return { ...base, route };
}

export function emptyLibrary(slug: string): CustomLibrary {
  return {
    version: 1,
    slug,
    name: slug,
    created_at: "2026-06-11T00:00:00.000Z",
    words: [],
    sentences: [],
    articles: [],
  };
}

describe("library create screen", () => {
  test("typing accumulates name, enter creates library and persists", () => {
    let state = stateAt({ screen: "library_create", name: "" });
    for (const char of "web") {
      state = reduceLibraryCreateKey(state, keyEvent(char, char)).state;
    }
    if (state.route.screen === "library_create") {
      expect(state.route.name).toBe("web");
    } else {
      throw new Error("expected library_create route");
    }
    const result = reduceLibraryCreateKey(state, keyEvent("enter", "\r"));
    expect(result.persist).toEqual({
      kind: "save",
      library: expect.objectContaining({ slug: "web", name: "web" }),
    });
    expect(result.state.customLibraries?.length).toBe(1);
    expect(result.state.route).toEqual({ screen: "submenu", menu: "custom", selected_index: 0 });
  });

  test("backspace removes the last character", () => {
    let state = stateAt({ screen: "library_create", name: "ab" });
    state = reduceLibraryCreateKey(state, keyEvent("backspace", "\x7f")).state;
    expect(state.route).toEqual({ screen: "library_create", name: "a" });
  });

  test("enter with empty name does nothing", () => {
    const result = reduceLibraryCreateKey(
      stateAt({ screen: "library_create", name: "  " }),
      keyEvent("enter", "\r"),
    );
    expect(result.state.route.screen).toBe("library_create");
    expect(result.persist).toBeUndefined();
  });

  test("slug conflicts get numeric suffix against existing libraries", () => {
    let state = stateAt({ screen: "library_create", name: "web" }, {
      customLibraries: [emptyLibrary("web")],
    });
    const result = reduceLibraryCreateKey(state, keyEvent("enter", "\r"));
    expect(result.persist).toEqual({
      kind: "save",
      library: expect.objectContaining({ slug: "web-2" }),
    });
    expect(result.state.customLibraries?.length).toBe(2);
  });
});

import {
  reduceLibraryInputKey,
  reduceLibraryPreviewKey,
} from "../src/ui/opentui/libraryReducers";
import type { OpenTuiAppSessionContext } from "../src/ui/opentui/appSession";

function charEvent(char: string): OpenTuiKeyEvent {
  if (char === "\n") {
    return keyEvent("enter", "\r");
  }
  return keyEvent(char, char);
}

const ctrlD: OpenTuiKeyEvent = { name: "d", sequence: "\x04", ctrl: true, meta: false };

function fakeContext(): OpenTuiAppSessionContext {
  return {
    language: "zh",
    records: [],
    plan: { focus_words: [], focus_keys: [], modules: [] } as never,
    library: {} as never,
    dictionary: {
      tier: "mini",
      lookup: (text: string) =>
        text.toLowerCase() === "abandon"
          ? { phonetic: "ə'bændən", translation_zh: "v. 放弃" }
          : null,
    } as never,
  } as OpenTuiAppSessionContext;
}

describe("library words input flow", () => {
  test("ctrl+d parses lines, queries dictionary, routes to preview", () => {
    let state = stateAt(
      {
        screen: "library_input",
        slug: "web",
        kind: "words",
        text: "",
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    for (const char of "Abandon\nfoo: 自定义\nmachine learning\n苹果") {
      state = reduceLibraryInputKey(state, charEvent(char), fakeContext()).state;
    }
    const result = reduceLibraryInputKey(state, ctrlD, fakeContext());
    expect(result.state.route.screen).toBe("library_preview");
    if (result.state.route.screen !== "library_preview") {
      throw new Error("expected preview");
    }
    const payload = result.state.route.payload;
    expect(payload).toMatchObject({
      kind: "words",
      entries: [
        { text: "Abandon", word_kind: "word", meaning_zh: "v. 放弃", phonetic: "ə'bændən", source: "dict" },
        { text: "foo", word_kind: "word", meaning_zh: "自定义", source: "manual" },
        { text: "machine learning", word_kind: "phrase", source: "dict" },
      ],
    });
    if (payload.kind === "words") {
      expect(payload.entries[2]?.meaning_zh).toBeUndefined();
      expect(payload.error_lines.length).toBe(1);
      expect(payload.raw_text).toContain("Abandon");
    }
  });

  test("preview enter appends words to library, dedupes, and persists", () => {
    const previewState = stateAt(
      {
        screen: "library_preview",
        slug: "web",
        payload: {
          kind: "words",
          raw_text: "abandon",
          entries: [
            { text: "abandon", word_kind: "word", meaning_zh: "v. 放弃", source: "dict" },
            { text: "abandon", word_kind: "word", meaning_zh: "重复", source: "manual" },
          ],
          error_lines: [],
        },
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    const result = reduceLibraryPreviewKey(previewState, keyEvent("enter", "\r"));
    expect(result.persist?.kind).toBe("save");
    const library = result.state.customLibraries?.[0];
    expect(library?.words.length).toBe(1);
    expect(library?.words[0]?.meaning_zh).toBe("v. 放弃");
    expect(result.state.route).toEqual({
      screen: "library_actions",
      slug: "web",
      selected_index: 0,
    });
  });

  test("preview backspace returns to input with raw text restored", () => {
    const previewState = stateAt(
      {
        screen: "library_preview",
        slug: "web",
        payload: { kind: "words", raw_text: "abandon\nfoo", entries: [], error_lines: [] },
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    const result = reduceLibraryPreviewKey(previewState, keyEvent("backspace", "\x7f"));
    expect(result.state.route).toMatchObject({
      screen: "library_input",
      kind: "words",
      text: "abandon\nfoo",
    });
  });
});

import { reduceOpenTuiAppKey } from "../src/ui/opentui/appSession";

describe("library screens dispatch through reduceOpenTuiAppKey", () => {
  test("create screen accepts typing and enter persists via app reducer", () => {
    let state = stateAt({ screen: "library_create", name: "" });
    state = reduceOpenTuiAppKey(state, keyEvent("a", "a"), fakeContext()).state;
    const result = reduceOpenTuiAppKey(state, keyEvent("enter", "\r"), fakeContext());
    expect(result.persist).toMatchObject({ kind: "save" });
    expect(result.state.route.screen).toBe("submenu");
  });

  test("input screen reaches preview and saving persists via app reducer", () => {
    let state = stateAt(
      {
        screen: "library_input",
        slug: "web",
        kind: "words",
        text: "abandon",
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    state = reduceOpenTuiAppKey(state, ctrlD, fakeContext()).state;
    expect(state.route.screen).toBe("library_preview");
    const saved = reduceOpenTuiAppKey(state, keyEvent("enter", "\r"), fakeContext());
    expect(saved.persist).toMatchObject({ kind: "save" });
    expect(saved.state.route.screen).toBe("library_actions");
  });

  test("escape from input returns to library actions", () => {
    const state = stateAt(
      {
        screen: "library_input",
        slug: "web",
        kind: "words",
        text: "abc",
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    const result = reduceOpenTuiAppKey(state, keyEvent("escape", "\x1b"), fakeContext());
    expect(result.state.route).toEqual({
      screen: "library_actions",
      slug: "web",
      selected_index: 0,
    });
  });
});

describe("library sentences and article input flow", () => {
  test("sentences paste parses interleaved blocks into preview and saves", () => {
    let state = stateAt(
      {
        screen: "library_input",
        slug: "web",
        kind: "sentences",
        text: "The weather is nice.\n今天天气很好。\n\nSee you tomorrow.",
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    state = reduceLibraryInputKey(state, ctrlD, fakeContext()).state;
    expect(state.route.screen).toBe("library_preview");
    if (state.route.screen !== "library_preview") throw new Error("expected preview");
    expect(state.route.payload).toMatchObject({
      kind: "sentences",
      entries: [
        { text: "The weather is nice.", translation_zh: "今天天气很好。" },
        { text: "See you tomorrow." },
      ],
    });
    const saved = reduceLibraryPreviewKey(state, keyEvent("enter", "\r"));
    expect(saved.persist?.kind).toBe("save");
    expect(saved.state.customLibraries?.[0]?.sentences.length).toBe(2);
  });

  test("article paste goes straight to body and derives title from first paragraph", () => {
    let state = stateAt(
      {
        screen: "library_input",
        slug: "web",
        kind: "article",
        text: "First para about typing practice.\nSecond para.\n\n第一段。\n第二段。",
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    state = reduceLibraryInputKey(state, ctrlD, fakeContext()).state;
    if (state.route.screen !== "library_preview") throw new Error("expected preview");
    expect(state.route.payload).toMatchObject({
      kind: "article",
      paragraphs: [
        { text: "First para about typing practice.", translation_zh: "第一段。" },
        { text: "Second para.", translation_zh: "第二段。" },
      ],
      warnings: [],
    });
    const saved = reduceLibraryPreviewKey(state, keyEvent("enter", "\r"));
    expect(saved.persist?.kind).toBe("save");
    const article = saved.state.customLibraries?.[0]?.articles[0];
    expect(article?.title).toBe("First para about typing practice.");
    expect(article?.paragraphs.length).toBe(2);
  });

  test("article paste with mismatched translation count carries warnings", () => {
    let state = stateAt(
      {
        screen: "library_input",
        slug: "web",
        kind: "article",
        text: "P1.\nP2.\n\n译一。",
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    state = reduceLibraryInputKey(state, ctrlD, fakeContext()).state;
    if (state.route.screen !== "library_preview") throw new Error("expected preview");
    if (state.route.payload.kind !== "article") throw new Error("expected article payload");
    expect(state.route.payload.warnings.length).toBe(1);
  });

  test("empty submit stays on input screen", () => {
    const state = stateAt(
      {
        screen: "library_input",
        slug: "web",
        kind: "sentences",
        text: "  \n ",
      },
      { customLibraries: [emptyLibrary("web")] },
    );
    const result = reduceLibraryInputKey(state, ctrlD, fakeContext());
    expect(result.state.route.screen).toBe("library_input");
  });
});

import {
  libraryActionItems,
  libraryBrowseMatches,
  reduceLibraryActionsKey,
  reduceLibraryBrowseKey,
  reduceLibraryDeleteConfirmKey,
  reduceLibraryDetailKey,
  reduceLibraryManageKey,
} from "../src/ui/opentui/libraryReducers";

function richLibrary(): CustomLibrary {
  return {
    version: 1,
    slug: "web",
    name: "Web 词汇",
    created_at: "2026-06-11T00:00:00.000Z",
    words: [
      { id: "w1", text: "abandon", kind: "word", meaning_zh: "v. 放弃", source: "dict" },
      { id: "w2", text: "machine learning", kind: "phrase", meaning_zh: "机器学习", source: "manual" },
      { id: "w3", text: "vivid", kind: "word", source: "dict" },
    ],
    sentences: [{ id: "s1", text: "Hello there.", translation_zh: "你好。" }],
    articles: [{ id: "a1", title: "My Day", paragraphs: [{ text: "P1.", translation_zh: "一。" }] }],
  };
}

describe("library manage screen", () => {
  test("enter on a library opens its actions screen", () => {
    const state = stateAt(
      { screen: "library_manage", selected_index: 0 },
      { customLibraries: [richLibrary()] },
    );
    const result = reduceLibraryManageKey(state, keyEvent("enter", "\r"));
    expect(result.state.route).toEqual({
      screen: "library_actions",
      slug: "web",
      selected_index: 0,
    });
  });

  test("arrow keys move selection across libraries", () => {
    const state = stateAt(
      { screen: "library_manage", selected_index: 0 },
      { customLibraries: [richLibrary(), emptyLibrary("two")] },
    );
    const moved = reduceLibraryManageKey(state, keyEvent("down", "\x1b[B"));
    expect(moved.state.route).toMatchObject({ screen: "library_manage", selected_index: 1 });
  });
});

describe("library actions screen", () => {
  test("action items cover add, browse, and delete", () => {
    const state = stateAt(
      { screen: "library_actions", slug: "web", selected_index: 0 },
      { customLibraries: [richLibrary()] },
    );
    expect(libraryActionItems(state, "web").map((item) => item.id)).toEqual([
      "add_words",
      "add_sentences",
      "add_article",
      "browse_all",
      "delete_library",
    ]);
  });

  test("enter routes to the chosen action", () => {
    const base = stateAt(
      { screen: "library_actions", slug: "web", selected_index: 0 },
      { customLibraries: [richLibrary()] },
    );
    const addWords = reduceLibraryActionsKey(base, keyEvent("enter", "\r"));
    expect(addWords.state.route).toMatchObject({
      screen: "library_input",
      kind: "words",
    });
    const onDelete = stateAt(
      { screen: "library_actions", slug: "web", selected_index: 4 },
      { customLibraries: [richLibrary()] },
    );
    const confirm = reduceLibraryActionsKey(onDelete, keyEvent("enter", "\r"));
    expect(confirm.state.route).toEqual({ screen: "library_delete_confirm", slug: "web" });
    const onBrowse = stateAt(
      { screen: "library_actions", slug: "web", selected_index: 3 },
      { customLibraries: [richLibrary()] },
    );
    const browse = reduceLibraryActionsKey(onBrowse, keyEvent("enter", "\r"));
    expect(browse.state.route).toEqual({
      screen: "library_browse",
      slug: "web",
      query: "",
      index: 0,
    });
  });

  test("article action goes straight to body paste", () => {
    const onArticle = stateAt(
      { screen: "library_actions", slug: "web", selected_index: 2 },
      { customLibraries: [richLibrary()] },
    );
    const result = reduceLibraryActionsKey(onArticle, keyEvent("enter", "\r"));
    expect(result.state.route).toEqual({
      screen: "library_input",
      slug: "web",
      kind: "article",
      text: "",
    });
  });
});

describe("library browse screen", () => {
  function browseState(query = "", index = 0): OpenTuiAppState {
    return stateAt(
      { screen: "library_browse", slug: "web", query, index },
      { customLibraries: [richLibrary()] },
    );
  }

  test("fuzzy query filters across words, sentences, and articles", () => {
    const all = libraryBrowseMatches(browseState());
    expect(all.map((entry) => entry.id)).toEqual(["w1", "w2", "w3", "s1", "a1"]);
    const filtered = libraryBrowseMatches(browseState("mln"));
    expect(filtered.map((entry) => entry.id)).toEqual(["w2"]);
    const article = libraryBrowseMatches(browseState("My Day"));
    expect(article.map((entry) => entry.id)).toEqual(["a1"]);
  });




});

describe("library delete confirmation", () => {
  test("enter deletes the library and persists deletion", () => {
    const state = stateAt(
      { screen: "library_delete_confirm", slug: "web" },
      { customLibraries: [richLibrary(), emptyLibrary("two")] },
    );
    const result = reduceLibraryDeleteConfirmKey(state, keyEvent("enter", "\r"));
    expect(result.persist).toEqual({ kind: "delete", slug: "web" });
    expect(result.state.customLibraries?.map((library) => library.slug)).toEqual(["two"]);
    expect(result.state.route).toEqual({ screen: "library_manage", selected_index: 0 });
  });

  test("backspace cancels back to actions", () => {
    const state = stateAt(
      { screen: "library_delete_confirm", slug: "web" },
      { customLibraries: [richLibrary()] },
    );
    const result = reduceLibraryDeleteConfirmKey(state, keyEvent("backspace", "\x7f"));
    expect(result.state.route).toEqual({
      screen: "library_actions",
      slug: "web",
      selected_index: 0,
    });
    expect(result.persist).toBeUndefined();
  });
});

import { openTuiFlatSettingsItems } from "../src/ui/opentui/settingsItems";

describe("dictionary status in settings", () => {
  test("flat settings include dictionary status reflecting tier", () => {
    const full = openTuiFlatSettingsItems({
      ...stateAt({ screen: "settings", view: "menu" }),
      dictionaryTier: "full",
    });
    const fullItem = full.find((item) => item.kind === "dictionary_status");
    expect(fullItem?.value).toBe("完整版已就绪（ECDICT）");
    const mini = openTuiFlatSettingsItems({
      ...stateAt({ screen: "settings", view: "menu" }),
      dictionaryTier: "mini",
    });
    expect(mini.find((item) => item.kind === "dictionary_status")?.value).toBe(
      "精简版（完整版后台下载中）",
    );
  });
});

import { Dictionary } from "../src/content/dictionary";
import { renderOpenTuiAppOnce } from "../src/index";

describe("acceptance: real mini dictionary lookup", () => {
  test("bundled dictionary_mini.json resolves common words", async () => {
    const dictionary = await Dictionary.open({ miniPath: "contents/dictionary_mini.json" });
    expect(dictionary.tier).toBe("mini");
    expect(dictionary.lookup("abandon")?.translation_zh).toContain("放弃");
    expect(dictionary.lookup("The")?.translation_zh).toBeDefined();
    expect(dictionary.lookup("zzzqqqxxx")).toBeNull();
  });
});

describe("acceptance: all library screens render without throwing", () => {
  const routes: OpenTuiRoute[] = [
    { screen: "library_menu", slug: "web", selected_index: 0 },
    { screen: "library_create", name: "考研" },
    { screen: "library_manage", selected_index: 0 },
    { screen: "library_actions", slug: "web", selected_index: 2 },
    {
      screen: "library_input",
      slug: "web",
      kind: "words",
      text: "abandon\nfoo: 释义",
    },
    {
      screen: "library_input",
      slug: "web",
      kind: "article",
      text: "First para.\n\n第一段。",
    },
    {
      screen: "library_preview",
      slug: "web",
      payload: {
        kind: "words",
        raw_text: "abandon",
        entries: [
          { text: "abandon", word_kind: "word", meaning_zh: "v. 放弃", source: "dict" },
          { text: "missing", word_kind: "word", source: "dict" },
        ],
        error_lines: ["第 3 行：苹果"],
      },
    },
    { screen: "library_browse", slug: "web", query: "ab", index: 0 },
    { screen: "library_delete_confirm", slug: "web" },
  ];

  for (const route of routes) {
    test(`renders ${route.screen}${"kind" in route ? `:${route.kind}` : ""}`, async () => {
      const state = stateAt(route, {
        customLibraries: [
          {
            ...emptyLibrary("web"),
            words: [{ id: "w1", text: "abandon", kind: "word", meaning_zh: "v. 放弃", source: "dict" }],
          },
        ],
      });
      const kit = fakeRenderKit();
      await renderOpenTuiAppOnce(state, kit);
      expect(kit.addedNodes.length).toBeGreaterThan(0);
    });
  }
});

interface FakeRenderNode {
  type: string;
  props: Record<string, unknown>;
  children: FakeRenderNode[];
}

function fakeRenderKit(): Parameters<typeof renderOpenTuiAppOnce>[1] & {
  addedNodes: FakeRenderNode[];
} {
  const addedNodes: FakeRenderNode[] = [];
  return {
    addedNodes,
    Box: (props: Record<string, unknown>, ...children: FakeRenderNode[]) => ({
      type: "Box",
      props,
      children,
    }),
    ScrollBox: (props: Record<string, unknown>, ...children: FakeRenderNode[]) => ({
      type: "ScrollBox",
      props,
      children,
    }),
    Text: (props: Record<string, unknown>) => ({ type: "Text", props, children: [] }),
    createCliRenderer: async () => ({
      root: {
        add: (node: FakeRenderNode) => {
          addedNodes.push(node);
        },
      },
      destroy: () => {},
    }),
  } as never;
}

import { inputTextFromEvent } from "../src/ui/opentui/libraryReducers";
import { wrapWordsToDisplayWidth } from "../src/ui/opentui/screens/shared";

describe("IME and paste text input", () => {
  test("inputTextFromEvent accepts multi-character IME sequences", () => {
    expect(inputTextFromEvent(keyEvent("考研英语", "考研英语"))).toBe("考研英语");
    expect(inputTextFromEvent(keyEvent("a", "a"))).toBe("a");
    expect(inputTextFromEvent(keyEvent("escape", "\x1b"))).toBeNull();
    expect(inputTextFromEvent({ name: "d", sequence: "\x04", ctrl: true, meta: false })).toBeNull();
  });

  test("inputTextFromEvent accepts synthetic paste events with newlines kept", () => {
    const paste = { name: "paste", sequence: "abandon\r\nvivid: 生动\r\n", ctrl: false, meta: false };
    expect(inputTextFromEvent(paste)).toBe("abandon\nvivid: 生动\n");
  });

  test("library name input accepts IME chunk and pasted text without newlines", () => {
    let state = stateAt({ screen: "library_create", name: "" });
    state = reduceLibraryCreateKey(state, keyEvent("考研英语", "考研英语")).state;
    expect(state.route).toEqual({ screen: "library_create", name: "考研英语" });
    state = reduceLibraryCreateKey(state, {
      name: "paste",
      sequence: " 2026\n冲刺",
      ctrl: false,
      meta: false,
    }).state;
    expect(state.route).toEqual({ screen: "library_create", name: "考研英语 2026 冲刺" });
  });

  test("multi-line input accepts pasted block with newlines", () => {
    let state = stateAt(
      { screen: "library_input", slug: "web", kind: "words", text: "" },
      { customLibraries: [emptyLibrary("web")] },
    );
    state = reduceLibraryInputKey(
      state,
      { name: "paste", sequence: "abandon\nmachine learning: 机器学习\n", ctrl: false, meta: false },
      fakeContext(),
    ).state;
    if (state.route.screen !== "library_input") throw new Error("expected input");
    expect(state.route.text).toBe("abandon\nmachine learning: 机器学习\n");
    state = reduceLibraryInputKey(state, keyEvent("好", "好"), fakeContext()).state;
    if (state.route.screen !== "library_input") throw new Error("expected input");
    expect(state.route.text).toBe("abandon\nmachine learning: 机器学习\n好");
  });

  test("browse query accepts IME chunks", () => {
    const base = stateAt(
      { screen: "library_browse", slug: "web", query: "", index: 0 },
      {
        customLibraries: [
          {
            ...emptyLibrary("web"),
            words: [{ id: "w1", text: "abandon", kind: "word", source: "dict" }],
          },
        ],
      },
    );
    const typed = reduceLibraryBrowseKey(base, keyEvent("机器", "机器"));
    if (typed.state.route.screen !== "library_browse") throw new Error("expected browse");
    expect(typed.state.route.query).toBe("机器");
  });
});

describe("library input screens swallow the global quit key", () => {
  test("q types into name, body, and query instead of quitting", () => {
    const create = reduceOpenTuiAppKey(
      stateAt({ screen: "library_create", name: "" }),
      keyEvent("q", "q"),
      fakeContext(),
    );
    expect(create.action).toBe("continue");
    expect(create.state.route).toEqual({ screen: "library_create", name: "q" });

    const input = reduceOpenTuiAppKey(
      stateAt(
        { screen: "library_input", slug: "web", kind: "words", text: "" },
        { customLibraries: [emptyLibrary("web")] },
      ),
      keyEvent("q", "q"),
      fakeContext(),
    );
    expect(input.action).toBe("continue");
    if (input.state.route.screen !== "library_input") throw new Error("expected input");
    expect(input.state.route.text).toBe("q");

    const browse = reduceOpenTuiAppKey(
      stateAt(
        { screen: "library_browse", slug: "web", query: "", index: 0 },
        { customLibraries: [emptyLibrary("web")] },
      ),
      keyEvent("q", "q"),
      fakeContext(),
    );
    expect(browse.action).toBe("continue");
    if (browse.state.route.screen !== "library_browse") throw new Error("expected browse");
    expect(browse.state.route.query).toBe("q");
  });
});

describe("browse entry operations with active query", () => {
  function browseStateWithWords(query: string): OpenTuiAppState {
    return stateAt(
      { screen: "library_browse", slug: "web", query, index: 0 },
      {
        customLibraries: [
          {
            ...emptyLibrary("web"),
            words: [
              { id: "w1", text: "abandon", kind: "word", meaning_zh: "v. 放弃", source: "dict" },
              { id: "w2", text: "vivid", kind: "word", source: "dict" },
            ],
          },
        ],
      },
    );
  }

  test("ctrl+x asks then deletes the selected entry even while searching", () => {
    const asked = reduceLibraryBrowseKey(browseStateWithWords("aban"), {
      name: "x",
      sequence: "\x18",
      ctrl: true,
      meta: false,
    });
    const result = reduceLibraryBrowseKey(asked.state, keyEvent("enter", "\r"));
    expect(result.persist?.kind).toBe("save");
    expect(result.state.customLibraries?.[0]?.words.map((word) => word.id)).toEqual(["w2"]);
  });


  test("plain d is just a search character now", () => {
    const result = reduceLibraryBrowseKey(browseStateWithWords(""), keyEvent("d", "d"));
    expect(result.persist).toBeUndefined();
    if (result.state.route.screen !== "library_browse") throw new Error("expected browse");
    expect(result.state.route.query).toBe("d");
  });
});

describe("word-boundary wrapping", () => {
  test("wraps at spaces instead of cutting words", () => {
    const wrapped = wrapWordsToDisplayWidth("the quick brown fox jumps over", 12);
    expect(wrapped).toEqual(["the quick", "brown fox", "jumps over"]);
  });

  test("hard-splits a single overlong word and handles cjk width", () => {
    expect(wrapWordsToDisplayWidth("internationalization", 8)).toEqual([
      "internat",
      "ionaliza",
      "tion",
    ]);
    expect(wrapWordsToDisplayWidth("中文段落测试", 8)).toEqual(["中文段落", "测试"]);
  });
});

describe("browse entry detail popup", () => {
  function browseBase(query = "aban"): OpenTuiAppState {
    return stateAt(
      { screen: "library_browse", slug: "web", query, index: 0 },
      {
        customLibraries: [
          {
            ...emptyLibrary("web"),
            words: [
              { id: "w1", text: "abandon", kind: "word", meaning_zh: "v. 放弃", source: "dict" },
              { id: "w2", text: "vivid", kind: "word", source: "dict" },
            ],
          },
        ],
      },
    );
  }

  test("enter opens the detail popup remembering picker position", () => {
    const result = reduceLibraryBrowseKey(browseBase(), keyEvent("enter", "\r"));
    expect(result.state.route).toEqual({
      screen: "library_detail",
      slug: "web",
      entry_id: "w1",
      return_query: "aban",
      return_index: 0,
      scroll: 0,
    });
  });

  test("E starts inline editing prefilled with entry format", () => {
    const detail = reduceLibraryBrowseKey(browseBase(), keyEvent("enter", "\r")).state;
    const editing = reduceLibraryDetailKey(detail, keyEvent("e", "e"), fakeContext());
    if (editing.state.route.screen !== "library_detail") throw new Error("expected detail");
    expect(editing.state.route.editing).toEqual({
      text: "abandon: v. 放弃",
      cursor: "abandon: v. 放弃".length,
    });
  });

  test("cursor moves and mid-text edits work inside the popup editor", () => {
    let state = reduceLibraryBrowseKey(browseBase(), keyEvent("enter", "\r")).state;
    state = reduceLibraryDetailKey(state, keyEvent("e", "e"), fakeContext()).state;
    state = reduceLibraryDetailKey(state, keyEvent("home", "\x1b[H"), fakeContext()).state;
    for (let i = 0; i < 7; i += 1) {
      state = reduceLibraryDetailKey(state, keyEvent("right", "\x1b[C"), fakeContext()).state;
    }
    state = reduceLibraryDetailKey(state, keyEvent("s", "s"), fakeContext()).state;
    if (state.route.screen !== "library_detail") throw new Error("expected detail");
    expect(state.route.editing?.text).toBe("abandons: v. 放弃");
    expect(state.route.editing?.cursor).toBe(8);
  });

  test("ctrl+d saves the edit, replaces the entry, returns to picker", () => {
    let state = reduceLibraryBrowseKey(browseBase(""), keyEvent("enter", "\r")).state;
    state = reduceLibraryDetailKey(state, keyEvent("e", "e"), fakeContext()).state;
    if (state.route.screen !== "library_detail") throw new Error("expected detail");
    state = {
      ...state,
      route: { ...state.route, editing: { text: "abandon: 抛弃", cursor: 0 } },
    };
    const saved = reduceLibraryDetailKey(state, ctrlD, fakeContext());
    expect(saved.persist?.kind).toBe("save");
    const words = saved.state.customLibraries?.[0]?.words ?? [];
    expect(words.find((word) => word.text === "abandon")?.meaning_zh).toBe("抛弃");
    expect(words.some((word) => word.id === "w1")).toBe(false);
    expect(saved.state.route).toEqual({
      screen: "library_browse",
      slug: "web",
      query: "",
      index: 0,
    });
  });

  test("D asks then deletes the entry from the view popup and returns to picker", () => {
    const detail = reduceLibraryBrowseKey(browseBase(), keyEvent("enter", "\r")).state;
    const asked = reduceLibraryDetailKey(detail, keyEvent("d", "d"), fakeContext());
    const result = reduceLibraryDetailKey(asked.state, keyEvent("enter", "\r"), fakeContext());
    expect(result.persist?.kind).toBe("save");
    expect(result.state.customLibraries?.[0]?.words.map((word) => word.id)).toEqual(["w2"]);
    expect(result.state.route.screen).toBe("library_browse");
  });

  test("typing while viewing does not edit; enter closes back to picker", () => {
    const detail = reduceLibraryBrowseKey(browseBase(), keyEvent("enter", "\r")).state;
    const typed = reduceLibraryDetailKey(detail, keyEvent("x", "x"), fakeContext());
    expect(typed.state.route.screen).toBe("library_detail");
    const closed = reduceLibraryDetailKey(detail, keyEvent("enter", "\r"), fakeContext());
    expect(closed.state.route).toMatchObject({ screen: "library_browse", query: "aban" });
  });
});

describe("detail view wheel scrolling", () => {
  test("wheel events scroll the view by 3 lines, clamped at 0", () => {
    const longArticle: CustomLibrary = {
      ...emptyLibrary("web"),
      articles: [
        {
          id: "a1",
          title: "Long",
          paragraphs: Array.from({ length: 40 }, (_, i) => ({ text: `Paragraph number ${i}.` })),
        },
      ],
    };
    const state = stateAt(
      {
        screen: "library_detail",
        slug: "web",
        entry_id: "a1",
        return_query: "",
        return_index: 0,
        scroll: 0,
      },
      { customLibraries: [longArticle] },
    );
    const down = reduceLibraryDetailKey(
      state,
      { name: "wheel_down", sequence: "", ctrl: false, meta: false },
      fakeContext(),
    );
    if (down.state.route.screen !== "library_detail") throw new Error("expected detail");
    expect(down.state.route.scroll).toBe(3);
    const up = reduceLibraryDetailKey(
      state,
      { name: "wheel_up", sequence: "", ctrl: false, meta: false },
      fakeContext(),
    );
    if (up.state.route.screen !== "library_detail") throw new Error("expected detail");
    expect(up.state.route.scroll).toBe(0);
  });
});

describe("delete confirmation", () => {
  function detailState(): OpenTuiAppState {
    return stateAt(
      {
        screen: "library_detail",
        slug: "web",
        entry_id: "w1",
        return_query: "",
        return_index: 0,
        scroll: 0,
      },
      {
        customLibraries: [
          {
            ...emptyLibrary("web"),
            words: [{ id: "w1", text: "abandon", kind: "word", source: "dict" }],
          },
        ],
      },
    );
  }

  test("D in detail view asks for confirmation first, enter confirms", () => {
    const asked = reduceLibraryDetailKey(detailState(), keyEvent("d", "d"), fakeContext());
    expect(asked.persist).toBeUndefined();
    if (asked.state.route.screen !== "library_detail") throw new Error("expected detail");
    expect(asked.state.route.confirm_delete).toBe(true);
    const confirmed = reduceLibraryDetailKey(asked.state, keyEvent("enter", "\r"), fakeContext());
    expect(confirmed.persist?.kind).toBe("save");
    expect(confirmed.state.customLibraries?.[0]?.words.length).toBe(0);
    expect(confirmed.state.route.screen).toBe("library_browse");
  });

  test("any other key cancels the detail delete confirmation", () => {
    const asked = reduceLibraryDetailKey(detailState(), keyEvent("d", "d"), fakeContext());
    const cancelled = reduceLibraryDetailKey(asked.state, keyEvent("x", "x"), fakeContext());
    if (cancelled.state.route.screen !== "library_detail") throw new Error("expected detail");
    expect(cancelled.state.route.confirm_delete).toBeUndefined();
    expect(cancelled.persist).toBeUndefined();
  });

  test("ctrl+x in browse asks for confirmation, enter confirms", () => {
    const base = stateAt(
      { screen: "library_browse", slug: "web", query: "", index: 0 },
      {
        customLibraries: [
          {
            ...emptyLibrary("web"),
            words: [{ id: "w1", text: "abandon", kind: "word", source: "dict" }],
          },
        ],
      },
    );
    const ctrlX = { name: "x", sequence: "\x18", ctrl: true, meta: false };
    const asked = reduceLibraryBrowseKey(base, ctrlX);
    expect(asked.persist).toBeUndefined();
    if (asked.state.route.screen !== "library_browse") throw new Error("expected browse");
    expect(asked.state.route.confirm_delete_id).toBe("w1");
    const confirmed = reduceLibraryBrowseKey(asked.state, keyEvent("enter", "\r"));
    expect(confirmed.persist?.kind).toBe("save");
    expect(confirmed.state.customLibraries?.[0]?.words.length).toBe(0);
    const cancelled = reduceLibraryBrowseKey(asked.state, keyEvent("a", "a"));
    if (cancelled.state.route.screen !== "library_browse") throw new Error("expected browse");
    expect(cancelled.state.route.confirm_delete_id).toBeUndefined();
    expect(cancelled.state.route.query).toBe("");
  });
});
