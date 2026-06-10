# TS Lesson Words Context Random Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure programming word targets pass `BuildTargetContext.random` into `buildLessonWords`, so standalone technical terms and comprehensive programming mix both use Rust-compatible shuffled filler terms.

**Architecture:** Reuse the existing optional random parameter on `buildLessonWords`. Keep focus-word priority, output source, chunking, and term cap unchanged.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic context-random word target test**

Add a test that builds standalone technical terms and programming-basics mix with ordered programming terms and a fixed random sequence. Assert a later term can enter both outputs.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "programming word targets pass injected random to lesson words"`

Expected: fail because callers currently invoke `buildLessonWords` without `context.random`.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Pass context random into word targets**

Pass `context.random ?? Math.random` to `buildLessonWords` from `buildProgrammingBasicsMixTarget` and the standalone `programming_terms` target.

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
