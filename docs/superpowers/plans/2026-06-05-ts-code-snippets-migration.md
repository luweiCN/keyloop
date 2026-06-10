# TS Code Snippets Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Port KeyLoop's non-UI code snippet extraction, normalization, filtering, difficulty, and picker logic from Rust to TypeScript.

**Architecture:** Keep snippet logic in `ts/src/content/snippets.ts`, close to the content library because both built-in JSON snippets and repo-extracted snippets share one model. The target generator should consume this module rather than slicing `library.code_snippets` directly. Repo walking should be explicit-path and testable without OpenTUI.

**Tech Stack:** Bun test runner, TypeScript strict mode, Node `fs/promises`, local path utilities.

---

## File Structure

- Modify: `ts/src/domain/model.ts`
  - Add `CodePracticeConfig` and `CodePracticeOption`.
- Create: `ts/src/content/snippets.ts`
  - `CodeSnippet`, built-in normalization, snippet scoring, file extraction, config matching, code practice options, picker functions, repo extraction.
- Modify: `ts/src/content/library.ts`
  - Re-export/use `BuiltinCodeSnippet` type from `snippets.ts` or keep compatible imports.
- Modify: `ts/src/training/targets.ts`
  - Use `pickBuiltinCode` for code mix target instead of direct first-slice selection.
- Modify: `ts/src/index.ts`
  - Export snippet module.
- Test: `ts/tests/snippets.test.ts`
  - Rust-parity tests for normalization, extraction, filtering, difficulty and picking.

## Task 1: Snippet Types and Normalization

**Files:**
- Modify: `ts/src/domain/model.ts`
- Create: `ts/src/content/snippets.ts`
- Modify: `ts/src/index.ts`
- Test: `ts/tests/snippets.test.ts`

- [x] **Step 1: Write failing tests**

Create `ts/tests/snippets.test.ts` with tests for:

- `codeSnippetFromBuiltin` trims trailing whitespace and strips common indent.
- `makeSnippet` computes score and difficulty.
- `languageFromSource("src/App.tsx:10")` returns `"typescript"`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: fail because snippet exports are missing.

- [x] **Step 3: Implement normalization and types**

Implement `BuiltinCodeSnippet`, `CodeSnippet`, `CodePracticeConfig`, `CodePracticeOption`, `normalizeSnippetText`, `codeSnippetFromBuiltin`, `makeSnippet`, and language mapping.

- [x] **Step 4: Run snippet tests**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: pass the normalization tests.

## Task 2: File Extraction

**Files:**
- Modify: `ts/src/content/snippets.ts`
- Test: `ts/tests/snippets.test.ts`

- [x] **Step 1: Add failing extraction tests**

Extend `ts/tests/snippets.test.ts` with tests for:

- `snippetsFromFile` preserves relative indent for captured blocks.
- Non-ASCII captured blocks are skipped.
- Candidate comments and too-short lines are ignored.
- `isSupportedSourcePath` rejects lockfiles and `.min.js`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: fail on missing extraction exports.

- [x] **Step 3: Implement extraction helpers**

Port Rust's candidate-line, block capture, indent normalization, source support, extension, and language mapping logic.

- [x] **Step 4: Run snippet tests**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: pass.

## Task 3: Filtering, Options, and Picker

**Files:**
- Modify: `ts/src/content/snippets.ts`
- Test: `ts/tests/snippets.test.ts`

- [x] **Step 1: Add failing picker tests**

Extend `ts/tests/snippets.test.ts` with tests for:

- single-line local snippets are skipped for code lesson picking;
- difficulty filter falls back when too few candidates exist;
- focus terms are preferred before filler snippets;
- `match_any` matches language/framework/project alternatives;
- code practice options sort by count descending then value ascending and exclude project `keyloop-generated`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: fail on missing picker/config functions.

- [x] **Step 3: Implement picker logic**

Port `matchesCodeConfig`, `codePracticeOptions`, `pickCodeSnippetsExcludingByDifficulty`, `pickBuiltinCodeExcludingByDifficulty`, and difficulty fallback. Keep picker deterministic by preserving candidate order in TS tests; add injectable shuffle later if needed.

- [x] **Step 4: Run snippet tests**

Run:

```bash
bun test ts/tests/snippets.test.ts
```

Expected: pass.

## Task 4: Repo Extraction and Target Integration

**Files:**
- Modify: `ts/src/content/snippets.ts`
- Modify: `ts/src/training/targets.ts`
- Test: `ts/tests/snippets.test.ts`
- Test: `ts/tests/targets.test.ts`

- [x] **Step 1: Add failing repo/target tests**

Add tests for:

- `extractSnippets(repoPath)` reads supported source files, skips lockfiles, skips files over 200 KB, and deduplicates snippet text.
- `buildDailyPracticePlan` code lesson uses picker output rather than the first JSON snippets.

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test ts/tests/snippets.test.ts ts/tests/targets.test.ts
```

Expected: fail on missing repo extraction or target picker integration.

- [x] **Step 3: Implement repo extraction and target integration**

Implement recursive repo walking with supported extension and size filtering. Use `pickBuiltinCodeExcludingByDifficulty` in `codeMixTarget`.

- [x] **Step 4: Run tests**

Run:

```bash
bun test ts/tests/snippets.test.ts ts/tests/targets.test.ts
```

Expected: pass.

## Task 5: Third-Slice Verification

**Files:**
- No new files.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests
bun run typecheck
```

Expected: all TS tests and typecheck pass.

- [x] **Step 2: Run existing Rust checks**

Run:

```bash
cargo test --locked --all-targets
```

Expected: existing Rust tests continue to pass.

- [x] **Step 3: Check diff whitespace**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.
