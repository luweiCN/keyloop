# TS Long Word Alias Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include alias practice text in the standalone long-word breakdown helper when a long-word entry defines an alias.

**Architecture:** Keep the existing `buildLongWordBreakdownTarget()` API and repetition options. Append one `<alias> <word>` pair after the repeated parts and full-word units when the first non-empty alias exists.

**Tech Stack:** Bun tests, TypeScript strict mode.

---

### Task 1: Alias Pair In Long Word Target

**Files:**
- Modify: `ts/tests/vocabulary.test.ts`
- Modify: `ts/src/training/vocabulary.ts`

- [x] **Step 1: Write failing alias-line test**

Update the existing `breakdown target repeats parts before the full word` test to assert:

```ts
expect(target.text).toBe(
  "international international ization ization internationalization internationalization i18n internationalization",
);
expect(target.text).toContain("i18n internationalization");
```

- [x] **Step 2: Run vocabulary test to verify RED**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: FAIL because `buildLongWordBreakdownTarget()` currently omits aliases.

- [x] **Step 3: Append the alias pair**

In `buildLongWordBreakdownTarget()`, after full-word repetitions, append the first non-empty alias and the full word:

```ts
const alias = entry.aliases?.find((value) => value.trim().length > 0)?.trim();
if (alias !== undefined) {
  units.push(alias, entry.word);
}
```

- [x] **Step 4: Run vocabulary test to verify GREEN**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-long-word-alias-line.md`

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
