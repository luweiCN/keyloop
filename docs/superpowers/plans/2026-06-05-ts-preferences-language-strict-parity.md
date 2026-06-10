# TS Preferences Language Strict Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust serde behavior for `UserPreferences.interface_language`: missing fields default, but invalid enum values reject instead of silently falling back.

**Architecture:** Keep existing field-level defaults for absent legacy fields. Add a small strict literal helper only where the stored preferences field is present.

**Tech Stack:** TypeScript, Bun test, existing storage/model tests.

---

### Task 1: Add RED Test For Invalid Preferences Language

**Files:**
- Modify: `ts/tests/storage.test.ts`

- [x] **Step 1: Add invalid `interface_language` fixture**

Write `{"interface_language":"fr"}` to `preferences.json` and assert `loadPreferencesFromPath` rejects.

- [x] **Step 2: Run focused storage test to verify RED**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects invalid preferences enum values"`

Expected: FAIL because TypeScript currently silently defaults invalid `interface_language` to `zh`.

### Task 2: Enforce Strict Present Enum Values

**Files:**
- Modify: `ts/src/domain/model.ts`

- [x] **Step 1: Add a present-field strict literal helper**

Missing values still use the fallback. Present invalid values throw.

- [x] **Step 2: Use the helper for `interface_language`**

Do not change unrelated enum fields in this slice.

- [x] **Step 3: Run focused storage test to verify GREEN**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects invalid preferences enum values"`

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
