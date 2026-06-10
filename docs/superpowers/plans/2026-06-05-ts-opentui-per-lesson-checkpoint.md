# TS OpenTUI Per-Lesson Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TS/OpenTUI 连续综合练习在每节课开始时更新 `current_session.json` checkpoint，而不是只在进入 runner 前保存第一节课。

**Architecture:** `StartRunnerContext` 增加可选 `saveCheckpoint(lesson, target)` 回调。CLI 注入该回调并复用现有 checkpoint 写入逻辑；OpenTUI start runner 在每次实际开始 lesson 前调用回调，使用已经刷新后的 lesson target。

**Tech Stack:** TypeScript、Bun test、现有 OpenTUI start runner 和 CLI storage。

---

### Task 1: OpenTUI Runner Callback

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write the failing runner test**

Add a test that runs a two-lesson plan through `createOpenTuiStartRunner`, provides `saveCheckpoint` in the context, completes the first lesson, continues to the second, then stops. Expect the callback to have been called for both `lesson-foundation` and `lesson-everyday` with target texts `a` and `b`.

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "saves checkpoint callback for each started lesson"`

Expected: fail because the runner never calls a checkpoint callback.

### Task 2: CLI Callback Injection

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write the failing CLI test**

Add a test with injected `runner` that asserts `context.saveCheckpoint` exists, calls it with a known target text, then reads `current_session.json` and verifies the target hash matches that target.

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "start runner context exposes checkpoint saver"`

Expected: fail because `saveCheckpoint` is not provided.

- [x] **Step 3: Implement context callback and runner call**

Add `saveCheckpoint?: (lesson: PracticeLesson, target: PracticeTarget) => Promise<void>` to `StartRunnerContext`. In `runStartRunner`, pass a callback that writes `current_session.json` using existing key aggregate snapshot and target hash logic. In `openTuiStartRunner`, call it before rendering each selected lesson and ignore callback errors so practice can continue.

- [x] **Step 4: Run focused tests**

Run both focused test-name commands from this plan.

Expected: both pass.

### Task 3: Verification

**Files:**
- Test: `ts/tests/opentuiStartRunner.test.ts`
- Test: `ts/tests/cli.test.ts`
- Test: all TS tests
- Test: Rust regression suite

- [x] **Step 1: Run focused test files**

Run: `bun test ts/tests/opentuiStartRunner.test.ts ts/tests/cli.test.ts`

Expected: both files pass.

- [x] **Step 2: Run TS full suite and typecheck**

Run: `bun test ts/tests && bun run typecheck`

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run Rust regression suite**

Run: `cargo test --locked --all-targets`

Expected: Rust tests still pass.

- [x] **Step 4: Run build and diff hygiene**

Run: `bun run build && git diff --check`

Expected: bundle succeeds and no whitespace errors.
