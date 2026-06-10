# TS Daily Run Lesson Kind Strict Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript `daily_runs.json` parsing reject stored lessons with invalid `kind`, matching Rust serde behavior.

**Architecture:** Keep missing optional/defaulted fields compatible, but make `PracticeLesson.kind` required and strict because Rust does not default that field.

**Tech Stack:** TypeScript, Bun test, existing storage tests.

---

### Task 1: Add RED Test For Invalid Daily Lesson Kind

**Files:**
- Modify: `ts/tests/storage.test.ts`

- [x] **Step 1: Add malformed stored daily run fixture**

Write `daily_runs.json` with a stored plan whose lesson `kind` is an unsupported value, then assert `loadOrCreateDailyPracticePlanFromPath` rejects.

- [x] **Step 2: Run focused storage test to verify RED**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects stored daily runs with invalid lesson kind"`

Expected: FAIL because TypeScript currently silently falls back to `"words"`.

### Task 2: Enforce Required Lesson Kind

**Files:**
- Modify: `ts/src/domain/model.ts`

- [x] **Step 1: Use required strict parsing for `PracticeLesson.kind`**

Keep module/category/mix profile defaults unchanged in this slice.

- [x] **Step 2: Run focused storage test to verify GREEN**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects stored daily runs with invalid lesson kind"`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify only.

- [x] **Step 1: Run storage/model tests**

Run: `bun test ts/tests/storage.test.ts ts/tests/model.test.ts`

- [x] **Step 2: Run TS suite and typecheck**

Run: `bun test ts/tests`

Run: `bun run typecheck`

- [x] **Step 3: Run build/Rust/hygiene checks**

Run: `bun run build`

Run: `cargo test --locked --all-targets`

Run: `cargo fmt --check`

Run: `git diff --check`
