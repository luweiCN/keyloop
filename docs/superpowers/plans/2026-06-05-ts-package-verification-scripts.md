# TS Package Verification Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing TS package verification scripts from the migration spec: `bun run lint` and `bun run build`.

**Architecture:** Keep package-level checks simple and aligned with the current TS migration stack. `lint` should be a deterministic type-level gate for now, and `build` should produce a Bun-targeted bundled CLI artifact from `ts/src/main.ts` while leaving runtime dependencies external.

**Tech Stack:** Bun, TypeScript strict mode, existing `package.json` scripts.

---

### Task 1: Package Script Gates

**Files:**
- Create: `ts/tests/package.test.ts`
- Modify: `package.json`

- [x] **Step 1: Write RED package script test**

Add a Bun test that reads root `package.json` and asserts:
- `scripts.lint === "tsc --noEmit"`
- `scripts.build === "bun build ts/src/main.ts --target bun --packages external --outfile dist/keyloop.js"`
- `scripts.test` and `scripts.typecheck` remain present
- `bin["keyloop-ts"] === "./ts/src/main.ts"`

- [x] **Step 2: Verify RED**

Run: `bun test ts/tests/package.test.ts`

Expected: fail because `lint` and `build` scripts are missing.

- [x] **Step 3: Implement scripts**

Update `package.json` scripts:
- `lint`: `tsc --noEmit`
- `build`: `bun build ts/src/main.ts --target bun --packages external --outfile dist/keyloop.js`

- [x] **Step 4: Verify GREEN and recommended gates**

Run:
- `bun test ts/tests/package.test.ts`
- `bun run lint`
- `bun run build`
- `bun test ts/tests && bun run typecheck`
- `cargo test --locked --all-targets`
- `cargo clippy --locked -- -D warnings`
- `KEYLOOP_HOME="$(mktemp -d)" cargo run --locked -- plan`
- `git diff --check`

Expected: all pass.
