# TS Foundation Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust foundation mix behavior by shuffling foundation drill lines and warmup repeat pools before selecting lines.

**Architecture:** Keep randomness injectable through `BuildTargetContext.random` for deterministic tests. Limit this slice to foundation mix; leave broader `fillFrom`/everyday/programming randomization for separate slices.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic foundation shuffle test**

Add a daily foundation mix test with a fixed random sequence. Assert a later top-row drill line can be selected into the first group after shuffle.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "daily foundation mix shuffles drill lines with injected random"`

Expected: fail because TS currently takes the first drill lines in source order.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Add injectable random source**

Add `random?: () => number` to `BuildTargetContext`.

- [x] **Step 2: Shuffle foundation lines**

Shuffle the foundation drill candidate pool before slicing, preserving recent-line exclusion and fallback behavior.

- [x] **Step 3: Match Rust warmup repeat pool**

Update `repeatPool` so each repeated pool is shuffled before append, then truncate to requested length.

- [x] **Step 4: Remove order-coupled assertion**

Update the existing foundation drill-selection test to verify selected drill family rather than a fixed line number.

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
