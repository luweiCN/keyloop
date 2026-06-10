# TS Standalone Word Form Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-UI TypeScript target generators for standalone long-word breakdown and personal-vocabulary practice.

**Architecture:** Keep these as pure functions in `ts/src/training/targets.ts` so OpenTUI can later expose menu entries without owning training logic. Reuse existing personal vocabulary ranking and identifier splitting. Do not add a new daily comprehensive module; these are standalone target builders.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing TS content, target, and vocabulary modules.

---

## File Structure

- Modify: `ts/src/training/targets.ts`
  - Export `buildLongWordBreakdownPracticeTarget(context, options)`.
  - Export `buildPersonalVocabularyPracticeTarget(entries, records, options)`.
  - Add small shared helpers for breakdown line expansion and fallback long words.
- Test: `ts/tests/targets.test.ts`
  - Verify standalone long-word selection order and fallback.
  - Verify personal vocabulary ranking, archiving, and limit behavior.

## Task 1: Long-Word Breakdown Target

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write failing long-word tests**

Add tests proving:

- personal vocabulary entries with `parts` are selected before focus words and built-in long words;
- focus identifiers are split into parts and include naming forms;
- hardcoded fallback words are used when no personal, focus, or built-in entries are available.

- [x] **Step 2: Run target tests and verify RED**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: fail because `buildLongWordBreakdownPracticeTarget` is not exported.

- [x] **Step 3: Implement long-word target**

Implement the smallest standalone builder matching the migration spec:

- input: `BuildTargetContext` plus `{ profile, domain, maxItems }`;
- selection order: personal entries with `parts`, split focus identifiers, built-in `long_words`, hardcoded fallback;
- output mode: `"words"`;
- output source: `keyloop:module:word-breakdown:<first-word>`.

- [x] **Step 4: Run target tests and verify GREEN**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: target tests pass.

## Task 2: Personal Vocabulary Target

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write failing personal vocabulary tests**

Add tests proving:

- archived entries are excluded;
- ranked active entries produce a standalone target;
- entries with `parts` include breakdown lines;
- `maxItems` limits output.

- [x] **Step 2: Run target tests and verify RED**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: fail because `buildPersonalVocabularyPracticeTarget` is not exported.

- [x] **Step 3: Implement personal vocabulary target**

Use `rankPersonalVocabulary` for ordering and reuse the same breakdown expansion for entries with parts.

- [x] **Step 4: Run target tests and verify GREEN**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: target tests pass.

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

- [x] **Step 3: Check diff hygiene and TS entry**

Run:

```bash
git diff --check
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- vocab list; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI entry still runs.
