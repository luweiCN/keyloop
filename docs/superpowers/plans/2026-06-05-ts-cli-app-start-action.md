# TS CLI App Start Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When bare `keyloop` enters the OpenTUI app session and the user selects a practice item, continue into the existing OpenTUI start runner instead of exiting.

**Architecture:** Keep `runOpenTuiAppSession` responsible only for menu navigation and returning `action: "start"` with a `running` route. `runCli` then converts that route into a `StartRunnerContext`, delegates to the same `StartRunner` used by `keyloop start`, and reuses the existing persistence path for completed records and key stats. Standalone routes use an empty `daily_run_id` so they do not complete comprehensive daily plan lessons.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing OpenTUI app model/session/start runner, existing storage persistence helpers.

---

### Task 1: Lock Standalone StartRunner Metadata

**Files:**
- Modify: `ts/tests/opentuiStartRunner.test.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`

- [x] **Step 1: Write failing test**

Add a test showing a plan with empty `run_id` produces standalone session metadata:

```ts
  test("empty daily run id records standalone lesson metadata", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "",
          kind: "words",
          module: "programming_basics",
          category: "personal_vocabulary",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "words", text: "i18n", source: "test:standalone" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };

    const runPromise = runner(contextWithPlan(plan));
    await kit.waitForKeyListener(1);

    nowMs = 10_100;
    kit.emitKey({ name: "i", sequence: "i" });
    nowMs = 10_200;
    kit.emitKey({ name: "1", sequence: "1" });
    nowMs = 10_300;
    kit.emitKey({ name: "8", sequence: "8" });
    nowMs = 10_400;
    kit.emitKey({ name: "n", sequence: "n" });
    await kit.waitForKeyListener(2);

    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    const record = result.completedRecords[0];

    expect(record?.daily_run_id).toBe("");
    expect(record?.lesson_id).toBe("");
    expect(record?.lesson_index).toBeNull();
    expect(record?.module).toBe("programming_basics");
    expect(record?.category).toBe("personal_vocabulary");
  });
```

- [x] **Step 2: Run focused test and confirm failure**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts --timeout 10000
```

Expected: FAIL because `recordOptions` currently sets `lesson_index: 0` for every lesson.

- [x] **Step 3: Implement standalone record options**

In `recordOptions`, return empty lesson linkage when `context.dailyPlan.run_id.length === 0`:

```ts
    daily_run_id: "",
    lesson_id: "",
    lesson_index: null,
```

Keep module/category/completion_state from the selected lesson.

- [x] **Step 4: Run focused test and confirm pass**

Run:

```bash
bun test ts/tests/opentuiStartRunner.test.ts --timeout 10000
```

Expected: PASS.

### Task 2: Bridge App Start Action In CLI

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write failing CLI test**

Add a test under `describe("TS CLI command dispatch", ...)` after the bare app context test. It should:
- run `runCli(["--language", "en"])`
- make `appRunner` return `action: "start"` with a `running` route
- make the injected `runner` return one completed record
- assert that the record is appended and the result says `Completed 1 sessions.`

- [x] **Step 2: Run CLI focused test and confirm failure**

Run:

```bash
bun test ts/tests/cli.test.ts --timeout 10000
```

Expected: FAIL because `runApp` currently ignores `action: "start"`.

- [x] **Step 3: Factor shared start runner persistence**

Extract the part of `runStart` after daily plan creation into a helper:

```ts
async function runStartRunner(
  context: StartRunnerContext,
  dataDir: string,
  options: RunCliOptions,
): Promise<RunCliResult>
```

It should call `saveStartCheckpoint`, the selected runner, append completed records, update key stats, clear checkpoint after completed save, and return the existing localized stdout.

- [x] **Step 4: Build start context from app session result**

Add a helper that converts a `running` route into `StartRunnerContext`:
- `source_item === "comprehensive"`: load/create the persisted daily plan from a fresh daily plan.
- other source items: build a one-lesson standalone daily plan with empty `run_id`.

- [x] **Step 5: Make `runApp` continue into runner**

After `appRunner` returns:

```ts
const result = await (options.appRunner ?? defaultAppRunner)(context);
if (result.action !== "start") {
  return { stdout: "" };
}
const startContext = await startContextFromAppState(result.state, context, dataDir, options);
return startContext === undefined
  ? { stdout: "" }
  : runStartRunner(startContext, dataDir, options);
```

- [x] **Step 6: Run focused CLI test and confirm pass**

Run:

```bash
bun test ts/tests/cli.test.ts --timeout 10000
```

Expected: PASS.

### Task 3: Full Verification

**Files:**
- Verify: TypeScript and Rust test suites
- Modify: this plan file checkbox statuses

- [x] **Step 1: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 2: Run Rust tests**

Run:

```bash
cargo test --locked --all-targets
```

Expected: all Rust unit and CLI tests pass.

- [x] **Step 3: Run whitespace and non-interactive CLI check**

Run:

```bash
git diff --check && tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; exit_code=$?; rm -rf "$tmpdir"; exit $exit_code
```

Expected: no whitespace errors; `plan` command prints `Next KeyLoop plan` and exits 0.

- [x] **Step 4: Update this plan checklist**

Mark all completed task checkboxes with `[x]`.
