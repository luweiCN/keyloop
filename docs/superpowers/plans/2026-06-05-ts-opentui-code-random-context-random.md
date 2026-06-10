# TS OpenTUI Code Random Context Random Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make OpenTUI `code_random_mix` use the injected `BuildTargetContext.random` source instead of global `Math.random`.

**Architecture:** Keep code random selection local to `appModel.ts`, but thread a `random` function through `randomCodeLevel` and `contextWithRandomCodeSelection`. Default to `Math.random` only when `context.random` is absent.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Context Random For Code Random Mix

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Write the failing test**

Add a test after the current `code random mix starts one concrete specialist level` test:

```ts
test("code random mix uses context random source", () => {
  const randomValues = [0.4, 0.75];
  const context = appContext({
    random: () => randomValues.shift() ?? 0,
  });
  const originalRandom = Math.random;
  const submenu = activateOpenTuiMenuItem(
    createOpenTuiInitialState("en", {
      codeFilters: createOpenTuiCodeFilterState({
        options: [
          { facet: "language", value: "solidity", count: 3 },
          { facet: "framework", value: "react", count: 2 },
        ],
        selected: [
          { facet: "language", value: "solidity" },
          { facet: "framework", value: "react" },
        ],
      }),
    }),
    "code",
    context,
  );

  Math.random = () => 0;
  try {
    const running = activateOpenTuiMenuItem(submenu, "code_random_mix", context);

    expect(running.route.screen).toBe("running");
    if (running.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.route.target.source).toContain("level=function");
    expect(running.route.target.source).toContain("framework=react");
    expect(running.route.target.source).not.toContain("level=block");
    expect(running.route.target.source).not.toContain("lang=solidity");
  } finally {
    Math.random = originalRandom;
  }
});
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "code random mix uses context random source"`

Expected: FAIL because current code uses global `Math.random`, selecting `block` and `lang=solidity`.

- [x] **Step 3: Implement minimal code**

In `ts/src/ui/opentui/appModel.ts`:

```ts
function randomCodeLevel(random: () => number): CodePracticeConcreteLevel {
  return codeRandomLevels[Math.floor(random() * codeRandomLevels.length)] ?? "block";
}

function contextWithRandomCodeSelection(
  context: BuildTargetContext,
  state: OpenTuiAppState,
): BuildTargetContext {
  const random = context.random ?? Math.random;
  // use randomCodeLevel(random)
  // use selected[Math.floor(random() * selected.length)]
}
```

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/opentuiApp.test.ts --test-name-pattern "code random mix uses context random source" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck`

Expected: PASS.
