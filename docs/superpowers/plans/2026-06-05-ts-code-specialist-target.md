# TS Code Specialist Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Rust `build_code_specialist_target` into TS as a pure target builder.

**Architecture:** Add an exported `buildCodeSpecialistPracticeTarget` in `ts/src/training/targets.ts`. It should use the existing built-in snippet picker, recent-code exclusion, adaptive difficulty, and `CodePracticeConfig.level` filtering.

**Tech Stack:** Bun tests, TypeScript strict mode, existing TS content/snippet modules.

---

### Task 1: RED Tests

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add code specialist fixtures**

Add tests that assert:
- `buildCodeSpecialistPracticeTarget` respects `codeConfig.level = "function"` and emits source `keyloop:code-specialist:level=function:<count>`.
- It avoids snippets already present in recent code records.
- It appends selected filter labels such as `lang=rust` in the source.

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/targets.test.ts`

Expected: fail because the TS builder is not exported yet.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Add exported builder**

Implement:

```ts
export function buildCodeSpecialistPracticeTarget(
  context: BuildTargetContext,
  count = 4,
): PracticeTarget
```

- [x] **Step 2: Match Rust behavior**

Implementation details:
- Use `usedCodeSnippetTexts(context.records)`.
- Use `codeDifficultyForRecords(context.records)`.
- Pick built-in snippets with `pickBuiltinCodeExcludingByDifficulty`.
- If fewer than `count`, fill with `pickBuiltinCode` and avoid duplicates.
- Return `mode: "code"`, joined snippets with blank lines, and source `keyloop:code-specialist:<source-parts>:<picked-count>`.
- Source parts: `level=<block|function|file|mixed>`, plus non-empty `lang=...`, `framework=...`, and `project=...` from plural config fields.

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
