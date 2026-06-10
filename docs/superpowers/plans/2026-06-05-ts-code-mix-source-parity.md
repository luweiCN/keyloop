# TS Code Mix Source Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make comprehensive code practice target sources match the migration contract for built-in, repo-only, and repo-plus-fallback code lessons.

**Architecture:** Add an optional `localCodeSource` to `BuildTargetContext`, set it from CLI `--repo`, and compute source labels in `codeMixTarget` from the actual picked local/built-in snippets. Keep picker APIs unchanged.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Code Mix Source Labels

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/src/training/targets.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write the failing tests**

Add tests near existing daily code practice tests:

```ts
test("daily code practice source labels built-in repo and fallback origins", () => {
  const builtInOnly = buildDailyPracticePlan({
    records: [],
    plan: testPlan(),
    library: testLibrary(),
  }).lessons.find((lesson) => lesson.module === "code_practice");
  expect(builtInOnly?.target.source).toBe("keyloop:code-corpus");

  const repoOnly = buildDailyPracticePlan({
    records: [],
    plan: testPlan(),
    library: testLibrary(),
    localCodeSource: "/tmp/project",
    localCodeSnippets: localCodeSnippets(3),
  }).lessons.find((lesson) => lesson.module === "code_practice");
  expect(repoOnly?.target.source).toBe("/tmp/project");

  const repoPlusFallback = buildDailyPracticePlan({
    records: [],
    plan: testPlan(),
    library: testLibrary(),
    localCodeSource: "/tmp/project",
    localCodeSnippets: localCodeSnippets(1),
  }).lessons.find((lesson) => lesson.module === "code_practice");
  expect(repoPlusFallback?.target.source).toBe("/tmp/project + keyloop:fallback-code");
});
```

Use a helper:

```ts
function localCodeSnippets(count: number): CodeSnippet[] {
  return Array.from({ length: count }, (_, index): CodeSnippet => ({
    text: `function localSelected${index + 1}() {\n  return selected;\n}`,
    source: `src/local${index + 1}.ts:1`,
    difficulty: "medium",
    score: 20 + index,
    language: "typescript",
    framework: "local",
    project: "local-repo",
    level: "function",
  }));
}
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "daily code practice source labels built-in repo and fallback origins"`

Expected: FAIL because current source is fixed to `keyloop:module:code-practice-mix`.

- [x] **Step 3: Implement minimal code**

In `BuildTargetContext`, add:

```ts
localCodeSource?: string;
```

In `codeMixTarget`, compute source from picked counts:

```ts
const localPickedCount = localSnippets.length;
const source =
  localPickedCount === 0
    ? "keyloop:code-corpus"
    : localPickedCount === snippets.length
      ? context.localCodeSource ?? "keyloop:local-code"
      : `${context.localCodeSource ?? "keyloop:local-code"} + keyloop:fallback-code`;
```

Use `source` in returned `PracticeTarget`.

In `ts/src/cli.ts`, when `command.repo` is present, set `targetContext.localCodeSource = command.repo`.

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "daily code practice source labels built-in repo and fallback origins" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck`

Expected: PASS.
