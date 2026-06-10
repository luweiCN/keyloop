# TS Everyday Long Word Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ensure the Everyday practice “Long word breakdown” standalone entry selects everyday/workplace long words instead of programming technical vocabulary.

**Architecture:** Extend `BuildLongWordBreakdownPracticeOptions` with an optional multi-domain filter while preserving the existing single `domain` option. The OpenTUI Everyday menu uses `domains: ["everyday", "workplace"]`; the Programming “Technical long words” entry keeps the existing `domain: "programming"` behavior.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Add Multi-Domain Filtering for Everyday Long Words

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/src/training/targets.ts`
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Write the failing OpenTUI test**

Add this test near the existing long-word OpenTUI tests:

```ts
test("everyday long word breakdown uses everyday and workplace domains", () => {
  const submenu = activateOpenTuiMenuItem(
    createOpenTuiInitialState("en"),
    "everyday",
    appContext({
      personalVocabulary: [
        {
          id: "vocab-serialization",
          text: "serialization",
          kind: "code_term",
          parts: ["serial", "ization"],
          aliases: [],
          tags: ["programming"],
          priority: 3,
          created_at: "2026-06-05T00:00:00.000Z",
          updated_at: "2026-06-05T00:00:00.000Z",
          archived: false,
        },
        {
          id: "vocab-collaboration",
          text: "collaboration",
          kind: "word",
          parts: ["collabor", "ation"],
          aliases: [],
          tags: ["workplace"],
          priority: 2,
          created_at: "2026-06-05T00:00:00.000Z",
          updated_at: "2026-06-05T00:00:00.000Z",
          archived: false,
        },
      ],
    }),
  );
  const running = activateOpenTuiMenuItem(
    submenu,
    "long_word_breakdown",
    appContext({
      personalVocabulary: [
        {
          id: "vocab-serialization",
          text: "serialization",
          kind: "code_term",
          parts: ["serial", "ization"],
          aliases: [],
          tags: ["programming"],
          priority: 3,
          created_at: "2026-06-05T00:00:00.000Z",
          updated_at: "2026-06-05T00:00:00.000Z",
          archived: false,
        },
        {
          id: "vocab-collaboration",
          text: "collaboration",
          kind: "word",
          parts: ["collabor", "ation"],
          aliases: [],
          tags: ["workplace"],
          priority: 2,
          created_at: "2026-06-05T00:00:00.000Z",
          updated_at: "2026-06-05T00:00:00.000Z",
          archived: false,
        },
      ],
    }),
  );

  expect(running.route.screen).toBe("running");
  if (running.route.screen !== "running") {
    throw new Error("expected running route");
  }
  expect(running.route.target.text).toContain("collabor ation");
  expect(running.route.target.text).not.toContain("serial ization");
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts --test-name-pattern "everyday long word breakdown uses everyday and workplace domains"
```

Expected: FAIL because the entry currently has no domain filter and selects the higher-priority programming vocabulary.

- [x] **Step 3: Write minimal implementation**

In `ts/src/training/targets.ts`, update options:

```ts
domains?: LongWordEntry["domain"][];
```

Add a helper that treats `domains` as preferred and `domain` as backward-compatible single-domain input:

```ts
function matchesAllowedDomain(
  candidateDomain: LongWordEntry["domain"],
  domain: LongWordEntry["domain"] | undefined,
  domains: LongWordEntry["domain"][] | undefined,
): boolean {
  const allowed = domains ?? (domain === undefined ? undefined : [domain]);
  return allowed === undefined || allowed.includes(candidateDomain);
}
```

Use it from both long-word and personal-vocabulary domain matchers.

In `ts/src/ui/opentui/appModel.ts`, change the `long_word_breakdown` item to pass:

```ts
domains: ["everyday", "workplace"],
```

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts
bun test ts/tests/targets.test.ts
```

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
bun test ts/tests && bun run typecheck
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: all commands exit 0.
