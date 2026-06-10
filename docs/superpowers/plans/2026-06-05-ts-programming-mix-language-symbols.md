# TS Programming Mix Language Symbols Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TS programming basics mix include language/framework-specific symbol sets from the current code config, matching Rust `build_lesson_symbols`.

**Architecture:** Keep symbol selection in `ts/src/training/targets.ts`. Reuse existing `languageSymbolItems(context)` and update the private programming mix symbol builder to receive the full target context instead of only `plan` and `library`.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target generation.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add language symbol fixture**

Add a test around `buildProgrammingBasicsMixTarget`:
- Provide a content library with `language_symbols` for Rust.
- Pass `codeConfig.languages = ["rust"]`.
- Assert the generated programming basics mix includes a Rust-specific symbol line such as `Result<T, E>` or `:: ->`.

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/targets.test.ts`

Expected: fail because `buildProgrammingBasicsMixTarget` currently calls `buildLessonSymbols(plan, library)` without code config.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Update symbol builder**

Change private `buildLessonSymbols` to accept `BuildTargetContext`.

- [x] **Step 2: Match Rust symbol assembly**

Inside `buildLessonSymbols`:
- Start with unique `plan.focus_symbols`.
- Append up to 6 language/framework-specific symbol items.
- Fill from generic `library.symbols` to 18 total items.
- Append up to 2 number drill lines.
- Truncate to 26 and chunk by 5.

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
