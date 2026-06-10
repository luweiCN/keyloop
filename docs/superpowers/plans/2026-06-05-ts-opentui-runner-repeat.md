# TS OpenTUI Runner Repeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Rust-compatible `R` repeat behavior to the TypeScript/OpenTUI completion page.

**Architecture:** Keep saved completed records intact. When the complete page receives `R`, rerun the just-completed lesson target once by forcing the next loop iteration to use the same `LessonSelection`; after the repeated completion, normal next-lesson or summary flow resumes.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI runner and app model.

---

## File Structure

- Modify: `ts/tests/opentuiStartRunner.test.ts`
  - Add RED coverage proving `R` repeats the current completed lesson before summary.
- Modify: `ts/src/ui/opentui/startRunner.ts`
  - Add a `repeat` post-completion action.
  - Keep accumulated records unchanged and rerun the same lesson selection.
- Modify: this plan document.

## Task 1: RED Repeat Test

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`

- [x] **Step 1: Add failing repeat test**

Add a single-lesson test proving:

- after the first completion page appears, pressing `r` starts the same lesson again;
- the runner does not enter summary before the repeated lesson completes;
- after the repeated lesson completes and Enter is pressed, summary appears;
- the final result contains two completed records with the same lesson id.

- [x] **Step 2: Run focused runner tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: fail because `R` is currently ignored on the complete page.

## Task 2: GREEN Repeat Implementation

**Files:**
- Modify: `ts/src/ui/opentui/startRunner.ts`

- [x] **Step 1: Add repeat post-completion action**

Extend `PostCompletionAction` to `"repeat"`. Treat `r` and `R` without ctrl/meta as repeat in `waitForPostCompletionAction`.

- [x] **Step 2: Rerun the current selection**

In `openTuiStartRunner`, keep an optional forced `LessonSelection`. If the complete page returns `"repeat"`, set it to the current selection and continue the loop without removing saved records.

- [x] **Step 3: Run focused runner tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts
```

Expected: OpenTUI start runner tests pass.

## Task 3: Integrated Verification

**Files:**
- Modify: this plan document.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests and typecheck pass.

- [x] **Step 2: Run Rust checks**

Run:

```bash
cargo test --locked --all-targets
```

Expected: existing Rust tests pass.

- [x] **Step 3: Check diff hygiene and TS entry**

Run:

```bash
git diff --check
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI non-start entry still runs.
