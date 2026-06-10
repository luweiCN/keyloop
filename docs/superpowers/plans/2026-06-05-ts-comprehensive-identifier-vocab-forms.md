# TS Comprehensive Identifier Vocabulary Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make comprehensive personal-vocabulary injection include identifier naming forms, matching the long-word breakdown contract.

**Architecture:** Reuse the existing `breakdownCandidateFromPersonalVocabulary` and `breakdownCandidateLines` helpers for comprehensive personal-vocabulary lines. This keeps standalone and comprehensive formatting aligned and avoids duplicating identifier-specific output rules.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Add Identifier Forms To Comprehensive Personal Vocabulary Injection

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing target-generation test**

Add this test near the existing Programming Basics personal-vocabulary injection tests:

```ts
test("programming basics mix expands personal identifier vocabulary forms", () => {
  const target = buildProgrammingBasicsMixTarget(
    {
      records: [],
      plan: testPlan(),
      library: testLibrary(),
      personalVocabulary: [
        {
          id: "vocab-selected-receipt",
          text: "selectedReceipt",
          kind: "identifier",
          parts: ["selected", "Receipt"],
          aliases: [],
          tags: ["programming"],
          priority: 3,
          created_at: "2026-06-05T00:00:00.000Z",
          updated_at: "2026-06-05T00:00:00.000Z",
          archived: false,
        },
      ],
      personalVocabularyLimit: 4,
    },
    "comprehensive",
  );

  expect(target.text).toContain("selected Receipt");
  expect(target.text).toContain("selectedReceipt selectedReceipt");
  expect(target.text).toContain("loadSelectedReceipt");
  expect(target.text).toContain("selectedReceiptConfig");
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "personal identifier"
```

Expected: FAIL because comprehensive personal-vocabulary lines do not currently include identifier forms.

- [x] **Step 3: Reuse shared breakdown rendering**

Update `personalVocabularyBreakdownLines`:

```ts
function personalVocabularyBreakdownLines(entry: PersonalVocabularyEntry): string[] {
  const candidate = breakdownCandidateFromPersonalVocabulary(entry);
  return candidate === null ? [] : breakdownCandidateLines(candidate);
}
```

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "personal identifier"
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
