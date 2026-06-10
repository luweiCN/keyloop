# TS Everyday Word Meanings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 TS/OpenTUI 中 standalone everyday word 练习的内置中文释义显示能力。

**Architecture:** 在训练核心层提供 `everydayWordMeaning` 和 `everydayMeaningLines`，保持与 Rust 小型 hardcoded map 一致。OpenTUI app model 只在 `source_item === "everyday_words"` 的 running route 中追加释义行，避免影响 comprehensive、phrases、sentences。

**Tech Stack:** TypeScript、Bun test、现有 OpenTUI 文本行渲染模型。

---

### Task 1: Core Meaning Lines

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing test**

Add a test that imports `everydayMeaningLines`, calls it with `"practice today before unknown practice"` and max words `4`, and expects:

```ts
["practice: 练习", "today: 今天", "before: 在之前"]
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "everyday meaning lines return built-in Chinese glosses"`

Expected: fail because `everydayMeaningLines` is not exported.

- [x] **Step 3: Implement the minimal core**

Add a small hardcoded `Record<string, string>` map with the Rust words needed by tests and export:

```ts
export function everydayWordMeaning(word: string): string | undefined
export function everydayMeaningLines(text: string, maxWords: number): string[]
```

The function lowercases ASCII words, ignores unknown words, de-duplicates repeated known words, and truncates to `maxWords`.

- [x] **Step 4: Run test to verify it passes**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "everyday meaning lines return built-in Chinese glosses"`

Expected: pass.

### Task 2: OpenTUI Running Route Meanings

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Write the failing OpenTUI app model test**

Add a test that starts `everyday_words` from the everyday submenu and expects route lines to contain `practice: 练习` while a comprehensive route with the same word target does not contain meaning lines.

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "running everyday words route shows built-in meanings"`

Expected: fail because route lines contain only module and target text.

- [x] **Step 3: Implement route line integration**

In `openTuiRouteLines`, when `state.route.screen === "running"` and `state.route.source_item === "everyday_words"`, append `everydayMeaningLines(state.route.target.text, 6)` after the target text.

- [x] **Step 4: Run test to verify it passes**

Run: `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "running everyday words route shows built-in meanings"`

Expected: pass.

### Task 3: Verification

**Files:**
- Test: `ts/tests/targets.test.ts`
- Test: `ts/tests/opentuiApp.test.ts`
- Test: all TS tests
- Test: Rust regression suite

- [x] **Step 1: Run focused tests**

Run: `bun test ts/tests/targets.test.ts ts/tests/opentuiApp.test.ts`

Expected: all focused tests pass.

- [x] **Step 2: Run TS full suite and typecheck**

Run: `bun test ts/tests && bun run typecheck`

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run Rust regression suite**

Run: `cargo test --locked --all-targets`

Expected: Rust tests still pass.

- [x] **Step 4: Run diff hygiene**

Run: `git diff --check`

Expected: no whitespace errors.
