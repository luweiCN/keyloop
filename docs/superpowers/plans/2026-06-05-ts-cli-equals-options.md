# TS CLI Equals Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve clap-style `--option=value` compatibility in the TS CLI parser.

**Architecture:** Add one small option-token splitter in `ts/src/cli.ts` and use it in global option parsing, `start` option parsing, and `vocab add` option parsing. Keep existing `--option value` behavior unchanged.

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Support Inline Long Option Values

**Files:**
- Modify: `ts/tests/cli.test.ts`
- Modify: `ts/src/cli.ts`

- [x] **Step 1: Write failing parser tests**

Add tests that assert these forms parse:

```ts
parseCliArgs([
  "--language=en",
  "start",
  "--repo=/tmp/app",
  "--code-language=typescript",
  "--code-framework=react",
  "--code-project=nextjs",
]);

parseCliArgs([
  "vocab",
  "add",
  "internationalization",
  "--parts=international,ization",
  "--alias=i18n",
  "--tag=programming",
  "--priority=3",
]);
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test ts/tests/cli.test.ts --test-name-pattern "equals"
```

Expected: FAIL because the parser currently treats `--language=en` or `--repo=/tmp/app` as unknown/missing-value tokens.

- [x] **Step 3: Implement minimal option-token parsing**

Add a helper that splits a token at the first `=`:

```ts
interface ParsedOptionToken {
  name: string;
  value?: string;
}

function splitOptionToken(option: string | undefined): ParsedOptionToken {
  const text = option ?? "";
  const equalsIndex = text.indexOf("=");
  return equalsIndex === -1
    ? { name: text }
    : { name: text.slice(0, equalsIndex), value: text.slice(equalsIndex + 1) };
}
```

Use `splitOptionToken` in global `--language`, `parseStartCommand`, and `parseVocabAddAction`. Add an `optionValue` helper that returns the inline value when present and otherwise falls back to the existing required next argument behavior.

- [x] **Step 4: Run focused verification**

Run:

```bash
bun test ts/tests/cli.test.ts --test-name-pattern "equals"
bun test ts/tests/cli.test.ts
```

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
bun test ts/tests && bun run typecheck
cargo test --locked --all-targets && bun run build && git diff --check
```

Expected: all commands exit 0.
