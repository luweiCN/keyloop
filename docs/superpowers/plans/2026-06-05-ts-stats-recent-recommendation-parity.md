# TS Stats Recent Recommendation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript stats overview recommendations match Rust by considering only records inside `PLAN_HISTORY_DAYS`.

**Architecture:** Keep all overview aggregates over all visible records, but filter only the recommendation input through the same recent-history cutoff used by Rust `recent_plan_records`.

**Tech Stack:** TypeScript, Bun test, existing stats tests.

---

### Task 1: Add RED Test For Stale Problem Records

**Files:**
- Modify: `ts/tests/stats.test.ts`

- [x] **Step 1: Add a test where an old key error should not drive overview advice**

Use one stale record with repeated key errors and one recent clean record. The overview should stay balanced because Rust filters recommendation records to the recent plan window.

- [x] **Step 2: Run focused stats test to verify RED**

Run: `bun test ts/tests/stats.test.ts --test-name-pattern "overview recommendation ignores stale problem records"`

Expected: FAIL because TypeScript currently passes all records into the recommendation helper.

### Task 2: Filter Recommendation Records By Plan Window

**Files:**
- Modify: `ts/src/report/stats.ts`

- [x] **Step 1: Import `PLAN_HISTORY_DAYS`**

- [x] **Step 2: Add a recent-record helper**

Filter records with finite `started_at` timestamps greater than or equal to `now - PLAN_HISTORY_DAYS`.

- [x] **Step 3: Use the recent helper only for overview recommendation text**

Do not change overall totals, charts, or token/key aggregate lines.

- [x] **Step 4: Run focused stats test to verify GREEN**

Run: `bun test ts/tests/stats.test.ts --test-name-pattern "overview recommendation ignores stale problem records"`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify only.

- [x] **Step 1: Run stats tests**

Run: `bun test ts/tests/stats.test.ts`

- [x] **Step 2: Run TS suite and typecheck**

Run: `bun test ts/tests`

Run: `bun run typecheck`

- [x] **Step 3: Run diff hygiene**

Run: `git diff --check`
