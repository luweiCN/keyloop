# TS OpenTUI Stats Comprehensive Daily Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TypeScript/OpenTUI Stats pages for full-practice runs and daily detail, matching the remaining Rust stats page contracts that are not yet represented in TS.

**Architecture:** Keep stats aggregation and printable line construction in `ts/src/report/stats.ts`. Extend the pure OpenTUI app model in `ts/src/ui/opentui/appModel.ts` with `comprehensive` and `daily` views, including a clamped daily index for date selection.

**Tech Stack:** Bun tests, TypeScript strict mode, existing migrated TS stats helpers.

---

## File Structure

- Modify: `ts/tests/stats.test.ts`
  - Add RED coverage for `statsComprehensiveLines` and `statsDayLines`.
- Modify: `ts/tests/opentuiApp.test.ts`
  - Add RED coverage for `comprehensive` and `daily` route views and next-view cycling.
- Modify: `ts/tests/opentuiRenderer.test.ts`
  - Add renderer coverage for daily stats view.
- Modify: `ts/src/report/stats.ts`
  - Add `statsComprehensiveLines` and `statsDayLines`.
- Modify: `ts/src/ui/opentui/appModel.ts`
  - Extend `OpenTuiStatsView`.
  - Add `dailyIndex` route option.
  - Dispatch comprehensive and daily stats views.
- Modify: this plan document.

## Task 1: RED Stats Helper Tests

**Files:**
- Modify: `ts/tests/stats.test.ts`

- [x] **Step 1: Add failing comprehensive and daily line tests**

Import `statsComprehensiveLines` and `statsDayLines`. Add assertions proving:

```ts
expect(statsComprehensiveLines([comprehensive, code], 20, "en")).toEqual(
  expect.arrayContaining([
    "Full practice runs",
    expect.stringContaining("20260605-1  1 groups | 1 modules | active 1m | WPM 18.0"),
  ]),
);
expect(statsDayLines("2026-06-05", 0, 1, [comprehensive, code], 3, "en")).toEqual(
  expect.arrayContaining([
    "Date 2026-06-05  (1/1)  Left/Right switches date",
    expect.stringContaining("Day 2 sessions | 2m | active 1m 30s | idle 0s"),
    expect.stringContaining("Target ["),
  ]),
);
```

- [x] **Step 2: Run stats tests and verify RED**

Run:

```bash
bun test ts/tests/stats.test.ts
```

Expected: fail because the new helpers are not exported.

## Task 2: RED OpenTUI Route Tests

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/tests/opentuiRenderer.test.ts`

- [x] **Step 1: Add failing app model assertions**

Extend the existing stats route test to assert:

```ts
const comprehensive = createOpenTuiStatsState("en", records, { view: "comprehensive" });
const daily = createOpenTuiStatsState("en", records, { view: "daily", dailyIndex: 0 });

expect(openTuiRouteLines(comprehensive)[0]).toBe("Full practice runs");
expect(openTuiRouteLines(daily)[0]).toBe("Date 2026-06-05  (1/1)  Left/Right switches date");
```

Update next-view cycling so `today -> comprehensive -> modules` and `code -> daily -> overview`.

- [x] **Step 2: Add failing renderer assertion**

Add a renderer test for `view: "daily"` proving rendered content includes `Date 2026-06-05`.

- [x] **Step 3: Run focused OpenTUI tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiRenderer.test.ts
```

Expected: fail because the route union does not support `comprehensive` or `daily`.

## Task 3: GREEN Implementation

**Files:**
- Modify: `ts/src/report/stats.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Implement `statsComprehensiveLines`**

Group records by non-empty `daily_run_id`, sort groups by latest `started_at` descending, then render compact run lines:

```text
Full practice runs
<run_id>  <n> groups | <m> modules | active <duration> | WPM <value>
```

- [x] **Step 2: Implement `statsDayLines`**

Accept a date key string, index, total date count, day records, max session count, and language. Render the Rust-compatible compact daily header, target progress line, day words, day keys, and session summary lines.

- [x] **Step 3: Extend stats route model and dispatch**

Add `comprehensive` and `daily` to `OpenTuiStatsView`. Add optional `dailyIndex` to route options. For daily view, derive dates from `statsDatesFromRecords`, clamp the daily index, filter records by selected date, and pass them to `statsDayLines`.

Cycle views as:

```text
overview -> today -> comprehensive -> modules -> keys -> tokens -> code -> daily -> overview
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
bun test ts/tests/stats.test.ts ts/tests/opentuiApp.test.ts ts/tests/opentuiRenderer.test.ts
```

Expected: focused tests pass.

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
