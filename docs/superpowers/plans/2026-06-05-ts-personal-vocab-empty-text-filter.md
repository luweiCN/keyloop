# TS Personal Vocabulary Empty Text Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prevent invalid blank personal vocabulary entries loaded from storage from entering ranking or generated practice targets.

**Architecture:** Keep storage parsing permissive for backward compatibility, but enforce practice eligibility at `rankPersonalVocabulary()`. This protects all callers that depend on ranking, including standalone personal vocabulary practice and daily module injection.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Filter Blank Personal Vocabulary Entries

**Files:**
- Modify: `ts/tests/vocabulary.test.ts`
- Modify: `ts/src/training/vocabulary.ts`

- [x] **Step 1: Write the failing test**

Add this test near the existing archived-entry exclusion test in `ts/tests/vocabulary.test.ts`:

```ts
test("blank personal vocabulary entries are excluded", () => {
  const ranked = rankPersonalVocabulary([
    entry("blank", "   ", 3),
    entry("active", "internationalization", 1),
  ]);

  expect(ranked.map((item) => item.entry.text)).toEqual(["internationalization"]);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/vocabulary.test.ts --test-name-pattern "blank personal vocabulary entries are excluded"
```

Expected: FAIL because the blank text entry is currently ranked.

- [x] **Step 3: Write minimal implementation**

Change `rankPersonalVocabulary()` in `ts/src/training/vocabulary.ts` so the ranked input filters active, non-blank entries:

```ts
  const ranked = entries
    .filter((entry) => !entry.archived && entry.text.trim().length > 0)
    .map((entry) => rankEntry(entry, recentRecords))
```

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
bun test ts/tests && bun run typecheck
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: all commands exit 0. If the known flaky Rust content picker test fails, rerun once and report it explicitly.
