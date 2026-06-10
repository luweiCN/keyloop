# TS OpenTUI App Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a testable TypeScript/OpenTUI app shell model that routes menus to core practice targets, including standalone long-word and personal-vocabulary practice.

**Architecture:** Keep this slice renderer-free under `ts/src/ui/opentui/appModel.ts`. The model owns menu ids, localized labels, route transitions, and mapping menu selections to `PracticeTarget`s. Actual OpenTUI components can consume this model later without duplicating training logic.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing TS target generation and domain modules.

---

## File Structure

- Create: `ts/src/ui/opentui/appModel.ts`
  - Main menu and setup menu definitions.
  - Pure route state and activation helpers.
  - Target routing for comprehensive first lesson, technical long words, and personal vocabulary.
- Modify: `ts/src/index.ts`
  - Export the OpenTUI app model.
- Test: `ts/tests/opentuiApp.test.ts`
  - Verify menu shape and target routing.

## Task 1: Menu Shape and Routes

**Files:**
- Create: `ts/tests/opentuiApp.test.ts`
- Create: `ts/src/ui/opentui/appModel.ts`
- Modify: `ts/src/index.ts`

- [x] **Step 1: Write failing menu tests**

Add tests proving:

- the main menu exposes seven current product entries;
- selecting Everyday practice opens an everyday submenu;
- selecting Programming basics opens a programming submenu;
- selecting Comprehensive practice starts the first daily lesson target.

- [x] **Step 2: Run OpenTUI model tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: fail because the OpenTUI app model does not exist.

- [x] **Step 3: Implement menu model**

Implement the smallest discriminated-union route model and menu activation helpers required by the tests.

- [x] **Step 4: Run OpenTUI model tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: OpenTUI model tests pass.

## Task 2: Word-Form Menu Entries

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Write failing word-form routing tests**

Add tests proving:

- Programming basics -> Technical long words starts a word-breakdown target;
- Programming basics -> My vocabulary starts a personal-vocabulary target and excludes archived entries.

- [x] **Step 2: Run OpenTUI model tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: fail until word-form menu entries are wired.

- [x] **Step 3: Implement word-form routing**

Route the menu entries to `buildLongWordBreakdownPracticeTarget` and `buildPersonalVocabularyPracticeTarget`.

- [x] **Step 4: Run OpenTUI model tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: OpenTUI model tests pass.

## Task 3: Integrated Verification

**Files:**
- No new files.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests and typecheck pass.

- [x] **Step 2: Run Rust checks**

Run:

```bash
cargo test --locked --all-targets
```

Expected: existing Rust tests pass.

- [x] **Step 3: Check diff hygiene and TS entry**

Run:

```bash
git diff --check
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI entry still runs.
