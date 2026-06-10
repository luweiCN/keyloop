# TS Personal Vocabulary Practiced History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make personal vocabulary `never_practiced_bonus` use all historical records while keeping recent error/timing scoring limited to the configured history window.

**Architecture:** Keep `rankPersonalVocabulary` as the public entry point. Split the inputs passed into ranking so `practiced` is computed from all records and `recent_error_count` / timing averages are computed from the recent 21-day window.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Use Full History For Practiced Detection

**Files:**
- Modify: `ts/tests/vocabulary.test.ts`
- Modify: `ts/src/training/vocabulary.ts`

- [x] **Step 1: Write the failing ranking test**

Add this test near the other `rankPersonalVocabulary` tests:

```ts
test("never practiced bonus uses all historical target text", () => {
  const ranked = rankPersonalVocabulary(
    [entry("old", "internationalization", 1)],
    [
      defaultSessionRecord({
        started_at: "2026-01-01T00:00:00.000Z",
        target_text: "internationalization",
      }),
    ],
    { now: new Date("2026-06-05T00:00:00.000Z") },
  );

  expect(ranked[0]?.practiced).toBe(true);
  expect(ranked[0]?.score).toBe(500);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/vocabulary.test.ts --test-name-pattern "never practiced"
```

Expected: FAIL because current scoring filters records to the recent window before checking `target_text`.

- [x] **Step 3: Split all-record and recent-record ranking inputs**

Update `rankPersonalVocabulary` so each entry is ranked with both:

```ts
rankEntry(entry, records, recentRecords)
```

Then update `rankEntry` to:

- Compute `practiced` by scanning all records.
- Compute `recentErrorCount`, `avg_start_delay_ms`, and `avg_duration_ms` from `recentRecords`.

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/vocabulary.test.ts --test-name-pattern "never practiced"
bun test ts/tests/vocabulary.test.ts
```

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
bun test ts/tests && bun run typecheck
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: all commands exit 0.
