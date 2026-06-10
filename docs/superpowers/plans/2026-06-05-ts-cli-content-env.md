# TS CLI Content Env Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `RunCliOptions.env.KEYLOOP_EVERYDAY_CORPUS` reach every CLI path that loads the content library.

**Architecture:** Keep corpus loading in `ts/src/content/library.ts`. Add a small CLI helper that extracts `KEYLOOP_EVERYDAY_CORPUS` from `RunCliOptions.env` and pass it to `loadContentLibrary()` and `sourceCatalog()` from `sources`, bare app startup, and `start`.

**Tech Stack:** Bun tests, TypeScript strict mode, existing CLI dependency injection.

---

### Task 1: CLI Env Reaches Content Library

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write failing CLI tests**

Add tests that:

1. Write a temporary everyday corpus JSON.
2. Run `keyloop sources` with `env: { KEYLOOP_HOME, KEYLOOP_EVERYDAY_CORPUS }` and assert the output includes the user source id/name.
3. Run bare `keyloop` with an injected `appRunner` and assert `context.library.everyday_english.entries` includes the user entry.
4. Run `keyloop start` with an injected `runner` and assert `context.targetContext?.library.everyday_english.entries` includes the user entry.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: FAIL because `RunCliOptions.env` currently only feeds `keyloopDataDir()` and not content-library loading.

- [x] **Step 3: Pass content env through CLI**

In `ts/src/cli.ts`:

1. Add a helper:

```ts
function contentLibraryOptions(options: RunCliOptions): {
  userEverydayCorpusPath?: string;
} {
  const path = options.env?.KEYLOOP_EVERYDAY_CORPUS?.trim();
  return path === undefined || path.length === 0
    ? {}
    : { userEverydayCorpusPath: path };
}
```

2. Use it in `runApp()`, `runStart()`, and `sources`.

- [x] **Step 4: Run CLI test to verify it passes**

Run:

```bash
bun test ts/tests/cli.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-cli-content-env.md`

- [x] **Step 1: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 2: Run repository verification**

Run:

```bash
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: Rust tests pass, TS build passes, and diff whitespace check is clean.

- [x] **Step 3: Mark this plan complete**

Check all boxes only after reading the corresponding command output.
