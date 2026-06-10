# TS Word Breakdown Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `preferences.word_breakdown` control long-word breakdown injection in TS comprehensive practice.

**Architecture:** Keep standalone long-word practice unchanged. Add optional word-breakdown settings to `BuildTargetContext`; daily comprehensive programming-basics mix uses those settings to disable injection or cap injected entries, while standalone programming-basics mix remains available.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing `UserPreferences.word_breakdown`, existing target generation and CLI dispatch.

---

### Task 1: Add RED Target Tests

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add disabled comprehensive injection test**

Add a test proving `enabled_in_comprehensive: false` removes long-word breakdown lines from the daily programming-basics lesson:

```ts
test("daily plan omits word breakdown injection when disabled in preferences", () => {
  const daily = buildDailyPracticePlan({
    records: [],
    plan: testPlan(),
    library: testLibrary(),
    personalVocabulary: [
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
    personalVocabularyLimit: 4,
    wordBreakdownSettings: {
      enabled_in_comprehensive: false,
      max_items_per_group: 6,
    },
  });

  const programming = daily.lessons.find(
    (lesson) => lesson.module === "programming_basics",
  );
  expect(programming?.target.text).not.toContain("config uration");
  expect(programming?.target.text).not.toContain("international ization");
});
```

- [x] **Step 2: Add max items cap test**

Add a test proving `max_items_per_group` caps total injected breakdown entries:

```ts
test("daily plan caps word breakdown injection by preference", () => {
  const daily = buildDailyPracticePlan({
    records: [],
    plan: testPlan(),
    library: testLibrary(),
    personalVocabulary: [
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
      {
        id: "vocab-accessibility",
        text: "accessibility",
        kind: "code_term",
        parts: ["access", "ibility"],
        aliases: [],
        tags: ["programming"],
        priority: 2,
        created_at: "2026-06-05T00:00:00.000Z",
        updated_at: "2026-06-05T00:00:00.000Z",
        archived: false,
      },
    ],
    personalVocabularyLimit: 4,
    wordBreakdownSettings: {
      enabled_in_comprehensive: true,
      max_items_per_group: 1,
    },
  });

  const programming = daily.lessons.find(
    (lesson) => lesson.module === "programming_basics",
  );
  expect(programming?.target.text).toContain("config uration");
  expect(programming?.target.text).not.toContain("access ibility");
  expect(programming?.target.text).not.toContain("international ization");
});
```

- [x] **Step 3: Run focused target tests and verify RED**

Run:

```bash
bun test ts/tests/targets.test.ts --timeout 10000
```

Expected: FAIL because `BuildTargetContext` has no `wordBreakdownSettings` and comprehensive injection currently uses a hardcoded cap of `6`.

### Task 2: Implement Target Context Wiring

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Add context field**

Add:

```ts
wordBreakdownSettings?: UserPreferences["word_breakdown"];
```

to `BuildTargetContext`.

- [x] **Step 2: Make programming basics mix profile-aware**

Use `"comprehensive"` when `buildDailyPracticePlan` creates the programming-basics lesson, and default exported standalone calls to `"standalone"`.

- [x] **Step 3: Apply settings in comprehensive injection**

For comprehensive profile:
- return no breakdown lines when `enabled_in_comprehensive` is false.
- cap total personal + built-in entries with `max_items_per_group`.
- keep existing default as enabled with cap `6`.

- [x] **Step 4: Run focused target tests and verify GREEN**

Run:

```bash
bun test ts/tests/targets.test.ts --timeout 10000
```

Expected: PASS.

### Task 3: Add RED CLI Wiring Test

**Files:**
- Modify: `ts/tests/cli.test.ts`

- [x] **Step 1: Add start-context test**

Add a CLI dispatch test that saves `word_breakdown.enabled_in_comprehensive = false`, stores a personal vocabulary entry with `parts`, runs `keyloop start`, captures the runner `dailyPlan`, and asserts the programming-basics lesson does not contain the breakdown line.

- [x] **Step 2: Run focused CLI test and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts --timeout 10000
```

Expected: FAIL because `runStart` and `runApp` do not pass `preferences.word_breakdown` into target generation.

### Task 4: Implement CLI Wiring

**Files:**
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Pass settings in bare app context**

Add `wordBreakdownSettings: preferences.word_breakdown` to the app context.

- [x] **Step 2: Pass settings in start context**

Add `wordBreakdownSettings: preferences.word_breakdown` to `targetContext` in `runStart`.

- [x] **Step 3: Preserve returned state in app start context**

No OpenTUI state field is needed in this slice; `startContextFromAppState` will keep using the original app context setting.

- [x] **Step 4: Run focused CLI test and verify GREEN**

Run:

```bash
bun test ts/tests/cli.test.ts --timeout 10000
```

Expected: PASS.

### Task 5: Full Verification

**Files:**
- Verify: TS and Rust suites
- Modify: this plan checklist

- [x] **Step 1: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 2: Run Rust tests**

Run:

```bash
cargo test --locked --all-targets
```

Expected: all Rust tests pass.

- [x] **Step 3: Run whitespace and non-interactive CLI check**

Run:

```bash
git diff --check && tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; exit_code=$?; rm -rf "$tmpdir"; exit $exit_code
```

Expected: no whitespace errors; `plan` prints `Next KeyLoop plan`.

- [x] **Step 4: Update this plan checklist**

Mark all completed task checkboxes with `[x]`.
