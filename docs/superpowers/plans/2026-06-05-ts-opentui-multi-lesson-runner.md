# TS OpenTUI Multi-Lesson Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the TypeScript/OpenTUI `start` runner continue through subsequent unfinished daily lessons after a lesson is completed.

**Architecture:** Keep one-lesson typing semantics in `runLessonUntilComplete`. Change `openTuiStartRunner` into a loop that repeatedly chooses the next unfinished lesson, renders it, and appends completed records. Stop the loop when all lessons are done, when no interactive `keyInput` is available, when Escape returns no record, or when a partial record is produced.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI renderer adapter and live session core.

---

## File Structure

- Modify: `ts/tests/opentuiStartRunner.test.ts`
  - Add a test proving a completed first lesson advances to the second unfinished lesson.
- Modify: `ts/src/ui/opentui/startRunner.ts`
  - Replace single-lesson runner behavior with a loop across unfinished daily lessons.

## Task 1: RED Test

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Add failing multi-lesson completion test**

Add a test with two one-character lessons. Type the first lesson, wait for the second key listener, type the second lesson, and expect:

- two completed records are returned;
- record lesson ids are `lesson-foundation` and `lesson-everyday`;
- renderer is destroyed once per completed lesson.

- [x] **Step 2: Run focused start runner tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: fail because the runner currently returns after the first completed lesson.

## Task 2: GREEN Implementation

**Files:**
- Modify: `ts/src/ui/opentui/startRunner.ts`

- [x] **Step 1: Loop over unfinished lessons**

Track completed lesson ids from historical records plus records produced in the current runner call. Render and run the first unfinished lesson repeatedly.

- [x] **Step 2: Stop on partial or empty Escape**

If `runLessonUntilComplete` returns `null`, stop and return accumulated records. If it returns a `partial` record, append it and stop.

- [x] **Step 3: Run focused start runner tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: start runner tests pass.

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
