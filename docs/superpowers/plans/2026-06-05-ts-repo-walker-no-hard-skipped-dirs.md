# TS Repo Walker No Hard-Skipped Dirs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust repo snippet extraction by scanning supported files in ordinary directories such as `dist/` unless ignore files exclude them.

**Architecture:** Keep ignore handling inside `ts/src/content/snippets.ts`. Remove the TS-only hard-coded directory skip set and rely on `.gitignore`, `.git/info/exclude`, and `.ignore` rules plus file extension and size filters.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Remove Hard-Skipped Repo Directories

**Files:**
- Modify: `ts/tests/snippets.test.ts`
- Modify: `ts/src/content/snippets.ts`

- [x] **Step 1: Write the failing extraction test**

Add this repo extraction test near the existing ignore tests:

```ts
test("extractSnippets scans supported files in ordinary build directories when not ignored", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyloop-ts-snippets-build-dir-"));
  try {
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(
      join(dir, "dist", "generated.ts"),
      "function visibleBuildOutput() {\n  return generated;\n}\n",
    );

    const snippets = await extractSnippets(dir);
    const text = snippets.map((snippet) => snippet.text).join("\n");

    expect(text).toContain("visibleBuildOutput");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run test to verify RED**

Run: `bun test ts/tests/snippets.test.ts --test-name-pattern "extractSnippets scans supported files in ordinary build directories when not ignored"`

Expected: FAIL because current TS extraction hard-skips `dist`.

- [x] **Step 3: Remove hard-coded directory skipping**

In `ts/src/content/snippets.ts`, delete the `skippedDirectories` set and remove this block from `walkRepo`:

```ts
if (skippedDirectories.has(entry.name)) {
  continue;
}
```

Leave ignore-file handling unchanged.

- [x] **Step 4: Verify GREEN**

Run: `bun test ts/tests/snippets.test.ts --test-name-pattern "extractSnippets scans supported files in ordinary build directories when not ignored" && bun run typecheck`

Expected: PASS.

- [x] **Step 5: Full verification**

Run: `bun test ts/tests && bun run typecheck && bun run build && git diff --check`

Expected: PASS.
