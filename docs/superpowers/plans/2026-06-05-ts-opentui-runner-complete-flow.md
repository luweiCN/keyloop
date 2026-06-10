# TS OpenTUI Runner Complete Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the OpenTUI `start` runner to the completion and daily-summary routes after each completed lesson.

**Architecture:** Keep typing and record creation in `runLessonUntilComplete`. After a completed record is produced, render a `complete` route and wait for a key decision. Enter continues to the next unfinished lesson, or opens a summary route when the daily plan is finished; Esc/Q stops and returns accumulated records. Summary Enter/Esc/Q returns accumulated records.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI renderer adapter and app model route helpers.

---

## File Structure

- Modify: `ts/tests/opentuiStartRunner.test.ts`
  - Add RED coverage proving completed lessons show complete/summary routes and wait for keys.
  - Update existing completion tests to press through the new post-completion pages.
- Modify: `ts/src/ui/opentui/startRunner.ts`
  - Render `createOpenTuiCompletionState` after each completed record.
  - Render `createOpenTuiSummaryState` after the final completed daily lesson.
  - Add small key-wait helpers for complete and summary routes.
- Modify: this plan document.

## Task 1: RED Runner Test

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Add failing completion-flow test**

Add a single-lesson test proving:

- after typing the target, the runner renders `Lesson complete`;
- the runner does not resolve before a complete-page Enter;
- complete-page Enter renders `Daily summary`;
- summary Enter returns the completed record.

- [x] **Step 2: Run focused runner tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: fail because the runner currently returns immediately after completion.

## Task 2: GREEN Runner Implementation

**Files:**
- Modify: `ts/src/ui/opentui/startRunner.ts`
- Modify: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Add complete and summary route waits**

After a completed record:

- compute the next unfinished lesson using historical records plus records from this run;
- render `createOpenTuiCompletionState(language, record, { nextLesson })`;
- wait for Enter/Esc/Q on the complete page;
- if Enter and next lesson exists, continue the loop;
- if Enter and no next lesson exists, render `createOpenTuiSummaryState` and wait for Enter/Esc/Q;
- otherwise return accumulated records.

- [x] **Step 2: Update existing completion tests**

Update tests that used to expect immediate continuation so they press Enter through the complete page, and press Enter through the summary page when the plan is complete.

- [x] **Step 3: Run focused runner tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: OpenTUI start runner tests pass.

## Task 3: Integrated Verification

**Files:**
- Modify: this plan document.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests and typecheck pass.

- [x] **Step 2: Run Rust checks**

Run:

```bash
cargo test --locked --all-targets
```

Expected: existing Rust tests pass.

- [x] **Step 3: Check diff hygiene and TS entry**

Run:

```bash
git diff --check
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI non-start entry still runs.
