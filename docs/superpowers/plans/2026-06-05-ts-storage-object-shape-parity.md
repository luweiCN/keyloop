# TS Storage Object Shape Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript structured object stores reject malformed top-level JSON shapes instead of silently replacing them with defaults.

**Architecture:** Keep field-level default parsing for legacy compatibility, but require object top-level shapes for `preferences.json`, `current_session.json`, and `vocabulary.json` when the file exists.

**Tech Stack:** TypeScript, Bun test, existing storage tests.

---

### Task 1: Add RED Tests For Object Store Shape Validation

**Files:**
- Modify: `ts/tests/storage.test.ts`

- [x] **Step 1: Add a test for malformed top-level object stores**

Write invalid top-level arrays to `preferences.json`, `current_session.json`, and `vocabulary.json`, then assert the loaders reject with file-specific messages.

- [x] **Step 2: Run focused storage test to verify RED**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects malformed object json stores"`

Expected: FAIL because TypeScript currently treats these top-level arrays as defaults.

### Task 2: Enforce Object Top-Level Shapes

**Files:**
- Modify: `ts/src/storage/keyloopStore.ts`

- [x] **Step 1: Add an object-store reader helper**

Use it after `readJsonIfExists` for object stores. Missing files still return `null`.

- [x] **Step 2: Apply the helper to preferences, session checkpoint, and vocabulary loaders**

Do not change field-level model parsers.

- [x] **Step 3: Run focused storage test to verify GREEN**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects malformed object json stores"`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify only.

- [x] **Step 1: Run storage tests**

Run: `bun test ts/tests/storage.test.ts`

- [x] **Step 2: Run TS suite and typecheck**

Run: `bun test ts/tests`

Run: `bun run typecheck`

- [x] **Step 3: Run diff hygiene**

Run: `git diff --check`
