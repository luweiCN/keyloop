# TS Start Checkpoint Refreshed Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TS `start` 保存的 `current_session.json.target_hash` 对齐实际开始练习时刷新后的 target，而不是复用 stale daily plan 里的旧 target。

**Architecture:** 复用已有 `refreshModuleMixTarget`。`saveStartCheckpoint` 接收完整 `StartRunnerContext`，在存在 `targetContext` 且当前 lesson 是 comprehensive 时，用最新 records 和 target context 刷新 target；刷新失败则保持旧 target，维持迁移文档中的 fallback 语义。

**Tech Stack:** TypeScript、Bun test、现有 CLI storage/checkpoint 路径。

---

### Task 1: CLI Checkpoint Red Test

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write the failing test**

Add a CLI test that writes a stale `daily_runs.json` with a first programming basics lesson target text `"fallback"`, then runs `keyloop start` with an injected runner. Inside the runner, read `current_session.json`, compute the expected refreshed target via `refreshModuleMixTarget(lesson, context.targetContext)`, hash it with the same FNV-1a algorithm, and assert checkpoint hash equals the refreshed hash.

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "start checkpoint hashes refreshed target"`

Expected: fail because current checkpoint hashes `"fallback"`.

- [x] **Step 3: Implement refreshed checkpoint target selection**

Change `saveStartCheckpoint` to accept `StartRunnerContext` instead of separate plan/records. Add a helper that refreshes the selected lesson target when `targetContext` is available and `dailyPlan.run_id` is non-empty.

- [x] **Step 4: Run test to verify it passes**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "start checkpoint hashes refreshed target"`

Expected: pass.

### Task 2: Verification

**Files:**
- Test: `ts/tests/cli.test.ts`
- Test: all TS tests
- Test: Rust regression suite

- [x] **Step 1: Run focused CLI tests**

Run: `bun test ts/tests/cli.test.ts`

Expected: all CLI tests pass.

- [x] **Step 2: Run TS full suite and typecheck**

Run: `bun test ts/tests && bun run typecheck`

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run Rust regression suite**

Run: `cargo test --locked --all-targets`

Expected: Rust tests still pass.

- [x] **Step 4: Run build and diff hygiene**

Run: `bun run build && git diff --check`

Expected: bundle succeeds and there are no whitespace errors.
