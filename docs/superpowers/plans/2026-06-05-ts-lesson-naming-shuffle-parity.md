# TS Lesson Naming Shuffle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust naming lesson behavior by shuffling naming template candidates before filling missing target lines.

**Architecture:** Add an optional random source to `buildLessonNaming`, then pass `context.random ?? Math.random` from comprehensive and standalone programming-basics callers. Keep focus naming lines, target source, mode, and five-line cap unchanged.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add deterministic naming shuffle test**

Add a standalone naming styles test with ordered naming templates and a fixed random sequence. Assert a later naming template can enter the selected target.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "programming naming target shuffles naming templates with injected random"`

Expected: fail because TS currently fills naming templates in source order.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Inject random into naming fill**

Update `buildLessonNaming` to accept an optional random source and pass it to `fillFrom`. Call it with `context.random ?? Math.random` from both programming-basics mix and standalone naming targets.

### Task 3: Regression Gates

**Files:**
- No additional source files expected.

- [x] **Step 1: Run focused checks**

Run:
- `bun test ts/tests/targets.test.ts`
- `bun run typecheck`

Expected: all pass.

- [x] **Step 2: Run full checks**

Run:
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `bun run build`
- `git diff --check`

Expected: all pass.
