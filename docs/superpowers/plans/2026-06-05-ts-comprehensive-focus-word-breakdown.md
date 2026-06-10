# TS Comprehensive Focus Word Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make comprehensive Programming Basics long-word injection follow the migration contract order by including split-able `plan.focus_words` before built-in long-word entries.

**Architecture:** Reuse the existing `breakdownCandidateFromFocusWord` and `breakdownCandidateLines` helpers in `ts/src/training/targets.ts`. Keep standalone behavior unchanged and extend the comprehensive `longWordBreakdownLines` candidate assembly from personal vocabulary + built-ins to personal vocabulary + focus words + due built-ins.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Inject Split Focus Words Into Comprehensive Programming Basics

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing target-generation test**

Add this test near existing Programming Basics long-word tests:

```ts
test("programming basics mix injects split focus words before built-in long words", () => {
  const record = defaultSessionRecord({
    token_stats: [
      {
        token: "internationalization",
        kind: "word",
        start_delay_ms: 900,
        duration_ms: 500,
        errors: 1,
      },
    ],
  });

  const target = buildProgrammingBasicsMixTarget(
    {
      records: [record],
      plan: {
        ...testPlan(),
        focus_words: ["selectedPreference"],
      },
      library: testLibrary(),
    },
    "comprehensive",
  );

  expect(target.text).toContain("selected preference");
  expect(target.text).toContain("selectedPreference selectedPreference");
  expect(target.text).toContain("loadSelectedPreference");
  expect(target.text.indexOf("selected preference")).toBeLessThan(
    target.text.indexOf("international ization"),
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "split focus words"
```

Expected: FAIL because comprehensive `longWordBreakdownLines` currently does not add focus-word candidates.

- [x] **Step 3: Add focus-word candidate selection**

Update `longWordBreakdownLines` so after personal vocabulary it:

1. Computes remaining slots.
2. Converts `context.plan.focus_words` through `breakdownCandidateFromFocusWord(word, "programming")`.
3. Skips words already used by personal vocabulary.
4. Emits these focus-word breakdown lines before due built-in long words.

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "split focus words"
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
