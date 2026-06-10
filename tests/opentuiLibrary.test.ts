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
        phase: "body",
        article_title: "",
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
        phase: "body",
        article_title: "",
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
        phase: "body",
        article_title: "",
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
