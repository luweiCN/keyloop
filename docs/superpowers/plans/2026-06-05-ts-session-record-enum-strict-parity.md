# TS Session Record Enum Strict Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript session JSONL parsing match Rust serde enum behavior: missing defaulted fields still default, but present invalid enum values reject the row.

**Architecture:** Reuse strict literal helpers in the domain parser. `loadSessionsFromPath` already skips parser errors row-by-row, so invalid enum rows should be skipped with the existing diagnostic path.

**Tech Stack:** TypeScript, Bun test, existing storage/model tests.

---

### Task 1: Add RED Test For Invalid Session Enum Rows

**Files:**
- Modify: `ts/tests/storage.test.ts`

- [x] **Step 1: Add invalid session enum JSONL fixture**

Write JSONL with one valid row, invalid `mode`, invalid `completion_state`, invalid `token_stats[].kind`, and one legacy row missing those fields. Assert only the valid and legacy rows load.

- [x] **Step 2: Run focused storage test to verify RED**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "sessions skip rows with invalid present enum values"`

Expected: FAIL because TypeScript currently silently defaults invalid enum values.

### Task 2: Enforce Strict Present Enum Values

**Files:**
- Modify: `ts/src/domain/model.ts`

- [x] **Step 1: Use present-field strict parsing for defaulted SessionRecord enums**

Apply to `mode`, `completion_state`, `module`, and `category`.

- [x] **Step 2: Use required strict parsing for nested token/key event enums**

Apply to `token_stats[].kind`, `slow_tokens[].kind`, and `key_events[].action`.

- [x] **Step 3: Run focused storage test to verify GREEN**

Run: `bun test ts/tests/storage.test.ts --test-name-pattern "sessions skip rows with invalid present enum values"`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify only.

- [x] **Step 1: Run storage/model tests**

Run: `bun test ts/tests/storage.test.ts ts/tests/model.test.ts`

- [x] **Step 2: Run TS suite and typecheck**

Run: `bun test ts/tests`

Run: `bun run typecheck`

- [x] **Step 3: Run Rust and hygiene checks**

Run: `cargo test --locked --all-targets`

Run: `cargo fmt --check`

Run: `git diff --check`
