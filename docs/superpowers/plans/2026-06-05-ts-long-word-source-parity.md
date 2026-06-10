# TS Long Word Source Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the standalone long-word breakdown helper use the migration-contract source format.

**Architecture:** Keep long-word target construction in `ts/src/training/vocabulary.ts`. Update only the source identifier produced by `buildLongWordBreakdownTarget()` so all long-word breakdown targets use `keyloop:module:word-breakdown:<word>`.

**Tech Stack:** Bun tests, TypeScript strict mode.

---

### Task 1: Long Word Source Format

**Files:**
- Modify: `ts/tests/vocabulary.test.ts`
- Modify: `ts/src/training/vocabulary.ts`

- [x] **Step 1: Write failing source-format test**

Update the existing `buildLongWordBreakdownTarget()` test to expect:

```ts
expect(target.source).toBe(
  "keyloop:module:word-breakdown:internationalization",
);
```

- [x] **Step 2: Run vocabulary test to verify RED**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: FAIL because the helper currently emits `long_word:keyloop:test:internationalization`.

- [x] **Step 3: Implement source-format parity**

In `buildLongWordBreakdownTarget()`, change:

```ts
source: `long_word:${entry.source_id}:${entry.word}`,
```

to:

```ts
source: `keyloop:module:word-breakdown:${entry.word}`,
```

- [x] **Step 4: Run vocabulary test to verify GREEN**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-long-word-source-parity.md`

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
