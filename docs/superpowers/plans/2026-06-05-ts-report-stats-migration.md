# TS Report and Stats Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port KeyLoop's non-UI report and stats aggregation contracts from Rust to TypeScript.

**Architecture:** Keep CLI printable report text in `ts/src/report/report.ts` and reusable stats aggregation in `ts/src/report/stats.ts`. The TS modules return plain strings and data objects; OpenTUI can style/render them later without owning formulas.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing TS domain model, existing adaptive plan and content modules.

---

## File Structure

- Create: `ts/src/report/report.ts`
  - `todayReport`, `planReport`, `sessionSummary`, `importPreview`, `sourceCatalogReport`.
  - Local-date filtering accepts an injectable `now` for deterministic tests.
- Create: `ts/src/report/stats.ts`
  - shared helpers: effective typed length, effective active time, aggregate WPM, weighted accuracy, token/key problem aggregation, stats line builders.
- Modify: `ts/src/index.ts`
  - export both report modules.
- Test: `ts/tests/report.test.ts`
  - CLI report text and formulas.
- Test: `ts/tests/stats.test.ts`
  - aggregation helpers and stats line builders.

## Task 1: CLI Report Text

**Files:**
- Create: `ts/tests/report.test.ts`
- Create: `ts/src/report/report.ts`
- Modify: `ts/src/index.ts`

- [x] **Step 1: Write failing report tests**

Create `ts/tests/report.test.ts` with tests for:

- no sessions today returns the recommendation and `keyloop start`;
- today report uses active time for WPM/raw WPM and weighted saved accuracy;
- comprehensive vs standalone records are split by non-empty `daily_run_id`;
- legacy `error_tokens` populate word/symbol sections;
- plan report includes the four-module default path;
- session/source/import reports render stable text.

- [x] **Step 2: Run report tests and verify RED**

Run:

```bash
bun test ts/tests/report.test.ts
```

Expected: fail because report exports do not exist.

- [x] **Step 3: Implement minimal report module**

Implement `todayReport`, `planReport`, `sessionSummary`, `importPreview`, and `sourceCatalogReport`. Use the formulas from `docs/ts-opentui-migration.md` section 21 and the labels from `src/report.rs`.

- [x] **Step 4: Run report tests and verify GREEN**

Run:

```bash
bun test ts/tests/report.test.ts
```

Expected: pass.

## Task 2: Stats Aggregations

**Files:**
- Create: `ts/tests/stats.test.ts`
- Create: `ts/src/report/stats.ts`
- Modify: `ts/src/index.ts`

- [x] **Step 1: Write failing stats tests**

Create `ts/tests/stats.test.ts` with tests for:

- weighted accuracy uses `typed_len`, and legacy records fall back to `max(user_input.length, correct_chars)`;
- aggregate WPM uses total correct chars and total effective active time;
- top problem tokens score `errors * 1000 + start_delay_ms + duration_ms / 2`;
- slow tokens score `start_delay_ms + duration_ms / 2 + errors * 750`;
- key errors use key-event expected/input buckets and legacy `error_chars` fallback;
- overview/today/module/code lines expose the same numbers as Rust without Ratatui styling.

- [x] **Step 2: Run stats tests and verify RED**

Run:

```bash
bun test ts/tests/stats.test.ts
```

Expected: fail because stats exports do not exist.

- [x] **Step 3: Implement minimal stats module**

Implement `effectiveTypedLen`, `effectiveActiveMs`, `aggregateWpm`, `weightedAccuracy`, `recordErrorRate`, `topProblemTokens`, `topSlowTokens`, `aggregateKeyErrors`, `statsOverviewLines`, `statsTodayLines`, `statsModuleLines`, `statsCodeLines`, and sort helpers needed by tests.

- [x] **Step 4: Run stats tests and verify GREEN**

Run:

```bash
bun test ts/tests/stats.test.ts
```

Expected: pass.

## Task 3: Integrated Verification

**Files:**
- No new files.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests
bun run typecheck
```

Expected: all TS tests and typecheck pass.

- [x] **Step 2: Run Rust checks**

Run:

```bash
cargo test --locked --all-targets
```

Expected: existing Rust tests pass. If `content::tests::programming_basics_targets_stay_lightweight` fails once on random length bounds, rerun that exact test and then rerun the full suite before concluding.

- [x] **Step 3: Check diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.
