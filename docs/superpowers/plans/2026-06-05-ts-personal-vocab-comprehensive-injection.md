# TS Personal Vocabulary Comprehensive Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript comprehensive practice draw due personal vocabulary entries from `~/.keyloop/vocabulary.json` without adding a fifth daily module.

**Architecture:** Keep ranking and entry normalization in `ts/src/training/vocabulary.ts`. Extend `ts/src/training/targets.ts` so comprehensive programming basics can inject breakdown lines from ranked personal vocabulary entries before built-in long words. Extend `ts/src/cli.ts` start dispatch to load the local vocabulary store and pass preference limits into the target generator.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing TS storage, CLI, and target generation modules.

---

## File Structure

- Modify: `ts/src/training/targets.ts`
  - Add optional personal vocabulary fields to `BuildTargetContext`.
  - Inject ranked personal vocabulary entries with `parts` into programming basics mix.
  - Respect `personalVocabularyLimit` and keep the daily module count unchanged.
- Modify: `ts/src/cli.ts`
  - Load `vocabulary.json` during `start`.
  - Pass active entries and `preferences.personal_vocabulary.daily_review_limit` into `buildDailyPracticePlan`.
- Test: `ts/tests/targets.test.ts`
  - Verify personal vocabulary entries are injected before built-in long words and constrained by limit.
- Test: `ts/tests/cli.test.ts`
  - Verify `keyloop start` passes stored vocabulary into the generated programming basics lesson.

## Task 1: Target Generator Injection

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write failing target tests**

Add tests proving:

- `buildProgrammingBasicsMixTarget` includes a personal vocabulary entry with `parts`.
- Personal entries are preferred over built-in `long_words`.
- `personalVocabularyLimit` caps injected personal entries.

- [x] **Step 2: Run target tests and verify RED**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: fail because `BuildTargetContext` does not accept personal vocabulary fields and target generation does not inject those entries.

- [x] **Step 3: Implement target injection**

Add the smallest target-generation helper needed by the tests. Use existing `rankPersonalVocabulary` and the existing long-word line pattern.

- [x] **Step 4: Run target tests and verify GREEN**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: target tests pass.

## Task 2: CLI Start Wiring

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write failing CLI test**

Add a `start` test with a temp `KEYLOOP_HOME`, saved `vocabulary.json`, and injected runner. Assert that the generated programming basics lesson contains the stored vocabulary breakdown.

- [x] **Step 2: Run CLI tests and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: fail because `runStart` does not load or pass vocabulary entries.

- [x] **Step 3: Implement CLI wiring**

Load `vocabulary.json` with existing storage helpers and pass active entries plus preference limit into `buildDailyPracticePlan`.

- [x] **Step 4: Run CLI tests and verify GREEN**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: CLI tests pass.

## Task 3: Integrated Verification

**Files:**
- No new source files.

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

- [x] **Step 3: Check diff hygiene and TS start entry**

Run:

```bash
git diff --check
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI entry still runs.
