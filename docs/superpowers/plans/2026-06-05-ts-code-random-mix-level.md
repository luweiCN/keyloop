# TS Code Random Mix Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 OpenTUI 代码专项里的 `code_random_mix` 按迁移文档先选一个具体 level（block/function/file），而不是生成 `level=mixed` 的跨 level target。

**Architecture:** 只改 OpenTUI app model 的菜单激活逻辑。`code_random_mix` 调用一个小函数选择 `block | function | file`，再复用现有 `buildCodeSpecialistPracticeTarget(contextWithCodeLevel(...))`；底层 snippet picker 和 source label 逻辑保持不变。

**Tech Stack:** TypeScript、Bun test、现有 OpenTUI app model tests。

---

### Task 1: Random Mix Level Selection

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Write failing app model test**

Add a test named `code random mix starts one concrete specialist level`. Activate the code submenu, then activate `code_random_mix`. Expect the resulting running target source to match `keyloop:code-specialist:level=(block|function|file)` and not include `level=mixed`.

- [x] **Step 2: Run red test**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts --test-name-pattern "code random mix starts one concrete specialist level"
```

Expected: fail because current `code_random_mix` deletes `codeConfig.level`, producing `level=mixed`.

- [x] **Step 3: Implement concrete level selection**

Add:

```ts
const codeRandomLevels = ["block", "function", "file"] as const;

function randomCodeLevel(): CodePracticeConfig["level"] {
  return codeRandomLevels[Math.floor(Math.random() * codeRandomLevels.length)] ?? "block";
}
```

Change the `code_random_mix` case to call:

```ts
buildCodeSpecialistPracticeTarget(contextWithCodeLevel(effectiveContext, randomCodeLevel()))
```

- [x] **Step 4: Run focused test**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts --test-name-pattern "code random mix starts one concrete specialist level"
```

Expected: pass.

### Task 2: Verification

**Files:**
- Test: `ts/tests/opentuiApp.test.ts`
- Test: all TS tests
- Test: Rust regression suite

- [x] **Step 1: Run app model test file**

Run: `bun test ts/tests/opentuiApp.test.ts`

Expected: app model tests pass.

- [x] **Step 2: Run TS full suite and typecheck**

Run: `bun test ts/tests && bun run typecheck`

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run Rust regression suite**

Run: `cargo test --locked --all-targets`

Expected: Rust tests still pass.

- [x] **Step 4: Run build and diff hygiene**

Run: `bun run build && git diff --check`

Expected: bundle succeeds and no whitespace errors.
