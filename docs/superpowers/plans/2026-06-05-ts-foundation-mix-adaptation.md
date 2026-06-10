# TS Foundation Mix Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Rust foundation mix drill selection and recent-line avoidance into TS target generation.

**Architecture:** Keep the behavior inside `ts/src/training/targets.ts` because foundation mix is part of practice target generation. Preserve deterministic TS ordering while matching Rust selection and filtering rules.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS content model.

---

### Task 1: RED Tests

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add foundation mix fixtures**

Add tests around `buildDailyPracticePlan`:
- Focus key `q` should choose the `top-row` foundation drill instead of the default punctuation drill.
- Recent `keyloop:foundation:<drill-id>` records should make foundation mix avoid those target lines when enough unused lines remain.

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/targets.test.ts`

Expected: fail because TS currently always chooses `punctuation-edges` and slices the first drill lines.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Add drill selection helper**

Add `foundationDrillForKeys(keys)` matching Rust:
- punctuation keys `; ' / , . \` - =` -> `punctuation-edges`
- top-row keys -> `top-row`
- bottom-row keys -> `bottom-row`
- index-finger keys -> `index-fingers`
- pinky keys -> `pinky-fingers`
- fallback -> `home-row`

- [x] **Step 2: Avoid recently used foundation lines**

Update `foundationMixTarget`:
- Use selected drill id from focus keys.
- Build a used-line set from records whose source starts with `keyloop:foundation:`.
- Filter selected drill items against used lines.
- If fewer than required lines remain, fall back to the full drill items.
- Use 8 drill lines with recent history, else 6.
- Repeat warmup lines to 4 when available.

- [x] **Step 3: Verify GREEN**

Run: `bun test ts/tests/targets.test.ts`

Expected: all target-generation tests pass.

### Task 3: Regression Gates

**Files:**
- No source changes expected.

- [x] **Step 1: Run full checks**

Run:
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `bun run build`
- `git diff --check`

Expected: all pass.
