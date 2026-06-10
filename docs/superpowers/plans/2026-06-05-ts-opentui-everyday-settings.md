# TS OpenTUI Everyday Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Rust-compatible everyday English settings to the TS/OpenTUI app and make those settings affect generated targets and persisted preferences.

**Architecture:** Keep everyday target behavior in `ts/src/training/targets.ts`; OpenTUI only carries editable settings state and key handling. CLI app dispatch compares returned app state with loaded preferences and saves `preferences.json` only when everyday settings changed.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing `UserPreferences.everyday_english`, OpenTUI app model/session reducers.

---

### Task 1: Add RED Tests For Everyday Target Parity

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add an everyday mix target test**

Add a test proving `include_phrases` and `sentence_length` affect the generated text:

```ts
test("everyday mix includes phrases and matching sentence length when enabled", () => {
  const target = buildEverydayPracticeTarget(
    {
      records: [],
      plan: testPlan(),
      library: testLibrary(),
      everydaySettings: {
        word_count: 10,
        sentence_length: "short",
        include_phrases: true,
      },
    },
    "mix",
  );

  expect(target.source).toBe(
    "keyloop:module:everyday-english:words-10:sentences-short",
  );
  expect(target.text).toContain("stand up");
  expect(target.text).toContain("Short daily sentence.");
  expect(target.text).not.toContain("This is a much longer workplace sentence.");
});
```

- [x] **Step 2: Add an exclusion test for phrases**

Add a second test proving phrase lines are skipped when disabled:

```ts
test("everyday mix omits phrase lines when phrase setting is disabled", () => {
  const target = buildEverydayPracticeTarget(
    {
      records: [],
      plan: testPlan(),
      library: testLibrary(),
      everydaySettings: {
        word_count: 10,
        sentence_length: "mixed",
        include_phrases: false,
      },
    },
    "mix",
  );

  expect(target.text).not.toContain("stand up");
  expect(target.text).not.toContain("check in");
  expect(target.text).toContain("Short daily sentence.");
});
```

- [x] **Step 3: Run focused target tests and verify RED**

Run:

```bash
bun test ts/tests/targets.test.ts --timeout 10000
```

Expected: FAIL because `everydayMixTarget` currently emits only word chunks.

### Task 2: Implement Everyday Mix Parity

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Extend `everydayMixTarget`**

Use `settings.include_phrases` to append up to two phrase lines, three phrases per line. Append sentences matching `settings.sentence_length`, with standalone/comprehensive/review counts matching the migration spec.

- [x] **Step 2: Run focused target tests and verify GREEN**

Run:

```bash
bun test ts/tests/targets.test.ts --timeout 10000
```

Expected: PASS.

### Task 3: Add RED Tests For OpenTUI Everyday Settings

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/tests/opentuiAppSession.test.ts`
- Modify: `ts/tests/cli.test.ts`

- [x] **Step 1: Add OpenTUI route rendering test**

Assert that Settings now renders a third menu entry and an everyday settings page:

```ts
expect(openTuiRouteLines(settings)).toEqual([
  "1. Interface language",
  "2. Programming language scope",
  "3. Everyday English",
]);
```

The everyday page should render:

```ts
[
  "Word count  50",
  "Sentence length  mixed",
  "Phrases  on",
]
```

- [x] **Step 2: Add OpenTUI reducer test**

Navigate `6 -> 3`, press right, press `1`, press space, return to everyday mix, and assert:

```ts
expect(openTuiRouteLines(next.state)).toContain("Word count  100");
expect(openTuiRouteLines(short.state)).toContain("Sentence length  short");
expect(openTuiRouteLines(noPhrases.state)).toContain("Phrases  off");
expect(running.state.route.target.source).toContain("words-100:sentences-short");
expect(running.state.route.target.text).not.toContain("stand up");
```

- [x] **Step 3: Add CLI persistence/start-context test**

In `ts/tests/cli.test.ts`, use `appRunner` to return an OpenTUI state with edited everyday settings and action `"start"`. Assert:

```ts
expect(preferences.everyday_english).toEqual({
  word_count: 100,
  sentence_length: "short",
  include_phrases: false,
});
const everydayLesson = runnerDailyPlan?.lessons.find(
  (lesson) => lesson.module === "everyday_english",
);
expect(everydayLesson?.target.source).toContain(
  "words-100:sentences-short",
);
```

- [x] **Step 4: Run focused tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiAppSession.test.ts ts/tests/cli.test.ts --timeout 10000
```

Expected: FAIL because app state has no everyday settings and Settings `3` is currently a no-op.

### Task 4: Implement OpenTUI Everyday Settings State

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`
- Modify: `ts/src/ui/opentui/appSession.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Extend app state**

Add `everydaySettings?: EverydayEnglishSettings` to OpenTUI state/options and clone it in `appState`.

- [x] **Step 2: Extend Settings route**

Add `OpenTuiSettingsView = "menu" | "language" | "code_filters" | "everyday"`. Keep Settings item `2` for code filters and add item `3` for everyday settings.

- [x] **Step 3: Add reducer behavior**

On everyday settings page:
- Left/H or `-` cycles word count through `10, 20, 50, 100` backward.
- Right/L/N or `+`/`=` cycles word count forward.
- `1..4` set sentence length to `short`, `medium`, `long`, `mixed`.
- Space toggles `include_phrases`.
- Escape returns to Settings menu preserving everyday settings.

- [x] **Step 4: Feed settings into target generation**

`buildTargetContextForState` should return `{ ...context, everydaySettings: state.everydaySettings }` when present so standalone/comprehensive targets use edited settings.

- [x] **Step 5: Persist settings from CLI app result**

`preferencesFromAppState` should compare `state.everydaySettings` to `preferences.everyday_english`, write it when changed, and preserve all other preferences.

- [x] **Step 6: Use returned settings for start context**

`startContextFromAppState` should build the effective app context with both returned `codeConfig` and returned `everydaySettings`.

- [x] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiAppSession.test.ts ts/tests/cli.test.ts --timeout 10000
```

Expected: PASS.

### Task 5: Full Verification

**Files:**
- Verify: TS and Rust suites
- Modify: this plan checklist

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
