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
