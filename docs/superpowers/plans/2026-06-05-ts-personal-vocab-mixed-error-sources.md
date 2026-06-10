# TS Personal Vocabulary Mixed Error Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make personal vocabulary ranking count legacy `error_tokens` for a word when a record has `token_stats` but no matching token stat for that word.

**Architecture:** Keep ranking in `ts/src/training/vocabulary.ts`. For each record, count matching `token_stats` when present for the entry text; otherwise fall back to `record.error_tokens[entry.text]`.

**Tech Stack:** Bun tests, TypeScript strict mode.

---

### Task 1: Mixed Error Source Ranking

**Files:**
- Modify: `ts/tests/vocabulary.test.ts`
- Modify: `ts/src/training/vocabulary.ts`

- [x] **Step 1: Write failing mixed-source test**

Add a test where a recent record has a non-empty `token_stats` array for another token and a legacy `error_tokens` value for the vocabulary entry:

```ts
test("legacy error tokens count when token stats omit the vocabulary entry", () => {
  const records = [
    defaultSessionRecord({
      started_at: new Date().toISOString(),
      target_text: "selected performance",
      error_tokens: {
        internationalization: 2,
      },
      token_stats: [
        {
          token: "selected",
          kind: "word",
          start_delay_ms: 100,
          duration_ms: 100,
          errors: 0,
        },
      ],
    }),
  ];

  const ranked = rankPersonalVocabulary(
    [entry("legacy-error", "internationalization", 1)],
    records,
  );

  expect(ranked[0]?.recent_error_count).toBe(2);
});
```

- [x] **Step 2: Run vocabulary test to verify RED**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: FAIL because `rankEntry()` currently skips `error_tokens` whenever `token_stats.length > 0`.

- [x] **Step 3: Implement per-entry fallback**

In `rankEntry()`, track whether any matching token stat was found for the entry in the current record. If none was found, add `record.error_tokens[entry.text] ?? 0`.

- [x] **Step 4: Run vocabulary test to verify GREEN**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-personal-vocab-mixed-error-sources.md`

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
