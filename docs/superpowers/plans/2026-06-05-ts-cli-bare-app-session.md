# TS CLI Bare App Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route bare `keyloop` / `runCli([])` in the TypeScript CLI into the OpenTUI app session while keeping `keyloop start` on the existing live typing runner.

**Architecture:** `parseCliArgs([])` continues returning `command: null`. `runCli` treats `null` as the interactive app entry, loads the same persisted data used by app model/stats, and delegates to an injectable `appRunner` for tests or to `runOpenTuiAppSession` in production. Existing command subtrees (`start`, `plan`, `report`, `sources`, `import`, `vocab`) keep their current dispatch behavior.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing KeyLoop storage/content/training modules, OpenTUI app session adapter.

---

### Task 1: Add Failing CLI Dispatch Test

**Files:**
- Modify: `ts/tests/cli.test.ts`

- [x] **Step 1: Write the failing test**

Add a test under `describe("TS CLI command dispatch", ...)` before the `start builds daily plan...` test:

```ts
  test("bare keyloop loads app context and delegates to injected app runner", async () => {
    const dir = await tempDir();
    const calls: Array<{
      language: Language;
      records: SessionRecord[];
      dataDir: string;
      codeConfig: CodePracticeConfig;
      keyCount: number;
      personalVocabularyCount: number;
      personalVocabularyLimit: number | undefined;
    }> = [];
    try {
      await appendSessionToPath(
        defaultSessionRecord({
          id: "existing-session",
          started_at: "2026-06-05T03:00:00.000Z",
          duration_ms: 60_000,
          active_ms: 30_000,
          typed_len: 120,
          correct_chars: 114,
          accuracy: 95,
        }),
        sessionLogPath(dir),
      );
      await savePreferencesToPath(
        {
          interface_language: "zh",
          pinned_code_filters: [],
          global_code_filters: [
            { facet: "language", value: "typescript" },
            { facet: "framework", value: "opentui" },
          ],
          everyday_english: {
            word_count: 50,
            sentence_length: "mixed",
            include_phrases: true,
          },
          word_breakdown: {
            enabled_in_comprehensive: true,
            max_items_per_group: 6,
          },
          personal_vocabulary: {
            enabled_in_comprehensive: true,
            daily_review_limit: 5,
          },
        },
        preferencesPath(dir),
      );
      await saveKeyAggregatesToPath(
        [
          {
            key: "=",
            sample_count: 4,
            hit_count: 3,
            miss_count: 1,
            avg_ms: 180,
            fastest_ms: 120,
            slowest_ms: 260,
            filtered_avg_ms: 180,
            error_rate: 25,
            confidence: 260 / 180,
            last_seen_at: "2026-06-05T03:30:00.000Z",
          },
        ],
        keyStatsPath(dir),
      );
      await saveVocabularyStoreToPath(
        {
          version: 1,
          entries: [
            {
              id: "vocab-i18n",
              text: "internationalization",
              kind: "code_term",
              parts: ["international", "ization"],
              aliases: ["i18n"],
              tags: ["programming"],
              priority: 3,
              created_at: "2026-06-05T00:00:00.000Z",
              updated_at: "2026-06-05T00:00:00.000Z",
              archived: false,
            },
          ],
        },
        vocabularyPath(dir),
      );

      const result = await runCli(["--language", "en"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00.000Z"),
        runner: async () => {
          throw new Error("start runner should not be used by bare keyloop");
        },
        appRunner: async (context) => {
          calls.push({
            language: context.language,
            records: context.records,
            dataDir: context.dataDir,
            codeConfig: context.codeConfig,
            keyCount: context.keyAggregates?.length ?? 0,
            personalVocabularyCount: context.personalVocabulary?.length ?? 0,
            personalVocabularyLimit: context.personalVocabularyLimit,
          });
          return { state: { language: context.language, route: { screen: "main_menu" } }, action: "quit" };
        },
      });

      expect(result.stdout).toBe("");
      expect(calls).toEqual([
        {
          language: "en",
          records: [expect.objectContaining({ id: "existing-session" })],
          dataDir: dir,
          codeConfig: {
            language: undefined,
            framework: undefined,
            project: undefined,
            level: undefined,
            languages: ["typescript"],
            frameworks: ["opentui"],
            projects: [],
            match_any: true,
          },
          keyCount: 1,
          personalVocabularyCount: 1,
          personalVocabularyLimit: 5,
        },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/cli.test.ts --timeout 10000
```

Expected: FAIL because `RunCliOptions` has no `appRunner`, and/or bare `runCli(["--language", "en"])` still delegates to `start`.

### Task 2: Implement Bare App Dispatch

**Files:**
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Import app session types and runner**

Add:

```ts
import {
  runOpenTuiAppSession,
  type OpenTuiAppSessionContext,
  type OpenTuiAppSessionResult,
} from "./ui/opentui/appSession";
```

- [x] **Step 2: Add app runner options**

Add:

```ts
export interface AppRunnerContext extends OpenTuiAppSessionContext {
  dataDir: string;
  codeConfig: CodePracticeConfig;
}

export type AppRunner = (
  context: AppRunnerContext,
) => Promise<OpenTuiAppSessionResult>;
```

Then add `appRunner?: AppRunner;` to `RunCliOptions`.

- [x] **Step 3: Dispatch null command to runApp**

Replace the implicit default start command in `runCli`:

```ts
  if (parsed.command === null) {
    return runApp(dataDir, parsed.language, options);
  }

  const command = parsed.command;
```

- [x] **Step 4: Load app context and call app runner**

Add:

```ts
async function runApp(
  dataDir: string,
  language: Language,
  options: RunCliOptions,
): Promise<RunCliResult> {
  const records = await loadSessionsFromPath(sessionLogPath(dataDir));
  const preferences = await loadPreferencesFromPath(preferencesPath(dataDir));
  const library = await loadContentLibrary();
  const plan = buildPlan(records, language, options.now);
  const keyAggregates = await loadKeyAggregatesFromPath(keyStatsPath(dataDir));
  const context: AppRunnerContext = {
    language,
    records,
    plan,
    library,
    codeConfig: codeConfigFromPreferences(preferences),
    dataDir,
  };

  if (keyAggregates.length > 0) {
    context.keyAggregates = keyAggregates;
  }
  if (options.now !== undefined) {
    context.now = options.now;
  }
  if (preferences.personal_vocabulary.enabled_in_comprehensive) {
    const vocabularyStore = await loadVocabularyStoreFromPath(vocabularyPath(dataDir));
    context.personalVocabulary = vocabularyStore.entries;
    context.personalVocabularyLimit =
      preferences.personal_vocabulary.daily_review_limit;
  }

  await (options.appRunner ?? defaultAppRunner)(context);
  return { stdout: "" };
}

async function defaultAppRunner(
  context: AppRunnerContext,
): Promise<OpenTuiAppSessionResult> {
  return runOpenTuiAppSession(context);
}
```

- [x] **Step 5: Run focused test**

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

Expected: no whitespace errors; `plan` command prints `Next KeyLoop plan` and exits 0. Do not run bare `keyloop` here because it now enters the interactive app session.

- [x] **Step 4: Update this plan checklist**

Mark all completed task checkboxes with `[x]`.
