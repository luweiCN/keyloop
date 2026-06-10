# TS OpenTUI Settings Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TypeScript/OpenTUI Settings placeholder with a testable settings menu and an interactive interface-language page.

**Architecture:** Keep settings as pure app state in `ts/src/ui/opentui/appModel.ts` and key reduction in `ts/src/ui/opentui/appSession.ts`. This slice only changes in-memory OpenTUI state; preference persistence is intentionally left for a later slice so `--language en` does not accidentally become a saved preference.

**Tech Stack:** Bun tests, TypeScript strict mode, existing OpenTUI app model/session/renderer adapter.

---

### Task 1: Add Failing Settings Model Tests

**Files:**
- Modify: `ts/tests/opentuiApp.test.ts`
- Modify: `ts/tests/opentuiAppSession.test.ts`

- [x] **Step 1: Add app model settings assertions**

Add a test proving the Settings menu is no longer a placeholder:

```ts
  test("settings route renders menu and language choices", () => {
    const settings = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "settings",
      appContext(),
    );

    expect(settings.route.screen).toBe("settings");
    expect(openTuiRouteLines(settings)).toEqual([
      "1. Interface language",
      "2. Programming language scope",
    ]);
  });
```

- [x] **Step 2: Add app session language reducer assertions**

Add to `ts/tests/opentuiAppSession.test.ts`:

```ts
  test("settings language page switches interface language in memory", () => {
    const context = appContext();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("zh"),
      key("6", "6"),
      context,
    );
    const languagePage = reduceOpenTuiAppKey(settings.state, key("1", "1"), context);
    const english = reduceOpenTuiAppKey(languagePage.state, key("2", "2"), context);
    const menu = reduceOpenTuiAppKey(english.state, key("escape", "\x1b"), context);
    const main = reduceOpenTuiAppKey(menu.state, key("escape", "\x1b"), context);

    expect(languagePage.state.route.screen).toBe("settings");
    if (languagePage.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(languagePage.state.route.view).toBe("language");
    expect(english.state.language).toBe("en");
    expect(english.state.route.screen).toBe("settings");
    expect(menu.state.route.screen).toBe("settings");
    if (menu.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(menu.state.route.view).toBe("menu");
    expect(main.state.route.screen).toBe("main_menu");
    expect(main.state.language).toBe("en");
  });
```

- [x] **Step 3: Run focused tests and verify RED**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiAppSession.test.ts --timeout 10000
```

Expected: FAIL because Settings still renders `Settings screen` and settings keys are no-ops.

### Task 2: Implement Settings Model And Reducer

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`
- Modify: `ts/src/ui/opentui/appSession.ts`

- [x] **Step 1: Extend settings route state**

Add `OpenTuiSettingsView = "menu" | "language"` and change the settings route to include:

```ts
{ screen: "settings"; view: OpenTuiSettingsView }
```

Add `createOpenTuiSettingsState(language, view = "menu")`.

- [x] **Step 2: Render settings lines**

In `openTuiRouteLines`, replace the placeholder with:
- menu view: interface language and programming language scope.
- language view: Chinese / English choices, with current marker.

- [x] **Step 3: Reduce settings keys**

In `reduceOpenTuiAppKey`:
- Escape on settings language page returns settings menu.
- Escape on settings menu returns main menu.
- Settings menu `1` enters language page.
- Language page `1` sets `language: "zh"`.
- Language page `2` sets `language: "en"`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiAppSession.test.ts --timeout 10000
```

Expected: PASS.

### Task 3: Full Verification

**Files:**
- Verify: TS and Rust suites
- Modify: this plan file checkbox statuses

- [x] **Step 1: Run TypeScript tests and typecheck**

Run:

```bash
bun test ts/tests && bun run typecheck
```

Expected: all TS tests pass and `tsc --noEmit` exits 0.

- [x] **Step 2: Run Rust tests**

Run:

```bash
cargo test --locked --all-targets
```

Expected: all Rust tests pass.

- [x] **Step 3: Run whitespace and non-interactive CLI check**

Run:

```bash
git diff --check && tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" bun run keyloop -- --language en plan; exit_code=$?; rm -rf "$tmpdir"; exit $exit_code
```

Expected: no whitespace errors; `plan` prints `Next KeyLoop plan`.

- [x] **Step 4: Update this plan checklist**

Mark all completed task checkboxes with `[x]`.
