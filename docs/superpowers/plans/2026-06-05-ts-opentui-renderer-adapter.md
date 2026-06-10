# TS OpenTUI Renderer Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal OpenTUI renderer adapter that can render the current app model through `@opentui/core` while staying testable without a real terminal.

**Architecture:** Keep renderer-specific code in `ts/src/ui/opentui/renderer.ts`. The adapter accepts an injectable kit with `createCliRenderer`, `Box`, and `Text`, so tests can assert the component tree without starting a terminal. The production loader lazily imports `@opentui/core`, matching the official Bun-focused OpenTUI entry path.

**Tech Stack:** Bun, TypeScript strict mode, `@opentui/core`, existing OpenTUI app model.

---

## File Structure

- Create: `ts/src/ui/opentui/renderer.ts`
  - Define the injectable renderer kit interface.
  - Render main/submenu/running routes to OpenTUI Box/Text constructs.
  - Export `loadOpenTuiKit` and `renderOpenTuiAppOnce`.
- Modify: `ts/src/index.ts`
  - Export renderer adapter functions.
- Modify: `package.json`, `bun.lock`
  - Add `@opentui/core`.
- Test: `ts/tests/opentuiRenderer.test.ts`
  - Verify renderer options and rendered tree using a fake kit.

## Task 1: Renderer Adapter Tests

**Files:**
- Create: `ts/tests/opentuiRenderer.test.ts`

- [x] **Step 1: Write failing renderer tests**

Add tests proving:

- `renderOpenTuiAppOnce` creates a renderer with `exitOnCtrlC: true`;
- main menu rendering includes localized labels;
- running route rendering includes target text.

- [x] **Step 2: Run renderer tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiRenderer.test.ts
```

Expected: fail because renderer adapter exports do not exist.

## Task 2: Renderer Adapter Implementation

**Files:**
- Create: `ts/src/ui/opentui/renderer.ts`
- Modify: `ts/src/index.ts`
- Modify: `package.json`, `bun.lock`

- [x] **Step 1: Implement renderer adapter**

Use the injectable kit in tests and a lazy `@opentui/core` import for production.

- [x] **Step 2: Install OpenTUI dependency**

Run:

```bash
bun add @opentui/core
```

Expected: `package.json` and `bun.lock` include `@opentui/core`.

- [x] **Step 3: Run renderer tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiRenderer.test.ts
```

Expected: renderer tests pass.

## Task 3: Integrated Verification

**Files:**
- No new source files.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests && bun run typecheck
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
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI entry still runs.
