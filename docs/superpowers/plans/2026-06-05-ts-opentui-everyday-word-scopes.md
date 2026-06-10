# TS OpenTUI Everyday Word Scopes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Rust-compatible everyday word scopes in the TS/OpenTUI everyday submenu: top 500, top 1000, and top 5000 words.

**Architecture:** Add three submenu item IDs that delegate to the scope-specific `buildEverydayPracticeTarget` kinds. Keep the existing `everyday_words` item activation as a compatibility path for older tests/state, but make the visible submenu include the Rust-compatible scope entries.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI app model.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Add menu/activation test**

Add a test asserting the everyday submenu includes `everyday_common_500`, `everyday_common_1000`, and `everyday_common_5000`, and that each starts a running target with the corresponding Rust source slug.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "everyday submenu exposes Rust word scopes"`

Expected: fail because the OpenTUI submenu currently exposes only the generic everyday words entry.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Add submenu IDs and labels**

Add typed submenu IDs and visible menu items for top 500, top 1000, and top 5000 words.

- [x] **Step 2: Wire activation**

Map each new submenu item to the corresponding `buildEverydayPracticeTarget` scope.

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
