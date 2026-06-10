# TS Lesson Words Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust `fill_from` behavior for programming lesson word fill by shuffling filler terms after fixed focus words.

**Architecture:** Add an optional random source to `buildLessonWords` and thread it into `fillFrom`. Keep `fillFrom` order-preserving for existing callers unless a random source is explicitly supplied; broader fill-path randomization remains a separate migration slice.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic filler shuffle test**

Add a `buildLessonWords` test with one fixed focus word and a fixed random sequence. Assert a later programming filler term can be selected immediately after focus terms.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "lesson words shuffle fill terms with injected random"`

Expected: fail because TS currently fills programming terms in source order.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Add optional random to `buildLessonWords`**

Default to `Math.random` for production behavior while preserving existing call compatibility.

- [x] **Step 2: Allow `fillFrom` to shuffle when requested**

Copy the source pool and shuffle it only when a random source is provided.

### Task 3: Regression Gates

**Files:**
- No additional source files expected.

- [x] **Step 1: Run focused checks**

Run:
- `bun test ts/tests/targets.test.ts`
- `bun run typecheck`

Expected: all pass.

- [x] **Step 2: Run full checks**

Run:
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `bun run build`
- `git diff --check`

Expected: all pass.
