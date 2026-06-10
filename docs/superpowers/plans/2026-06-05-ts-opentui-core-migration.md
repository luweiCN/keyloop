# TS OpenTUI Core Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first TypeScript migration slice for KeyLoop's non-UI core: project harness, serializable models, metrics, adaptive planning, and the new vocabulary/long-word training logic.

**Architecture:** Keep TypeScript core code isolated under `ts/` so Rust files remain untouched during the migration. Non-UI modules must be runnable by Bun tests without OpenTUI. The OpenTUI UI will later depend on this core rather than owning product logic.

**Tech Stack:** Bun test runner, TypeScript strict mode, local JSON content files, Node-compatible file system APIs for later storage work.

---

## File Structure

- Create: `package.json`
  - Root scripts for TS tests and typecheck.
- Create: `tsconfig.json`
  - Strict TypeScript config targeting Bun/Node ESM.
- Create: `ts/src/domain/model.ts`
  - String literal unions and defaulting helpers matching Rust serde values.
- Create: `ts/src/training/metrics.ts`
  - Port of `src/metrics.rs`: token spans, timing breakdown, WPM, accuracy, token stats.
- Create: `ts/src/training/plan.ts`
  - Port of `src/plan.rs`: 21-day history filtering, focus selection, advice, recommended mode.
- Create: `ts/src/training/generatedIdentifier.ts`
  - TS equivalent of generated numbered identifier filtering from `src/feedback.rs`.
- Create: `ts/src/training/vocabulary.ts`
  - Personal vocabulary and long-word breakdown target construction.
- Create: `ts/src/index.ts`
  - Public exports for tests and later CLI/UI.
- Create: `ts/tests/model.test.ts`
  - Compatibility tests for missing-field defaults and enum string values.
- Create: `ts/tests/metrics.test.ts`
  - Rust-parity tests based on existing Rust metric unit tests.
- Create: `ts/tests/plan.test.ts`
  - Rust-parity tests for plan fallback, legacy token support, identifier filtering, key hotspots.
- Create: `ts/tests/vocabulary.test.ts`
  - New feature tests for personal vocabulary selection and long-word breakdown groups.

## Task 1: TypeScript Harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `ts/src/index.ts`
- Test: `ts/tests/model.test.ts`

- [x] **Step 1: Write the failing test**

Create `ts/tests/model.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parsePracticeLesson, parseSessionRecord } from "../src/index";

describe("domain model compatibility", () => {
  test("session records default missing diagnostic and module fields", () => {
    const record = parseSessionRecord({
      started_at: "2026-05-30T00:00:00Z",
      mode: "words",
      source: "legacy",
      duration_ms: 60000,
      target_text: "hello",
      user_input: "hello",
      target_len: 5,
      typed_len: 5,
      correct_chars: 5,
      wpm: 10,
      raw_wpm: 10,
      accuracy: 100,
      error_count: 0,
      backspace_count: 0,
    });

    expect(record.id).toBe("legacy");
    expect(record.module).toBe("unknown");
    expect(record.category).toBe("unknown");
    expect(record.error_chars).toEqual({});
    expect(record.error_tokens).toEqual({});
    expect(record.slow_tokens).toEqual([]);
    expect(record.token_stats).toEqual([]);
    expect(record.key_events).toEqual([]);
    expect(record.active_ms).toBe(0);
    expect(record.char_stats).toEqual({ correct: 0, incorrect: 0, extra: 0, missed: 0 });
  });

  test("practice lessons default missing module fields like Rust serde defaults", () => {
    const lesson = parsePracticeLesson({
      id: "daily-words-1",
      kind: "words",
      estimated_minutes: 3,
      target: { mode: "words", text: "return value", source: "test" },
      reason_zh: "test",
      reason_en: "test",
    });

    expect(lesson.module).toBe("programming_basics");
    expect(lesson.category).toBe("programming_terms");
    expect(lesson.mix_profile).toBe("standalone");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/model.test.ts
```

Expected: fail because `../src/index` does not exist.

- [x] **Step 3: Add the minimal TS harness**

Create `package.json`:

```json
{
  "name": "keyloop-ts-migration",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test ts/tests",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["ts/src/**/*.ts", "ts/tests/**/*.ts"]
}
```

Create `ts/src/index.ts`:

```ts
export * from "./domain/model";
```

- [x] **Step 4: Run test to verify it still fails for missing model implementation**

Run:

```bash
bun test ts/tests/model.test.ts
```

Expected: fail because `./domain/model` does not exist or exported functions are missing.

## Task 2: Domain Model Defaults

**Files:**
- Create: `ts/src/domain/model.ts`
- Modify: `ts/src/index.ts`
- Test: `ts/tests/model.test.ts`

- [x] **Step 1: Implement minimal model defaults**

Create `ts/src/domain/model.ts` with literal unions, interfaces, and `parseSessionRecord` / `parsePracticeLesson` defaulting helpers matching the migration spec.

- [x] **Step 2: Run model tests**

Run:

```bash
bun test ts/tests/model.test.ts
```

Expected: pass.

- [x] **Step 3: Run typecheck**

Run:

```bash
bun install
bun run typecheck
```

Expected: pass with no TypeScript errors.

## Task 3: Metrics Port

**Files:**
- Create: `ts/src/training/metrics.ts`
- Modify: `ts/src/index.ts`
- Test: `ts/tests/metrics.test.ts`

- [x] **Step 1: Write failing metric parity tests**

Create `ts/tests/metrics.test.ts` with four tests copied from Rust behavior:

```ts
import { describe, expect, test } from "bun:test";
import { buildSessionRecord, tokenSpans, type KeyEventRecord, type PracticeTarget } from "../src/index";

const target = (text: string): PracticeTarget => ({ mode: "words", text, source: "test" });
const insert = (at_ms: number, position: number, input: string, correct: boolean): KeyEventRecord => ({
  at_ms,
  action: "insert",
  position,
  expected: input,
  input,
  correct,
});

describe("metrics parity", () => {
  test("tokenizes words and programming symbols", () => {
    const tokens = tokenSpans("items.map((item) => item.id !== null)").map((span) => span.token);

    expect(tokens).toContain("items");
    expect(tokens).toContain("=>");
    expect(tokens).toContain("!==");
  });

  test("accuracy counts corrected mistakes", () => {
    const events: KeyEventRecord[] = [
      insert(100, 0, "a", true),
      { at_ms: 200, action: "insert", position: 1, expected: "b", input: "x", correct: false },
      { at_ms: 300, action: "backspace", position: 1, expected: "b", input: null, correct: false },
      insert(400, 1, "b", true),
      insert(500, 2, "c", true),
    ];

    const record = buildSessionRecord(target("abc"), "2026-05-30T00:00:00Z", 1000, 0, "abc", events);

    expect(record.correct_chars).toBe(3);
    expect(record.typed_len).toBe(4);
    expect(record.error_count).toBe(1);
    expect(record.accuracy).toBe(75);
  });

  test("wpm excludes start delay and last key tail", () => {
    const record = buildSessionRecord(target("abc"), "2026-05-30T00:00:00Z", 20000, 0, "abc", [
      insert(5000, 0, "a", true),
      insert(5500, 1, "b", true),
      insert(6000, 2, "c", true),
    ]);

    expect(record.start_to_first_key_ms).toBe(5000);
    expect(record.last_key_to_end_ms).toBe(14000);
    expect(record.active_ms).toBe(1000);
    expect(record.wpm).toBe(36);
  });

  test("idle gap excess is excluded from wpm and token stats", () => {
    const record = buildSessionRecord(target("ab cd"), "2026-05-30T00:00:00Z", 20500, 0, "ab cd", [
      insert(100, 0, "a", true),
      insert(200, 1, "b", true),
      insert(20300, 3, "c", true),
      insert(20400, 4, "d", true),
    ]);

    const cd = record.token_stats.find((stat) => stat.token === "cd");

    expect(record.idle_pause_count).toBe(1);
    expect(record.idle_ms).toBe(10100);
    expect(record.active_ms).toBe(10200);
    expect(cd?.start_delay_ms).toBe(10000);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/metrics.test.ts
```

Expected: fail because metrics exports are missing.

- [x] **Step 3: Port the minimal metrics implementation**

Implement `tokenSpans` and `buildSessionRecord` with `IDLE_THRESHOLD_MS = 10000`, Rust-compatible token symbols, active/idle timing, corrected-mistake accuracy, slow token sorting, and printable error labels.

- [x] **Step 4: Run metrics tests**

Run:

```bash
bun test ts/tests/metrics.test.ts
```

Expected: pass.

## Task 4: Adaptive Plan Port

**Files:**
- Create: `ts/src/training/generatedIdentifier.ts`
- Create: `ts/src/training/plan.ts`
- Modify: `ts/src/index.ts`
- Test: `ts/tests/plan.test.ts`

- [x] **Step 1: Write failing adaptive plan tests**

Create tests for:

- no-history defaults: focus words include `return`, recommended mode is `chars`, `has_recent_history` is `false`;
- legacy `error_tokens` populate word and symbol focus;
- generated numbered identifiers like `transaction5Open` are filtered while `response` remains;
- `error_chars` are bucketed into focus keys such as `j` and `;`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/plan.test.ts
```

Expected: fail because plan exports are missing.

- [x] **Step 3: Port generated identifier filtering and adaptive plan logic**

Implement score `avg_delay + avg_duration * 0.25 + errors * 300`, 21-day cutoff, focus selection limits, key buckets, advice text, and recommended-mode pressure comparison.

- [x] **Step 4: Run plan tests**

Run:

```bash
bun test ts/tests/plan.test.ts
```

Expected: pass.

## Task 5: Vocabulary and Long-Word Breakdown

**Files:**
- Create: `ts/src/training/vocabulary.ts`
- Modify: `ts/src/index.ts`
- Test: `ts/tests/vocabulary.test.ts`

- [x] **Step 1: Write failing vocabulary tests**

Create tests for:

- archived personal vocabulary entries are excluded;
- higher priority and recent errors rank entries ahead;
- breakdown target repeats parts before the full word;
- aliases such as `i18n` are accepted metadata but do not replace the primary target word.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: fail because vocabulary exports are missing.

- [x] **Step 3: Implement vocabulary scoring and target generation**

Implement personal vocabulary ranking from the migration spec:

```text
score = priority * 500 + never_practiced_bonus + recent_error_count * 1000 + avg_start_delay_ms + avg_duration_ms / 2
```

Use `never_practiced_bonus = 800`, exclude archived entries, and build long-word breakdown text as part repetitions followed by full-word repetitions.

- [x] **Step 4: Run vocabulary tests**

Run:

```bash
bun test ts/tests/vocabulary.test.ts
```

Expected: pass.

## Task 6: Full First-Slice Verification

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

- [x] **Step 3: Check formatting-sensitive diff issues**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

