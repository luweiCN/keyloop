# TS OpenTUI Everyday Scope Meanings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show built-in word meanings on running pages for the new standalone everyday word scope entries, not only the legacy `everyday_words` item.

**Architecture:** Add a small predicate for standalone everyday word source items and reuse the existing `everydayMeaningLines` display path. Keep comprehensive practice and non-word everyday routes unchanged.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI app model.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Extend meanings test to scoped word item**

Assert a running route started from `everyday_common_1000` includes built-in meanings for displayed common words.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "running everyday words route shows built-in meanings only for standalone words"`

Expected: fail because meanings are currently shown only when `source_item === "everyday_words"`.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Add standalone everyday word predicate**

Recognize `everyday_common_500`, `everyday_common_1000`, `everyday_common_5000`, and legacy `everyday_words` as standalone word routes.

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
