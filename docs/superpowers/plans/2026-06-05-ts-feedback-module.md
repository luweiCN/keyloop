# TS Feedback Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Rust `src/feedback.rs` group feedback logic into a dedicated TypeScript training module and reuse it from programming basics target generation.

**Architecture:** Add a serializable `GroupFeedback` TypeScript type, implement `groupFeedback()` with Rust-compatible token/key extraction and normalization, and expose `recentFeedbackTerms()` for target generation. Keep UI untouched and replace only the private duplicate feedback scan in `targets.ts`.

**Tech Stack:** Bun tests, TypeScript strict mode, existing domain model and generated identifier filter.

---

### Task 1: Port Group Feedback

**Files:**
- Modify: `ts/src/domain/model.ts`
- Create: `ts/src/training/feedback.ts`
- Modify: `ts/src/training/targets.ts`
- Modify: `ts/src/index.ts`
- Create: `ts/tests/feedback.test.ts`

- [x] **Step 1: Write failing feedback tests**

Create `ts/tests/feedback.test.ts` with tests for:

```ts
import { describe, expect, test } from "bun:test";

import {
  defaultSessionRecord,
  groupFeedback,
  isNumberedTemplateIdentifier,
  recentFeedbackTerms,
} from "../src/index";

describe("group feedback parity", () => {
  test("extracts error and slow tokens while filtering generated identifiers", () => {
    const feedback = groupFeedback(
      defaultSessionRecord({
        error_chars: { J: 3 },
        token_stats: [
          {
            token: "response",
            kind: "word",
            start_delay_ms: 900,
            duration_ms: 500,
            errors: 1,
          },
          {
            token: "transaction5Open",
            kind: "word",
            start_delay_ms: 1500,
            duration_ms: 500,
            errors: 2,
          },
          {
            token: "return",
            kind: "word",
            start_delay_ms: 50,
            duration_ms: 120,
            errors: 0,
          },
        ],
        key_events: [
          {
            at_ms: 10,
            action: "insert",
            position: 0,
            expected: ";",
            input: "j",
            correct: false,
          },
        ],
      }),
    );

    expect(feedback.error_tokens).toEqual([["response", 1]]);
    expect(feedback.slow_tokens).toEqual([["response", 1400]]);
    expect(feedback.error_keys).toEqual([
      [";", 1],
      ["J", 3],
    ]);
  });

  test("keeps numbered template identifier detector compatible", () => {
    expect(isNumberedTemplateIdentifier("transaction5Open")).toBe(true);
    expect(isNumberedTemplateIdentifier("transaction10Open")).toBe(true);
    expect(isNumberedTemplateIdentifier("Module6Config")).toBe(true);
    expect(isNumberedTemplateIdentifier("module3-list")).toBe(true);
    expect(isNumberedTemplateIdentifier("uint256")).toBe(false);
    expect(isNumberedTemplateIdentifier("ERC20")).toBe(false);
    expect(isNumberedTemplateIdentifier("H2Title")).toBe(false);
    expect(isNumberedTemplateIdentifier("r2d2")).toBe(false);
    expect(isNumberedTemplateIdentifier("s3Bucket")).toBe(false);
    expect(isNumberedTemplateIdentifier("sha256Sum")).toBe(false);
  });

  test("recent feedback terms use latest records first and unique terms", () => {
    const older = defaultSessionRecord({
      error_chars: { a: 1 },
      token_stats: [
        {
          token: "response",
          kind: "word",
          start_delay_ms: 50,
          duration_ms: 100,
          errors: 1,
        },
      ],
    });
    const latest = defaultSessionRecord({
      error_chars: { ";": 1 },
      token_stats: [
        {
          token: "selected",
          kind: "word",
          start_delay_ms: 1300,
          duration_ms: 20,
          errors: 0,
        },
      ],
    });

    expect(recentFeedbackTerms([older, latest])).toEqual([
      "selected",
      ";",
      "response",
      "a",
    ]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/feedback.test.ts
```

Expected: FAIL because `groupFeedback` and `recentFeedbackTerms` are not exported yet.

- [x] **Step 3: Add model type and feedback module**

Add `GroupFeedback` to `ts/src/domain/model.ts`:

```ts
export interface GroupFeedback {
  error_keys: Array<[string, number]>;
  slow_keys: Array<[string, number]>;
  error_tokens: Array<[string, number]>;
  slow_tokens: Array<[string, number]>;
  missed_symbols: Array<[string, number]>;
  backspace_clusters: Array<[string, number]>;
}
```

Create `ts/src/training/feedback.ts` with:

```ts
import type { GroupFeedback, SessionRecord } from "../domain/model";
import { isNumberedTemplateIdentifier } from "./generatedIdentifier";

const GROUP_FEEDBACK_SLOW_TOKEN_THRESHOLD_MS = 1200;

export function groupFeedback(record: SessionRecord): GroupFeedback {
  const feedback = emptyGroupFeedback();
  for (const [key, count] of sortedObjectEntries(record.error_chars)) {
    feedback.error_keys.push([key, count]);
  }
  for (const stat of record.token_stats) {
    if (isNumberedTemplateIdentifier(stat.token)) {
      continue;
    }
    if (stat.errors > 0) {
      feedback.error_tokens.push([stat.token, stat.errors]);
    }
    const tokenMs = stat.start_delay_ms + stat.duration_ms;
    if (tokenMs >= GROUP_FEEDBACK_SLOW_TOKEN_THRESHOLD_MS) {
      feedback.slow_tokens.push([stat.token, tokenMs]);
    }
  }
  for (const event of record.key_events) {
    if (event.action === "insert" && !event.correct) {
      feedback.error_keys.push([event.expected ?? event.input ?? "extra", 1]);
    }
  }
  return normalizeGroupFeedback(feedback);
}

export function recentFeedbackTerms(records: SessionRecord[]): string[] {
  const terms: string[] = [];
  for (const record of records.slice(-4).reverse()) {
    const feedback = groupFeedback(record);
    terms.push(...feedback.error_tokens.map(([token]) => token));
    terms.push(...feedback.slow_tokens.map(([token]) => token));
    terms.push(...feedback.error_keys.map(([key]) => key));
  }
  return uniqueTerms(terms.filter((term) => term.trim() !== "")).slice(0, 12);
}

function emptyGroupFeedback(): GroupFeedback {
  return {
    error_keys: [],
    slow_keys: [],
    error_tokens: [],
    slow_tokens: [],
    missed_symbols: [],
    backspace_clusters: [],
  };
}

function normalizeGroupFeedback(feedback: GroupFeedback): GroupFeedback {
  return {
    error_keys: normalizePairs(feedback.error_keys),
    slow_keys: normalizePairs(feedback.slow_keys),
    error_tokens: normalizePairs(feedback.error_tokens),
    slow_tokens: normalizePairs(feedback.slow_tokens),
    missed_symbols: normalizePairs(feedback.missed_symbols),
    backspace_clusters: normalizePairs(feedback.backspace_clusters),
  };
}

function normalizePairs(pairs: Array<[string, number]>): Array<[string, number]> {
  const sorted = [...pairs].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = compareText(leftKey, rightKey);
    return keyOrder === 0 ? leftValue - rightValue : keyOrder;
  });
  const normalized: Array<[string, number]> = [];
  for (const pair of sorted) {
    const previous = normalized.at(-1);
    if (
      previous !== undefined &&
      previous[0] === pair[0] &&
      previous[1] === pair[1]
    ) {
      continue;
    }
    normalized.push(pair);
  }
  return normalized;
}

function sortedObjectEntries(object: Record<string, number>): Array<[string, number]> {
  return Object.entries(object).sort(([left], [right]) => compareText(left, right));
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const term of terms) {
    if (seen.has(term)) {
      continue;
    }
    seen.add(term);
    unique.push(term);
  }
  return unique;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
```

- [x] **Step 4: Reuse feedback module from targets and export it**

In `ts/src/training/targets.ts`, replace the private `recentFeedbackTerms` helper and `isNumberedTemplateIdentifier` import with:

```ts
import { recentFeedbackTerms } from "./feedback";
```

Add to `ts/src/index.ts`:

```ts
export * from "./training/feedback";
```

- [x] **Step 5: Run feedback tests to verify they pass**

Run:

```bash
bun test ts/tests/feedback.test.ts
```

Expected: PASS.

### Task 2: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-ts-feedback-module.md`

- [x] **Step 1: Run related target and plan tests**

Run:

```bash
bun test ts/tests/feedback.test.ts ts/tests/targets.test.ts ts/tests/plan.test.ts
```

Expected: all related tests pass.

- [x] **Step 2: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 3: Run repository verification**

Run:

```bash
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: Rust tests pass, TS build passes, and diff whitespace check is clean.

- [x] **Step 4: Mark this plan complete**

Check all boxes only after reading the corresponding command output.
