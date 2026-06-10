# TS OpenTUI App Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TypeScript/OpenTUI app session layer that connects menu navigation and Stats page switching to keyboard input.

**Architecture:** Keep route data and line generation in `appModel.ts`; add `appSession.ts` as the keyboard reducer and lightweight render/wait loop. Do not merge this into `startRunner.ts`, which remains responsible for live typing practice.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI renderer adapter.

---

## File Structure

- Create: `ts/src/ui/opentui/appSession.ts`
  - Pure key reducer for menus, Stats pages, Esc, Q, and daily date navigation.
  - App session runner that renders current state, waits for one key event, destroys the renderer, and renders the next state.
- Create: `ts/tests/opentuiAppSession.test.ts`
  - RED/GREEN tests for reducer and session runner.
- Modify: `ts/src/index.ts`
  - Export `appSession.ts`.
- Modify: this plan document.

## Task 1: RED App Session Tests

**Files:**
- Create: `ts/tests/opentuiAppSession.test.ts`

- [x] **Step 1: Add reducer tests**

Add tests proving:

```ts
const stats = reduceOpenTuiAppKey(createOpenTuiInitialState("en"), key("7"), context);
expect(stats.state.route.screen).toBe("stats");

const today = reduceOpenTuiAppKey(stats.state, key("tab", "\t"), context);
expect(today.state.route.screen).toBe("stats");
expect(today.state.route.view).toBe("today");

const daily = reduceOpenTuiAppKey(stats.state, key("8"), context);
expect(daily.state.route.view).toBe("daily");

const menu = reduceOpenTuiAppKey(daily.state, key("escape", "\x1b"), context);
expect(menu.state.route.screen).toBe("main_menu");
```

- [x] **Step 2: Add session runner test**

Add a fake OpenTUI kit test proving `runOpenTuiAppSession`:

1. renders the main menu;
2. key `7` renders Stats;
3. Tab renders Today;
4. Escape renders the main menu again;
5. `q` exits with action `quit`.

- [x] **Step 3: Run app session tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiAppSession.test.ts
```

Expected: fail because `appSession.ts` does not exist.

## Task 2: GREEN App Session Implementation

**Files:**
- Create: `ts/src/ui/opentui/appSession.ts`
- Modify: `ts/src/index.ts`

- [x] **Step 1: Implement pure key reducer**

Implement:

```ts
export function reduceOpenTuiAppKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  context: OpenTuiAppSessionContext,
): OpenTuiAppKeyResult
```

Handle:

- `q`/`Q` without modifiers -> `quit`;
- Escape on main menu -> `quit`;
- Escape on submenu/settings/stats -> main menu;
- numeric keys in menu/submenu -> activate that menu item;
- Tab in Stats -> `nextOpenTuiStatsView`;
- numeric keys `1..8` in Stats -> direct Stats pages;
- Left/Right/Home/End in Daily Stats -> update `dailyIndex`;
- `s`/`S` in Keys Stats -> cycle key sort.

- [x] **Step 2: Implement app session runner**

Implement:

```ts
export async function runOpenTuiAppSession(
  context: OpenTuiAppSessionContext,
  options?: OpenTuiAppSessionOptions,
): Promise<OpenTuiAppSessionResult>
```

Render current state with `renderOpenTuiAppOnce`, wait for one `keypress`, destroy the renderer, reduce state, and repeat until action is `quit` or `start`.

- [x] **Step 3: Export app session**

Add:

```ts
export * from "./ui/opentui/appSession";
```

to `ts/src/index.ts`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiAppSession.test.ts
```

Expected: app session tests pass.

## Task 3: Integrated Verification

**Files:**
- Modify: this plan document.

- [x] **Step 1: Run TS checks**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests and typecheck pass.

- [x] **Step 2: Run Rust checks**

Run:

```bash
cargo test --locked --all-targets
```

Expected: existing Rust tests pass.

- [x] **Step 3: Check diff hygiene and TS entry**

Run:

```bash
git diff --check
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; cmd_status=$?; rm -rf "$tmpdir"; exit $cmd_status
```

Expected: no whitespace errors; TS CLI non-start entry still runs.
