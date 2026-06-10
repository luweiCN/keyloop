# TS Long Word Line Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the exported standalone long-word helper emit the same line-oriented breakdown pattern as the migration contract.

**Architecture:** Keep `buildLongWordBreakdownTarget()` in `ts/src/training/vocabulary.ts` and preserve its optional repetition knobs for compatibility. Change default output to line groups: parts line, full-word line, optional alias line.

**Tech Stack:** Bun tests, TypeScript strict mode.

---

### Task 1: Default Line-Oriented Long Word Breakdown

**Files:**
- Modify: `ts/tests/vocabulary.test.ts`
- Modify: `ts/src/training/vocabulary.ts`

- [x] **Step 1: Write failing line-format test**

Update the existing long-word target test to call `buildLongWordBreakdownTarget(word)` with default options and expect:

```ts
expect(target.text).toBe(
  [
    "international ization",
    "internationalization internationalization",
    "i18n internationalization",
  ].join("\n"),
);
```

- [x] **Step 2: Run vocabulary test to verify RED**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: FAIL because the helper currently emits a single space-separated line and defaults to three part/full-word repetitions.

- [x] **Step 3: Implement line-oriented default output**

In `buildLongWordBreakdownTarget()`:

1. Change default `partRepetitions` to `1`.
2. Change default `wordRepetitions` to `2`.
3. Build line groups instead of a flat `units` array.
4. Return `lines.join("\n")`.

- [x] **Step 4: Run vocabulary test to verify GREEN**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-long-word-line-format.md`

- [x] **Step 1: Run TS checks**

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

Check all boxes only after reading the corresponding command output.
