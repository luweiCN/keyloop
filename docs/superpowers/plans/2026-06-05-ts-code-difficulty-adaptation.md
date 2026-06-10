# TS Code Difficulty Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Rust `code_difficulty_for_records` behavior into TS code practice target generation.

**Architecture:** Keep difficulty calculation private to `ts/src/training/targets.ts`, where code practice targets are assembled. Reuse existing snippet pickers, which already accept an optional difficulty filter.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS content and target generation modules.

---

### Task 1: RED Tests

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add difficulty fixtures**

Add tests around `buildDailyPracticePlan`:
- Strong recent code records should make the daily code lesson prefer hard snippets even when easy snippets appear first in the corpus.
- Weak recent code records should make the daily code lesson prefer easy snippets even when hard snippets appear first in the corpus.

Use Rust thresholds:
- Hard: weighted accuracy `>= 97`, weighted WPM `>= 24`, error rate `<= 3`.
- Medium: weighted accuracy `>= 94`, weighted WPM `>= 16`, error rate `<= 6`.
- Otherwise easy.

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/targets.test.ts`

Expected: fail because TS currently passes no difficulty to `pickBuiltinCodeExcludingByDifficulty`.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Add private difficulty helper**

Add `codeDifficultyForRecords(records)` matching Rust:
- Consider only records with `mode === "code"` and `typed_len > 0`.
- `total_typed = sum(max(typed_len, target_len))`.
- `error_rate = total_errors / total_typed * 100`.
- `weighted_accuracy` weighted by `max(typed_len, 1)`.
- `weighted_wpm` weighted by `max(duration_ms, 1)`.
- Return `"hard"`, `"medium"`, `"easy"`, or `undefined`.

- [x] **Step 2: Pass difficulty to pickers**

Update `codeMixTarget` so both local and built-in snippet pickers receive the computed difficulty.

- [x] **Step 3: Verify GREEN**

Run: `bun test ts/tests/targets.test.ts`

Expected: all target-generation tests pass.

### Task 3: Regression Gates

**Files:**
- No source changes expected.

- [x] **Step 1: Run full checks**

Run:
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `bun run build`
- `git diff --check`

Expected: all pass.
