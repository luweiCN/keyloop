# TS Practice Target Mode Strict Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript `PracticeTarget.mode` match Rust serde: missing fields default to `mixed`, but present invalid values reject.

**Architecture:** Reuse `literalIfPresent` for `target.mode`; do not change `text` or `source` parsing.

**Tech Stack:** TypeScript, Bun test, existing storage/model tests.

---

### Task 1: Add RED Test For Invalid Target Mode

**Files:**
- Modify: `ts/tests/storage.test.ts`

- [x] **Step 1: Add stored daily run fixture with invalid `target.mode`**

Assert the malformed stored plan rejects when loaded.

- [x] **Step 2: Run focused storage test to verify RED**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects stored daily runs with invalid target mode"`

Expected: FAIL because TypeScript currently silently falls back to `mixed`.

### Task 2: Enforce Present-Field Strict Parsing

**Files:**
- Modify: `ts/src/domain/model.ts`

- [x] **Step 1: Apply `literalIfPresent` to `target.mode`**

Missing `target.mode` must still default to `mixed`.

- [x] **Step 2: Run focused storage test to verify GREEN**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "rejects stored daily runs with invalid target mode"`

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
