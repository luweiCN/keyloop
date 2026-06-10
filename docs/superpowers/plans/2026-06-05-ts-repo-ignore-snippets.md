# TS Repo Ignore Snippet Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript repo snippet extraction respect project ignore files like Rust `ignore::WalkBuilder`.

**Architecture:** Keep snippet extraction in `ts/src/content/snippets.ts`. Add a small ignore matcher used by `walkRepo()` that reads root and nested `.gitignore`, `.ignore`, plus root `.git/info/exclude`, while still including hidden source files unless an ignore rule excludes them.

**Tech Stack:** Bun tests, TypeScript strict mode, Node `fs/promises` and `path`.

---

### Task 1: Ignore-Aware Repo Walk

**Files:**
- Modify: `ts/tests/snippets.test.ts`
- Modify: `ts/src/content/snippets.ts`

- [x] **Step 1: Write failing repo extraction test**

Add a test under `describe("repo extraction")` that creates:

```text
.gitignore               # ignores ignored.ts, ignored-dir/, *.generated.ts, but re-includes keep.generated.ts
.ignore                  # ignores ignored-by-dotignore.ts
.git/info/exclude        # ignores excluded-info.ts
src/.hidden.ts           # should still be included
```

The test should assert ignored snippets are absent and hidden/re-included snippets are present.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: FAIL because current TS `walkRepo()` only skips fixed directory names and does not apply ignore files.

- [x] **Step 3: Implement ignore file loading and matching**

In `ts/src/content/snippets.ts`:

1. Read `.gitignore`, `.ignore`, and `.git/info/exclude`.
2. Parse non-empty, non-comment lines.
3. Support `!` negation, trailing `/` directory rules, anchored `/foo` rules, slash-containing path rules, basename rules, and `*`/`?` wildcards.
4. Apply rules in order, so later negation can re-include paths.
5. Preserve hidden-file inclusion when no ignore rule matches.

- [x] **Step 4: Run snippets test to verify it passes**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-repo-ignore-snippets.md`

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
