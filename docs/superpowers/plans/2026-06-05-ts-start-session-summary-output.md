# TS Start Session Summary Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TypeScript `start` command print the same completed-session summary shape as Rust after saved sessions.

**Architecture:** Keep the existing `sessionSummary` report function as the single formatter. Update `runStartRunner` to track the append path from saved records and print the latest record summary plus the multi-session saved count when applicable.

**Tech Stack:** TypeScript, Bun test, existing KeyLoop CLI/report/storage modules.

---

### Task 1: Add CLI Output Regression Test

**Files:**
- Modify: `ts/tests/cli.test.ts`

- [x] **Step 1: Update the existing completed-record test**

Change the `start appends completed records returned by runner` assertion so it expects the Rust-style summary:

```ts
expect(result.stdout).toContain("已保存练习记录到");
expect(result.stdout).toContain(sessionLogPath(dir));
expect(result.stdout).toContain("模式:");
expect(result.stdout).toContain("WPM:");
expect(result.stdout).not.toContain("已完成 1 次练习");
```

- [x] **Step 2: Run focused test to verify RED**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "start appends completed records returned by runner"`

Expected: FAIL because `runStartRunner` still prints `已完成 1 次练习。`.

### Task 2: Use Session Summary in `start` Output

**Files:**
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Import the formatter**

Add `sessionSummary` to the report import list:

```ts
import {
  codePracticeOptions,
  extractSnippets,
  type CodeSnippet,
} from "./content/snippets";
```

becomes the existing report import plus `sessionSummary`.

- [x] **Step 2: Return saved path from `saveSessionRecord`**

Change `saveSessionRecord` to return the path from `appendSessionToPath`:

```ts
async function saveSessionRecord(
  record: SessionRecord,
  dataDir: string,
): Promise<string> {
  const savedTo = await appendSessionToPath(record, sessionLogPath(dataDir));
  await updateKeyStatsFromCompletedRecords([record], dataDir);
  await clearSessionCheckpointAtPath(currentSessionPath(dataDir));
  return savedTo;
}
```

- [x] **Step 3: Track the latest saved path in `runStartRunner`**

Inside `runStartRunner`, keep `lastSavedTo` updated from `saveSessionRecord(record, dataDir)`.

- [x] **Step 4: Print Rust-style output**

When records were saved, print:

```ts
const lastRecord = persistedRecords[persistedRecords.length - 1];
const savedTo = lastSavedTo ?? result.lastSavedTo ?? sessionLogPath(dataDir);
const lines = [sessionSummary(lastRecord, savedTo, language)];
if (persistedRecords.length > 1) {
  lines.push(
    language === "zh"
      ? `已保存 ${persistedRecords.length} 次练习。`
      : `Saved ${persistedRecords.length} sessions.`,
  );
}
return { stdout: `${lines.join("\n\n")}\n` };
```

- [x] **Step 5: Run focused test to verify GREEN**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "start appends completed records returned by runner"`

Expected: PASS.

### Task 3: Regression Verification

**Files:**
- Verify only.

- [x] **Step 1: Run affected CLI tests**

Run: `bun test ts/tests/cli.test.ts`

Expected: PASS.

- [x] **Step 2: Run TS quality gates**

Run: `bun test ts/tests`

Run: `bun run typecheck`

Run: `bun run build`

Expected: all PASS.

- [x] **Step 3: Run diff hygiene**

Run: `git diff --check`

Expected: no output and exit 0.
