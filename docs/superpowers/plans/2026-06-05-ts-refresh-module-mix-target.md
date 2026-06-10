# TS Refresh Module Mix Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 TS/OpenTUI 迁移中补齐 Rust `refresh_module_mix_target` 行为：综合练习每节课开始前，基于历史记录和本轮已完成记录刷新练习内容。

**Architecture:** 在 `ts/src/training/targets.ts` 增加纯函数 `refreshModuleMixTarget`，复用已有 module mix target 构建器。`StartRunnerContext` 可选携带 `BuildTargetContext`，OpenTUI start runner 在每节综合课开始前用最新 records 重建 plan 并刷新 lesson target；没有上下文或刷新异常时沿用已保存的 target。

**Tech Stack:** Bun test、TypeScript、现有 KeyLoop TS domain/content/training/OpenTUI runner。

---

### Task 1: Pure Target Refresh

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing test**

Add a test that imports `refreshModuleMixTarget`, passes a stored programming lesson whose target is `fallback`, and expects a latest symbol error record for `=>` to appear in the refreshed target.

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "refreshes programming basics mix from latest symbol records"`

Expected: fail because `refreshModuleMixTarget` is not exported.

- [x] **Step 3: Write minimal implementation**

Add:

```ts
export function refreshModuleMixTarget(
  lesson: PracticeLesson,
  context: BuildTargetContext,
): PracticeTarget {
  switch (lesson.module) {
    case "foundation_input":
      return foundationMixTarget(context);
    case "everyday_english":
      return everydayMixTarget(context, lesson.mix_profile);
    case "programming_basics":
      return buildProgrammingBasicsMixTarget(context, lesson.mix_profile);
    case "code_practice":
      return codeMixTarget(context);
    default:
      return lesson.target;
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "refreshes programming basics mix from latest symbol records"`

Expected: pass.

### Task 2: Runner Refresh Before Each Comprehensive Lesson

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`
- Modify: `ts/src/cli.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`

- [x] **Step 1: Write the failing runner test**

Add a test that starts a two-lesson comprehensive plan, completes the first lesson while producing an error token record for `=>`, then verifies the second programming lesson renders refreshed content containing `=>` instead of only its saved fallback target.

- [x] **Step 2: Run test to verify it fails**

Run: `bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "refreshes later comprehensive lesson target"`

Expected: fail because the runner still renders the stored target.

- [x] **Step 3: Extend start context and CLI wiring**

Add optional `targetContext?: BuildTargetContext` and `now?: Date` to `StartRunnerContext`. Pass the existing build target context from both direct `start` and app-to-start flows.

- [x] **Step 4: Refresh selection in the runner**

Before rendering/running a non-forced comprehensive lesson, build latest records as:

```ts
const records = [...context.targetContext.records, ...completedRecords];
```

Then rebuild plan with `buildPlan(records, context.language, context.now)` and call `refreshModuleMixTarget`. Catch errors and use the stored lesson target on failure.

- [x] **Step 5: Run runner test to verify it passes**

Run: `bun test ts/tests/opentuiStartRunner.test.ts --test-name-pattern "refreshes later comprehensive lesson target"`

Expected: pass.

### Task 3: Verification

**Files:**
- Test: `ts/tests/targets.test.ts`
- Test: `ts/tests/opentuiStartRunner.test.ts`
- Test: `ts/tests`
- Test: TypeScript compiler

- [x] **Step 1: Run focused tests**

Run: `bun test ts/tests/targets.test.ts ts/tests/opentuiStartRunner.test.ts`

Expected: all focused tests pass.

- [x] **Step 2: Run TS suite and typecheck**

Run: `bun test ts/tests && bun run typecheck`

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run broader migration gates**

Run: `cargo test --locked --all-targets`

Expected: Rust regression suite still passes.

- [x] **Step 4: Run diff hygiene**

Run: `git diff --check`

Expected: no whitespace errors.
