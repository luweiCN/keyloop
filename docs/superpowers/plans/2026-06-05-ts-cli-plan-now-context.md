# TS CLI Plan Now Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `runCli(["plan"], { now })` pass the injected clock into adaptive plan generation so CLI plan reports are deterministic.

**Architecture:** Keep clock injection at the CLI boundary. `runCli` already passes `options.now` into `start`, `report`, and app contexts; update only the `plan` command dispatch and `runPlan` signature.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: CLI Plan Uses Injected Now

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write the failing CLI test**

Add this test next to the existing plan command test:

```ts
test("plan command uses injected now for recent history cutoff", async () => {
  const dir = await tempDir();
  try {
    await appendSessionToPath(
      defaultSessionRecord({
        started_at: "2020-01-02T03:00:00.000Z",
        typed_len: 20,
        accuracy: 80,
        token_stats: [
          {
            token: "performance",
            kind: "word",
            start_delay_ms: 500,
            duration_ms: 500,
            errors: 2,
          },
        ],
      }),
      sessionLogPath(dir),
    );

    const result = await runCli(["--language", "en", "plan"], {
      env: { KEYLOOP_HOME: dir },
      now: new Date("2020-01-02T04:00:00.000Z"),
    });

    expect(result.stdout).toContain("performance");
    expect(result.stdout).toContain("Accuracy is below 95%");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "plan command uses injected now for recent history cutoff"`

Expected: FAIL because `runPlan` calls `buildPlan(records, language)` without `options.now`.

- [x] **Step 3: Pass now through plan dispatch**

Change the plan command dispatch:

```ts
case "plan":
  return runPlan(dataDir, parsed.language, options.now);
```

Change `runPlan`:

```ts
async function runPlan(
  dataDir: string,
  language: Language,
  now: Date | undefined,
): Promise<RunCliResult> {
  const records = await loadSessionsFromPath(sessionLogPath(dataDir));
  const plan = buildPlan(records, language, now);
  return { stdout: planReport(plan, language) };
}
```

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "plan command uses injected now for recent history cutoff" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck && bun run build && git diff --check`

Expected: PASS.
