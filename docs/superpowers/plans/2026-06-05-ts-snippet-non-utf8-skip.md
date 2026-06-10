# TS Snippet Non-UTF8 Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript repo snippet extraction skip non-UTF-8 files like Rust `fs::read_to_string`.

**Architecture:** Keep extraction in `ts/src/content/snippets.ts`. Read source files as bytes and decode with fatal UTF-8 validation before passing text to `snippetsFromFile()`, so malformed files are skipped entirely.

**Tech Stack:** Bun tests, TypeScript strict mode, Node/Bun `fs/promises`, `TextDecoder`.

---

### Task 1: Fatal UTF-8 Snippet Read

**Files:**
- Modify: `ts/tests/snippets.test.ts`
- Modify: `ts/src/content/snippets.ts`

- [x] **Step 1: Write failing repo extraction test**

Add a repo extraction test that writes `invalid.ts` as raw bytes:

```ts
await writeFile(
  join(dir, "invalid.ts"),
  Buffer.from([
    ...Buffer.from("function invalidEncoding() {\n  return value;\n}\n"),
    0xff,
  ]),
);
```

Assert `extractSnippets(dir)` does not include `invalidEncoding`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: FAIL because current `readFile(path, "utf8")` replaces malformed bytes and still allows snippets from valid lines in the file.

- [x] **Step 3: Decode source files with fatal UTF-8 validation**

In `ts/src/content/snippets.ts`:

1. Change file reads in `extractSnippets()` from `readFile(path, "utf8")` to byte reads.
2. Add a helper that uses `new TextDecoder("utf-8", { fatal: true })`.
3. If decoding throws, skip the file.

- [x] **Step 4: Run snippets test to verify it passes**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-snippet-non-utf8-skip.md`

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
