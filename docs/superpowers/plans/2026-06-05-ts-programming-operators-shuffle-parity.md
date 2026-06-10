# TS Programming Operators Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust standalone programming operators target behavior by shuffling language-specific symbols, general symbols, and number drills before filling the target.

**Architecture:** Reuse `BuildTargetContext.random` for deterministic tests. Keep existing target source, mode, chunking, and focus-symbol precedence unchanged.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic operators shuffle test**

Add a standalone programming operators test with ordered language symbols, general symbols, and number drills plus a fixed random sequence. Assert later pool items can enter the target.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "programming operators target shuffles fill pools with injected random"`

Expected: fail because TS currently fills standalone operators in source order.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Shuffle operator fill pools**

Use `context.random ?? Math.random` in `programmingOperatorsTarget` and pass it to language-specific, general symbol, and number-drill fill operations.

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
