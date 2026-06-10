# TS Programming Common Terms Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ensure built-in Programming Basics content includes common non-keyword programming/business state terms from the migration contract.

**Architecture:** Keep the existing `programming_words` target-generation path unchanged and expand its JSON source with curated project-authored terms. Add a content-library test that makes these terms a stable content contract.

**Tech Stack:** TypeScript, Bun test runner, JSON content files.

---

### Task 1: Add Curated Common Programming Terms

**Files:**
- Modify: `ts/tests/content.test.ts`
- Modify: `content/programming_words.json`

- [x] **Step 1: Write the failing content coverage test**

Add this test to `ts/tests/content.test.ts`:

```ts
test("programming words include common non-keyword state terms", async () => {
  const library = await loadContentLibrary();
  expect(library.programming_words).toEqual(
    expect.arrayContaining([
      "enabled",
      "pending",
      "selected",
      "visible",
      "archived",
      "configuration",
      "preference",
      "performance",
    ]),
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/content.test.ts --test-name-pattern "programming words include common non-keyword state terms"
```

Expected: FAIL because these words are not all present in the built-in `programming_words` corpus.

- [x] **Step 3: Add minimal curated terms**

Add the missing terms to `content/programming_words.json` in the existing alphabetical-ish list:

```json
"archived",
"available",
"compatible",
"configuration",
"enabled",
"initialization",
"pending",
"performance",
"preference",
"selected",
"serialized",
"synchronization",
"visible"
```

Keep the JSON as a plain string array and avoid adding a new schema.

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/content.test.ts
```

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
bun test ts/tests && bun run typecheck
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: all commands exit 0.
