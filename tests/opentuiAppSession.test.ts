import { describe, expect, test } from "bun:test";

import {
  createOpenTuiInitialState,
  openTuiMenuItems,
  openTuiFlatSettingsItems,
  defaultKeyAggregate,
  defaultSessionRecord,
  openTuiRouteLines,
  reduceOpenTuiAppKey,
  runOpenTuiAppSession,
  type ContentLibrary,
  type OpenTuiAppState,
  type OpenTuiAppSessionContext,
  type OpenTuiKeyEvent,
  type OpenTuiRendererKit,
  type PracticePlan,
} from "../src/index";

interface FakeNode {
  type: "Box" | "Text";
  props: Record<string, unknown>;
  children: FakeNode[];
}

describe("OpenTUI app session", () => {
  test("reducer navigates menus stats pages escape and quit", () => {
    const context = appContext();
    const stats = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("8", "8"),
      context,
    );

    expect(stats.action).toBe("continue");
    expect(stats.state.route.screen).toBe("stats");
    if (stats.state.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(stats.state.route.view).toBe("overview");
    expect(stats.state.route.keyAggregates).toHaveLength(1);

    const today = reduceOpenTuiAppKey(stats.state, key("tab", "\t"), context);
    expect(today.state.route.screen).toBe("stats");
    if (today.state.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(today.state.route.view).toBe("today");

    const daily = reduceOpenTuiAppKey(stats.state, key("8", "8"), context);
    expect(daily.state.route.screen).toBe("stats");
    if (daily.state.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(daily.state.route.view).toBe("daily");
    expect(daily.state.route.dailyIndex).toBe(0);

    const olderDay = reduceOpenTuiAppKey(daily.state, key("right", ""), context);
    expect(olderDay.state.route.screen).toBe("stats");
    if (olderDay.state.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(olderDay.state.route.dailyIndex).toBe(1);

    const keys = reduceOpenTuiAppKey(stats.state, key("5", "5"), context);
    const nextSort = reduceOpenTuiAppKey(keys.state, key("s", "s"), context);
    expect(nextSort.state.route.screen).toBe("stats");
    if (nextSort.state.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(nextSort.state.route.view).toBe("keys");
    expect(nextSort.state.route.keyStatsSort).toBe("fastest");

    const menu = reduceOpenTuiAppKey(daily.state, key("escape", "\x1b"), context);
    expect(menu.state.route.screen).toBe("main_menu");
    expect(menu.action).toBe("continue");

    const quit = reduceOpenTuiAppKey(menu.state, key("q", "q"), context);
    expect(quit.action).toBe("quit");
    expect(quit.state.route.screen).toBe("main_menu");
  });

  test("custom submenu lists libraries and starts library practice", () => {
    const context: OpenTuiAppSessionContext = {
      ...appContext(),
      customLibraries: [
        {
          version: 1,
          slug: "web3",
          name: "Web3 terms",
          created_at: "2026-06-01T00:00:00.000Z",
          words: [
            { id: "w1", text: "staking", kind: "word", meaning_zh: "质押", source: "manual" },
            { id: "w2", text: "oracle", kind: "word", source: "dict" },
          ],
          sentences: [],
          articles: [],
        },
      ],
    };

    const initial = createOpenTuiInitialState("en", {
      customLibraries: context.customLibraries,
    });
    const submenu = reduceOpenTuiAppKey(initial, key("6", "6"), context);
    expect(submenu.state.route.screen).toBe("submenu");
    if (submenu.state.route.screen !== "submenu") {
      throw new Error("expected submenu");
    }
    expect(submenu.state.route.menu).toBe("custom");
    const items = openTuiMenuItems(submenu.state);
    expect(items.map((item) => item.id)).toEqual([
      "library_open_web3",
      "library_new",
      "library_manage",
    ]);
    expect(items[0]?.label).toBe("Web3 terms");

    const opened = reduceOpenTuiAppKey(submenu.state, key("1", "1"), context);
    expect(opened.state.route).toMatchObject({ screen: "library_menu", slug: "web3" });
    const running = reduceOpenTuiAppKey(opened.state, key("1", "1"), context);
    expect(running.action).toBe("start");
    expect(running.state.route.screen).toBe("running");
    if (running.state.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.state.route.source_item).toBe("library_kind_web3:words");
    expect(running.state.route.target.source).toBe("keyloop:library:web3:words");
    expect(running.state.route.target.text).toContain("staking");
    expect(running.state.route.target.text).toContain("oracle");
  });

  test("reducer supports arrow selection and enter in the main menu", () => {
    const context = appContext();
    const foundationSelected = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("down", ""),
      context,
    );
    const submenu = reduceOpenTuiAppKey(foundationSelected.state, key("enter", "\r"), context);

    expect(foundationSelected.action).toBe("continue");
    expect(foundationSelected.state.route.screen).toBe("main_menu");
    if (foundationSelected.state.route.screen !== "main_menu") {
      throw new Error("expected main menu");
    }
    expect(foundationSelected.state.route.selected_index).toBe(1);
    expect(submenu.action).toBe("continue");
    expect(submenu.state.route.screen).toBe("submenu");
    if (submenu.state.route.screen !== "submenu") {
      throw new Error("expected submenu");
    }
    expect(submenu.state.route.menu).toBe("foundation");
    expect(submenu.state.route.selected_index).toBe(0);
  });

  test("settings page supports flat arrow selection and left/right edits", () => {
    const context = appContextWithCodeOptions();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    let speedRow = reduceOpenTuiAppKey(settings.state, key("down", ""), context).state;
    const cpm = reduceOpenTuiAppKey(speedRow, key("right", ""), context);
    speedRow = cpm.state;
    let difficultyRow = reduceOpenTuiAppKey(speedRow, key("down", ""), context).state;
    difficultyRow = reduceOpenTuiAppKey(difficultyRow, key("down", ""), context).state;
    const difficulty = reduceOpenTuiAppKey(difficultyRow, key("right", ""), context);

    expect(difficulty.state.route.screen).toBe("settings");
    if (difficulty.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(difficulty.state.route.view).toBe("menu");
    expect(difficulty.state.route.selected_index).toBe(3);
    expect(openTuiRouteLines(settings.state)).toContain(
      "> Interface language  English",
    );
    expect(openTuiRouteLines(cpm.state)).toContain(
      "> Typing speed  CPM (characters per minute)",
    );
    expect(cpm.state.speed_unit).toBe("cpm");
    expect(openTuiRouteLines(difficulty.state)).toContain(
      "> Code difficulty  Any",
    );
    const lengthRow = reduceOpenTuiAppKey(difficulty.state, key("down", ""), context);
    const length = reduceOpenTuiAppKey(lengthRow.state, key("right", ""), context);
    expect(length.state.route.screen).toBe("settings");
    if (length.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(length.state.route.selected_index).toBe(4);
    expect(openTuiRouteLines(length.state)).toContain("> Code length  Short");
  });

  test("settings entry preserves session-scoped settings", () => {
    const context = appContext();
    const initial = createOpenTuiInitialState("en", {
      enabledModules: ["foundation_input"],
      dictionaryTier: "mini",
      mainGoal: {
        form: "code",
        target_wpm: 50,
        deadline: "2026-09-14",
        created_at: "2026-06-05T00:00:00.000Z",
      },
    });
    const settings = reduceOpenTuiAppKey(initial, key("7", "7"), context);

    expect(openTuiRouteLines(settings.state)).toContain(
      "  Dictionary status  Mini (full downloading in background)",
    );
    expect(openTuiRouteLines(settings.state)).toContain(
      "  Comprehensive: code practice  Off",
    );
    expect(openTuiRouteLines(settings.state)).toContain(
      "  Goal-driven training  On",
    );
  });

  test("goal-driven training stays enabled after returning to settings", () => {
    const context = appContext();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    const goalIndex = openTuiFlatSettingsItems(settings.state).findIndex(
      (item) => item.kind === "goal_enabled",
    );
    expect(goalIndex).toBeGreaterThanOrEqual(0);

    const goalRow = pressSettingsDown(settings.state, context, goalIndex);
    const enabled = reduceOpenTuiAppKey(goalRow, key("right", ""), context);
    const mainMenu = reduceOpenTuiAppKey(enabled.state, key("escape", "\x1b"), context);
    const reopened = reduceOpenTuiAppKey(mainMenu.state, key("7", "7"), context);

    expect(openTuiRouteLines(reopened.state)).toContain(
      "  Goal-driven training  On",
    );
  });

  test("settings page saves youdao paid voice credentials through persist action", () => {
    const context = appContext();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    const youdaoRow = pressSettingsDown(settings.state, context, 10);
    const youdaoPage = reduceOpenTuiAppKey(youdaoRow, key("return", "\r"), context);

    expect(youdaoPage.state.route.screen).toBe("settings");
    if (youdaoPage.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(youdaoPage.state.route.view).toBe("youdao_tts");
    expect(openTuiRouteLines(youdaoPage.state)).toContain(
      "> Youdao App Key  ",
    );
    expect(openTuiRouteLines(youdaoPage.state)).toContain(
      "  Save to macOS Keychain",
    );

    let state = youdaoPage.state;
    for (const char of "app-key") {
      state = reduceOpenTuiAppKey(state, key(char, char), context).state;
    }
    state = reduceOpenTuiAppKey(state, key("down", ""), context).state;
    for (const char of "app-secret") {
      state = reduceOpenTuiAppKey(state, key(char, char), context).state;
    }
    state = reduceOpenTuiAppKey(state, key("down", ""), context).state;
    const saved = reduceOpenTuiAppKey(state, key("return", "\r"), context);

    expect(saved.persist).toEqual({
      kind: "save_youdao_credentials",
      credentials: {
        appKey: "app-key",
        appSecret: "app-secret",
      },
    });
    expect(openTuiRouteLines(saved.state)).toContain("> Save to macOS Keychain");
  });

  test("youdao credential fields accept q instead of treating it as quit", () => {
    const context = appContext();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    const youdaoRow = pressSettingsDown(settings.state, context, 10);
    let state = reduceOpenTuiAppKey(youdaoRow, key("return", "\r"), context).state;

    const typed = reduceOpenTuiAppKey(state, key("q", "q"), context);
    state = typed.state;

    expect(typed.action).toBe("continue");
    expect(openTuiRouteLines(state)).toContain("> Youdao App Key  q");
  });

  test("running route remembers the menu it started from", () => {
    const context = appContext();
    const foundationMenu = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("2", "2"),
      context,
    );
    const running = reduceOpenTuiAppKey(foundationMenu.state, key("enter", "\r"), context);

    expect(running.action).toBe("start");
    expect(running.state.route.screen).toBe("running");
    if (running.state.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.state.route.return_route).toEqual({
      screen: "submenu",
      menu: "foundation",
      selected_index: 0,
    });
  });

  test("settings language row switches interface language in memory", () => {
    const context = appContext();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("zh"),
      key("7", "7"),
      context,
    );
    const english = reduceOpenTuiAppKey(settings.state, key("right", ""), context);
    const main = reduceOpenTuiAppKey(english.state, key("escape", "\x1b"), context);

    expect(english.state.route.screen).toBe("settings");
    if (english.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(english.state.language).toBe("en");
    expect(english.state.route.view).toBe("menu");
    expect(openTuiRouteLines(english.state)).toContain(
      "> Interface language  English",
    );
    expect(main.state.route.screen).toBe("main_menu");
    expect(main.state.language).toBe("en");
  });

  test("settings code filters toggle in memory and affect code practice target", () => {
    const context = appContextWithCodeOptions();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    const codeFilterRow = pressSettingsDown(settings.state, context, 2);
    const picker = reduceOpenTuiAppKey(codeFilterRow, key("enter", "\r"), context);
    const selected = reduceOpenTuiAppKey(picker.state, key("right", ""), context);
    const settingsMenu = reduceOpenTuiAppKey(selected.state, key("escape", "\x1b"), context);
    const mainMenu = reduceOpenTuiAppKey(settingsMenu.state, key("escape", "\x1b"), context);
    const codeMenu = reduceOpenTuiAppKey(mainMenu.state, key("5", "5"), context);
    const running = reduceOpenTuiAppKey(codeMenu.state, key("1", "1"), context);

    expect(selected.state.route.screen).toBe("settings");
    if (selected.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(selected.state.route.view).toBe("code_filters");
    expect(openTuiRouteLines(selected.state)).toContain(
      "> [x] language: typescript (1)",
    );
    expect(running.action).toBe("start");
    expect(running.state.route.screen).toBe("running");
    if (running.state.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.state.route.target.text).toContain("const selectedValue");
    expect(running.state.route.target.text).not.toContain("fn selected_value");
  });

  test("ctrl-p pins and unpins the active code filter option", () => {
    const context = appContextWithCodeOptions();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    let state = pressSettingsDown(settings.state, context, 2);
    state = reduceOpenTuiAppKey(state, key("enter", "\r"), context).state;
    state = reduceOpenTuiAppKey(state, key("down", ""), context).state;

    const ctrlP: OpenTuiKeyEvent = { name: "p", sequence: "\x10", ctrl: true, meta: false };
    const pinned = reduceOpenTuiAppKey(state, ctrlP, context);
    if (pinned.state.route.screen !== "settings" || pinned.state.codeFilters === undefined) {
      throw new Error("expected settings route with code filters");
    }
    expect(pinned.state.codeFilters.pinned).toHaveLength(1);
    const pinnedPreference = pinned.state.codeFilters.pinned[0];
    expect(openTuiRouteLines(pinned.state).join("\n")).toContain("pinned");

    const pinnedIndex = pinned.state.codeFilters.options.findIndex(
      (option) =>
        option.facet === pinnedPreference?.facet && option.value === pinnedPreference?.value,
    );
    expect(pinnedIndex).toBe(0);
    expect(pinned.state.codeFilters.index).toBe(pinnedIndex);

    const unpinned = reduceOpenTuiAppKey(pinned.state, ctrlP, context);
    if (unpinned.state.route.screen !== "settings" || unpinned.state.codeFilters === undefined) {
      throw new Error("expected settings route with code filters");
    }
    expect(unpinned.state.codeFilters.pinned).toHaveLength(0);
  });

  test("settings code scope picker searches navigates and selects with arrows", () => {
    const context = appContextWithCodeOptions();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    let state = pressSettingsDown(settings.state, context, 2);
    state = reduceOpenTuiAppKey(state, key("enter", "\r"), context).state;

    expect(openTuiRouteLines(state)).toContain("Search  ");

    state = reduceOpenTuiAppKey(state, key("r", "r"), context).state;
    state = reduceOpenTuiAppKey(state, key("e", "e"), context).state;
    state = reduceOpenTuiAppKey(state, key("a", "a"), context).state;

    expect(openTuiRouteLines(state)).toContain("Search  rea");
    expect(openTuiRouteLines(state)).toContain("> [ ] framework: react (1)");
    expect(openTuiRouteLines(state)).not.toContain(
      "  [ ] language: typescript (1)",
    );

    const reactRow = reduceOpenTuiAppKey(state, key("down", ""), context);
    expect(openTuiRouteLines(reactRow.state)).toContain(
      "> [ ] framework: react (1)",
    );

    const selected = reduceOpenTuiAppKey(reactRow.state, key("right", ""), context);
    expect(openTuiRouteLines(selected.state)).toContain(
      "> [x] framework: react (1)",
    );

    const cancelled = reduceOpenTuiAppKey(selected.state, key("left", ""), context);
    expect(openTuiRouteLines(cancelled.state)).toContain(
      "> [ ] framework: react (1)",
    );
  });

  test("settings code scope picker toggles the active option with space", () => {
    const context = appContextWithCodeOptions();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    let state = pressSettingsDown(settings.state, context, 2);
    state = reduceOpenTuiAppKey(state, key("enter", "\r"), context).state;
    state = reduceOpenTuiAppKey(state, key("r", "r"), context).state;
    state = reduceOpenTuiAppKey(state, key("e", "e"), context).state;
    state = reduceOpenTuiAppKey(state, key("a", "a"), context).state;

    const selected = reduceOpenTuiAppKey(state, key("space", " "), context);
    expect(openTuiRouteLines(selected.state)).toContain(
      "> [x] framework: react (1)",
    );

    const cancelled = reduceOpenTuiAppKey(selected.state, key("space", " "), context);
    expect(openTuiRouteLines(cancelled.state)).toContain(
      "> [ ] framework: react (1)",
    );
  });

  test("settings code difficulty updates later code practice targets", () => {
    const context = appContextWithCodeDifficultyOptions();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    let difficultyState = pressSettingsDown(settings.state, context, 3);
    difficultyState = reduceOpenTuiAppKey(difficultyState, key("right", ""), context).state;
    difficultyState = reduceOpenTuiAppKey(difficultyState, key("right", ""), context).state;
    difficultyState = reduceOpenTuiAppKey(difficultyState, key("right", ""), context).state;
    const mainMenu = reduceOpenTuiAppKey(difficultyState, key("escape", "\x1b"), context);
    const codeMenu = reduceOpenTuiAppKey(mainMenu.state, key("5", "5"), context);
    const running = reduceOpenTuiAppKey(codeMenu.state, key("1", "1"), context);

    expect(difficultyState.route.screen).toBe("settings");
    if (difficultyState.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(difficultyState.route.view).toBe("menu");
    expect(openTuiRouteLines(difficultyState)).toContain("> Code difficulty  Medium");
    expect(running.state.route.screen).toBe("running");
    if (running.state.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.state.route.target.text).toContain("mediumSelected");
    expect(running.state.route.target.text).not.toContain("easySelected");
  });

  test("settings code style updates later code practice targets", () => {
    const context = appContextWithCodeStyleSnippet();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );
    const semicolonRow = pressSettingsDown(settings.state, context, 6);
    const noSemicolons = reduceOpenTuiAppKey(semicolonRow, key("right", ""), context);
    const quoteRow = reduceOpenTuiAppKey(noSemicolons.state, key("down", ""), context);
    const singleQuotes = reduceOpenTuiAppKey(quoteRow.state, key("right", ""), context);
    const mainMenu = reduceOpenTuiAppKey(singleQuotes.state, key("escape", "\x1b"), context);
    const codeMenu = reduceOpenTuiAppKey(mainMenu.state, key("5", "5"), context);
    const running = reduceOpenTuiAppKey(codeMenu.state, key("1", "1"), context);

    expect(singleQuotes.state.route.screen).toBe("settings");
    if (singleQuotes.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(singleQuotes.state.route.view).toBe("menu");
    expect(openTuiRouteLines(noSemicolons.state)).toContain(
      "> Code semicolons  Never",
    );
    expect(openTuiRouteLines(singleQuotes.state)).toContain("> Code quotes  Single");
    expect(running.action).toBe("start");
    expect(running.state.route.screen).toBe("running");
    if (running.state.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.state.route.target.text).toBe("if (ready) {\n  return 'ok'\n}");
  });

  test("settings page does not expose single-practice everyday controls", () => {
    const context = appContextWithEverydayCorpus();
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );

    expect(settings.state.route.screen).toBe("settings");
    if (settings.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(openTuiRouteLines(settings.state)).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("Everyday word count"),
        expect.stringContaining("Everyday sentence length"),
        expect.stringContaining("Everyday phrases"),
      ]),
    );
  });

  test("settings page does not expose comprehensive word-form controls", () => {
    const context = {
      ...appContext(),
      personalVocabulary: [
        {
          id: "vocab-serialization",
          text: "serialization",
          kind: "code_term" as const,
          parts: ["serial", "ization"],
          aliases: [],
          tags: ["programming"],
          priority: 3 as const,
          created_at: "2026-06-05T00:00:00.000Z",
          updated_at: "2026-06-05T00:00:00.000Z",
          archived: false,
        },
      ],
      personalVocabularyLimit: 8,
      wordBreakdownSettings: {
        enabled_in_comprehensive: true,
        max_items_per_group: 6,
        word_repeats: 2,
      },
      personalVocabularySettings: {
        enabled_in_comprehensive: true,
        daily_review_limit: 8,
      },
    };
    const settings = reduceOpenTuiAppKey(
      createOpenTuiInitialState("en"),
      key("7", "7"),
      context,
    );

    expect(settings.state.route.screen).toBe("settings");
    if (settings.state.route.screen !== "settings") {
      throw new Error("expected settings route");
    }
    expect(openTuiRouteLines(settings.state)).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("Word breakdown"),
        expect.stringContaining("Vocabulary in full practice"),
        expect.stringContaining("Vocabulary daily limit"),
      ]),
    );
  });

  test("session runner rerenders menu stats today menu and quits", async () => {
    const kit = fakeKit();
    const runPromise = runOpenTuiAppSession(appContext(), {
      kit,
      initialState: createOpenTuiInitialState("en"),
    });

    await kit.waitForKeyListener(1);
    expect(flattenContent(kit.addedNodes)).toContain("KeyLoop");

    kit.emitKey({ name: "8", sequence: "8" });
    await kit.waitForKeyListener(2);
    expect(flattenContent(kit.addedNodes)).toContain("Stats");
    expect(flattenContent(kit.addedNodes)).toContain("Overview  2 sessions");

    kit.emitKey({ name: "tab", sequence: "\t" });
    await kit.waitForKeyListener(3);
    expect(flattenContent(kit.addedNodes)).toContain("Today 1 sessions");

    kit.emitKey({ name: "escape", sequence: "\x1b" });
    await kit.waitForKeyListener(4);
    expect(flattenContent(kit.addedNodes)).toContain("KeyLoop");

    kit.emitKey({ name: "q", sequence: "q" });
    const result = await Promise.race([
      runPromise,
      delay(50).then(() => null),
    ]);

    expect(result?.action).toBe("quit");
    expect(result?.state.route.screen).toBe("main_menu");
    expect(kit.createdOptions).toHaveLength(1);
    expect(kit.destroyed).toBe(1);
  });

  test("session seeds the main goal from context preferences", async () => {
    const kit = fakeKit();
    const goal = {
      form: "code" as const,
      target_wpm: 50,
      deadline: "2026-09-14",
      created_at: "2026-06-15T00:00:00.000Z",
    };
    const runPromise = runOpenTuiAppSession({ ...appContext(), mainGoal: goal }, { kit });
    await kit.waitForKeyListener(1);
    kit.emitKey({ name: "q", sequence: "q" });
    const result = await Promise.race([runPromise, delay(50).then(() => null)]);
    expect(result?.state.mainGoal).toEqual(goal);
  });

  test("session runner keeps one renderer while navigating with arrows", async () => {
    const kit = fakeKit();
    const runPromise = runOpenTuiAppSession(appContext(), {
      kit,
      initialState: createOpenTuiInitialState("en"),
    });

    await kit.waitForKeyListener(1);
    kit.emitKey({ name: "down", sequence: "" });
    await kit.waitForRenderRequest(1);
    await kit.waitForKeyListener(2);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForRenderRequest(2);
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "q", sequence: "q" });

    const result = await Promise.race([
      runPromise,
      delay(50).then(() => null),
    ]);

    expect(result?.action).toBe("quit");
    expect(result?.state.route.screen).toBe("submenu");
    if (result?.state.route.screen !== "submenu") {
      throw new Error("expected submenu");
    }
    expect(result.state.route.menu).toBe("foundation");
    expect(kit.createdOptions).toHaveLength(1);
    expect(kit.destroyed).toBe(1);
  });

  test("session runner hands the live renderer to the start runner on start action", async () => {
    const kit = fakeKit();
    const runPromise = runOpenTuiAppSession(appContext(), {
      kit,
      initialState: createOpenTuiInitialState("en"),
    });

    await kit.waitForKeyListener(1);
    // 第一个 Enter 进入综合训练诊断屏，第二个 Enter 开始第一阶段
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(2);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await Promise.race([
      runPromise,
      delay(50).then(() => null),
    ]);

    expect(result?.action).toBe("start");
    expect(result?.state.route.screen).toBe("running");
    expect(result?.renderer).toBeDefined();
    expect(kit.createdOptions).toHaveLength(1);
    expect(kit.destroyed).toBe(0);

    result?.renderer?.destroy?.();
    expect(kit.destroyed).toBe(1);
  });

  test("session runner initializes code filters from context", async () => {
    const kit = fakeKit();
    const runPromise = runOpenTuiAppSession(
      {
        ...appContextWithCodeOptions(),
        selectedCodeFilters: [{ facet: "language", value: "typescript" }],
      },
      { kit },
    );

    await kit.waitForKeyListener(1);
    kit.emitKey({ name: "q", sequence: "q" });

    const result = await Promise.race([
      runPromise,
      delay(50).then(() => null),
    ]);

    expect(result?.action).toBe("quit");
    expect(result?.state.codeFilters?.selected).toEqual([
      { facet: "language", value: "typescript" },
    ]);
  });

  test("session runner renders explicit today elapsed time from context", async () => {
    const kit = fakeKit();
    const runPromise = runOpenTuiAppSession(
      {
        ...appContext(),
        todayElapsedMs: 28 * 60_000 + 24_000,
      },
      {
        kit,
        initialState: createOpenTuiInitialState("en"),
      },
    );

    await kit.waitForKeyListener(1);
    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Today");
    expect(content).toContain("28:24");

    kit.emitKey({ name: "q", sequence: "q" });
    await runPromise;
  });

  test("today elapsed time survives navigating into submenus and back", () => {
    const context = appContext();
    const initial = {
      ...createOpenTuiInitialState("en"),
      today_elapsed_ms: 28 * 60_000 + 24_000,
    };

    const submenu = reduceOpenTuiAppKey(initial, key("2", "2"), context);
    expect(submenu.state.route.screen).toBe("submenu");
    expect(submenu.state.today_elapsed_ms).toBe(28 * 60_000 + 24_000);

    const backToMenu = reduceOpenTuiAppKey(submenu.state, key("escape", "\x1b"), context);
    expect(backToMenu.state.route.screen).toBe("main_menu");
    expect(backToMenu.state.today_elapsed_ms).toBe(28 * 60_000 + 24_000);

    const settings = reduceOpenTuiAppKey(backToMenu.state, key("7", "7"), context);
    const backAgain = reduceOpenTuiAppKey(settings.state, key("escape", "\x1b"), context);
    expect(backAgain.state.route.screen).toBe("main_menu");
    expect(backAgain.state.today_elapsed_ms).toBe(28 * 60_000 + 24_000);
  });
});

function appContext(): OpenTuiAppSessionContext {
  return {
    language: "en",
    now: new Date("2026-06-05T12:30:00.000Z"),
    records: [
      defaultSessionRecord({
        started_at: "2026-06-05T12:00:00.000Z",
        duration_ms: 60_000,
        active_ms: 60_000,
        target_len: 100,
        correct_chars: 100,
        typed_len: 100,
        accuracy: 100,
        wpm: 20,
      }),
      defaultSessionRecord({
        started_at: "2026-06-04T12:00:00.000Z",
        duration_ms: 60_000,
        active_ms: 60_000,
        target_len: 100,
        correct_chars: 90,
        typed_len: 100,
        accuracy: 90,
        wpm: 18,
      }),
    ],
    plan: testPlan(),
    library: testLibrary(),
    keyAggregates: [
      defaultKeyAggregate({
        key: "[",
        sample_count: 5,
        avg_ms: 400,
        fastest_ms: 80,
        slowest_ms: 900,
        error_rate: 20,
        confidence: 0.4,
      }),
    ],
  };
}

function appContextWithCodeOptions(): OpenTuiAppSessionContext {
  const context = appContext();
  return {
    ...context,
    library: {
      ...context.library,
      code_snippets: [
        {
          language: "typescript",
          framework: "react",
          project: "test",
          level: "block",
          source: "test:typescript",
          text: "const selectedValue = items.map((item) => item.id);",
        },
        {
          language: "zig",
          framework: "none",
          project: "zig-demo",
          level: "block",
          source: "test:zig",
          text: "fn selected_value() void {\n    return;\n}",
        },
      ],
    },
  };
}

function appContextWithCodeDifficultyOptions(): OpenTuiAppSessionContext {
  const context = appContext();
  return {
    ...context,
    library: {
      ...context.library,
      code_snippets: [
        {
          language: "typescript",
          framework: "react",
          project: "test",
          level: "block",
          difficulty: "easy",
          source: "test:easy",
          text: "if (easySelected) {\n  return easySelected;\n}",
        },
        {
          language: "typescript",
          framework: "react",
          project: "test",
          level: "block",
          difficulty: "medium",
          source: "test:medium",
          text: "if (mediumSelected) {\n  return mediumSelected;\n}",
        },
      ],
    },
  };
}

function appContextWithCodeStyleSnippet(): OpenTuiAppSessionContext {
  const context = appContext();
  return {
    ...context,
    library: {
      ...context.library,
      code_snippets: [
        {
          language: "javascript",
          framework: "none",
          project: "test",
          level: "block",
          source: "test:javascript",
          text: 'if (ready) { return "ok"; }',
        },
      ],
    },
  };
}

function appContextWithEverydayCorpus(): OpenTuiAppSessionContext {
  const context = appContext();
  return {
    ...context,
    everydaySettings: {
      word_count: 50,
      sentence_length: "mixed",
      include_phrases: true,
    },
    library: {
      ...context.library,
      common_words: ["today", "review", "support", "practice"],
      everyday_english: {
        sources: [],
        entries: [
          {
            text: "today",
            kind: "word",
            tier: 1,
            length: null,
            domain: "everyday",
            source_id: "test",
          },
          {
            text: "stand up",
            kind: "phrase",
            tier: 1,
            length: null,
            domain: "everyday",
            source_id: "test",
          },
          {
            text: "Short daily sentence.",
            kind: "sentence",
            tier: 1,
            length: "short",
            domain: "everyday",
            source_id: "test",
          },
        ],
      },
    },
  };
}

function key(name: string, sequence: string): OpenTuiKeyEvent {
  return { name, sequence, ctrl: false, meta: false };
}

function pressSettingsDown(
  state: OpenTuiAppState,
  context: OpenTuiAppSessionContext,
  count: number,
): OpenTuiAppState {
  let current = state;
  for (let index = 0; index < count; index += 1) {
    current = reduceOpenTuiAppKey(current, key("down", ""), context).state;
  }
  return current;
}

function fakeKit(): OpenTuiRendererKit & {
  addedNodes: FakeNode[];
  createdOptions: Array<{ exitOnCtrlC: boolean }>;
  destroyed: number;
  emitKey(event: Partial<OpenTuiKeyEvent>): void;
  waitForKeyListener(count?: number): Promise<void>;
  waitForRenderRequest(count?: number): Promise<void>;
} {
  const addedNodes: FakeNode[] = [];
  const createdOptions: Array<{ exitOnCtrlC: boolean }> = [];
  let destroyed = 0;
  let keyHandler: ((event: OpenTuiKeyEvent) => void) | undefined;
  let keyListenerCount = 0;
  let renderRequestCount = 0;
  const keyListenerWaiters: Array<{
    count: number;
    resolve: () => void;
  }> = [];
  const renderRequestWaiters: Array<{
    count: number;
    resolve: () => void;
  }> = [];
  const resolveKeyListenerWaiters = (): void => {
    for (let index = keyListenerWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = keyListenerWaiters[index];
      if (waiter !== undefined && keyListenerCount >= waiter.count) {
        waiter.resolve();
        keyListenerWaiters.splice(index, 1);
      }
    }
  };
  const resolveRenderRequestWaiters = (): void => {
    for (let index = renderRequestWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = renderRequestWaiters[index];
      if (waiter !== undefined && renderRequestCount >= waiter.count) {
        waiter.resolve();
        renderRequestWaiters.splice(index, 1);
      }
    }
  };
  return {
    addedNodes,
    createdOptions,
    get destroyed() {
      return destroyed;
    },
    emitKey: (event) => {
      if (keyHandler === undefined) {
        throw new Error("keypress handler was not registered");
      }
      keyHandler({
        name: event.name ?? "",
        sequence: event.sequence ?? "",
        ctrl: event.ctrl ?? false,
        meta: event.meta ?? false,
      });
    },
    waitForKeyListener: (count = 1) => {
      if (keyListenerCount >= count) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        keyListenerWaiters.push({ count, resolve });
      });
    },
    waitForRenderRequest: (count = 1) => {
      if (renderRequestCount >= count) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        renderRequestWaiters.push({ count, resolve });
      });
    },
    Box: (props, ...children) => ({ type: "Box", props, children }),
    Text: (props) => ({ type: "Text", props, children: [] }),
    createCliRenderer: async (options) => {
      createdOptions.push(options);
      return {
        root: {
          add: (...nodes: unknown[]) => {
            addedNodes.push(...(nodes as FakeNode[]));
          },
          remove: (id: string) => {
            for (let index = addedNodes.length - 1; index >= 0; index -= 1) {
              if (addedNodes[index]?.props.id === id) {
                addedNodes.splice(index, 1);
              }
            }
          },
        },
        idle: async () => {},
        requestRender: () => {
          renderRequestCount += 1;
          resolveRenderRequestWaiters();
        },
        destroy: () => {
          destroyed += 1;
        },
        keyInput: {
          on: (event: "keypress", handler: (event: OpenTuiKeyEvent) => void) => {
            if (event === "keypress") {
              keyHandler = handler;
              keyListenerCount += 1;
              resolveKeyListenerWaiters();
            }
          },
          off: (event: "keypress", handler: (event: OpenTuiKeyEvent) => void) => {
            if (event === "keypress" && keyHandler === handler) {
              keyHandler = undefined;
            }
          },
        },
      };
    },
  };
}

function flattenContent(nodes: FakeNode[]): string {
  const values: string[] = [];
  const visit = (node: FakeNode): void => {
    const content = node.props.content;
    if (typeof content === "string") {
      values.push(content);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return values.join("\n");
}

function testPlan(): PracticePlan {
  return {
    focus_words: ["selected"],
    focus_symbols: ["=>"],
    focus_code: ["items.map"],
    focus_keys: ["["],
    advice: [],
    recommended_mode: "mixed",
    has_recent_history: true,
  };
}

function testLibrary(): ContentLibrary {
  return {
    warmup: ["asdf jkl;"],
    foundation_drills: [
      {
        id: "home-row",
        title_zh: "home",
        title_en: "home",
        hint_zh: "",
        hint_en: "",
        items: ["asdf jkl;"],
      },
    ],
    word_chunks: ["select ed"],
    common_words: ["today"],
    everyday_english: { sources: [], entries: [] },
    everyday_words: { sources: [], entries: [] },
    everyday_sentences: { sources: [], entries: [] },
    everyday_articles: { sources: [], entries: [] },
    everyday_word_decomposition: { sources: [], entries: [] },
    programming_words: ["selected", "pending", "enabled"].map((word) => ({
      word,
      note_zh: "",
    })),
    code_snippets: [],
    long_words: [],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

  test("burst keypresses from one stdin chunk are all consumed (IME commit)", async () => {
    const kit = fakeKit();
    const runPromise = runOpenTuiAppSession(appContext(), {
      kit,
      initialState: {
        ...createOpenTuiInitialState("zh"),
        route: { screen: "library_create", name: "" },
      },
    });

    await kit.waitForKeyListener(1);
    // 模拟 IME 整句上屏：同一同步批次连发 4 个字符事件
    kit.emitKey({ name: "考", sequence: "考" });
    kit.emitKey({ name: "研", sequence: "研" });
    kit.emitKey({ name: "英", sequence: "英" });
    kit.emitKey({ name: "语", sequence: "语" });
    await kit.waitForKeyListener(2);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "q", sequence: "q" });

    const result = await Promise.race([runPromise, delay(80).then(() => null)]);
    expect(result?.action).toBe("quit");
    expect(result?.state.customLibraries?.[0]?.name).toBe("考研英语");
  });

  test("today elapsed is recomputed from context on every session entry", async () => {
    const kit = fakeKit();
    const runPromise = runOpenTuiAppSession(
      { ...appContext(), todayElapsedMs: 5 * 60 * 1000 },
      {
        kit,
        initialState: {
          ...createOpenTuiInitialState("zh"),
          today_elapsed_ms: 60 * 1000, // 练习前的旧值
        },
      },
    );
    await kit.waitForKeyListener(1);
    kit.emitKey({ name: "q", sequence: "q" });
    const result = await Promise.race([runPromise, delay(80).then(() => null)]);
    expect(result?.state.today_elapsed_ms).toBe(5 * 60 * 1000);
  });
