# TS OpenTUI Ctrl-P Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TS/OpenTUI running lesson 支持 Rust 等价的 `Ctrl+P` 暂停/恢复，并把暂停时间从练习计时和 key event 时间中扣除。

**Architecture:** `runLessonUntilComplete` 内维护 `pausedAtMs` 和 `pausedTotalMs`，用 active elapsed 替代 wall elapsed。暂停状态下只接受 `Ctrl+P` 恢复，普通输入不写入 live session；完成或 partial record 写入 `manual_pause_ms`。

**Tech Stack:** TypeScript、Bun test、OpenTUI runner fake kit、现有 live session metrics。

---

### Task 1: Runner Pause Semantics

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`

- [x] **Step 1: Write the failing pause test**

Add a test named `ctrl-p pauses and resumes without counting paused time` to `ts/tests/opentuiStartRunner.test.ts`. It should start a two-character lesson, type `a`, press `Ctrl+P`, press `b` while paused, resume with `Ctrl+P`, then type `b`. Expect the paused `b` to be ignored, `duration_ms` to be `300`, `manual_pause_ms` to be `500`, and key event timestamps to be `[100, 300]`.

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "ctrl-p pauses and resumes without counting paused time"`

Expected: fail because the current runner treats `Ctrl+P` as an ignored character and still counts wall-clock time.

- [x] **Step 3: Implement minimal pause state**

In `runLessonUntilComplete`, add local pause state:

```ts
let pausedAtMs: number | undefined;
let pausedTotalMs = 0;
```

Add helpers inside the promise:

```ts
const activeElapsedMs = (currentMs: number): number => {
  const wallElapsed = Math.max(currentMs - startedAtMs, 0);
  const currentPause =
    pausedAtMs === undefined
      ? 0
      : Math.max(currentMs - pausedAtMs, 0);
  return Math.max(wallElapsed - pausedTotalMs - currentPause, 0);
};
const togglePause = (currentMs: number): void => {
  if (pausedAtMs === undefined) {
    pausedAtMs = currentMs;
    return;
  }
  pausedTotalMs += Math.max(currentMs - pausedAtMs, 0);
  pausedAtMs = undefined;
};
```

Handle `Ctrl+P` before normal input. When paused, ignore all non-`Ctrl+P` events. Pass `manual_pause_ms: pausedTotalMs` into `sessionRecordFromLiveSession` for both completed and partial records.

- [x] **Step 4: Run focused test**

Run: `bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "ctrl-p pauses and resumes without counting paused time"`

Expected: pass.

### Task 2: Verification

**Files:**
- Test: `ts/tests/opentuiStartRunner.test.ts`
- Test: all TS tests
- Test: Rust regression suite

- [x] **Step 1: Run focused runner file**

Run: `bun test ts/tests/opentuiStartRunner.test.ts`

Expected: runner tests pass.

- [x] **Step 2: Run TS full suite and typecheck**

Run: `bun test ts/tests && bun run typecheck`

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run Rust regression suite**

Run: `cargo test --locked --all-targets`

Expected: Rust tests still pass.

- [x] **Step 4: Run build and diff hygiene**

Run: `bun run build && git diff --check`

Expected: bundle succeeds and no whitespace errors.
