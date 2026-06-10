# TS Foundation Used Lines Source Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript foundation drill line reuse match Rust by excluding only lines previously used for the same foundation drill source.

**Architecture:** Keep foundation mix generation unchanged except for the used-line filter. Pass the selected drill id into `usedFoundationLines` and match exact `keyloop:foundation:<drill_id>` sources like Rust.

**Tech Stack:** TypeScript, Bun test, existing target generation tests.

---

### Task 1: Add RED Test For Cross-Drill Shared Lines

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add a test under target generation core**

Add a test where a previous `top-row` record contains a line also present in the selected `punctuation-edges` drill. The selected punctuation drill should still be allowed to use that shared line.

```ts
test("daily foundation mix only avoids lines from the selected drill source", () => {
  const library = foundationDrillLibrary();
  const punctuation = library.foundation_drills.find(
    (drill) => drill.id === "punctuation-edges",
  );
  if (punctuation === undefined) {
    throw new Error("expected punctuation drill");
  }
  punctuation.items = ["shared line", ...numberedLines("punctuation line", 9)];

  const daily = buildDailyPracticePlan({
    records: [
      defaultSessionRecord({
        source: "keyloop:foundation:top-row",
        target_text: "shared line",
      }),
    ],
    plan: unfocusedPlan({ focus_keys: [";"], has_recent_history: true }),
    library,
    random: sequenceRandom(Array.from({ length: 20 }, () => 0.999)),
  });

  const foundation = daily.lessons.find(
    (lesson) => lesson.module === "foundation_input",
  );
  const lines = foundation?.target.text.split("\n") ?? [];

  expect(lines).toContain("shared line");
});
```

- [x] **Step 2: Run focused test to verify RED**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "daily foundation mix only avoids lines from the selected drill source"`

Expected: FAIL because TypeScript currently excludes all lines from any `keyloop:foundation:*` source.

### Task 2: Match Rust Source Filtering

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Pass selected drill id into used-line filter**

Change:

```ts
const usedLines = usedFoundationLines(context.records);
```

to:

```ts
const usedLines = usedFoundationLines(context.records, drill?.id);
```

- [x] **Step 2: Require exact source match**

Change `usedFoundationLines` to:

```ts
function usedFoundationLines(
  records: SessionRecord[],
  drillId: string | undefined,
): Set<string> {
  if (drillId === undefined) {
    return new Set();
  }
  const source = `keyloop:foundation:${drillId}`;
  const used = new Set<string>();
  for (const record of records) {
    if (record.source !== source) {
      continue;
    }
    for (const line of record.target_text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        used.add(trimmed);
      }
    }
  }
  return used;
}
```

- [x] **Step 3: Run focused test to verify GREEN**

Run: `bun test ts/tests/targets.test.ts --test-name-pattern "daily foundation mix (avoids recently practiced drill lines|only avoids lines from the selected drill source)"`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify only.

- [x] **Step 1: Run target tests**

Run: `bun test ts/tests/targets.test.ts`

Expected: PASS.

- [x] **Step 2: Run TS gates**

Run: `bun test ts/tests`

Run: `bun run typecheck`

Expected: PASS.

- [x] **Step 3: Run diff hygiene**

Run: `git diff --check`

Expected: no output and exit 0.
