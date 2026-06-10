# TS Daily Plan Now Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make daily practice plan time-dependent behavior use an injected `now` value so `completed_ms` and module readiness are deterministic.

**Architecture:** Add `now?: Date` to `BuildTargetContext`, pass it into the daily-plan helpers, and keep default behavior unchanged when omitted. Tests cover both same-day completed time and recent-readiness filtering against an injected future date.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Daily Plan Time Injection

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing tests**

Add tests near the existing `buildDailyPracticePlan` tests:

```ts
test("daily plan completed time uses injected now", () => {
  const daily = buildDailyPracticePlan({
    records: [
      defaultSessionRecord({
        started_at: "2020-01-02T03:00:00.000Z",
        duration_ms: 60_000,
      }),
    ],
    plan: testPlan(),
    library: testLibrary(),
    now: new Date("2020-01-02T04:00:00.000Z"),
  });

  expect(daily.completed_ms).toBe(60_000);
});

test("daily plan readiness uses injected now", () => {
  const daily = buildDailyPracticePlan({
    records: stableModuleRecords(
      "foundation_input",
      "foundation_mix",
      "2020-01-02T03:00:00.000Z",
    ),
    plan: unfocusedPlan(),
    library: testLibrary(),
    now: new Date("2020-01-02T04:00:00.000Z"),
  });

  expect(daily.lessons.map((lesson) => lesson.module)).toEqual([
    "everyday_english",
    "programming_basics",
    "code_practice",
  ]);
});
```

Update `stableModuleRecords` to accept an optional `startedAt` string and use it for its generated records.

- [x] **Step 2: Run tests to verify RED**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "daily plan completed time uses injected now|daily plan readiness uses injected now"`

Expected: FAIL because `BuildTargetContext` does not accept `now`, and production code does not use injected time yet.

- [x] **Step 3: Implement minimal code**

In `ts/src/training/targets.ts`:

```ts
export interface BuildTargetContext {
  records: SessionRecord[];
  plan: PracticePlan;
  library: ContentLibrary;
  codeConfig?: Partial<CodePracticeConfig>;
  localCodeSnippets?: CodeSnippet[];
  everydaySettings?: EverydayEnglishSettings;
  wordBreakdownSettings?: UserPreferences["word_breakdown"];
  personalVocabulary?: PersonalVocabularyEntry[];
  personalVocabularyLimit?: number;
  random?: () => number;
  now?: Date;
}
```

Change daily plan generation:

```ts
export function buildDailyPracticePlan(context: BuildTargetContext): DailyPracticePlan {
  const now = context.now ?? new Date();
  const readiness = moduleReadinessFromRecords(context.records, now);
  // ...
  completed_ms: completedMsForDate(context.records, now),
}
```

Replace `completedMsToday` with:

```ts
function completedMsForDate(records: SessionRecord[], now: Date): number {
  const today = localDateString(now.toISOString());
  return records
    .filter((record) => localDateString(record.started_at) === today)
    .reduce((sum, record) => sum + record.duration_ms, 0);
}
```

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "daily plan completed time uses injected now|daily plan readiness uses injected now" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck`

Expected: PASS.
