# TS OpenTUI Code Specialist Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已迁移的 TS `buildCodeSpecialistPracticeTarget` 暴露到 OpenTUI `code` 子菜单，补齐 Rust 代码实战按粒度启动的行为。

**Architecture:** 继续使用现有 OpenTUI 子菜单模型，不新增复杂 setup phase。`code` 子菜单增加 block/function/file/random 四个 specialist 入口，每个入口通过同一个 helper 设置 `codeConfig.level` 后调用核心 target builder；保留现有 `code_mix` 入口。

**Tech Stack:** TypeScript、Bun test、现有 OpenTUI app model。

---

### Task 1: OpenTUI Menu And Target Test

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Write the failing test**

Add a test that opens the `code` submenu and expects menu IDs:

```ts
[
  "code_blocks",
  "code_functions",
  "code_file_fragments",
  "code_random_mix",
  "code_mix",
]
```

Then activate `code_functions` and expect a running target whose source starts with:

```text
keyloop:code-specialist:level=function
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "code submenu exposes specialist levels"`

Expected: fail because the submenu currently exposes only `code_mix`.

- [x] **Step 3: Implement menu IDs and target startup**

Add the four new `OpenTuiSubmenuId` variants. Add submenu labels:

- `code_blocks`: `代码块` / `Code blocks`
- `code_functions`: `函数块` / `Functions`
- `code_file_fragments`: `文件片段` / `File fragments`
- `code_random_mix`: `随机综合` / `Random mix`

In `activateSubmenuItem`, route these IDs to `buildCodeSpecialistPracticeTarget` with the corresponding `codeConfig.level`:

- block -> `"block"`
- function -> `"function"`
- file -> `"file"`
- random -> `undefined`

- [x] **Step 4: Run test to verify it passes**

Run: `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "code submenu exposes specialist levels"`

Expected: pass.

### Task 2: Verification

**Files:**
- Test: `ts/tests/opentuiApp.test.ts`
- Test: all TS tests
- Test: Rust regression suite

- [x] **Step 1: Run focused test file**

Run: `bun test ts/tests/opentuiApp.test.ts`

Expected: all OpenTUI app model tests pass.

- [x] **Step 2: Run TS full suite and typecheck**

Run: `bun test ts/tests && bun run typecheck`

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run Rust regression suite**

Run: `cargo test --locked --all-targets`

Expected: Rust tests still pass.

- [x] **Step 4: Run build and diff hygiene**

Run: `bun run build && git diff --check`

Expected: bundle succeeds and there are no whitespace errors.
