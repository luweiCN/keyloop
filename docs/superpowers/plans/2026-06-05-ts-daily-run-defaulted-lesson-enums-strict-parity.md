# TS Daily Run Defaulted Lesson Enums Strict Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript `PracticeLesson` defaulted enum fields match Rust serde: missing fields default, but present invalid values reject.

**Architecture:** Reuse `literalIfPresent` for `module`, `category`, and `mix_profile`. Keep `kind` as required strict and leave target parsing for a later slice.

**Tech Stack:** TypeScript, Bun test, existing storage/model tests.

---

### Task 1: Add RED Test For Invalid Defaulted Lesson Enums

**Files:**
- Modify: `ts/tests/storage.test.ts`

- [x] **Step 1: Add stored daily run fixtures with invalid module/category/mix_profile**

Assert each malformed stored plan rejects when loaded.

- [x] **Step 2: Run focused storage test to verify RED**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects stored daily runs with invalid defaulted lesson enums"`

Expected: FAIL because TypeScript currently silently falls back to defaults.

### Task 2: Enforce Present-Field Strict Parsing

**Files:**
- Modify: `ts/src/domain/model.ts`

- [x] **Step 1: Apply `literalIfPresent` to module/category/mix_profile**

Missing fields must still default to `programming_basics`, `programming_terms`, and `standalone`.

- [x] **Step 2: Run focused storage test to verify GREEN**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects stored daily runs with invalid defaulted lesson enums"`

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
