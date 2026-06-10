# TS OpenTUI Standalone Submenus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every visible TypeScript/OpenTUI standalone submenu item start a real practice target instead of silently staying on the submenu.

**Architecture:** Keep target construction in `ts/src/training/targets.ts` and keep `ts/src/ui/opentui/appModel.ts` as a pure route mapper. Add exported standalone target builders for foundation, everyday, programming basics, and code practice, then map each visible submenu id to one of those builders. This slice does not implement interactive word-count or sentence-length switching.

**Tech Stack:** Bun tests, TypeScript strict mode, existing migrated content/target/app model modules.

---

### Task 1: Add Failing App Model Coverage

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`

- [x] **Step 1: Write failing test**

Add a test asserting each currently visible submenu id transitions to `running` and emits the expected source prefix:

```ts
  test("all visible standalone submenu items start practice targets", () => {
    const cases: Array<[Parameters<typeof activateOpenTuiMenuItem>[1], Parameters<typeof activateOpenTuiMenuItem>[1], string]> = [
      ["foundation", "foundation_mix", "keyloop:module:foundation-mix"],
      ["everyday", "everyday_words", "keyloop:module:everyday-english:words"],
      ["everyday", "everyday_phrases", "keyloop:module:everyday-english:phrases"],
      ["everyday", "everyday_sentences", "keyloop:module:everyday-english:sentences"],
      ["everyday", "everyday_mix", "keyloop:module:everyday-english"],
      ["programming", "operators_brackets_quotes", "keyloop:module:programming-basics:operators-brackets-quotes"],
      ["programming", "programming_terms", "keyloop:module:programming-basics:technical-terms"],
      ["programming", "naming_styles", "keyloop:module:programming-basics:naming"],
      ["programming", "programming_basics_mix", "keyloop:module:programming-basics-mix"],
      ["code", "code_mix", "keyloop:module:code-practice-mix"],
    ];

    for (const [mainItem, submenuItem, sourcePrefix] of cases) {
      const submenu = activateOpenTuiMenuItem(
        createOpenTuiInitialState("en"),
        mainItem,
        appContext(),
      );
      const running = activateOpenTuiMenuItem(submenu, submenuItem, appContext());

      expect(running.route.screen).toBe("running");
      if (running.route.screen !== "running") {
        throw new Error(`expected running route for ${submenuItem}`);
      }
      expect(running.route.source_item).toBe(submenuItem);
      expect(running.route.target.source).toContain(sourcePrefix);
      expect(running.route.target.text.length).toBeGreaterThan(0);
    }
  });
```

- [x] **Step 2: Run focused test and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts --timeout 10000
```

Expected: FAIL because at least `foundation_mix` still leaves the app on the submenu.

### Task 2: Add Core Standalone Target Builders

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Export foundation, everyday, programming, and code standalone builders**

Add focused exports:

```ts
export type EverydayPracticeTargetKind = "words" | "phrases" | "sentences" | "mix";
export type ProgrammingBasicsPracticeTargetKind =
  | "operators_brackets_quotes"
  | "programming_terms"
  | "naming_styles"
  | "mix";

export function buildFoundationMixPracticeTarget(context: BuildTargetContext): PracticeTarget;
export function buildEverydayPracticeTarget(context: BuildTargetContext, kind: EverydayPracticeTargetKind): PracticeTarget;
export function buildProgrammingBasicsPracticeTarget(context: BuildTargetContext, kind: ProgrammingBasicsPracticeTargetKind): PracticeTarget;
export function buildCodeMixPracticeTarget(context: BuildTargetContext): PracticeTarget;
```

Use the already migrated helper logic where possible:
- foundation: existing `foundationMixTarget`.
- everyday mix: existing `everydayMixTarget`.
- programming mix: existing `buildProgrammingBasicsMixTarget`.
- code mix: existing `codeMixTarget`.
- standalone words/phrases/sentences and programming specialist variants should stay deterministic and use existing library arrays.

- [x] **Step 2: Run target/app tests**

Run:

```bash
bun test ts/tests/targets.test.ts ts/tests/opentuiApp.test.ts --timeout 10000
```

Expected: compile or app test failure until `appModel.ts` calls the new builders.

### Task 3: Wire App Model Submenu Mapping

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`

- [x] **Step 1: Import and map new builders**

Replace default no-op submenu cases with calls to the new target builders:
- `foundation_mix` -> `buildFoundationMixPracticeTarget`
- `everyday_words` -> `buildEverydayPracticeTarget(..., "words")`
- `everyday_phrases` -> `buildEverydayPracticeTarget(..., "phrases")`
- `everyday_sentences` -> `buildEverydayPracticeTarget(..., "sentences")`
- `everyday_mix` -> `buildEverydayPracticeTarget(..., "mix")`
- `operators_brackets_quotes` -> `buildProgrammingBasicsPracticeTarget(..., "operators_brackets_quotes")`
- `programming_terms` -> `buildProgrammingBasicsPracticeTarget(..., "programming_terms")`
- `naming_styles` -> `buildProgrammingBasicsPracticeTarget(..., "naming_styles")`
- `code_mix` -> `buildCodeMixPracticeTarget`

- [x] **Step 2: Run focused tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts --timeout 10000
```

Expected: PASS.

### Task 4: Full Verification

**Files:**
- Verify: TypeScript and Rust suites
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

Expected: no whitespace errors; `plan` prints `Next KeyLoop plan`.

- [x] **Step 4: Update this plan checklist**

Mark all completed task checkboxes with `[x]`.
