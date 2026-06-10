# TS OpenTUI Settings Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist TS/OpenTUI Settings changes for interface language and code-scope filters back to `preferences.json`.

**Architecture:** Keep Settings interaction state in OpenTUI state, then let `ts/src/cli.ts` compare the returned state against the initial app language and loaded preferences. Save preferences only when the returned app state proves a user-visible setting changed; this preserves `--language en` as a temporary CLI override when no settings action changed state.

**Tech Stack:** Bun tests, TypeScript strict mode, existing `keyloopStore` preferences JSON helpers, existing OpenTUI app state/reducer.

---

### Task 1: Add Failing CLI Persistence Tests

**Files:**
- Modify: `ts/tests/cli.test.ts`

- [x] **Step 1: Import preference loading and OpenTUI helpers**

Add imports from `../src/index`:

```ts
  createOpenTuiCodeFilterState,
  createOpenTuiInitialState,
  loadPreferencesFromPath,
  reduceOpenTuiAppKey,
  type CodeFilterPreference,
  type OpenTuiKeyEvent,
```

- [x] **Step 2: Add language persistence test**

Add a test under `TS CLI command dispatch`:

```ts
  test("bare keyloop persists interface language changed in app settings", async () => {
    const dir = await tempDir();
    try {
      await savePreferencesToPath(defaultPreferences("zh"), preferencesPath(dir));

      await runCli([], {
        env: { KEYLOOP_HOME: dir },
        appRunner: async (context) => {
          const settings = reduceOpenTuiAppKey(
            createOpenTuiInitialState(context.language),
            key("6", "6"),
            context,
          );
          const languagePage = reduceOpenTuiAppKey(settings.state, key("1", "1"), context);
          const english = reduceOpenTuiAppKey(languagePage.state, key("2", "2"), context);
          return { state: english.state, action: "quit" };
        },
      });

      const preferences = await loadPreferencesFromPath(preferencesPath(dir));
      expect(preferences.interface_language).toBe("en");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
```

- [x] **Step 3: Add code filter persistence and start-context test**

Add a test proving selected/pinned code filters persist and the start runner receives the returned state config:

```ts
  test("bare keyloop persists code filter settings and starts with returned state config", async () => {
    const dir = await tempDir();
    let selectedPreference: CodeFilterPreference | undefined;
    let runnerConfig: CodePracticeConfig | undefined;
    try {
      await savePreferencesToPath(defaultPreferences("en"), preferencesPath(dir));

      await runCli(["--language", "en"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00.000Z"),
        idFactory: () => "settings",
        appRunner: async (context) => {
          const option = context.codeFilterOptions?.find(
            (candidate) =>
              candidate.facet === "language" && candidate.value === "typescript",
          );
          if (option === undefined) {
            throw new Error("expected typescript code filter option");
          }
          selectedPreference = { facet: option.facet, value: option.value };
          const codeFilters = createOpenTuiCodeFilterState({
            options: context.codeFilterOptions ?? [],
            selected: [selectedPreference],
            pinned: [selectedPreference],
          });
          const codeMenu = reduceOpenTuiAppKey(
            createOpenTuiInitialState(context.language, { codeFilters }),
            key("5", "5"),
            context,
          );
          const running = reduceOpenTuiAppKey(codeMenu.state, key("1", "1"), context);
          if (running.action !== "start") {
            throw new Error("expected start action");
          }
          return { state: running.state, action: "start" };
        },
        runner: async (context) => {
          runnerConfig = context.codeConfig;
          return { completedRecords: [] };
        },
      });

      const preferences = await loadPreferencesFromPath(preferencesPath(dir));
      expect(preferences.global_code_filters).toEqual([selectedPreference]);
      expect(preferences.pinned_code_filters).toEqual([selectedPreference]);
      expect(runnerConfig).toMatchObject({
        languages: ["typescript"],
        frameworks: [],
        projects: [],
        match_any: true,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
```

- [x] **Step 4: Add temporary language override regression test**

Add a test proving `--language en` alone does not save `interface_language`:

```ts
  test("bare keyloop language flag is not persisted without settings change", async () => {
    const dir = await tempDir();
    try {
      await savePreferencesToPath(defaultPreferences("zh"), preferencesPath(dir));

      await runCli(["--language", "en"], {
        env: { KEYLOOP_HOME: dir },
        appRunner: async (context) => ({
          state: createOpenTuiInitialState(context.language),
          action: "quit",
        }),
      });

      const preferences = await loadPreferencesFromPath(preferencesPath(dir));
      expect(preferences.interface_language).toBe("zh");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
```

- [x] **Step 5: Add local test helpers**

Add to `ts/tests/cli.test.ts`:

```ts
function defaultPreferences(language: Language) {
  return {
    interface_language: language,
    pinned_code_filters: [],
    global_code_filters: [],
    everyday_english: {
      word_count: 50,
      sentence_length: "mixed" as const,
      include_phrases: true,
    },
    word_breakdown: {
      enabled_in_comprehensive: true,
      max_items_per_group: 6,
    },
    personal_vocabulary: {
      enabled_in_comprehensive: true,
      daily_review_limit: 8,
    },
  };
}

function key(name: string, sequence: string): OpenTuiKeyEvent {
  return { name, sequence, ctrl: false, meta: false };
}
```

- [x] **Step 6: Run focused tests and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts --timeout 10000
```

Expected: FAIL because `runApp` does not save returned settings preferences and `startContextFromAppState` still uses the original app context code config.

### Task 2: Implement Preference Projection And Saving

**Files:**
- Modify: `ts/src/cli.ts`
- Modify: `ts/src/ui/opentui/appSession.ts` only if focused tests expose a reducer issue
- Modify: `ts/src/ui/opentui/appModel.ts` only if a helper needs exporting

- [x] **Step 1: Import required helpers in `cli.ts`**

Update imports:

```ts
  savePreferencesToPath,
```

and:

```ts
import { openTuiCodeConfig, type OpenTuiRoute } from "./ui/opentui/appModel";
```

- [x] **Step 2: Save preferences after app returns**

After `const appResult = ...`, add:

```ts
  const nextPreferences = preferencesFromAppState(
    preferences,
    appResult.state,
    language,
  );
  if (nextPreferences !== undefined) {
    await savePreferencesToPath(nextPreferences, preferencesPath(dataDir));
  }
```

Do this before handling `appResult.action !== "start"` so quit and start both persist settings.

- [x] **Step 3: Implement `preferencesFromAppState`**

Add a pure helper:

```ts
function preferencesFromAppState(
  preferences: UserPreferences,
  state: OpenTuiAppSessionResult["state"],
  initialLanguage: Language,
): UserPreferences | undefined
```

Rules:
- If `state.language !== initialLanguage`, set `interface_language`.
- If `state.codeFilters !== undefined`, set `global_code_filters` from `state.codeFilters.selected` and `pinned_code_filters` from `state.codeFilters.pinned`.
- Preserve all other preference fields.
- Return `undefined` if no preference field changed.

- [x] **Step 4: Use returned state code config for start runner**

In `startContextFromAppState`, derive:

```ts
const codeConfig = openTuiCodeConfig(state) ?? appContext.codeConfig;
const effectiveAppContext = { ...appContext, codeConfig };
```

Use `effectiveAppContext` for `buildDailyPracticePlan` and return `language: state.language` plus `codeConfig`.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
bun test ts/tests/cli.test.ts --timeout 10000
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
