# TS Code Specialist Standalone Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve correct lesson metadata when the bare OpenTUI app starts standalone code specialist practice entries such as `code_functions`.

**Architecture:** Keep the selected target in the OpenTUI app model. Fix the CLI bridge in `standaloneLessonMetadata` so standalone `OpenTuiRunningRoute.source_item` values map to concrete `TrainingModule` and `TrainingCategory` instead of falling through to `unknown`.

**Tech Stack:** Bun tests, TypeScript strict mode, existing CLI app runner injection.

---

### Task 1: CLI Standalone Code Metadata

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write the failing test**

Add a CLI test that runs bare `keyloop`, returns a running `code_functions` state from the injected `appRunner`, and asserts the injected `runner` receives a standalone daily plan:

```ts
expect(runnerLesson?.module).toBe("code_practice");
expect(runnerLesson?.category).toBe("code_function");
expect(runnerLesson?.mix_profile).toBe("standalone");
expect(runnerDailyRunId).toBe("");
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: FAIL because `code_functions` currently maps to `unknown`.

- [x] **Step 3: Add minimal metadata mapping**

In `standaloneLessonMetadata`, map:

```ts
code_blocks -> code_practice / code_snippet
code_functions -> code_practice / code_function
code_file_fragments -> code_practice / code_file_fragment
code_random_mix -> code_practice / code_mix
```

- [x] **Step 4: Run CLI test to verify it passes**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-code-specialist-standalone-metadata.md`

- [x] **Step 1: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 2: Run repository verification**

Run:

```bash
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: Rust tests pass, TS build passes, and diff whitespace check is clean.

- [x] **Step 3: Mark this plan complete**

Check all boxes only after the matching command output has been read.
