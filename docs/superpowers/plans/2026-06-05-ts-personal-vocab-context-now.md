# TS Personal Vocabulary Context Now Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure comprehensive and standalone target generation ranks personal vocabulary against the injected `BuildTargetContext.now` instead of the real system date.

**Architecture:** Keep `rankPersonalVocabulary` unchanged; it already accepts `now`. Pass `context.now` from the three `BuildTargetContext` call sites in `targets.ts`.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Propagate Context Time Into Vocabulary Ranking

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing test**

Add a test near the programming personal vocabulary injection tests:

```ts
test("programming basics mix ranks personal vocabulary with injected now", () => {
  const record = defaultSessionRecord({
    started_at: "2020-01-02T03:00:00.000Z",
    target_text: "performance",
    token_stats: [
      {
        token: "performance",
        kind: "word",
        start_delay_ms: 0,
        duration_ms: 0,
        errors: 1,
      },
    ],
  });

  const target = buildProgrammingBasicsMixTarget({
    records: [record],
    plan: unfocusedPlan(),
    library: testLibrary(),
    personalVocabulary: [
      {
        id: "vocab-performance",
        text: "performance",
        kind: "code_term",
        parts: ["per", "form", "ance"],
        aliases: [],
        tags: ["programming"],
        priority: 2,
        created_at: "2020-01-02T00:00:00.000Z",
        updated_at: "2020-01-02T00:00:00.000Z",
        archived: false,
      },
      {
        id: "vocab-collaboration",
        text: "collaboration",
        kind: "code_term",
        parts: ["collabor", "ation"],
        aliases: [],
        tags: ["programming"],
        priority: 2,
        created_at: "2020-01-02T00:00:00.000Z",
        updated_at: "2020-01-02T00:00:00.000Z",
        archived: false,
      },
    ],
    personalVocabularyLimit: 2,
    now: new Date("2020-01-02T04:00:00.000Z"),
  });

  const performanceIndex = target.text.indexOf("per form ance");
  const collaborationIndex = target.text.indexOf("collabor ation");
  expect(performanceIndex).toBeGreaterThanOrEqual(0);
  expect(collaborationIndex).toBeGreaterThanOrEqual(0);
  expect(performanceIndex).toBeLessThan(collaborationIndex);
});
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "programming basics mix ranks personal vocabulary with injected now"`

Expected: FAIL because old target generation ranks against the real 2026 date and ignores the 2020 recent-error record.

- [x] **Step 3: Implement minimal code**

Update all `rankPersonalVocabulary` calls that use `BuildTargetContext`:

```ts
return rankPersonalVocabulary(entries, context.records, {
  limit: entries.length,
  ...(context.now === undefined ? {} : { now: context.now }),
});
```

Apply the same conditional `now` option in programming and everyday vocabulary ranking helpers.

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "programming basics mix ranks personal vocabulary with injected now" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck`

Expected: PASS.
