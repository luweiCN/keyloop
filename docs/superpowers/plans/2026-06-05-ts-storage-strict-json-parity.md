# TS Storage Strict JSON Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript structured JSON storage fail on malformed top-level shapes like Rust, while keeping the documented JSONL session behavior of skipping invalid rows.

**Architecture:** Keep forgiving field-level model parsing for legacy compatibility, but reject wrong top-level shapes for `key_stats.json` and `daily_runs.json`. This matches Rust `serde_json::from_str` behavior for those files.

**Tech Stack:** TypeScript, Bun test, existing storage tests.

---

### Task 1: Add RED Tests For Strict JSON Shapes

**Files:**
- Modify: `ts/tests/storage.test.ts`

- [x] **Step 1: Add tests for malformed top-level `key_stats.json` and `daily_runs.json`**

Assert that `loadKeyAggregatesFromPath` rejects a JSON object and `loadOrCreateDailyPracticePlanFromPath` rejects a JSON array.

- [x] **Step 2: Run focused storage tests to verify RED**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects malformed structured json stores"`

Expected: FAIL because TypeScript currently treats malformed top-level structures as empty stores.

### Task 2: Enforce Rust-Parity Top-Level Shapes

**Files:**
- Modify: `ts/src/storage/keyloopStore.ts`

- [x] **Step 1: Require `key_stats.json` to be an array**

If the file exists and parsed JSON is not an array, throw an error instead of returning `[]`.

- [x] **Step 2: Require `daily_runs.json` to be an object store**

If the file exists and parsed JSON is not a non-array object, throw an error instead of treating it as an empty store.

- [x] **Step 3: Run focused storage tests to verify GREEN**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects malformed structured json stores"`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify only.

- [x] **Step 1: Run storage tests**

Run: `bun test ts/tests/storage.test.ts`

- [x] **Step 2: Run TS test suite and typecheck**

Run: `bun test ts/tests`

Run: `bun run typecheck`

- [x] **Step 3: Run diff hygiene**

Run: `git diff --check`
