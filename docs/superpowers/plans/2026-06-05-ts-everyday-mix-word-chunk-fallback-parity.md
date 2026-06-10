# TS Everyday Mix Word Chunk Fallback Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Rust everyday mix fallback behavior when no everyday phrase entries exist: use focus-word chunk lines first, then randomly append `library.word_chunks` up to ten lines.

**Architecture:** Add a TS `buildLessonWordChunks` helper mirroring Rust `build_lesson_word_chunks` / `focus_word_chunks`, reuse existing `identifierParts`, `uniqueLineItems`, and `appendFrom`, and call it only from everyday mix phrase fallback. Preserve existing phrase behavior when phrase entries are available.

**Tech Stack:** Bun tests, TypeScript strict mode, existing KeyLoop TS target-generation module.

---

### Task 1: RED Test

**Files:**
- Modify: `ts/tests/targets.test.ts`

- [x] **Step 1: Add no-phrase fallback parity test**

Add an everyday mix test with no phrase entries, a focus identifier, ordered `word_chunks`, and a fixed context random sequence. Assert the output includes the focus word chunk line and a later shuffled chunk.

- [x] **Step 2: Verify RED**

Run:
- `bun test ts/tests/targets.test.ts --test-name-pattern "everyday mix falls back to focus word chunks when phrase corpus is empty"`

Expected: fail because TS currently reads `library.word_chunks` directly and omits focus-word chunk lines.

### Task 2: Implementation

**Files:**
- Modify: `ts/src/training/targets.ts`

- [x] **Step 1: Add word chunk helper**

Implement `focusWordChunkLines` and `buildLessonWordChunks` with Rust-compatible first-five focus handling, ten-line cap, and randomized append.

- [x] **Step 2: Use helper in everyday mix fallback**

When `settings.include_phrases` is true and `everydayPhraseItems(context)` is empty, push `buildLessonWordChunks(context.plan, context.library, random)` instead of chunking `library.word_chunks` directly.

### Task 3: Regression Gates

**Files:**
- No additional source files expected.

- [x] **Step 1: Run focused checks**

Run:
- `bun test ts/tests/targets.test.ts`
- `bun run typecheck`

Expected: all pass.

- [x] **Step 2: Run full checks**

Run:
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `bun run build`
- `git diff --check`

Expected: all pass.
