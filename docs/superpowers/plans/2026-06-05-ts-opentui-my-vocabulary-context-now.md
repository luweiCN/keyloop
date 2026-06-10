# TS OpenTUI My Vocabulary Context Now Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the OpenTUI `my_vocabulary` standalone practice entry preserve injected time when it delegates to personal vocabulary target generation.

**Architecture:** Keep `buildPersonalVocabularyPracticeTarget` unchanged; it already accepts `now`. Pass `vocabularyContext.now` from `activateSubmenuItem` for the `my_vocabulary` route.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Pass Context Time Through My Vocabulary

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Write the failing test**

Add a test after the existing `my vocabulary starts personal vocabulary target without archived entries` test:

```ts
test("my vocabulary ranks entries with injected now", () => {
  const context = appContext({
    records: [
      defaultSessionRecord({
        started_at: "2020-01-02T03:00:00.000Z",
        target_text: "performance",
        token_stats: [
          {
            token: "performance",
            kind: "word",
            start_delay_ms: 0,
            duration_ms: 0,
            errors: 1,
          },
        ],
      }),
    ],
    personalVocabulary: [
      // performance and collaboration entries, same priority
    ],
    personalVocabularyLimit: 2,
    now: new Date("2020-01-02T04:00:00.000Z"),
  });
  const submenu = activateOpenTuiMenuItem(
    createOpenTuiInitialState("en"),
    "programming",
    context,
  );
  const running = activateOpenTuiMenuItem(submenu, "my_vocabulary", context);

  expect(running.route.screen).toBe("running");
  if (running.route.screen !== "running") {
    throw new Error("expected running route");
  }
  expect(running.route.target.text.indexOf("per form ance")).toBeLessThan(
    running.route.target.text.indexOf("collabor ation"),
  );
});
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "my vocabulary ranks entries with injected now"`

Expected: FAIL because the OpenTUI route does not pass `now` to `buildPersonalVocabularyPracticeTarget`.

- [x] **Step 3: Implement minimal code**

In `ts/src/ui/opentui/appModel.ts`, change the `my_vocabulary` call options:

```ts
{
  maxItems: vocabularyContext.personalVocabularyLimit ?? 8,
  ...(vocabularyContext.now === undefined ? {} : { now: vocabularyContext.now }),
}
```

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "my vocabulary ranks entries with injected now" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck`

Expected: PASS.
