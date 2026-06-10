# TS Core Storage Content Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the TypeScript non-UI core with KeyLoop-compatible storage, content loading, and deterministic practice target generation primitives.

**Architecture:** Keep all migrated logic under `ts/` and expose it through `ts/src/index.ts`. Storage must operate on explicit paths for tests and later wire to `KEYLOOP_HOME`; content and target generation should accept injected libraries so tests do not depend on random global state. OpenTUI remains out of scope for this phase.

**Tech Stack:** Bun test runner, TypeScript strict mode, Node `fs/promises`, local JSON content files.

---

## File Structure

- Modify: `ts/src/domain/model.ts`
  - Add `UserPreferences`, `CodeFilterPreference`, `EverydayEnglishSettings`, `KeyAggregate`, `SessionCheckpoint`, and daily-plan parsing helpers.
- Create: `ts/src/storage/keyloopStore.ts`
  - JSON/JSONL helpers, explicit data-dir path helpers, preferences, sessions, key aggregates, checkpoints, daily run reuse, personal vocabulary store IO.
- Create: `ts/src/content/library.ts`
  - Built-in JSON content loading and everyday corpus merge.
- Create: `ts/src/training/targets.ts`
  - Deterministic subset of foundation, everyday, programming, identifier splitting, and long-word injection target logic.
- Modify: `ts/src/index.ts`
  - Export storage, content, and target modules.
- Test: `ts/tests/storage.test.ts`
  - File compatibility tests mirroring Rust storage behavior.
- Test: `ts/tests/content.test.ts`
  - Content counts, everyday corpus merge, source catalog, long word file loading.
- Test: `ts/tests/targets.test.ts`
  - Deterministic target generation tests for daily module sequence, identifier splitting, technical words, and breakdown injection.

## Task 1: Storage Models

**Files:**
- Modify: `ts/src/domain/model.ts`
- Test: `ts/tests/storage.test.ts`

- [x] **Step 1: Write failing storage model tests**

Create `ts/tests/storage.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseUserPreferences } from "../src/index";

describe("storage model defaults", () => {
  test("preferences default new word feature fields", () => {
    const preferences = parseUserPreferences({
      interface_language: "en",
      everyday_english: { word_count: 25, sentence_length: "short", include_phrases: false },
    });

    expect(preferences.interface_language).toBe("en");
    expect(preferences.everyday_english.word_count).toBe(25);
    expect(preferences.word_breakdown.enabled_in_comprehensive).toBe(true);
    expect(preferences.word_breakdown.max_items_per_group).toBe(6);
    expect(preferences.personal_vocabulary.enabled_in_comprehensive).toBe(true);
    expect(preferences.personal_vocabulary.daily_review_limit).toBe(8);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/storage.test.ts
```

Expected: fail because `parseUserPreferences` is not exported.

- [x] **Step 3: Implement model additions**

Add TS interfaces and parsers for preferences, code filters, key aggregates, session checkpoints, daily plans, and default helpers.

- [x] **Step 4: Run storage model test**

Run:

```bash
bun test ts/tests/storage.test.ts
```

Expected: pass the preferences default test.

## Task 2: Storage File IO

**Files:**
- Create: `ts/src/storage/keyloopStore.ts`
- Modify: `ts/src/index.ts`
- Test: `ts/tests/storage.test.ts`

- [x] **Step 1: Add failing storage IO tests**

Extend `ts/tests/storage.test.ts` with tests for:

- `keyloopDataDir({ env: { KEYLOOP_HOME: dir }, homeDir: "/home/test" })` returns `dir`;
- `appendSessionToPath` creates parent directories and appends JSONL;
- `loadSessionsFromPath` skips invalid non-empty rows;
- `savePreferencesToPath` / `loadPreferencesFromPath` round trip pretty JSON;
- `saveVocabularyStoreToPath` / `loadVocabularyStoreFromPath` round trip `version: 1`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/storage.test.ts
```

Expected: fail because storage IO exports are missing.

- [x] **Step 3: Implement storage IO**

Implement explicit-path helpers with `fs.mkdir({ recursive: true })`, JSON parse/defaulting, and JSONL append/read behavior.

- [x] **Step 4: Run storage tests**

Run:

```bash
bun test ts/tests/storage.test.ts
```

Expected: pass.

## Task 3: Daily Runs and Key Aggregates

**Files:**
- Modify: `ts/src/storage/keyloopStore.ts`
- Test: `ts/tests/storage.test.ts`

- [x] **Step 1: Add failing daily run and key aggregate tests**

Extend `ts/tests/storage.test.ts` with tests for:

- unfinished daily run is reused and updates `completed_ms`;
- completed run creates the next `run_number`;
- partial records do not complete a run;
- `observeKeyEvent` updates hit/miss counts, rolling averages, error rate, confidence, and ignores `auto_indent`;
- session checkpoint saves and clears.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/storage.test.ts
```

Expected: fail on missing daily/key/checkpoint exports.

- [x] **Step 3: Implement daily run and key aggregate logic**

Port Rust logic from `src/storage.rs`, with injectable `today`, `now`, and `idFactory` parameters for deterministic tests.

- [x] **Step 4: Run storage tests**

Run:

```bash
bun test ts/tests/storage.test.ts
```

Expected: pass.

## Task 4: Content Library Loading

**Files:**
- Create: `ts/src/content/library.ts`
- Modify: `ts/src/index.ts`
- Test: `ts/tests/content.test.ts`

- [x] **Step 1: Write failing content tests**

Create `ts/tests/content.test.ts` with tests for:

- built-in content counts meet the Rust thresholds;
- everyday entries all reference an existing source;
- `mergeEverydayCorpus` deduplicates by `source_id` and `(source_id, kind, text)`;
- `sourceCatalog` includes everyday corpus source metadata.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/content.test.ts
```

Expected: fail because content exports are missing.

- [x] **Step 3: Implement content loader**

Read JSON files from `content/` using `import.meta.url` path resolution. Load the same code snippet files as Rust and expose `loadContentLibrary`, `mergeEverydayCorpus`, and `sourceCatalog`.

- [x] **Step 4: Run content tests**

Run:

```bash
bun test ts/tests/content.test.ts
```

Expected: pass.

## Task 5: Deterministic Target Generation Core

**Files:**
- Create: `ts/src/training/targets.ts`
- Modify: `ts/src/index.ts`
- Test: `ts/tests/targets.test.ts`

- [x] **Step 1: Write failing target tests**

Create `ts/tests/targets.test.ts` with tests for:

- `identifierParts("loadHTTP2Config")` returns `["load", "http", "2", "config"]`;
- `focusNamingLines(["selectedPreference"])` includes original, camel, Pascal, getter, and constant variants;
- `buildLessonWords` starts with unique plan focus words and fills to 16;
- `buildProgrammingBasicsMixTarget` includes recent feedback terms and long-word breakdown lines without adding a new module step;
- `buildDailyPracticePlan` returns foundation, everyday, programming, and code modules with `target_minutes = 20`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: fail because target exports are missing.

- [x] **Step 3: Implement deterministic target subset**

Implement pure functions for identifier splitting, naming lines, word/symbol chunks, daily base sequence, and long-word breakdown injection. Use deterministic source-order filling in TS tests; random shuffling can be added later behind an injectable picker.

- [x] **Step 4: Run target tests**

Run:

```bash
bun test ts/tests/targets.test.ts
```

Expected: pass.

## Task 6: Second-Slice Verification

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
