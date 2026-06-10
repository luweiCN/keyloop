# TS Everyday Sentences Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust standalone everyday sentence target behavior by shuffling sentence candidates before selecting the displayed six lines.

**Architecture:** Reuse `BuildTargetContext.random` for deterministic tests. Keep existing TS fallback behavior and output formatting unchanged; only align selection order with Rust.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic sentence shuffle test**

Add a standalone everyday sentences test with 10 short sentence entries and a fixed random sequence. Assert a later sentence can enter the selected target.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "everyday sentences target shuffles sentence pool with injected random"`

Expected: fail because TS currently selects everyday sentences in source order.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Shuffle standalone sentence pool**

After matching/fallback sentence candidates are assembled, shuffle using `context.random ?? Math.random`, then slice six lines.

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
