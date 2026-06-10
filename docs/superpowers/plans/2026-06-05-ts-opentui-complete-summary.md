# TS OpenTUI Complete Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add testable OpenTUI completion and daily-summary routes so the TS app shell can represent the post-lesson and post-run pages required by the migration spec.

**Architecture:** Keep route state and localized text in `ts/src/ui/opentui/appModel.ts`; keep OpenTUI component construction in `ts/src/ui/opentui/renderer.ts`. This slice does not change runner timing or persistence behavior.

**Tech Stack:** Bun tests, TypeScript strict mode, existing report/stat helpers.

---

## File Structure

- Modify: `ts/tests/opentuiApp.test.ts`
  - Add app-model tests for completion and summary routes.
- Modify: `ts/tests/opentuiRenderer.test.ts`
  - Add renderer coverage for complete and summary routes.
- Modify: `ts/src/ui/opentui/appModel.ts`
  - Add `complete` and `summary` route variants.
  - Add pure helpers for title and panel lines.
- Modify: `ts/src/ui/opentui/renderer.ts`
  - Render the new routes through the same panel renderer.

## Task 1: RED App Model Tests

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Add failing route tests**

Add tests proving:

- `createOpenTuiCompletionState` returns a `complete` route and exposes localized WPM, raw WPM, accuracy, error, backspace, and next-lesson lines;
- `createOpenTuiSummaryState` returns a `summary` route and aggregates active time, WPM, accuracy, error, and backspace counts across returned records.

- [x] **Step 2: Run OpenTUI app model tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: fail because completion and summary helpers do not exist.

## Task 2: GREEN App Model Implementation

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Implement route variants and line helpers**

Add `complete` and `summary` variants to `OpenTuiRoute`. Add `createOpenTuiCompletionState`, `createOpenTuiSummaryState`, `openTuiRouteTitle`, and `openTuiRouteLines`.

- [x] **Step 2: Run OpenTUI app model tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: OpenTUI app model tests pass.

## Task 3: Renderer Coverage

**Files:**
- Modify: `ts/tests/opentuiRenderer.test.ts`
- Modify: `ts/src/ui/opentui/renderer.ts`

- [x] **Step 1: Add failing renderer tests**

Add tests proving rendered complete and summary routes contain the title and metric text.

- [x] **Step 2: Run renderer tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiRenderer.test.ts
```

Expected: fail until the renderer delegates panel copy to the new route helpers.

- [x] **Step 3: Implement renderer route support**

Use `openTuiRouteTitle` and `openTuiRouteLines` for non-menu routes, including running, settings, stats, complete, and summary.

- [x] **Step 4: Run renderer tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiRenderer.test.ts
```

Expected: renderer tests pass.

## Task 4: Integrated Verification

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
