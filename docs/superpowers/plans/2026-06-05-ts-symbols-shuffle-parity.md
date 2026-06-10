# TS Symbols Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust `build_lesson_symbols` behavior by shuffling language-specific symbols, general symbols, and number drills before filling the programming symbols lesson.

**Architecture:** Reuse `BuildTargetContext.random` for deterministic tests. Keep randomness scoped to `buildLessonSymbols`; existing generic `appendFrom`/`fillFrom` callers remain order-preserving unless they explicitly pass a random source.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic language-symbol shuffle test**

Add a programming basics mix test with 10 Rust-specific symbol items and a fixed random sequence. Assert a later symbol can enter the first 6 language-specific picks.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "programming basics symbols shuffle language-specific items with injected random"`

Expected: fail because TS currently takes language-specific symbols in source order.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Thread random into symbol filling**

Pass `context.random ?? Math.random` into the language-specific `appendFrom`, general `fillFrom`, and number-drill `appendFrom` calls.

- [x] **Step 2: Allow `appendFrom` to shuffle when requested**

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
