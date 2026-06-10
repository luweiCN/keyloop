# TS Code Picker Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust code snippet picker behavior by shuffling candidates before focus-based tie sorting.

**Architecture:** Keep randomization inside `ts/src/content/snippets.ts`. Preserve existing picker call sites by adding an optional picker options argument with an injectable random source for deterministic tests.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS snippet picker module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/snippets.test.ts`

- [x] **Step 1: Add deterministic shuffle regression**

Add a test where two snippets have the same focus hit count. Inject a fixed random sequence and assert the focus-tie order follows the shuffled candidate order.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/snippets.test.ts --test-name-pattern "picker shuffles candidates before focus tie sorting"`

Expected: fail because the TS picker currently preserves original candidate order for focus ties.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/content/snippets.ts`

- [x] **Step 1: Add picker options**

Add `CodeSnippetPickerOptions` with optional `random?: () => number`.

- [x] **Step 2: Shuffle candidates**

Apply Fisher-Yates shuffle before focus sorting in both local and built-in picker paths. Default to `Math.random` and clamp injected random values to avoid out-of-range indexes.

- [x] **Step 3: Update order-sensitive target test**

Keep code specialist tests focused on level/source/filter contract instead of a specific randomized snippet pair.

### Task 3: Regression Gates

**Files:**
- No additional source files expected.

- [x] **Step 1: Run focused checks**

Run:
- `bun test ts/tests/snippets.test.ts`
- `bun test ts/tests/targets.test.ts --test-name-pattern "code"`
- `bun run typecheck`

Expected: all pass.

- [x] **Step 2: Run full checks**

Run:
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `bun run build`
- `git diff --check`

Expected: all pass.
