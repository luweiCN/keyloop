# TS OpenTUI Settings Code Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TS/OpenTUI Settings code-scope page that lets users select code language/framework/project filters in memory and have later OpenTUI practice targets use that selection.

**Architecture:** Keep code filter selection as pure OpenTUI app state in `ts/src/ui/opentui/appModel.ts`, with key reduction in `ts/src/ui/opentui/appSession.ts`. This slice mirrors Rust settings behavior for entering the code-scope subpage and toggling filters, but intentionally does not persist preferences yet; persistence requires a later CLI runner result contract for dirty preferences.

**Tech Stack:** Bun tests, TypeScript strict mode, existing content snippet option helpers, existing OpenTUI app model/session reducer.

---

### Task 1: Add Failing Code Filter Settings Tests

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/tests/opentuiAppSession.test.ts`

- [x] **Step 1: Add app model assertions for code filter route lines**

Add a test that proves the Settings `2` page renders actual code filter options instead of staying on the settings menu:

```ts
  test("settings code filters render selected option lines", () => {
    const state = createOpenTuiSettingsState("en", "code_filters", {
      codeFilters: createOpenTuiCodeFilterState({
        options: [
          { facet: "language", value: "typescript", count: 120 },
          { facet: "framework", value: "react", count: 30 },
        ],
        selected: [{ facet: "language", value: "typescript" }],
        pinned: [{ facet: "framework", value: "react" }],
      }),
    });

    expect(openTuiRouteTitle(state)).toBe("Programming language scope");
    expect(openTuiRouteLines(state)).toEqual([
      "[ ] framework: react (30)  pinned",
      "[x] language: typescript (120)",
    ]);
  });
```

- [x] **Step 2: Add reducer assertions for entering and toggling filters**

Add a test that opens Settings, enters code filters with `2`, toggles the first option, exits to the main menu, and starts Code practice with the selected filter applied:

```ts
  test("settings code filters toggle in memory and affect code practice target", () => {
    const context = appContextWithCodeOptions();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("6", "6"),
      context,
    );
    const codeFilters = reduceOpenTuiAppKey(settings.state, key("2", "2"), context);
    const selected = reduceOpenTuiAppKey(codeFilters.state, key("space", " "), context);
    const settingsMenu = reduceOpenTuiAppKey(selected.state, key("escape", "\x1b"), context);
    const mainMenu = reduceOpenTuiAppKey(settingsMenu.state, key("escape", "\x1b"), context);
    const codeMenu = reduceOpenTuiAppKey(mainMenu.state, key("5", "5"), context);
    const running = reduceOpenTuiAppKey(codeMenu.state, key("1", "1"), context);

    expect(codeFilters.state.route.screen).toBe("settings");
    if (codeFilters.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(codeFilters.state.route.view).toBe("code_filters");
    expect(openTuiRouteLines(codeFilters.state)).toContain(
      "[ ] language: typescript (1)",
    );
    expect(openTuiRouteLines(selected.state)).toContain(
      "[x] language: typescript (1)",
    );
    expect(running.action).toBe("start");
    expect(running.state.route.screen).toBe("running");
    if (running.state.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.state.route.target.text).toContain("const selectedValue");
    expect(running.state.route.target.text).not.toContain("fn selected_value");
  });
```

- [x] **Step 3: Run focused tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiAppSession.test.ts --timeout 10000
```

Expected: FAIL because `code_filters` is not a valid settings view yet and Settings `2` is a no-op.

### Task 2: Implement Code Filter State And Target Context

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`
- Modify: `ts/src/ui/opentui/appSession.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Extend OpenTUI state types**

In `appModel.ts`, add:

```ts
export type OpenTuiSettingsView = "menu" | "language" | "code_filters";

export interface OpenTuiCodeFilterState {
  options: CodePracticeOption[];
  selected: CodeFilterPreference[];
  pinned: CodeFilterPreference[];
  index: number;
}

export interface OpenTuiStateOptions {
  codeFilters?: OpenTuiCodeFilterState | undefined;
}
```

Change `OpenTuiAppState` to include optional `codeFilters?: OpenTuiCodeFilterState`.

- [x] **Step 2: Add pure code filter helpers**

In `appModel.ts`, add exported helpers:

```ts
export function createOpenTuiCodeFilterState(input: {
  options: CodePracticeOption[];
  selected?: CodeFilterPreference[];
  pinned?: CodeFilterPreference[];
  index?: number;
}): OpenTuiCodeFilterState

export function openTuiCodeConfig(state: OpenTuiAppState): CodePracticeConfig | undefined
```

Rules:
- Sort pinned filters before unpinned filters.
- Preserve selected filters by `{ facet, value }`.
- `openTuiCodeConfig` returns `undefined` only when the app has never initialized code filter state.
- If initialized with no selected filters, return an empty config with `match_any: true`, so clearing filters overrides previous context filters.

- [x] **Step 3: Render code filter settings lines**

In `settingsRouteLines`, add `code_filters`:

```ts
[
  "[ ] framework: react (30)  pinned",
  "[x] language: typescript (120)",
]
```

Return localized empty-state lines when no options exist:
- zh: `没有可用代码范围`
- en: `No code filters available`

- [x] **Step 4: Use selected filters when building practice targets**

In `activateMainMenuItem` and `activateSubmenuItem`, derive an effective build context:

```ts
const effectiveContext = buildTargetContextForState(state, context);
```

If `openTuiCodeConfig(state)` returns a config, pass that config to target builders. Otherwise preserve the incoming context.

- [x] **Step 5: Reduce settings code filter keys**

In `appSession.ts`:
- Settings menu `2` enters `createOpenTuiSettingsState(language, "code_filters", { codeFilters })`.
- Initialize `codeFilters` from `context.codeFilterOptions` when provided; otherwise derive from `codePracticeOptions(context.library.code_snippets)`.
- Initial selected filters come from `context.selectedCodeFilters` when provided; otherwise derive from `context.codeConfig`.
- Initial pinned filters come from `context.pinnedCodeFilters` when provided.
- `Space`/`Enter` toggles the active option.
- `Down`/`j` moves to the next option; `Up`/`k` moves to the previous option.
- `f` toggles pinned state.
- `d` removes the active pin.
- `Esc` returns to settings menu, preserving `codeFilters`.

- [x] **Step 6: Pass code filter options from the TS CLI app context**

In `runApp`, pass:

```ts
codeFilterOptions: codePracticeOptions(library.code_snippets),
pinnedCodeFilters: preferences.pinned_code_filters,
selectedCodeFilters: preferences.global_code_filters,
```

This prepares later persistence without writing preferences in this slice.

- [x] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiAppSession.test.ts --timeout 10000
```

Expected: PASS.

### Task 3: Full Verification

**Files:**
- Verify: TS and Rust suites
- Modify: this plan file checkbox statuses

- [x] **Step 1: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 2: Run Rust tests**

Run:

```bash
cargo test --locked --all-targets
```

Expected: all Rust tests pass.

- [x] **Step 3: Run whitespace and non-interactive CLI check**

Run:

```bash
git diff --check && tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; exit_code=$?; rm -rf "$tmpdir"; exit $exit_code
```

Expected: no whitespace errors; `plan` prints `Next KeyLoop plan`.

- [x] **Step 4: Update this plan checklist**

Mark all completed task checkboxes with `[x]`.
