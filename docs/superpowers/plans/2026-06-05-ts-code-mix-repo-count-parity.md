# TS Code Mix Repo Count Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make comprehensive code practice follow the migration contract for repo snippets: use 3 total snippets when repo snippets are available, otherwise use 4 built-in snippets.

**Architecture:** Keep picker APIs unchanged. Adjust only `codeMixTarget` count selection in `ts/src/training/targets.ts` based on whether local repo snippets are available.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Repo Snippet Count Rule

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing test**

Add a test near the existing daily code practice tests:

```ts
test("daily code practice limits repo-backed plans to three snippets", () => {
  const localCodeSnippets = Array.from({ length: 4 }, (_, index): CodeSnippet => ({
    text: `function localSelected${index + 1}() {\n  return selected;\n}`,
    source: `src/local${index + 1}.ts:1`,
    difficulty: "medium",
    score: 20 + index,
    language: "typescript",
    framework: "local",
    project: "local-repo",
    level: "function",
  }));

  const daily = buildDailyPracticePlan({
    records: [],
    plan: testPlan(),
    library: testLibrary(),
    localCodeSnippets,
  });
  const code = daily.lessons.find((lesson) => lesson.module === "code_practice");

  expect(code?.target.text.split("\n\n")).toHaveLength(3);
});
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "daily code practice limits repo-backed plans to three snippets"`

Expected: FAIL because the current implementation targets 4 snippets even when repo snippets exist.

- [x] **Step 3: Implement minimal code**

In `codeMixTarget`, derive the target count from local snippet availability:

```ts
const hasLocalSnippetCandidates = (context.localCodeSnippets?.length ?? 0) > 0;
const targetCount = hasLocalSnippetCandidates ? 3 : 4;
```

Use `targetCount` for local picker count and built-in fallback count:

```ts
count: targetCount
Math.max(0, targetCount - localSnippets.length)
```

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "daily code practice limits repo-backed plans to three snippets" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck`

Expected: PASS.
