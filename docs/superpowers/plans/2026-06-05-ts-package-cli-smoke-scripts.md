# TS Package CLI Smoke Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose migration-spec CLI smoke checks through package scripts so the real TS entrypoint and Rust fallback plan command can be verified with an isolated `KEYLOOP_HOME`.

**Architecture:** Keep smoke scripts shell-based and local. Each command creates a temp data directory, runs the relevant CLI entrypoint, removes the temp directory, and returns the CLI exit code.

**Tech Stack:** Bun, TypeScript, package script tests.

---

### Task 1: Add Package Smoke Script Gates

**Files:**
- Modify: `ts/tests/package.test.ts`
- Modify: `package.json`

- [x] **Step 1: Write RED package script assertions**

Assert `package.json` exposes:
- `smoke:plan`
- `smoke:report`
- `smoke:sources`
- `smoke:rust-plan`
- `smoke`
- `verify:migration`
- `verify:rust`
- `verify:all`

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/package.test.ts`

Expected: FAIL because the smoke scripts are missing.

- [x] **Step 3: Implement smoke scripts**

Add package scripts that run:
- `bun ts/src/main.ts plan`
- `bun ts/src/main.ts report today`
- `bun ts/src/main.ts sources`
- `cargo run --locked -- plan`

Each smoke command must use a temporary `KEYLOOP_HOME` and clean it up.
Add `verify:migration` as a single TS-side migration gate for typecheck, TS tests,
build, and smoke checks.
Add `verify:rust` for Rust fallback validation, including fmt, tests, clippy,
isolated Rust plan smoke, and diff whitespace checks. Add `verify:all` to run
both TS/OpenTUI migration and Rust fallback gates.

- [x] **Step 4: Verify GREEN and smoke behavior**

Run:
- `bun test ts/tests/package.test.ts`
- `bun run smoke`
- `bun run verify:migration`
- `bun run verify:all`

Expected: both pass.

- [x] **Step 5: Full verification**

Run:
- `bun test ts/tests`
- `bun run typecheck`
- `bun run build`
- `cargo test --locked --all-targets`
- `cargo fmt --check`
- `git diff --check`

Expected: all pass.
