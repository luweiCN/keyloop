# TS Personal Vocabulary Alias Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ensure personal vocabulary aliases loaded from permissive storage are trimmed before being emitted into practice target text.

**Architecture:** Keep storage parsing backward-compatible and normalize aliases at target-generation boundaries. Use one local helper in `targets.ts` so standalone breakdown and comprehensive injection produce the same alias line format.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Trim Personal Vocabulary Aliases in Generated Targets

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write failing target-generation assertions**

In `ts/tests/targets.test.ts`, use an alias with surrounding whitespace for personal vocabulary entries and keep the expected clean line:

```ts
aliases: [" ser "],
```

Expected assertions:

```ts
expect(target.text).toContain("ser serialization");
expect(target.text).not.toContain(" ser  serialization");
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/targets.test.ts --test-name-pattern "standalone long-word breakdown follows personal focus built-in order"
```

Expected: FAIL because the generated alias line currently preserves surrounding whitespace.

- [x] **Step 3: Write minimal implementation**

Add a local helper in `ts/src/training/targets.ts`:

```ts
function firstTrimmedAlias(aliases: string[] | undefined): string | undefined {
  return aliases?.map((value) => value.trim()).find((value) => value.length > 0);
}
```

Use it in both `breakdownCandidateLines()` and `personalVocabularyBreakdownLines()`.

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
