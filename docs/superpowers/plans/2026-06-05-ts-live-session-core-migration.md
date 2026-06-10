# TS Live Session Core Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port KeyLoop's running-practice input state and live metrics core from Rust to TypeScript.

**Architecture:** Keep the pure runtime state machine in `ts/src/training/liveSession.ts`. The module accepts UI-neutral key descriptions and returns state/events; OpenTUI can map terminal key events into this API later.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing domain model key event types.

---

## File Structure

- Create: `ts/src/training/liveSession.ts`
  - `createLiveSession`, `applyLiveKey`, `liveMetrics`, and small key/result types.
- Modify: `ts/src/index.ts`
  - export the live session module.
- Test: `ts/tests/liveSession.test.ts`
  - Rust-parity tests for input events, non-ASCII ignore, auto-indent, backspace, target limit, and live metrics.

## Task 1: Live Metrics

**Files:**
- Create: `ts/tests/liveSession.test.ts`
- Create: `ts/src/training/liveSession.ts`
- Modify: `ts/src/index.ts`

- [x] **Step 1: Write failing live metrics tests**

Create tests for:

- raw WPM counts backspaced inserts;
- accuracy keeps historical insert errors after backspacing to empty;
- auto-indent events switch WPM correct-char counting to insert correctness, matching Rust.

- [x] **Step 2: Run test and verify RED**

Run:

```bash
bun test ts/tests/liveSession.test.ts
```

Expected: fail because `liveMetrics` is not exported.

- [x] **Step 3: Implement `liveMetrics`**

Port Rust's `live_metrics` formula from `src/trainer/mod.rs`: insert events determine raw WPM and accuracy; auto-indent is not an insert; elapsed uses at least 1 ms.

- [x] **Step 4: Run test and verify GREEN**

Run:

```bash
bun test ts/tests/liveSession.test.ts
```

Expected: live metrics tests pass.

## Task 2: Input State Machine

**Files:**
- Modify: `ts/tests/liveSession.test.ts`
- Modify: `ts/src/training/liveSession.ts`

- [x] **Step 1: Add failing input tests**

Add tests for:

- non-ASCII char increments `ignored_non_ascii` without recording input/events;
- Ctrl/Alt char input is ignored;
- Enter/Tab/Char create insert events with position, expected, input, and correctness;
- Backspace pops input and records a backspace event at the new position;
- correct code newline auto-inserts following spaces as `auto_indent` events;
- input cannot grow beyond target length.

- [x] **Step 2: Run test and verify RED**

Run:

```bash
bun test ts/tests/liveSession.test.ts
```

Expected: fail on missing state-machine exports.

- [x] **Step 3: Implement state machine**

Implement `createLiveSession` and `applyLiveKey` with UI-neutral key descriptors. Keep pause/exit confirmation outside this module because those are screen-phase controls.

- [x] **Step 4: Run test and verify GREEN**

Run:

```bash
bun test ts/tests/liveSession.test.ts
```

Expected: all live session tests pass.

## Task 3: Session Record Bridge

**Files:**
- Modify: `ts/tests/liveSession.test.ts`
- Modify: `ts/src/training/liveSession.ts`

- [x] **Step 1: Add failing record bridge tests**

Add tests for:

- a code target with auto-indent builds a `SessionRecord` with `typed_len` and `correct_chars` counting only user inserts;
- completion state, daily run id, lesson id, lesson index, module, and category are copied from explicit options.

- [x] **Step 2: Run test and verify RED**

Run:

```bash
bun test ts/tests/liveSession.test.ts
```

Expected: fail because `sessionRecordFromLiveSession` is not exported.

- [x] **Step 3: Implement record bridge**

Implement `sessionRecordFromLiveSession` as a thin wrapper around `buildSessionRecord`, then apply optional metadata fields exactly once.

- [x] **Step 4: Run test and verify GREEN**

Run:

```bash
bun test ts/tests/liveSession.test.ts
```

Expected: all live session tests pass.

## Task 4: Integrated Verification

**Files:**
- No new files.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests
bun run typecheck
```

Expected: all TS tests and typecheck pass.

- [x] **Step 2: Run Rust checks**

Run:

```bash
cargo test --locked --all-targets
```

Expected: existing Rust tests pass.

- [x] **Step 3: Check diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.
