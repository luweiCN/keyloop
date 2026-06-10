import { createCustomLibrary, type CustomLibrary } from "../../training/customLibrary";
import { withRoute, type OpenTuiAppState } from "./appModel";
import type { LibraryPersist } from "./appSession";
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
