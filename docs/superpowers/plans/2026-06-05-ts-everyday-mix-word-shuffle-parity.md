# TS Everyday Mix Word Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust everyday mix behavior by shuffling the word candidate pool before filling the mix word section.

**Architecture:** Reuse `BuildTargetContext.random` for deterministic tests. Keep everyday mix profile sizing, phrase inclusion, sentence selection, target source, and long-word breakdown behavior unchanged.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic everyday mix word shuffle test**

Add an everyday mix test with ordered everyday word entries, disabled phrases, and a fixed context random sequence while global `Math.random` is fixed to source order. Assert a later word can enter the word section only when `context.random` is used.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "everyday mix shuffles word pool with injected random"`

Expected: fail because TS currently fills everyday mix words in source order.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Pass context random into mix word fill**

Use `context.random ?? Math.random` in `everydayMixTarget` and pass it to the word `fillFrom` call.

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
