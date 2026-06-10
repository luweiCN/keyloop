# TS Code Filter Preference Strict Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust serde behavior for stored code filter preferences: `facet` must be present and one of the supported code practice facets.

**Architecture:** Keep legacy defaults for missing top-level preference fields. Make individual code filter entries strict because Rust `CodeFilterPreference` has required fields.

**Tech Stack:** TypeScript, Bun test, existing storage tests.

---

### Task 1: Add RED Test For Invalid Code Filter Facet

**Files:**
- Modify: `ts/tests/storage.test.ts`

- [x] **Step 1: Add invalid `pinned_code_filters[].facet` fixture**

Write a `preferences.json` with a code filter facet such as `"library"` and assert `loadPreferencesFromPath` rejects.

- [x] **Step 2: Run focused storage test to verify RED**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects invalid code filter facets"`

Expected: FAIL because TypeScript currently silently falls back to `"language"`.

### Task 2: Enforce Strict Code Filter Facet

**Files:**
- Modify: `ts/src/domain/model.ts`

- [x] **Step 1: Add a required literal helper**

Unlike defaulted legacy fields, required nested enum fields should throw when missing or invalid.

- [x] **Step 2: Use the helper for `CodeFilterPreference.facet`**

Keep `value` parsing unchanged in this slice.

- [x] **Step 3: Run focused storage test to verify GREEN**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects invalid code filter facets"`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify only.

- [x] **Step 1: Run storage/model tests**

Run: `bun test ts/tests/storage.test.ts ts/tests/model.test.ts`

- [x] **Step 2: Run TS suite and typecheck**

Run: `bun test ts/tests`

Run: `bun run typecheck`

- [x] **Step 3: Run diff hygiene**

Run: `git diff --check`
