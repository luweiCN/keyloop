# TS Long Word Everyday Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ensure the built-in long-word corpus supports the Everyday practice long-word breakdown entry without relying on user personal vocabulary.

**Architecture:** Keep target-generation domain filtering intact and add everyday/workplace entries to `content/long_words.json`. Add a content-library test proving the built-in long-word corpus covers both programming and everyday/workplace domains.

**Tech Stack:** TypeScript, Bun test runner, JSON content files.

---

### Task 1: Add Everyday/Workplace Built-In Long Words

**Files:**
- Modify: `ts/tests/content.test.ts`
- Modify: `content/long_words.json`

- [x] **Step 1: Write the failing content coverage test**

Add this assertion to the built-in content loading test in `ts/tests/content.test.ts`:

```ts
const longWordDomains = new Set(library.long_words.map((entry) => entry.domain));
expect(longWordDomains.has("programming")).toBe(true);
expect(
  library.long_words.some(
    (entry) => entry.domain === "everyday" || entry.domain === "workplace",
  ),
).toBe(true);
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test ts/tests/content.test.ts --test-name-pattern "built-in json content loads with Rust-compatible counts"
```

Expected: FAIL because the current long-word file only contains programming entries.

- [x] **Step 3: Add built-in everyday/workplace entries**

Append entries such as:

```json
{
  "word": "communication",
  "parts": ["communi", "cation"],
  "domain": "workplace",
  "tier": 2,
  "source_id": "keyloop:long-words:manual",
  "note_zh": "沟通"
}
```

Also add several everyday/workplace entries so the standalone Everyday long-word breakdown has enough built-in candidates.

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/content.test.ts
bun test ts/tests/opentuiApp.test.ts
```

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
bun test ts/tests && bun run typecheck
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: all commands exit 0.
