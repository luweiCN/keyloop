# TS OpenTUI Code Random Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TypeScript/OpenTUI Code Practice random mix match the Rust behavior by randomly choosing one selected code preference in addition to one concrete code level.

**Architecture:** Keep the behavior in the pure OpenTUI app model because Rust applies this when a user starts the random code setup entry. Add a small helper that derives a random code config from the current selected OpenTUI code filters. Reuse the existing code specialist target generator; do not change snippet picking.

**Tech Stack:** TypeScript strict mode, Bun tests, existing OpenTUI app model.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Extend the random code mix test**

Add selected code preferences to the existing `code random mix starts one concrete specialist level` test. Stub `Math.random` with two values: the first chooses `function`, the second chooses the second selected preference. Assert the generated target source includes `level=function` and the selected preference label.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "code random mix starts one concrete specialist level"`

Expected: fail because the current TS random mix only chooses a level and keeps all selected code filters instead of randomly choosing one.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Add random selected-preference helper**

Add a helper that starts from an empty `defaultCodePracticeConfig({ match_any: true })`, applies a random concrete level, then optionally adds exactly one randomly selected preference from `state.codeFilters.selected`.

- [x] **Step 2: Use the helper for `code_random_mix`**

Change the `code_random_mix` activation path to use the helper rather than `contextWithCodeLevel()`.

### Task 3: Regression Gates

**Files:**
- No additional source files expected.

- [x] **Step 1: Run focused checks**

Run:
- `bun test ts/tests/opentuiApp.test.ts`
- `bun run typecheck`

Expected: all pass.

- [x] **Step 2: Run full checks**

Run:
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `bun run build`
- `git diff --check`

Expected: all pass.
