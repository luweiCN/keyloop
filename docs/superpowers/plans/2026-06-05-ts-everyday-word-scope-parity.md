# TS Everyday Word Scope Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Rust-compatible everyday word scopes to TS target generation: `common-500`, `common-1000`, and `common-5000`, each with the matching tier limit and source slug.

**Architecture:** Extend `EverydayPracticeTargetKind` with scope-specific values while keeping the existing `words` kind as a compatibility alias. Refactor `everydayWordsTarget` to accept a scope descriptor containing tier limit and source slug. Preserve word count, fill, shuffle, and formatting behavior.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add scope tier/source test**

Add a target-generation test for `common_500`, `common_1000`, and `common_5000` using tiered everyday words. Assert each output source contains the correct slug and each output respects the expected tier limit.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "everyday word scopes use Rust tier limits and source slugs"`

Expected: fail because TS currently has no scope-specific everyday word target kinds.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Add scope-specific target kinds**

Add `common_500`, `common_1000`, and `common_5000` to `EverydayPracticeTargetKind`.

- [x] **Step 2: Apply scope tier limits and source slugs**

Refactor `everydayWordsTarget` to accept `{ tierLimit, sourceSlug }` and emit `keyloop:module:everyday-english:<slug>:words-<word_count>`.

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
