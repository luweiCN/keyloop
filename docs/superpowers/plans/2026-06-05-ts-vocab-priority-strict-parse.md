# TS Vocabulary Priority Strict Parse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make `keyloop vocab add --priority` accept only exact `1`, `2`, or `3` values.

**Architecture:** Keep the existing CLI parser shape and tighten only `parsePersonalVocabularyPriority()`. This prevents malformed values such as `2x` or `2.5` from being silently accepted by `Number.parseInt`.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Reject Partial Priority Numbers

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write the failing parser test**

Add this test after the existing `vocab commands parse` test:

```ts
test("vocab priority must be an exact supported value", () => {
  expect(() =>
    parseCliArgs(["vocab", "add", "performance", "--priority", "2x"]),
  ).toThrow("--priority must be 1, 2, or 3");
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/cli.test.ts --test-name-pattern "vocab priority must be an exact supported value"
```

Expected: FAIL because `2x` is currently parsed as priority `2`.

- [x] **Step 3: Write minimal implementation**

Change `parsePersonalVocabularyPriority()` in `ts/src/cli.ts`:

```ts
function parsePersonalVocabularyPriority(value: string): PersonalVocabularyPriority {
  if (value === "1" || value === "2" || value === "3") {
    return Number(value) as PersonalVocabularyPriority;
  }
  throw new Error("--priority must be 1, 2, or 3");
}
```

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/cli.test.ts --test-name-pattern "vocab"
```

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
bun test ts/tests && bun run typecheck
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: all commands exit 0.
