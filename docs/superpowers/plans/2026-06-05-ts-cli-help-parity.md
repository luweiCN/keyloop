# TS CLI Help Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TypeScript CLI help support so `keyloop-ts --help` can run without opening the OpenTUI app or touching data files.

**Architecture:** Keep help as a static CLI command in `ts/src/cli.ts`, matching the existing parser/dispatcher pattern. The command should return text only and avoid loading storage, content, or OpenTUI state.

**Tech Stack:** TypeScript strict mode, Bun test runner, existing TS CLI dispatch.

---

### Task 1: Help Parser And Dispatch

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write RED parser and dispatch tests**

Add tests for:
- `parseCliArgs(["--help"])` returns `{ kind: "help" }`
- `parseCliArgs(["help"])` returns `{ kind: "help" }`
- `runCli(["--help"], { env: { KEYLOOP_HOME: dir } })` prints KeyLoop help and does not create `sessions.jsonl`

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/cli.test.ts`

Expected: fail because `--help` is currently treated as an unknown command.

- [x] **Step 3: Implement help command**

Add:
- `{ kind: "help" }` to `ParsedCommand`
- parser branches for `--help`, `-h`, and `help`
- `helpText(language)` with current TS commands: interactive app, start, plan, report, import, sources, vocab
- runCli dispatch that returns help before touching command-specific storage

- [x] **Step 4: Verify GREEN and full suite**

Run:
- `bun test ts/tests/cli.test.ts`
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `git diff --check`
- `KEYLOOP_HOME="$(mktemp -d)" bun run keyloop -- --help`

Expected: all pass.
