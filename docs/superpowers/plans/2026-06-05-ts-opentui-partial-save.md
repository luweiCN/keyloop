# TS OpenTUI Partial Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the TypeScript/OpenTUI runner save a non-empty in-progress lesson as a `partial` `SessionRecord` when Escape is pressed.

**Architecture:** Keep typing state in `ts/src/training/liveSession.ts`. Extend `ts/src/ui/opentui/startRunner.ts` so Escape resolves the current lesson with a partial record when input is non-empty. Existing `runCli start` persistence already appends returned records, clears checkpoint after saved records, and updates key stats.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI runner adapter.

---

## File Structure

- Modify: `ts/tests/opentuiStartRunner.test.ts`
  - Add a runner test for typing part of a target then pressing Escape.
- Modify: `ts/src/ui/opentui/startRunner.ts`
  - Detect Escape key events.
  - Resolve a partial record when current input is non-empty.

## Task 1: RED Test

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Add failing partial save test**

Add a test that types `a` into target `abc`, emits Escape, and expects one returned record with:

- `completion_state === "partial"`;
- `user_input === "a"`;
- `target_text === "abc"`;
- lesson metadata copied from the daily lesson;
- renderer destroyed.

- [x] **Step 2: Run focused start runner tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: fail because Escape is currently ignored by the runner.

## Task 2: GREEN Implementation

**Files:**
- Modify: `ts/src/ui/opentui/startRunner.ts`

- [x] **Step 1: Add Escape detection**

Treat OpenTUI key events with `name` equal to `escape`/`esc` or sequence `\x1b` as an exit request, separate from regular `LiveKey` input.

- [x] **Step 2: Resolve partial record**

When Escape is pressed and input is non-empty, unsubscribe the key handler, destroy the renderer, and return `sessionRecordFromLiveSession` with `completion_state: "partial"`.

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
