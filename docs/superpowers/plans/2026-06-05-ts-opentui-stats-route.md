# TS OpenTUI Stats Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the OpenTUI Stats placeholder with a real overview page backed by migrated TypeScript statistics logic.

**Architecture:** Keep stats aggregation in `ts/src/report/stats.ts`. Store only the records needed by the OpenTUI `stats` route in `ts/src/ui/opentui/appModel.ts`, and render overview lines through existing `openTuiRouteLines`/renderer plumbing.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI app model and stats helpers.

---

## File Structure

- Modify: `ts/tests/opentuiApp.test.ts`
  - Add RED coverage proving main-menu Stats uses records from context and renders overview metrics.
- Modify: `ts/tests/opentuiRenderer.test.ts`
  - Add renderer coverage proving a stats route renders real stats text, not placeholder copy.
- Modify: `ts/src/ui/opentui/appModel.ts`
  - Extend the `stats` route to carry session records.
  - Add `createOpenTuiStatsState`.
  - Make `openTuiRouteLines` delegate to `statsOverviewLines`.
- Modify: this plan document.

## Task 1: RED App Model Test

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Add failing stats route test**

Add a test proving:

- selecting Stats from the main menu creates a `stats` route with context records;
- `openTuiRouteLines` returns overview text containing session count, active time, WPM, accuracy, errors, and focus lines.

- [x] **Step 2: Run app model tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: fail because Stats still renders placeholder text.

## Task 2: GREEN App Model Implementation

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Implement stats route records**

Add `createOpenTuiStatsState(language, records)` and change main-menu Stats activation to pass `context.records`.

- [x] **Step 2: Render overview lines**

Use `statsOverviewLines(records, 8, language)` for `stats` route lines.

- [x] **Step 3: Run app model tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
```

Expected: OpenTUI app model tests pass.

## Task 3: Renderer Coverage

**Files:**
- Modify: `ts/tests/opentuiRenderer.test.ts`

- [x] **Step 1: Add failing renderer test**

Add a test proving rendered Stats content includes `Overview` and average WPM from supplied records.

- [x] **Step 2: Run renderer tests**

Run:

```bash
bun test ts/tests/opentuiRenderer.test.ts
```

Expected: renderer tests pass once app model routes expose real stats lines.

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
