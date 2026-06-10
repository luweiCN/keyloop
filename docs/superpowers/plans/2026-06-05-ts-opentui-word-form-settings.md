# TS OpenTUI Word Form Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenTUI settings for long-word breakdown and personal-vocabulary comprehensive practice preferences.

**Architecture:** Keep persisted preference shape unchanged in `UserPreferences`. Add a compact OpenTUI state object for word-form settings, render and reduce it in the settings route, then persist returned state through `ts/src/cli.ts`.

**Tech Stack:** TypeScript strict mode, Bun test runner, existing OpenTUI pure app model/session reducer.

---

### Task 1: App Model Settings View

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`
- Test: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Write RED app model test**

Add a test proving Settings has a fourth word-form entry and the word-form page renders the current preference values.

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/opentuiApp.test.ts`

Expected: fail because `word_forms` is not a settings view and the Settings menu has only three entries.

- [x] **Step 3: Implement state and render support**

Add:
- `OpenTuiWordFormSettings`
- `OpenTuiSettingsView` member `"word_forms"`
- `wordFormSettings` on `OpenTuiStateOptions` and `OpenTuiAppState`
- route title and lines for the new settings page
- state cloning/preservation through `appState`, `stateOptions`, and `buildTargetContextForState`

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/opentuiApp.test.ts`

Expected: app model tests pass.

### Task 2: Reducer and Persistence

**Files:**
- Modify: `ts/src/ui/opentui/appSession.ts`
- Modify: `ts/src/cli.ts`
- Test: `ts/tests/opentuiAppSession.test.ts`
- Test: `ts/tests/cli.test.ts`

- [x] **Step 1: Write RED reducer test**

Add a test for entering Settings `4`, toggling long-word and vocabulary comprehensive injection, changing their limits, and starting a comprehensive run that reflects the edited settings.

- [x] **Step 2: Write RED CLI persistence test**

Add a bare `keyloop` app-runner test that edits the word-form settings, starts comprehensive practice, and asserts `preferences.json` plus the generated daily plan both use the returned settings.

- [x] **Step 3: Verify RED**

Run: `bun test ts/tests/opentuiAppSession.test.ts ts/tests/cli.test.ts`

Expected: fail because the reducer and CLI persistence do not know the new settings.

- [x] **Step 4: Implement reducer and persistence**

Add:
- `wordFormSettingsFromContext`
- Settings menu key `4`
- `1` toggles long-word comprehensive injection
- `2` toggles personal-vocabulary comprehensive injection
- Left/right cycles `word_breakdown.max_items_per_group`
- Up/down cycles `personal_vocabulary.daily_review_limit`
- `preferencesFromAppState` writes changed `word_breakdown` and `personal_vocabulary`
- `startContextFromAppState` applies returned settings immediately

- [x] **Step 5: Verify GREEN and full suite**

Run:
- `bun test ts/tests/opentuiAppSession.test.ts ts/tests/cli.test.ts`
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `git diff --check`

Expected: all pass.
