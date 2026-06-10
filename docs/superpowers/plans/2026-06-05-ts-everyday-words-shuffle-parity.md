# TS Everyday Words Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust standalone everyday word target behavior by shuffling the word pool before selecting the requested word count.

**Architecture:** Reuse `BuildTargetContext.random` for deterministic tests. Keep the existing TS output formatting unchanged in this slice; only align selection order with Rust.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic everyday word shuffle test**

Add a standalone everyday words test with 10 everyday word entries and a fixed random sequence. Assert a later word can enter the selected target.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "everyday words target shuffles word pool with injected random"`

Expected: fail because TS currently selects everyday words in source order.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Shuffle standalone everyday word pool**

After filling from common words to the requested word count, shuffle the candidate pool using `context.random ?? Math.random`, then slice the selected words.

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
