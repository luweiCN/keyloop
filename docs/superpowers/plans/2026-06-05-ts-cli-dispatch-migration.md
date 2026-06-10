# TS CLI Dispatch Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port KeyLoop's current non-UI CLI parsing and command dispatch from Rust to TypeScript.

**Architecture:** Keep CLI parsing and dispatch in `ts/src/cli.ts`, with filesystem/data access injected through existing core modules. `start` builds the daily plan and delegates to an injected runner so the later OpenTUI app shell can plug in without CLI owning UI behavior.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing TS storage/content/plan/report modules, Node path utilities.

---

## File Structure

- Create: `ts/src/cli.ts`
  - `parseCliArgs`, `runCli`, `codeConfigFromPreferences`, CLI result/runner types.
- Create: `ts/src/main.ts`
  - executable entry that calls `runCli(process.argv.slice(2))`.
- Modify: `ts/src/index.ts`
  - export CLI helpers for tests and later binary wiring.
- Modify: `package.json`
  - add `bin` and a `keyloop` script for the TS migration entrypoint.
- Test: `ts/tests/cli.test.ts`
  - parser and command dispatch parity tests.

## Task 1: Parser

**Files:**
- Create: `ts/tests/cli.test.ts`
- Create: `ts/src/cli.ts`
- Modify: `ts/src/index.ts`

- [x] **Step 1: Write failing parser tests**

Create tests for:

- bare `keyloop` has no command and defaults language to `zh`;
- `start --repo /tmp/app --code-language typescript --code-framework react --code-project nextjs` parses all filters;
- `report today`, `plan`, `import /tmp/app`, `sources`, and `--language en` parse like Rust CLI.

- [x] **Step 2: Run parser tests and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: fail because CLI exports do not exist.

- [x] **Step 3: Implement parser**

Implement a small deterministic parser for the documented command set. Reject unknown commands/options with thrown `Error`.

- [x] **Step 4: Run parser tests and verify GREEN**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: parser tests pass.

## Task 2: Command Dispatch

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`
- Create: `ts/src/main.ts`
- Modify: `package.json`

- [x] **Step 1: Add failing dispatch tests**

Add tests for:

- `plan` loads sessions and prints `planReport`;
- `report today` loads sessions, builds plan, and prints `todayReport`;
- `import` calls snippet extraction and renders preview;
- `sources` loads source catalog and renders provenance;
- `start` loads preferences, merges global code filters only when CLI filters are empty, creates/reuses daily plan, and calls the injected runner.

- [x] **Step 2: Run dispatch tests and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: fail on missing dispatch behavior.

- [x] **Step 3: Implement command dispatch**

Use existing storage path helpers, content loading, plan building, daily run creation, and report functions. Keep UI behavior outside this module by requiring a `runner` for `start`.

- [x] **Step 4: Run dispatch tests and verify GREEN**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: dispatch tests pass.

## Task 3: Repo Snippet Integration

**Files:**
- Modify: `ts/tests/targets.test.ts`
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/training/targets.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Add failing repo snippet tests**

Add tests for:

- `buildDailyPracticePlan` can prefer local repo snippets supplied in the target context;
- `start --repo /path` extracts snippets and passes them into the generated daily code lesson.

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
bun test ts/tests/targets.test.ts ts/tests/cli.test.ts
```

Expected: fail because repo snippets are parsed by CLI but not used by target generation.

- [x] **Step 3: Implement repo snippet integration**

Add `localCodeSnippets?: CodeSnippet[]` to `BuildTargetContext`; pick local snippets first with `pickCodeSnippetsExcludingByDifficulty`, then fill from built-in snippets with existing picker logic. In `runCli(start)`, call `extractSnippets(repo)` when `--repo` is provided and pass the snippets to `buildDailyPracticePlan`.

- [x] **Step 4: Run tests and verify GREEN**

Run:

```bash
bun test ts/tests/targets.test.ts ts/tests/cli.test.ts
```

Expected: target and CLI tests pass.

## Task 4: Integrated Verification

**Files:**
- No new files.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests
bun run typecheck
```

Expected: all TS tests and typecheck pass.

- [x] **Step 2: Run Rust checks**

Run:

```bash
cargo test --locked --all-targets
```

Expected: existing Rust tests pass.

- [x] **Step 3: Check diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.
