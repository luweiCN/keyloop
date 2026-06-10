# TS Running Live Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live input, WPM, raw WPM, accuracy, errors, and backspaces on the OpenTUI running screen, and refresh those values after typing.

**Architecture:** Keep live metric formatting in `appModel` so rendering stays declarative. Add a renderer-level `renderState` helper that replaces the current root panel by id, then let `startRunner` recompute running state from the live session after every accepted key.

**Tech Stack:** Bun tests, TypeScript, OpenTUI renderer adapter, existing `liveMetrics` training core.

---

### Task 1: Running Route Live Lines

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`
- Test: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Write the failing test**

Add a test that builds a `running` route with `live` data and expects:

```ts
expect(openTuiRouteLines(state)).toEqual([
  "foundation_input",
  "abc",
  "Input: ax",
  "WPM 12.3 | Raw WPM 18.8 | Accuracy 66.7%",
  "Errors 1 | Backspace 2",
]);
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: FAIL because running routes do not currently accept/render `live`.

- [x] **Step 3: Add minimal model support**

Add `OpenTuiRunningLiveState` with `input` and `metrics`, allow it on the `running` route, and append formatted live lines in `runningRouteLines`.

- [x] **Step 4: Run model test to verify it passes**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: PASS.

### Task 2: Runner Refreshes Live Metrics

**Files:**
- Modify: `ts/src/ui/opentui/renderer.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`
- Test: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Write the failing test**

Add a runner test that starts a single lesson `ab`, emits `a`, and expects the rendered content after the keypress to include:

```ts
"Input: a"
"WPM 120.0 | Raw WPM 120.0 | Accuracy 100.0%"
"Errors 0 | Backspace 0"
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: FAIL because the runner only calls `requestRender` and the rendered route has no live state.

- [x] **Step 3: Add renderer replacement API**

Give `renderOpenTuiAppOnce` a returned `renderState(state)` method. It removes the previous root node id when available, adds a freshly rendered route with the same id, idles, and requests render.

- [x] **Step 4: Update runner state after accepted keys**

Import `liveMetrics`, compute metrics from the live session and active elapsed time, and call `renderer.renderState(runningStateForLesson(...))` with the live data after each accepted key and pause/resume transition.

- [x] **Step 5: Run runner test to verify it passes**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: PASS.

### Task 3: Full Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-running-live-metrics.md`

- [x] **Step 1: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 2: Run repository verification**

Run:

```bash
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: Rust tests pass, TS build passes, and diff whitespace check is clean.

- [x] **Step 3: Mark this plan complete**

Check all boxes in this file only after the corresponding verification output has been read.
