# TS Everyday Source Filter Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust everyday target generation by ignoring everyday corpus entries whose `source_id` is blank.

**Architecture:** Add a small source-id predicate and apply it to everyday word, phrase, and sentence candidate helpers, including fallback sentence pools. Preserve current domain, tier, length, and output formatting behavior.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add blank source filtering test**

Add a target-generation test with blank-source word, phrase, and sentence entries plus valid alternatives. Assert blank-source text is not emitted by everyday words, phrases, or sentences targets.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "everyday targets ignore corpus entries with blank source ids"`

Expected: fail because TS currently includes blank-source everyday entries.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Filter blank source ids**

Add a helper that checks `source_id.trim().length > 0` and apply it consistently to everyday word, phrase, and sentence candidate selection.

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
