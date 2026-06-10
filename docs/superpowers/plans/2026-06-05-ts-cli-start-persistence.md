# TS CLI Start Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist completed `SessionRecord`s returned by the TypeScript `StartRunner` to `sessions.jsonl`.

**Architecture:** Keep session creation inside the runner and storage ownership inside `ts/src/cli.ts`. `runStart` should append each completed record through the existing storage helper, then clear the current session checkpoint and return the existing completion summary.

**Tech Stack:** Bun tests, TypeScript strict mode, existing `appendSessionToPath` and `loadSessionsFromPath` storage helpers.

---

## File Structure

- Modify: `ts/tests/cli.test.ts`
  - Add a start command dispatch test proving completed records are appended.
- Modify: `ts/src/cli.ts`
  - Import `appendSessionToPath`.
  - Append every completed record returned by the runner.

## Task 1: RED Test

**Files:**
- Modify: `ts/tests/cli.test.ts`

- [x] **Step 1: Add failing start persistence test**

Add a test that runs `runCli(["start"])` with an injected runner returning one `defaultSessionRecord`, then loads `sessions.jsonl` and expects that record to be present.

- [x] **Step 2: Run focused CLI tests and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: fail because `runStart` reports completion but does not append records.

## Task 2: GREEN Implementation

**Files:**
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Append completed records in runStart**

After the runner returns non-empty `completedRecords`, append each record to `sessionLogPath(dataDir)` with `appendSessionToPath`.

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

Expected: existing Rust tests pass. If the known code specialist picker test flakes, rerun the focused test and the full suite once before treating it as a code failure.

- [x] **Step 3: Check diff hygiene and TS entry**

Run:

```bash
git diff --check
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI non-start entry still runs.
