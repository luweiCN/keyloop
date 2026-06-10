# TS CLI Start Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save `current_session.json` before TypeScript `keyloop start` begins the first unfinished lesson, then clear it after completed records are successfully saved.

**Architecture:** Keep checkpoint persistence in `ts/src/cli.ts` because `runStart` owns data directory and storage paths. Reuse existing `saveSessionCheckpointToPath` and `clearSessionCheckpointAtPath`. Use a deterministic TS-side target text hash for checkpoint identity; checkpoint compatibility is transient and only needs stable TS behavior for resume work.

**Tech Stack:** Bun tests, TypeScript strict mode, existing storage model and CLI runner contract.

---

## File Structure

- Modify: `ts/tests/cli.test.ts`
  - Add start dispatch test proving checkpoint is visible before runner executes and removed after completed save.
- Modify: `ts/src/cli.ts`
  - Save checkpoint for the first unfinished daily lesson before invoking the runner.

## Task 1: RED Test

**Files:**
- Modify: `ts/tests/cli.test.ts`

- [x] **Step 1: Add failing checkpoint lifecycle test**

Add a test that runs `runCli(["start"])` with an injected runner. Inside the runner, load `current_session.json` and assert it contains:

- first lesson id as `target_id`;
- `input_len`, `active_ms`, and `idle_ms` equal to `0`;
- current `key_stats.json` snapshot and sample count.

After `runCli` returns with one completed record, assert `current_session.json` no longer exists.

- [x] **Step 2: Run focused CLI tests and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: fail because `runStart` currently clears checkpoints after completed records but never saves one before the runner.

## Task 2: GREEN Implementation

**Files:**
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Save checkpoint before runner**

Find the first unfinished lesson using `daily_run_id`, `lesson_id`, and `completion_state`. Load current key aggregates, compute total key sample count, and save a `SessionCheckpoint`.

- [x] **Step 2: Run focused CLI tests and verify GREEN**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: CLI tests pass.

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
