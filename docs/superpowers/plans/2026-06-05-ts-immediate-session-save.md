# TS Immediate Session Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TS/OpenTUI 在 lesson 完成或 partial save 时立即保存 session、清 checkpoint、刷新 key stats，而不是等 runner 完整返回后批量保存。

**Architecture:** `StartRunnerContext` 增加可选 `saveRecord(record)` 回调。CLI 注入该回调并复用 append session、update key stats、clear checkpoint 逻辑；OpenTUI runner 在 completed/partial record 生成时调用回调。CLI 保留兼容路径：如果自定义 runner 只返回 records 但不调用 `saveRecord`，CLI 仍会保存；如果 runner 已调用 `saveRecord`，返回后按 record id 去重，避免重复 append。

**Tech Stack:** TypeScript、Bun test、现有 storage/key stats/checkpoint APIs、OpenTUI start runner fake kit。

---

### Task 1: Runner Immediate Save Callback

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write failing runner test**

Add a test named `saves completed lesson record before completion page is dismissed`. It should run a single-character lesson with `saveRecord` in the context, type the character, wait for the completion page key listener, and assert that `saveRecord` has already been called once before pressing Enter on the completion page.

- [x] **Step 2: Run runner red test**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "saves completed lesson record before completion page is dismissed"
```

Expected: fail because OpenTUI runner currently only returns records; it does not call a save callback.

### Task 2: CLI Save Callback Persistence

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write failing CLI test**

Add a test named `start runner context saveRecord persists immediately and avoids duplicate append`. The injected runner should call `context.saveRecord(record)`, then read `sessions.jsonl`, `key_stats.json`, and `current_session.json` before returning. Expect the record to be present immediately, key stats updated, checkpoint cleared, and after `runCli` completes the session log should still contain the record only once.

- [x] **Step 2: Run CLI red test**

Run:

```bash
bun test ts/tests/cli.test.ts --test-name-pattern "start runner context saveRecord persists immediately and avoids duplicate append"
```

Expected: fail because `saveRecord` is not provided.

- [x] **Step 3: Implement CLI callback and de-dup path**

Add `saveRecord?: (record: SessionRecord) => Promise<void>` to `StartRunnerContext`. In `runStartRunner`, create `persistedRecordIds`, pass `saveRecord` to the runner, and extract `saveSessionRecord(record, dataDir)` that appends the JSONL row, updates key stats for that record, and clears `current_session.json`. After runner returns, save only records whose id was not saved through the callback.

- [x] **Step 4: Implement OpenTUI runner callback call**

In `runLessonUntilComplete`, when a completed or partial record is built, call `await context.saveRecord?.(record)` before settling or showing the completion page. Keep returning the record so existing caller code and tests can still use `completedRecords`.

- [x] **Step 5: Run focused tests**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "saves completed lesson record before completion page is dismissed"
bun test ts/tests/cli.test.ts --test-name-pattern "start runner context saveRecord persists immediately and avoids duplicate append"
```

Expected: both focused tests pass.

### Task 3: Verification

**Files:**
- Test: `ts/tests/opentuiStartRunner.test.ts`
- Test: `ts/tests/cli.test.ts`
- Test: all TS tests
- Test: Rust regression suite

- [x] **Step 1: Run focused test files**

Run: `bun test ts/tests/opentuiStartRunner.test.ts ts/tests/cli.test.ts`

Expected: focused files pass.

- [x] **Step 2: Run TS full suite and typecheck**

Run: `bun test ts/tests && bun run typecheck`

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run Rust regression suite**

Run: `cargo test --locked --all-targets`

Expected: Rust tests still pass.

- [x] **Step 4: Run build and diff hygiene**

Run: `bun run build && git diff --check`

Expected: bundle succeeds and no whitespace errors.
