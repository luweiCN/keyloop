# TS Personal Vocabulary Full Run Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ensure comprehensive practice draws at most `personal_vocabulary.daily_review_limit` personal vocabulary entries across the whole daily run, not once per module.

**Architecture:** Keep `personalVocabularyLimit` as the full-run budget supplied by CLI/OpenTUI preferences. Target generation ranks the global top-N personal vocabulary entries first, then each domain-specific injection filters that same top-N pool, so everyday/workplace and programming/web3 injections cannot exceed the full-run budget in aggregate.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Enforce Full-Run Vocabulary Budget Across Domains

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing test**

Add this test near the existing daily word breakdown preference tests in `ts/tests/targets.test.ts`:

```ts
test("daily plan caps personal vocabulary across the full run", () => {
  const daily = buildDailyPracticePlan({
    records: [],
    plan: testPlan(),
    library: testLibrary(),
    personalVocabulary: [
      {
        id: "vocab-collaboration",
        text: "collaboration",
        kind: "word",
        parts: ["collabor", "ation"],
        aliases: [],
        tags: ["workplace"],
        priority: 3,
        created_at: "2026-06-05T00:00:00.000Z",
        updated_at: "2026-06-05T00:00:00.000Z",
        archived: false,
      },
      {
        id: "vocab-configuration",
        text: "configuration",
        kind: "code_term",
        parts: ["config", "uration"],
        aliases: [],
        tags: ["programming"],
        priority: 3,
        created_at: "2026-06-05T00:00:00.000Z",
        updated_at: "2026-06-05T00:00:00.000Z",
        archived: false,
      },
    ],
    personalVocabularyLimit: 1,
    wordBreakdownSettings: {
      enabled_in_comprehensive: true,
      max_items_per_group: 6,
    },
  });

  const everyday = daily.lessons.find(
    (lesson) => lesson.module === "everyday_english",
  );
  const programming = daily.lessons.find(
    (lesson) => lesson.module === "programming_basics",
  );

  expect(everyday?.target.text).toContain("collabor ation");
  expect(programming?.target.text).not.toContain("config uration");
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "daily plan caps personal vocabulary across the full run"
```

Expected: FAIL because the programming module currently receives its own personal vocabulary budget.

- [x] **Step 3: Write minimal implementation**

In `ts/src/training/targets.ts`, change both `rankedPersonalVocabularyForProgramming()` and `rankedPersonalVocabularyForEveryday()` to rank only the global `limit` entries before domain filtering:

```ts
  return rankPersonalVocabulary(entries, context.records, { limit })
    .map((item) => item.entry)
    .filter((entry) => (entry.parts?.length ?? 0) > 0)
    .filter(isProgrammingVocabularyEntry)
    .slice(0, Math.min(limit, 6));
```

Apply the analogous change for everyday vocabulary.

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
bun test ts/tests && bun run typecheck
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: all commands exit 0.
