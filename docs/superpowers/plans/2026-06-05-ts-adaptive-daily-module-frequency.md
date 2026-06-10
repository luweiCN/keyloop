# TS Adaptive Daily Module Frequency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Rust `build_daily_practice_plan` adaptive module frequency behavior into TS `buildDailyPracticePlan`.

**Architecture:** Keep the logic inside TS target generation because this mirrors Rust `content::build_daily_practice_plan` and avoids touching UI/session runners. Add a small readiness calculation from recent `SessionRecord`s, filter the comprehensive module sequence, and preserve Rust thresholds.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS domain model.

---

### Task 1: Adaptive Daily Plan Tests

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Write RED tests**

Add focused tests around `buildDailyPracticePlan`:
- Stable `foundation_input` records remove foundation from the daily plan while keeping at least three lessons.
- Weak `foundation_input` records keep exactly one foundation lesson and append the short-review reason.
- Stable `code_practice` records keep code practice but reduce its estimated minutes to `3`.
- Stable records for two non-code modules would leave fewer than three lessons, so the plan falls back to the full four-module sequence.

Use Rust thresholds:
- Recent history window: `21` days.
- Stable: at least `3` completed samples, typed length at least `180`, accuracy at least `97%`, error rate at most `2.5%`, backspaces at most `samples * 4`.
- Weak: at least `1` sample, typed length at least `20`, accuracy below `92%` or error rate at least `8%` or backspaces at least `samples * 12`.

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/targets.test.ts`

Expected: fail because TS currently always returns the fixed four-module sequence and does not derive readiness from records.

### Task 2: Port Module Readiness

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Implement readiness calculation**

Add private helpers in `targets.ts`:
- `moduleReadinessFromRecords(records, now = new Date())`
- `effectiveModuleTypedLen(record)`
- `isAdaptiveModule(module)`
- `moduleHasCurrentFocus(module, plan)`

Match Rust behavior:
- Ignore records older than `PLAN_HISTORY_DAYS`.
- Ignore non-adaptive modules.
- Derive typed length from `typed_len`, else `max(user_input.length, correct_chars)`.
- Mark weak before stable.

- [x] **Step 2: Apply readiness to daily lessons**

Change `buildDailyPracticePlan` to:
- Build the base four-module sequence.
- Filter stable non-code modules when they have no current focus.
- Fall back to the base sequence when fewer than three lessons remain.
- Generate lesson IDs by kind occurrence using `daily:<kind-slug>:<count>`.
- Pass readiness into lesson construction so reason text and estimated minutes can reflect stable/weak status.

- [x] **Step 3: Verify GREEN**

Run: `bun test ts/tests/targets.test.ts`

Expected: all target-generation tests pass.

### Task 3: Regression Gates

**Files:**
- No source changes expected.

- [x] **Step 1: Run TS checks**

Run:
- `bun test ts/tests && bun run typecheck`

Expected: all TS tests and type checking pass.

- [x] **Step 2: Run repository checks**

Run:
- `cargo test --locked --all-targets`
- `git diff --check`

Expected: Rust tests still pass and diff has no whitespace errors.
