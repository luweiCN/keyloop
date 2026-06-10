# TS Standalone Vocabulary Independent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep standalone "My vocabulary" practice available even when personal vocabulary injection is disabled for comprehensive practice.

**Architecture:** Load `vocabulary.json` into the bare app context regardless of the comprehensive-injection preference. Keep the preference behavior scoped to full practice and programming mix generation while allowing the explicit `my_vocabulary` standalone target to retain personal vocabulary entries.

**Tech Stack:** Bun tests, TypeScript strict mode, existing CLI app runner injection and OpenTUI reducer.

---

### Task 1: Standalone Vocabulary Uses Stored Entries

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Write the failing CLI test**

Add a test that:

1. Saves preferences with `personal_vocabulary.enabled_in_comprehensive = false`.
2. Writes one active `vocabulary.json` entry with `text: "serialization"` and `parts: ["serial", "ization"]`.
3. Runs bare `keyloop` with an injected `appRunner` that navigates `Programming basics -> My vocabulary`.
4. Asserts the injected `runner` receives a standalone plan whose first target includes `serial ization` and `serialization serialization`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: FAIL because the bare app context does not load personal vocabulary when comprehensive injection is disabled, and the app model strips personal vocabulary when the word-form setting is disabled.

- [x] **Step 3: Load vocabulary for app context**

In `runApp`, load `vocabulary.json` regardless of `personal_vocabulary.enabled_in_comprehensive`, assign `context.personalVocabulary`, and set `context.personalVocabularyLimit` from preferences. Keep `runStart` unchanged so non-interactive comprehensive `keyloop start` still respects the injection preference.

- [x] **Step 4: Scope personal vocabulary filtering to full practice targets**

Change `buildTargetContextForState` so the explicit `my_vocabulary` standalone target can keep `context.personalVocabulary` even when `enabled_in_comprehensive` is false. Main-menu `comprehensive` activation and `programming_basics_mix` should still pass an effective context with personal vocabulary stripped when disabled.

- [x] **Step 5: Run CLI test to verify it passes**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-standalone-vocabulary-independent.md`

- [x] **Step 1: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 2: Run repository verification**

Run:

```bash
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: Rust tests pass, TS build passes, and diff whitespace check is clean.

- [x] **Step 3: Mark this plan complete**

Check all boxes only after reading the corresponding command output.
