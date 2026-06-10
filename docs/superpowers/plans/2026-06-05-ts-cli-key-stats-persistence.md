# TS CLI Key Stats Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `key_stats.json` from completed `SessionRecord.key_events` after TypeScript `keyloop start` saves completed sessions.

**Architecture:** Keep per-key aggregation semantics in `ts/src/storage/keyloopStore.ts` through the existing `observeKeyEvent` helper. `runStart` owns persistence: load existing aggregates, replay each completed record's key events in order, save the updated aggregate file.

**Tech Stack:** Bun tests, TypeScript strict mode, existing storage helpers and Rust-compatible key aggregate model.

---

## File Structure

- Modify: `ts/tests/cli.test.ts`
  - Add a start dispatch test proving key events update `key_stats.json`.
- Modify: `ts/src/cli.ts`
  - Import key aggregate load/save/observe helpers.
  - Replay completed record key events with Rust-compatible key intervals.

## Task 1: RED Test

**Files:**
- Modify: `ts/tests/cli.test.ts`

- [x] **Step 1: Add failing key stats persistence test**

Add a test that runs `runCli(["start"])` with a runner returning one completed record containing insert, auto-indent, and wrong insert key events. Load `key_stats.json` and assert:

- auto-indent does not create an aggregate;
- the first key has a zero interval sample;
- the wrong insert is counted as a miss;
- the wrong insert interval is measured from the preceding auto-indent event.

- [x] **Step 2: Run focused CLI tests and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: fail because `runStart` currently appends sessions but does not update key stats.

## Task 2: GREEN Implementation

**Files:**
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Replay completed key events into aggregates**

For each completed record, process `record.key_events` in order. Compute `intervalMs` as `event.at_ms - previous.at_ms`, saturating at zero, and update the previous timestamp for every event including auto-indent.

- [x] **Step 2: Save updated aggregates**

Load `key_stats.json` before replay, call `observeKeyEvent`, and save back with `saveKeyAggregatesToPath`.

- [x] **Step 3: Run focused CLI tests and verify GREEN**

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
