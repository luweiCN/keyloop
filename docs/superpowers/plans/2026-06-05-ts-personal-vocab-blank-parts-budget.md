# TS Personal Vocabulary Blank Parts Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prevent personal vocabulary entries with only blank decomposition parts from consuming comprehensive word-breakdown injection budget.

**Architecture:** Keep permissive vocabulary storage parsing, but treat entries as decomposable only when at least one `parts` item is non-blank after trimming. Apply that eligibility before ranking and limiting long-word breakdown injection candidates.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Exclude Blank Decompositions Before Budgeting

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing target-generation test**

Add this test near the existing daily personal vocabulary budget tests in `ts/tests/targets.test.ts`:

```ts
test("daily plan ignores blank personal vocabulary parts before applying limit", () => {
  const daily = buildDailyPracticePlan({
    records: [],
    plan: testPlan(),
    library: testLibrary(),
    personalVocabulary: [
      {
        id: "vocab-invalid",
        text: "invalidTerm",
        kind: "code_term",
        parts: [" "],
        aliases: [],
        tags: ["programming"],
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
        priority: 2,
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

  const programming = daily.lessons.find(
    (lesson) => lesson.module === "programming_basics",
  );

  expect(programming?.target.text).toContain("config uration");
  expect(programming?.target.text).not.toContain("invalidTerm invalidTerm");
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "daily plan ignores blank personal vocabulary parts before applying limit"
```

Expected: FAIL because the blank-part entry currently consumes the single personal vocabulary limit.

- [x] **Step 3: Write minimal implementation**

In `ts/src/training/targets.ts`, add:

```ts
function hasPersonalVocabularyParts(entry: PersonalVocabularyEntry): boolean {
  return entry.parts?.some((part) => part.trim().length > 0) ?? false;
}
```

Use it before `rankPersonalVocabulary()` in `rankedPersonalVocabularyForStandalone()`, `rankedPersonalVocabularyForProgramming()`, and `rankedPersonalVocabularyForEveryday()`.

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
