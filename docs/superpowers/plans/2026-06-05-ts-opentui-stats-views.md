# TS OpenTUI Stats Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real OpenTUI stats subviews for Today, Modules, and Code using existing migrated TypeScript stats helpers.

**Architecture:** Keep the route model pure in `ts/src/ui/opentui/appModel.ts`. Extend the `stats` route with a typed `view`, route options, and a small next-view helper; delegate line generation to `statsOverviewLines`, `statsTodayLines`, `statsModuleLines`, and `statsCodeLines`.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI app model and `ts/src/report/stats.ts`.

---

## File Structure

- Modify: `ts/tests/opentuiApp.test.ts`
  - Add RED coverage for `today`, `modules`, `code`, and next-view cycling.
- Modify: `ts/tests/opentuiRenderer.test.ts`
  - Add renderer coverage for a non-overview stats view.
- Modify: `ts/src/ui/opentui/appModel.ts`
  - Add `OpenTuiStatsView`.
  - Add `OpenTuiStatsStateOptions`.
  - Extend the stats route with `view` and optional `now`.
  - Add `nextOpenTuiStatsView`.
  - Dispatch stats route lines by view.
- Modify: this plan document.

## Task 1: RED App Model Tests

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Add failing stats view tests**

Add tests proving:

- `createOpenTuiStatsState("en", records, { view: "today", now })` renders Today lines;
- `view: "modules"` renders module driver and module summary lines;
- `view: "code"` renders code summary lines;
- `nextOpenTuiStatsView` advances `overview -> today` and preserves records/options.

- [x] **Step 2: Run app model tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: fail because stats route currently only supports overview.

## Task 2: GREEN App Model Implementation

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Add stats view route model**

Add `OpenTuiStatsView = "overview" | "today" | "modules" | "code"` and route options with optional `view` and `now`.

- [x] **Step 2: Dispatch stats lines by view**

Use:

- `statsOverviewLines(records, 8, language)`
- `statsTodayLines(records, 8, language, { now })`
- `statsModuleLines(records, 8, language)`
- `statsCodeLines(records, 8, language)`

- [x] **Step 3: Add next-view helper**

Implement `nextOpenTuiStatsView(state)` so non-stats states are returned unchanged and stats states cycle through the four supported views.

- [x] **Step 4: Run app model tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: OpenTUI app model tests pass.

## Task 3: Renderer Coverage

**Files:**
- Modify: `ts/tests/opentuiRenderer.test.ts`

- [x] **Step 1: Add renderer test for modules stats view**

Add a test proving rendered stats content includes a module-driver line from `view: "modules"`.

- [x] **Step 2: Run renderer tests**

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
