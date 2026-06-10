# TS Vocabulary CLI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the TypeScript CLI operations for KeyLoop's personal vocabulary store.

**Architecture:** Keep vocabulary data operations in `ts/src/training/vocabulary.ts` and route CLI commands through `ts/src/cli.ts`. Storage remains `~/.keyloop/vocabulary.json` via existing path helpers; CLI output is plain text and testable without OpenTUI.

**Tech Stack:** Bun test runner, TypeScript strict mode, existing TS storage and CLI modules.

---

## File Structure

- Modify: `ts/src/training/vocabulary.ts`
  - Add create/add/list/archive/import helpers for personal vocabulary entries.
- Modify: `ts/src/cli.ts`
  - Parse and dispatch `vocab add`, `vocab list`, `vocab remove`, and `vocab import`.
- Test: `ts/tests/vocabulary.test.ts`
  - Unit tests for store operations and normalization.
- Test: `ts/tests/cli.test.ts`
  - End-to-end CLI tests using temp `KEYLOOP_HOME`.

## Task 1: Vocabulary Store Operations

**Files:**
- Modify: `ts/tests/vocabulary.test.ts`
- Modify: `ts/src/training/vocabulary.ts`

- [x] **Step 1: Write failing vocabulary operation tests**

Add tests for:

- creating an entry with id, text, kind, parts, aliases, tags, priority, timestamps, and `archived: false`;
- adding an entry replaces an active duplicate case-insensitively rather than creating two active copies;
- removing archives an entry and updates `updated_at`;
- importing from strings and partial entry objects normalizes them into valid entries.

- [x] **Step 2: Run vocabulary tests and verify RED**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: fail because vocabulary operation exports do not exist.

- [x] **Step 3: Implement vocabulary helpers**

Implement the smallest helpers needed by the tests. Use explicit options for `now` and `idFactory` so tests are deterministic.

- [x] **Step 4: Run vocabulary tests and verify GREEN**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: vocabulary tests pass.

## Task 2: CLI Vocabulary Commands

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write failing CLI tests**

Add tests for:

- `vocab add internationalization --parts international,ization --alias i18n --tag programming` writes `vocabulary.json`;
- `vocab list` prints active entries and hides archived entries;
- `vocab remove <id>` archives the entry;
- `vocab import /path/to/words.json` accepts an array of strings and partial entry objects.

- [x] **Step 2: Run CLI tests and verify RED**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: fail because `vocab` is not parsed or dispatched.

- [x] **Step 3: Implement CLI dispatch**

Extend `parseCliArgs` with a `vocab` command and dispatch each operation through existing storage helpers and new vocabulary helpers.

- [x] **Step 4: Run CLI tests and verify GREEN**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: CLI tests pass.

## Task 3: Integrated Verification

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

- [x] **Step 3: Check diff hygiene and TS entry**

Run:

```bash
git diff --check
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- vocab list; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI entry runs.
