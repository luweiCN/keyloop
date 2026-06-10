# TS Comprehensive Breakdown Max Six Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enforce the migration contract that comprehensive long-word breakdown injection adds at most six entries per group.

**Architecture:** Keep standalone `maxItems` behavior unchanged. Apply the six-entry cap only inside the comprehensive `wordBreakdownMaxItems` path used by Everyday/Programming mix injection.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Cap Comprehensive Breakdown Injection At Six

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing target-generation test**

Add this test near the Programming Basics long-word tests:

```ts
test("programming basics mix caps comprehensive focus breakdown at six entries", () => {
  const focusWords = [
    "alphaOneConfig",
    "betaTwoConfig",
    "gammaThreeConfig",
    "deltaFourConfig",
    "epsilonFiveConfig",
    "zetaSixConfig",
    "etaSevenConfig",
  ];

  const target = buildProgrammingBasicsMixTarget(
    {
      records: [],
      plan: { ...testPlan(), focus_words: focusWords },
      library: testLibrary(),
      wordBreakdownSettings: {
        enabled_in_comprehensive: true,
        max_items_per_group: 8,
      },
    },
    "comprehensive",
  );

  expect(target.text).toContain("alpha one config");
  expect(target.text).toContain("zeta six config");
  expect(target.text).not.toContain("eta seven config");
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "caps comprehensive focus breakdown"
```

Expected: FAIL because current comprehensive injection accepts all seven focus-word candidates when the saved setting is `8`.

- [x] **Step 3: Cap comprehensive settings at six**

Update `wordBreakdownMaxItems` so comprehensive settings use:

```ts
const maxComprehensiveBreakdownItems = 6;
return settings.enabled_in_comprehensive
  ? Math.min(normalizedMaxItems(settings.max_items_per_group), maxComprehensiveBreakdownItems)
  : 0;
```

Do not change standalone `normalizedMaxItems(options.maxItems)` call sites.

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "caps comprehensive focus breakdown"
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
