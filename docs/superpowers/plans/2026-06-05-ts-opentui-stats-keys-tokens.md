# TS OpenTUI Stats Keys Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TypeScript/OpenTUI Stats pages for key timing stats and token diagnostics using migrated non-UI stats helpers.

**Architecture:** Keep token aggregation in `ts/src/report/stats.ts` and keep OpenTUI state as a pure route model in `ts/src/ui/opentui/appModel.ts`. The stats route gains optional key aggregates and sort state; line rendering dispatches to report helpers.

**Tech Stack:** Bun tests, TypeScript strict mode, existing TS report stats and OpenTUI app model.

---

## File Structure

- Modify: `ts/tests/stats.test.ts`
  - Add RED coverage for `statsTokenLines`.
- Modify: `ts/tests/opentuiApp.test.ts`
  - Add RED coverage for `keys` and `tokens` stats route views and next-view cycling.
- Modify: `ts/tests/opentuiRenderer.test.ts`
  - Add renderer coverage for a key stats view.
- Modify: `ts/src/report/stats.ts`
  - Add `statsTokenLines`.
- Modify: `ts/src/ui/opentui/appModel.ts`
  - Extend `OpenTuiStatsView`.
  - Accept `keyAggregates` and `keyStatsSort` in stats route options.
  - Dispatch `keys` and `tokens` views.
- Modify: `ts/src/index.ts` only if exports are not already covered by barrel exports.
- Modify: this plan document.

## Task 1: RED Stats Helper Test

**Files:**
- Modify: `ts/tests/stats.test.ts`

- [x] **Step 1: Add failing token stats line test**

Add `statsTokenLines` to the imports and assert it renders:

```ts
expect(statsTokenLines([comprehensive, code], 20, "en")).toEqual(
  expect.arrayContaining([
    "Token stats",
    "High-error words/chunks  pending(2)",
    "High-error symbols  =>(2)",
    "Slow tokens  =>(",
  ]),
);
```

- [x] **Step 2: Run stats tests and verify RED**

Run:

```bash
bun test ts/tests/stats.test.ts
```

Expected: fail because `statsTokenLines` is not exported.

## Task 2: RED OpenTUI Route Tests

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/tests/opentuiRenderer.test.ts`

- [x] **Step 1: Add failing OpenTUI app model assertions**

Extend the existing stats route test to assert:

```ts
const keys = createOpenTuiStatsState("en", records, {
  view: "keys",
  keyAggregates: [defaultKeyAggregate({ key: "[", sample_count: 5, avg_ms: 400 })],
});
const tokens = createOpenTuiStatsState("en", records, { view: "tokens" });

expect(openTuiRouteLines(keys)[0]).toBe("Key stats  sort: slowest avg");
expect(openTuiRouteLines(tokens)).toContain("Token stats");
```

Also update next-view cycling so `modules -> keys -> tokens -> code`.

- [x] **Step 2: Add failing renderer assertion**

Add a renderer test for `view: "keys"` proving the rendered content includes `Key stats  sort: slowest avg`.

- [x] **Step 3: Run focused OpenTUI tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiRenderer.test.ts
```

Expected: fail because the route union does not support `keys` or `tokens`.

## Task 3: GREEN Implementation

**Files:**
- Modify: `ts/src/report/stats.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Implement `statsTokenLines`**

Use existing `topProblemTokens`, `topSlowTokens`, `compactProblemText`, and `compactSlowText` to return compact lines:

```text
Token stats
High-error words/chunks  ...
High-error symbols  ...
Slow tokens  ...
```

- [x] **Step 2: Extend stats route model**

Add `keys` and `tokens` to `OpenTuiStatsView`. Add optional `keyAggregates` and `keyStatsSort` to stats route options. Default `keyStatsSort` to `slowest_average`.

- [x] **Step 3: Dispatch new views**

Use:

```ts
keyStatsLines(route.keyAggregates ?? [], route.keyStatsSort ?? "slowest_average", 8, language)
statsTokenLines(route.records, 8, language)
```

Cycle views as:

```text
overview -> today -> modules -> keys -> tokens -> code -> overview
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
