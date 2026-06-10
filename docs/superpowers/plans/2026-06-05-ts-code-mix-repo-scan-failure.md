# TS Code Mix Repo Scan Failure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `keyloop start --repo <path>` fall back to built-in code practice when repo scanning fails and expose `keyloop:code-corpus (repo scan failed: <error>)` in the generated source.

**Architecture:** Keep `extractSnippets` strict for invalid roots. Catch scan errors in CLI start, store the error message on `BuildTargetContext`, and let `codeMixTarget` render the failure source when no local snippets were picked.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Repo Scan Failure Fallback

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/content/snippets.ts`
- Modify: `ts/src/cli.ts`
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Write the failing test**

Add a CLI test near existing start repo tests:

```ts
test("start repo scan failure falls back to built-in code source", async () => {
  const dir = await tempDir();
  try {
    const missingRepo = join(dir, "missing-repo");
    let codeSource = "";

    await runCli(["start", "--repo", missingRepo], {
      env: { KEYLOOP_HOME: dir },
      now: new Date("2026-06-05T04:00:00.000Z"),
      runner: async (context) => {
        codeSource =
          context.dailyPlan.lessons.find(
            (lesson) => lesson.module === "code_practice",
          )?.target.source ?? "";
        return { completedRecords: [] };
      },
    });

    expect(codeSource).toStartWith("keyloop:code-corpus (repo scan failed:");
    expect(codeSource).toContain("missing-repo");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "start repo scan failure falls back to built-in code source"`

Expected: FAIL because current code silently treats missing repo as an empty scan and source is `keyloop:code-corpus`.

- [x] **Step 3: Implement minimal code**

In `BuildTargetContext`, add:

```ts
localCodeScanError?: string;
```

In `extractSnippets`, validate `repoPath` before walking:

```ts
const rootMetadata = await stat(root);
if (!rootMetadata.isDirectory()) {
  throw new Error(`${root} is not a directory`);
}
```

In CLI `runStart`, catch scan errors:

```ts
let localCodeSnippets: CodeSnippet[] = [];
let localCodeScanError: string | undefined;
if (command.repo !== undefined) {
  try {
    localCodeSnippets = await extractSnippets(command.repo);
  } catch (error) {
    localCodeScanError = error instanceof Error ? error.message : String(error);
  }
}
```

Pass `localCodeScanError` into target context only when defined.

In `codeMixSource`, when `localSnippetCount === 0` and `localCodeScanError` exists, return:

```ts
`keyloop:code-corpus (repo scan failed: ${localCodeScanError})`
```

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "start repo scan failure falls back to built-in code source" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck`

Expected: PASS.
