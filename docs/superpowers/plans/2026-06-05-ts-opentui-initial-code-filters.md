# TS OpenTUI Initial Code Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure persisted/global code filters are visible in the initial OpenTUI app state and carried through normal menu navigation before the user opens Settings.

**Architecture:** Keep code filter derivation in the existing `codeFilterStateFromContext` helper. `runOpenTuiAppSession` should create its default initial state with `codeFilters`, `everydaySettings`, and `wordFormSettings` from context, while preserving explicit `initialState` overrides used by tests.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI app session reducer.

---

### Task 1: Initial App State Carries Code Filters

**Files:**
- Modify: `ts/tests/opentuiAppSession.test.ts`
- Modify: `ts/src/ui/opentui/appSession.ts`

- [x] **Step 1: Write the failing test**

Add a session runner test with a fake renderer and `appContextWithCodeOptions()` plus `selectedCodeFilters: [{ facet: "language", value: "typescript" }]`. Assert the first rendered menu state includes a selected code filter on the returned state when the user quits:

```ts
expect(result?.state.codeFilters?.selected).toEqual([
  { facet: "language", value: "typescript" },
]);
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/opentuiAppSession.test.ts
```

Expected: FAIL because `runOpenTuiAppSession` does not currently initialize `codeFilters`.

- [x] **Step 3: Add initial code filter state**

Change the default `createOpenTuiInitialState` call in `runOpenTuiAppSession` to include:

```ts
codeFilters: codeFilterStateFromContext(context),
```

Keep explicit `options.initialState` behavior unchanged.

- [x] **Step 4: Run focused test to verify it passes**

Run:

```bash
bun test ts/tests/opentuiAppSession.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-opentui-initial-code-filters.md`

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

Check all boxes only after the corresponding verification output has been read.
