# TS Bare App Saved Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bare `keyloop` use the saved `preferences.interface_language`, matching the Rust TUI/start behavior.

**Architecture:** Keep language resolution at the CLI app boundary. `runApp` already loads preferences before creating the OpenTUI app context; use `preferences.interface_language` for app context, plan generation, and preference-change comparison.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Bare App Reads Saved Interface Language

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write the failing CLI app test**

Add this test near the existing bare keyloop app tests:

```ts
test("bare keyloop uses saved interface language", async () => {
  const dir = await tempDir();
  let contextLanguage: Language | undefined;
  try {
    await savePreferencesToPath(defaultPreferences("en"), preferencesPath(dir));

    await runCli([], {
      env: { KEYLOOP_HOME: dir },
      appRunner: async (context) => {
        contextLanguage = context.language;
        return {
          state: createOpenTuiInitialState(context.language),
          action: "quit",
        };
      },
    });

    expect(contextLanguage).toBe("en");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "bare keyloop uses saved interface language"`

Expected: FAIL because current `runApp` uses parsed CLI default language `zh`.

- [x] **Step 3: Use preferences language in app context**

In `runApp`, after loading preferences, derive:

```ts
const effectiveLanguage = preferences.interface_language;
```

Use `effectiveLanguage` for:

- `buildPlan(records, effectiveLanguage, options.now)`
- `context.language`
- `preferencesFromAppState(preferences, appResult.state, effectiveLanguage)`

Leave `plan`, `report`, and `help` command language behavior unchanged.

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/cli.test.ts --test-name-pattern "bare keyloop uses saved interface language" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck && bun run build && git diff --check`

Expected: PASS.
