# TS OpenTUI Ctrl-C Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TypeScript/OpenTUI start runner honor the migration contract that `Ctrl+C` exits the running TUI loop without saving a partial or completed record.

**Architecture:** Keep the behavior in `startRunner.ts` because it owns the running lesson key loop. Add a small predicate for `Ctrl+C` and check it before pause/typing handling in the running state. Do not change plain `q` typing semantics while running.

**Tech Stack:** TypeScript strict mode, Bun tests, existing fake OpenTUI renderer kit.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Add Ctrl-C exit test**

Start a one-lesson runner, wait for the key listener, emit `{ ctrl: true, name: "c", sequence: "c" }`, and assert the runner returns `{ completedRecords: [] }` without calling `saveRecord`.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "ctrl-c exits running lesson without saving"`

Expected: fail because the current running loop does not settle on `Ctrl+C`.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/ui/opentui/startRunner.ts`

- [x] **Step 1: Add Ctrl-C predicate**

Add `isCtrlCEvent()` that returns true when `event.ctrl` is true, `event.meta` is false, and either sequence or name is `c` case-insensitively.

- [x] **Step 2: Settle running loop on Ctrl-C**

In the normal running branch, before pause and typing handling, call `settle(null)` for `Ctrl+C`. This exits without saving a record.

### Task 3: Regression Gates

**Files:**
- No additional source files expected.

- [x] **Step 1: Run focused checks**

Run:
- `bun test ts/tests/opentuiStartRunner.test.ts`
- `bun run typecheck`

Expected: all pass.

- [x] **Step 2: Run full checks**

Run:
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `bun run build`
- `git diff --check`

Expected: all pass.
