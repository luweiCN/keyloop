# TS OpenTUI Running Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `keyloop start` run one OpenTUI-backed practice lesson and return a completed `SessionRecord` when the target text has been typed.

**Architecture:** Keep typing semantics in `ts/src/training/liveSession.ts`. Add a small OpenTUI runner loop in `ts/src/ui/opentui/startRunner.ts` that converts renderer key events into `LiveKey`, updates the live session, and returns the completed record. The renderer adapter remains injectable so tests can drive the loop without a real terminal.

**Tech Stack:** TypeScript strict mode, Bun tests, existing `StartRunner` contract, OpenTUI `keyInput` keypress events.

---

## File Structure

- Modify: `ts/src/ui/opentui/renderer.ts`
  - Extend renderer typing with optional `keyInput`, `requestRender`, and root `remove`.
  - Export a small `OpenTuiKeyEvent` shape used by the runner.
- Modify: `ts/src/ui/opentui/startRunner.ts`
  - Add injectable clock support.
  - Add keypress listener lifecycle.
  - Convert OpenTUI keys to `LiveKey`.
  - Build `SessionRecord` from the completed live session.
- Modify: `ts/tests/opentuiStartRunner.test.ts`
  - Add tests for typing a full lesson and preserving lesson metadata.

## Task 1: RED Test

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Add a failing completion test**

Add a test that creates a fake renderer with a controllable key source, runs the start runner, emits `a` and `b`, and expects one completed record with:

- `target_text === "ab"`
- `user_input === "ab"`
- `daily_run_id === plan.run_id`
- `lesson_id === "lesson-foundation"`
- `lesson_index === 0`
- `module === "foundation_input"`
- `category === "foundation_mix"`

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: fail because the runner currently renders once and returns no completed records.

## Task 2: GREEN Implementation

**Files:**
- Modify: `ts/src/ui/opentui/renderer.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`

- [x] **Step 1: Extend renderer adapter types**

Expose the minimal event surface needed by the runner:

```ts
export interface OpenTuiKeyEvent {
  name: string;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
}
```

The renderer type should allow `keyInput.on("keypress", handler)` and `keyInput.off("keypress", handler)` when present.

- [x] **Step 2: Implement live loop in the start runner**

After rendering the running route, create a `LiveSessionState`, subscribe to keypress events, convert keys to `LiveKey`, and resolve when `input.length >= target.length`. Use `sessionRecordFromLiveSession` with daily run and lesson metadata.

- [x] **Step 3: Run focused test and verify GREEN**

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
