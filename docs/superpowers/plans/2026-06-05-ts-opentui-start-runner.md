# TS OpenTUI Start Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect `keyloop start` to the TypeScript/OpenTUI shell by adding a `StartRunner` implementation that renders the first unfinished daily lesson.

**Architecture:** Keep CLI planning/storage in `ts/src/cli.ts`. Add `ts/src/ui/opentui/startRunner.ts` as the bridge from `StartRunnerContext` to the renderer adapter. The runner should choose the first unfinished lesson from `DailyPracticePlan`, create a running route, render it once, and return no completed records until the later interactive running loop is implemented.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing TS CLI runner contract, OpenTUI app model and renderer adapter.

---

## File Structure

- Create: `ts/src/ui/opentui/startRunner.ts`
  - Export `createOpenTuiStartRunner`.
  - Select first unfinished lesson from the daily plan.
  - Render a running app state through `renderOpenTuiAppOnce`.
- Modify: `ts/src/main.ts`
  - Pass `createOpenTuiStartRunner()` to `runCli`.
- Modify: `ts/src/index.ts`
  - Export start runner helpers.
- Test: `ts/tests/opentuiStartRunner.test.ts`
  - Verify first unfinished lesson selection and renderer bridge.

## Task 1: Start Runner Tests

**Files:**
- Create: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Write failing start runner tests**

Add tests proving:

- the runner renders the first lesson when nothing is completed;
- it skips lessons already completed for the current daily run;
- it does not render when all lessons are complete.

- [x] **Step 2: Run start runner tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: fail because `createOpenTuiStartRunner` does not exist.

## Task 2: Start Runner Implementation

**Files:**
- Create: `ts/src/ui/opentui/startRunner.ts`
- Modify: `ts/src/index.ts`
- Modify: `ts/src/main.ts`

- [x] **Step 1: Implement runner bridge**

Implement `createOpenTuiStartRunner({ kit })` using the injectable renderer kit. Return `{ completedRecords: [] }` for now.

- [x] **Step 2: Wire main entry**

Pass `createOpenTuiStartRunner()` into `runCli` in `ts/src/main.ts`.

- [x] **Step 3: Run start runner tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: start runner tests pass.

## Task 3: Integrated Verification

**Files:**
- No new source files.

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
