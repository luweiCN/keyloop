# TS OpenTUI Exit Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TS/OpenTUI running lesson 的 `Esc` 行为与 Rust 和迁移文档一致：先暂停并打开退出确认，而不是立即保存 partial。

**Architecture:** 在 app model 中增加 `exit_confirmation` route 和对应文案。`runLessonUntilComplete` 管理当前 renderer，`Esc` 时切到确认 route；确认层支持 `Enter`/`Space`/`Esc`/`Ctrl+P` 恢复，`S` 保存 partial，`M`/`Q` 放弃当前输入并退出 runner。

**Tech Stack:** TypeScript、Bun test、OpenTUI fake renderer、现有 live session record builder。

---

### Task 1: Runner Exit Confirmation Behavior

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`
- Modify: `ts/src/ui/opentui/renderer.ts`

- [x] **Step 1: Write failing resume test**

Add a test named `escape opens exit confirmation and escape resumes practice` to `ts/tests/opentuiStartRunner.test.ts`. It should type `a`, press `Esc`, expect a second key listener and visible `Exit confirmation`, press `b` while confirming, press `Esc` to resume, type `b`, then complete normally. Expect the paused `b` to be ignored, final `user_input` to be `ab`, `duration_ms` to exclude confirmation pause time, and key event timestamps to be active elapsed.

- [x] **Step 2: Write failing partial-save test**

Replace the existing immediate-Esc partial expectation with `exit confirmation s saves non-empty input as a partial session record`. It should type `a`, press `Esc`, confirm the runner has not resolved yet, press `S`, then expect one partial record with the existing lesson metadata.

- [x] **Step 3: Run tests to verify they fail**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "escape opens exit confirmation|exit confirmation s saves"
```

Expected: fail because the current runner saves partial immediately on `Esc` and never renders an exit confirmation route.

- [x] **Step 4: Add exit confirmation route**

Add an `exit_confirmation` case to `OpenTuiRoute`, `openTuiMenuItems`, `openTuiRouteTitle`, `openTuiRouteLines`, and the renderer route switch. The route should render English title `Exit confirmation` and Chinese title `退出确认`; lines should match the Rust semantics: resume with `Enter`/`Space`/`Esc`, save with `S`, discard/menu with `M`, quit/discard with `Q`.

- [x] **Step 5: Implement runner state transitions**

Refactor `runLessonUntilComplete` so it can switch renderer states during the same live session. `Esc` while running should pause and render exit confirmation. Confirmation keys:

- `Enter`/`Space`/`Esc`/`Ctrl+P`: resume and re-render running state.
- `S`: settle with a partial record if input is non-empty; otherwise settle with `null`.
- `M`/`Q`: settle with `null`.
- Other keys: ignored.

- [x] **Step 6: Run focused tests**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "escape opens exit confirmation|exit confirmation s saves"
```

Expected: both focused tests pass.

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
