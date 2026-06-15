import { describe, expect, test } from "bun:test";

import { reduceFlatSettingsItem } from "../src/ui/opentui/settingsReducers";
import { openTuiFlatSettingsItems } from "../src/ui/opentui/settingsItems";
import { goalProgressLines } from "../src/ui/opentui/routeLines";
import { plannedMinutesValue } from "../src/ui/opentui/screens/running";
import {
  activateOpenTuiMenuItem,
  startStagePlanFirstLesson,
  createOpenTuiCompletionState,
  createOpenTuiCodeFilterState,
  createOpenTuiInitialState,
  createOpenTuiSettingsState,
  createOpenTuiStatsState,
  createOpenTuiSummaryState,
  defaultKeyAggregate,
  defaultSessionRecord,
  nextOpenTuiStatsView,
  openTuiMenuItems,
  openTuiRouteEmphasis,
  openTuiRouteLines,
  openTuiRouteTitle,
  type BuildTargetContext,
  type ContentLibrary,
  type EverydayEnglishSettings,
  type OpenTuiAppState,
  type PracticeLesson,
  type PracticePlan,
} from "../src/index";

describe("OpenTUI app model", () => {
  test("planned minutes value only applies to comprehensive lessons", () => {
    expect(
      plannedMinutesValue({
        mix_profile: "comprehensive",
        estimated_minutes: 8,
      } as unknown as PracticeLesson),
    ).toBe(8);
    expect(
      plannedMinutesValue({
        mix_profile: "standalone",
        estimated_minutes: 8,
      } as unknown as PracticeLesson),
    ).toBeUndefined();
    expect(plannedMinutesValue(undefined)).toBeUndefined();
  });

  test("main menu exposes product entries plus the temporary ANSI palette", () => {
    const items = openTuiMenuItems(createOpenTuiInitialState("zh"));

    expect(items.map((item) => item.id)).toEqual([
      "comprehensive",
      "foundation",
      "everyday",
      "programming",
      "code",
      "custom",
      "settings",
      "stats",
      "ansi_palette",
    ]);
    expect(items[0]?.label).toBe("综合练习");
    expect(items.at(-1)?.label).toBe("调试色板");
  });

  test("temporary ANSI palette menu opens the palette route", () => {
    const state = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "ansi_palette",
      appContext(),
    );

    expect(state.route).toEqual({ screen: "ansi_palette" });
    expect(openTuiRouteTitle(state)).toBe("ANSI palette");
    expect(openTuiRouteLines(state)).toContain("Temporary color selection aid");
  });


  test("everyday submenu exposes daily English modules", () => {
    const submenu = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "everyday",
      appContext(),
    );

    expect(openTuiMenuItems(submenu).map((item) => item.id)).toEqual([
      "everyday_words",
      "everyday_sentences",
      "everyday_articles",
      "everyday_word_decomposition",
      "everyday_mix",
    ]);

    const cases = [
      ["everyday_words", "keyloop:module:everyday-english:words-"],
      ["everyday_sentences", "keyloop:module:everyday-english:sentences-"],
      ["everyday_articles", "keyloop:module:everyday-english:articles-"],
      [
        "everyday_word_decomposition",
        "keyloop:module:everyday-english:word-decomposition-",
      ],
      ["everyday_mix", "keyloop:module:everyday-english"],
    ] as const;

    for (const [itemId, sourcePrefix] of cases) {
      const running = activateOpenTuiMenuItem(submenu, itemId, appContext());
      expect(running.route.screen).toBe("running");
      if (running.route.screen !== "running") {
        throw new Error(`expected running route for ${itemId}`);
      }
      expect(running.route.target.source).toContain(sourcePrefix);
    }
  });

  test("foundation submenu exposes standalone foundation courses", () => {
    const submenu = activateOpenTuiMenuItem(
      createOpenTuiInitialState("zh"),
      "foundation",
      appContext(),
    );

    expect(openTuiMenuItems(submenu).map((item) => item.id)).toEqual([
      "foundation_home_row",
      "foundation_top_row",
      "foundation_bottom_row",
      "foundation_number_row",
      "foundation_symbols",
      "foundation_left_hand",
      "foundation_right_hand",
      "foundation_index_fingers",
      "foundation_middle_fingers",
      "foundation_ring_fingers",
      "foundation_pinky_fingers",
      "foundation_horizontal_rolls",
      "foundation_vertical_ladders",
      "foundation_diagonal_crossovers",
      "foundation_letter_combinations",
      "foundation_capitalization",
      "foundation_mix",
    ]);
    expect(openTuiMenuItems(submenu).map((item) => item.label)).toEqual([
      "Home Row",
      "Top Row",
      "Bottom Row",
      "数字行",
      "符号标点",
      "左手专项",
      "右手专项",
      "食指竖向",
      "中指竖向",
      "无名指竖向",
      "小指专项",
      "横向连打",
      "竖向楼梯",
      "斜向过渡",
      "字母组合",
      "大小写基础",
      "基础综合",
    ]);
  });

  test("stage plan emphasizes the plan and length-tier guide lines", () => {
    const state = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "comprehensive",
      appContext(),
    );
    if (state.route.screen !== "stage_plan") {
      throw new Error("expected stage_plan route");
    }

    const lines = openTuiRouteLines(state);
    const emphasized = [...openTuiRouteEmphasis(state)].map((index) => lines[index]);

    expect(emphasized.some((line) => line?.startsWith("Plan:"))).toBe(true);
    expect(emphasized.some((line) => line?.startsWith("Length:"))).toBe(true);
    expect([...openTuiRouteEmphasis(createOpenTuiInitialState("en"))]).toEqual([]);
  });

  test("comprehensive opens the stage plan screen, enter starts stage one", () => {
    const state = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "comprehensive",
      appContext(),
    );

    expect(state.route.screen).toBe("stage_plan");
    if (state.route.screen !== "stage_plan") {
      throw new Error("expected stage_plan route");
    }
    expect(state.route.plan.lessons[0]?.id).toBe("stage:keys:1");
    expect(state.route.diagnosis_lines.length).toBeGreaterThan(0);

    const started = startStagePlanFirstLesson(state);
    expect(started.route.screen).toBe("running");
    if (started.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(started.route.lesson?.module).toBe("foundation_input");
    expect(started.route.target.source).toContain("keyloop:module:foundation-mix");
    expect(started.route.daily_plan?.lessons.length).toBeGreaterThanOrEqual(3);
  });

  test("programming technical long words starts a word breakdown target", () => {
    const submenu = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "programming",
      appContext(),
    );
    const running = activateOpenTuiMenuItem(
      submenu,
      "technical_long_words",
      appContext(),
    );

    expect(running.route.screen).toBe("running");
    if (running.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.route.target.source).toBe(
      "keyloop:module:word-breakdown:serialization",
    );
    expect(running.route.target.text).toContain("serialization serialization");
    expect(running.route.target.text).not.toContain("serial ization");
  });




  test("code submenu exposes specialist levels and starts function target", () => {
    const context = appContext({ library: codeMenuLibrary() });
    const submenu = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "code",
      context,
    );

    expect(openTuiMenuItems(submenu).map((item) => item.id)).toEqual([
      "code_blocks",
      "code_functions",
      "code_file_fragments",
      "code_mix",
    ]);

    const running = activateOpenTuiMenuItem(submenu, "code_functions", context);

    expect(running.route.screen).toBe("running");
    if (running.route.screen !== "running") {
      throw new Error("expected running route");
    }
    expect(running.route.target.source).toStartWith(
      "keyloop:code-specialist:level=function",
    );
    expect(running.route.target.text).toContain("function selectedValue");
  });

  test("standalone code submenu items each load one code snippet", () => {
    const context = appContext({
      library: codeMenuLibrary(),
      random: () => 0,
    });
    const submenu = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "code",
      context,
    );

    for (const itemId of [
      "code_blocks",
      "code_functions",
      "code_file_fragments",
      "code_mix",
    ] as const) {
      const running = activateOpenTuiMenuItem(submenu, itemId, context);

      expect(running.route.screen).toBe("running");
      if (running.route.screen !== "running") {
        throw new Error("expected running route");
      }
      const blocks = running.route.target.code_blocks ?? [];
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.start_line).toBe(0);
      expect(blocks[0]?.line_count).toBe(running.route.target.text.split("\n").length);
    }
  });

  test("running everyday words route shows built-in meanings only for standalone words", () => {
    const context = appContext({
      everydaySettings: dailySettings({ word_count: 4 }),
    });
    const submenu = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "everyday",
      context,
    );
    const standalone = activateOpenTuiMenuItem(submenu, "everyday_words", context);
    const comprehensive: OpenTuiAppState = {
      language: "en",
      route: {
        screen: "running",
        source_item: "comprehensive",
        target: {
          mode: "words",
          text: "today practice",
          source: "test:comprehensive",
        },
      },
    };

    expect(openTuiRouteLines(standalone)).toContain("today: 今天");
    expect(openTuiRouteLines(standalone)).toContain("practice: 练习");
    expect(openTuiRouteLines(comprehensive)).not.toContain("today: 今天");
  });

  test("running route shows live input and metrics when available", () => {
    const state = {
      language: "en",
      route: {
        screen: "running",
        source_item: "comprehensive",
        lesson: lesson("lesson-foundation", "foundation_input", "abc"),
        target: {
          mode: "words",
          text: "abc",
          source: "test:live-running",
        },
        live: {
          input: "ax",
          metrics: {
            wpm: 12.34,
            raw_wpm: 18.75,
            accuracy: 66.67,
            errors: 1,
            backspaces: 2,
          },
        },
      },
    } as unknown as OpenTuiAppState;

    expect(openTuiRouteLines(state)).toEqual([
      "foundation_input",
      "abc",
      "Input: ax",
      "WPM 12.3 | Raw WPM 18.8 | Accuracy 66.7%",
      "Errors 1 | Backspace 2",
    ]);
  });

  test("all visible standalone submenu items start practice targets", () => {
    const cases: Array<[
      Parameters<typeof activateOpenTuiMenuItem>[1],
      Parameters<typeof activateOpenTuiMenuItem>[1],
      string,
    ]> = [
      ["foundation", "foundation_mix", "keyloop:module:foundation-mix"],
      ["foundation", "foundation_home_row", "keyloop:foundation:home-row"],
      ["foundation", "foundation_top_row", "keyloop:foundation:top-row"],
      ["foundation", "foundation_bottom_row", "keyloop:foundation:bottom-row"],
      ["foundation", "foundation_number_row", "keyloop:foundation:number-row"],
      ["foundation", "foundation_symbols", "keyloop:foundation:punctuation-edges"],
      ["foundation", "foundation_left_hand", "keyloop:foundation:left-hand"],
      ["foundation", "foundation_right_hand", "keyloop:foundation:right-hand"],
      ["foundation", "foundation_index_fingers", "keyloop:foundation:index-fingers"],
      ["foundation", "foundation_middle_fingers", "keyloop:foundation:middle-fingers"],
      ["foundation", "foundation_ring_fingers", "keyloop:foundation:ring-fingers"],
      ["foundation", "foundation_pinky_fingers", "keyloop:foundation:pinky-fingers"],
      ["foundation", "foundation_horizontal_rolls", "keyloop:foundation:horizontal-rolls"],
      [
        "foundation",
        "foundation_vertical_ladders",
        "keyloop:foundation:vertical-ladders",
      ],
      [
        "foundation",
        "foundation_diagonal_crossovers",
        "keyloop:foundation:diagonal-crossovers",
      ],
      [
        "foundation",
        "foundation_letter_combinations",
        "keyloop:foundation:english-transitions",
      ],
      ["foundation", "foundation_capitalization", "keyloop:foundation:capitalization"],
      ["everyday", "everyday_words", "keyloop:module:everyday-english:words-"],
      ["everyday", "everyday_sentences", "keyloop:module:everyday-english:sentences-"],
      ["everyday", "everyday_articles", "keyloop:module:everyday-english:articles-"],
      [
        "everyday",
        "everyday_word_decomposition",
        "keyloop:module:everyday-english:word-decomposition-",
      ],
      ["everyday", "everyday_mix", "keyloop:module:everyday-english"],
      [
        "programming",
        "symbols_numbers",
        "keyloop:module:programming-basics:symbols-numbers",
      ],
      [
        "programming",
        "builtin_api",
        "keyloop:module:programming-basics:builtin-api",
      ],
      [
        "programming",
        "programming_terms",
        "keyloop:module:programming-basics:technical-terms",
      ],
      [
        "programming",
        "naming_styles",
        "keyloop:module:programming-basics:naming",
      ],
      [
        "programming",
        "programming_basics_mix",
        "keyloop:module:programming-basics:mix:adaptive",
      ],
      ["code", "code_mix", "keyloop:code-corpus"],
    ];

    for (const [mainItem, submenuItem, sourcePrefix] of cases) {
      const submenu = activateOpenTuiMenuItem(
        createOpenTuiInitialState("en"),
        mainItem,
        appContext(),
      );
      const running = activateOpenTuiMenuItem(submenu, submenuItem, appContext());

      expect(running.route.screen).toBe("running");
      if (running.route.screen !== "running") {
        throw new Error(`expected running route for ${submenuItem}`);
      }
      expect(running.route.source_item).toBe(submenuItem);
      expect(running.route.target.source).toContain(sourcePrefix);
      expect(running.route.target.text.length).toBeGreaterThan(0);
    }
  });

  test("settings route keeps global settings focused on interface and code preferences", () => {
    const settings = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "settings",
      appContext(),
    );

    expect(settings.route.screen).toBe("settings");
    expect(openTuiRouteLines(settings)).toEqual([
      "> Interface language  English",
      "  Typing speed  WPM (words per minute)",
      "  Code language/framework  All code scopes",
      "  Code difficulty  Adaptive",
      "  Code length  Adaptive",
      "  Code indent  2 spaces",
      "  Code semicolons  Always",
      "  Code quotes  Double",
      "  Word pronunciation  off",
      "  Pronunciation volume  100%",
      "  Youdao paid voice  not configured",
      "  Dictionary  Not loaded",
      "  Comprehensive: foundation  On",
      "  Comprehensive: everyday English  On",
      "  Comprehensive: programming basics  On",
      "  Comprehensive: code practice  On",
      "  Goal-driven training  Off",
    ]);
  });

  test("settings code difficulty route renders current option", () => {
    const state = createOpenTuiSettingsState("en", "code_difficulty", {
      codeSettings: { difficulty: "hard", length: "adaptive" },
    });

    expect(openTuiRouteTitle(state)).toBe("Code difficulty");
    expect(openTuiRouteLines(state)).toEqual([
      "1. Adaptive",
      "2. Any",
      "3. Easy",
      "4. Medium",
      "5. Hard  current",
    ]);
  });

  test("settings code style route renders current options", () => {
    const state = createOpenTuiSettingsState("en", "code_style", {
      codeStyleSettings: {
        formatter: "prettier",
        indent_style: "space",
        indent_width: 4,
        semicolons: "never",
        quotes: "single",
        trailing_commas: "all",
      },
    });

    expect(openTuiRouteTitle(state)).toBe("Code style");
    expect(openTuiRouteLines(state)).toEqual([
      "> Indent  4 spaces",
      "  Semicolons  Never",
      "  Quotes  Single",
    ]);
  });


  test("settings everyday route renders current everyday settings", () => {
    const state = createOpenTuiSettingsState("en", "everyday", {
      everydaySettings: {
        word_count: 50,
        sentence_length: "mixed",
        include_phrases: true,
      },
    });

    expect(openTuiRouteTitle(state)).toBe("Everyday English");
    expect(openTuiRouteLines(state)).toEqual([
      "Word count  50",
      "Sentence length  Mixed",
      "Phrases  on",
    ]);
  });

  test("settings code filters render selected option lines", () => {
    const state = createOpenTuiSettingsState("en", "code_filters", {
      codeFilters: createOpenTuiCodeFilterState({
        options: [
          { facet: "language", value: "typescript", count: 120 },
          { facet: "framework", value: "react", count: 30 },
        ],
        selected: [{ facet: "language", value: "typescript" }],
        pinned: [{ facet: "framework", value: "react" }],
      }),
    });

    expect(openTuiRouteTitle(state)).toBe("Code language/framework");
    expect(openTuiRouteLines(state)).toEqual([
      "Search  ",
      "> [ ] framework: react (30)  pinned",
      "  [x] language: typescript (120)",
    ]);
  });

  test("settings code language/framework picker filters options from its search query", () => {
    const state = createOpenTuiSettingsState("en", "menu", {
      codeFilters: createOpenTuiCodeFilterState({
        options: [
          { facet: "language", value: "typescript", count: 120 },
          { facet: "framework", value: "react", count: 30 },
          { facet: "project", value: "zig-demo", count: 2 },
        ],
        selected: [{ facet: "project", value: "zig-demo" }],
        pinned: [{ facet: "project", value: "zig-demo" }],
        query: "zig",
      }),
    });

    const picker = createOpenTuiSettingsState("en", "code_filters", {
      codeFilters: state.codeFilters,
    });

    expect(openTuiRouteLines(state)).toContain("  Code language/framework  zig");
    expect(openTuiRouteLines(state)).not.toContain("  Scope framework: react  off");
    expect(openTuiRouteLines(picker)).toContain("Search  zig");
    expect(openTuiRouteLines(picker)).toContain("No matches");
    expect(openTuiRouteLines(picker)).not.toContain("project: zig-demo");
    expect(openTuiRouteLines(state)).not.toContain(
      "  Scope language: typescript  off",
    );
  });

  test("stats menu renders overview from session records", () => {
    const state = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "stats",
      appContext({
        records: [
          defaultSessionRecord({
            started_at: "2026-06-05T03:00:00.000Z",
            duration_ms: 60_000,
            active_ms: 60_000,
            idle_ms: 0,
            target_len: 160,
            correct_chars: 150,
            typed_len: 160,
            accuracy: 93.75,
            wpm: 40,
            error_count: 4,
            backspace_count: 2,
          }),
          defaultSessionRecord({
            started_at: "2026-06-05T04:00:00.000Z",
            duration_ms: 60_000,
            active_ms: 60_000,
            idle_ms: 0,
            target_len: 100,
            correct_chars: 100,
            typed_len: 100,
            accuracy: 100,
            wpm: 20,
            error_count: 0,
            backspace_count: 1,
          }),
        ],
      }),
    );

    expect(state.route.screen).toBe("stats");
    expect(openTuiRouteTitle(state)).toBe("Stats");
    expect(openTuiRouteLines(state)).toEqual([
      "Overview  2 sessions | 1 days | total 2m | active 2m | idle 0s",
      "Speed  best WPM 40.0 | average WPM 25.0",
      "Quality  average accuracy 96.2% | lowest error rate 0.0%",
      "Errors  total 4 | backspace 3 | recent 06-05 █░░░░░ 2.0m",
      "Focus  word none yet | key none yet",
      "Full plan  Next full practice will stay balanced.",
    ]);
  });

  test("stats route supports all stats pages and next view", () => {
    const records = statsRecords();
    const today = createOpenTuiStatsState("en", records, {
      view: "today",
      now: new Date("2026-06-05T08:00:00.000Z"),
    });
    const comprehensive = createOpenTuiStatsState("en", records, {
      view: "comprehensive",
    });
    const modules = createOpenTuiStatsState("en", records, { view: "modules" });
    const keys = createOpenTuiStatsState("en", records, {
      view: "keys",
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
    });
    const tokens = createOpenTuiStatsState("en", records, { view: "tokens" });
    const code = createOpenTuiStatsState("en", records, { view: "code" });
    const daily = createOpenTuiStatsState("en", records, {
      view: "daily",
      dailyIndex: 0,
    });
    const next = nextOpenTuiStatsView(
      createOpenTuiStatsState("en", records, {
        view: "overview",
        now: new Date("2026-06-05T08:00:00.000Z"),
      }),
    );
    const nextFromToday = nextOpenTuiStatsView(today);
    const nextFromComprehensive = nextOpenTuiStatsView(comprehensive);
    const nextFromModules = nextOpenTuiStatsView(
      createOpenTuiStatsState("en", records, { view: "modules" }),
    );
    const nextFromKeys = nextOpenTuiStatsView(keys);
    const nextFromCode = nextOpenTuiStatsView(code);
    const nextFromDaily = nextOpenTuiStatsView(daily);

    expect(openTuiRouteLines(today).slice(0, 3)).toEqual([
      "Today 2 sessions",
      "Full practice  1 sessions | active 1m | WPM 30.0 | accuracy 93.8%",
      "Standalone  1 sessions | active 1m | WPM 20.0 | accuracy 100.0%",
    ]);
    expect(openTuiRouteLines(comprehensive).slice(0, 2)).toEqual([
      "Full practice runs",
      "run-1  1 groups | 1 modules | active 1m | WPM 30.0",
    ]);
    expect(openTuiRouteLines(modules).slice(0, 3)).toEqual([
      "Next driver  Programming basics | error 2.5% | accuracy 93.8%",
      "",
      "Programming basics  1 sessions | active 1m | WPM 30.0 | error 2.5%",
    ]);
    expect(openTuiRouteLines(keys)[0]).toBe("Key stats  sort: slowest avg");
    expect(openTuiRouteLines(keys)[2]).toContain("[");
    expect(openTuiRouteLines(tokens)).toEqual(
      expect.arrayContaining([
        "Token stats",
        "High-error words/chunks  pending(2)",
        "High-error symbols  =>(2)",
      ]),
    );
    expect(openTuiRouteLines(code)[0]).toBe(
      "Code practice  1 sessions | active 1m | WPM 20.0 | accuracy 100.0%",
    );
    expect(openTuiRouteLines(daily)[0]).toBe(
      "Date 2026-06-05  (1/1)  Left/Right switches date",
    );
    expect(next.route.screen).toBe("stats");
    if (next.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(next.route.view).toBe("today");
    expect(openTuiRouteLines(next)[0]).toBe("Today 2 sessions");
    expect(nextFromToday.route.screen).toBe("stats");
    if (nextFromToday.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(nextFromToday.route.view).toBe("comprehensive");
    expect(nextFromComprehensive.route.screen).toBe("stats");
    if (nextFromComprehensive.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(nextFromComprehensive.route.view).toBe("modules");
    expect(nextFromModules.route.screen).toBe("stats");
    if (nextFromModules.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(nextFromModules.route.view).toBe("keys");
    expect(nextFromKeys.route.screen).toBe("stats");
    if (nextFromKeys.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(nextFromKeys.route.view).toBe("tokens");
    expect(nextFromCode.route.screen).toBe("stats");
    if (nextFromCode.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(nextFromCode.route.view).toBe("daily");
    expect(nextFromDaily.route.screen).toBe("stats");
    if (nextFromDaily.route.screen !== "stats") {
      throw new Error("expected stats route");
    }
    expect(nextFromDaily.route.view).toBe("overview");
  });

  test("completion state exposes lesson metrics and next lesson copy", () => {
    const record = defaultSessionRecord({
      daily_run_id: "20260605-1-test",
      mode: "words",
      module: "programming_basics",
      wpm: 30,
      raw_wpm: 32,
      accuracy: 93.75,
      error_count: 4,
      backspace_count: 2,
    });
    const state = createOpenTuiCompletionState("en", record, {
      nextLesson: lesson("lesson-everyday", "everyday_english", "next text"),
      sourceItem: "comprehensive",
      target: {
        mode: "words",
        text: "return value",
        source: "test:complete",
      },
      live: {
        input: "return value",
        metrics: {
          wpm: 30,
          raw_wpm: 32,
          accuracy: 93.75,
          errors: 4,
          backspaces: 2,
        },
      },
    });

    expect(state.route.screen).toBe("complete");
    if (state.route.screen !== "complete") {
      throw new Error("expected complete route");
    }
    expect(state.route.target?.text).toBe("return value");
    expect(state.route.live?.input).toBe("return value");
    expect(state.route.result_visible).toBe(true);
    expect(openTuiRouteTitle(state)).toBe("Lesson complete");
    expect(openTuiRouteLines(state)).toEqual([
      "Mode words | Module programming_basics",
      "WPM 30.0 | Raw WPM 32.0 | Accuracy 93.8%",
      "Errors 4 | Backspace 2",
      "Next: everyday_english",
    ]);
  });

  test("summary state aggregates completed records", () => {
    const state = createOpenTuiSummaryState("en", [
      defaultSessionRecord({
        active_ms: 60_000,
        duration_ms: 60_000,
        correct_chars: 150,
        typed_len: 160,
        accuracy: 93.75,
        error_count: 4,
        backspace_count: 2,
      }),
      defaultSessionRecord({
        active_ms: 60_000,
        duration_ms: 60_000,
        correct_chars: 100,
        typed_len: 100,
        accuracy: 100,
        error_count: 0,
        backspace_count: 1,
      }),
    ]);

    expect(state.route.screen).toBe("summary");
    expect(openTuiRouteTitle(state)).toBe("Daily summary");
    expect(openTuiRouteLines(state)).toEqual([
      "2 sessions | active 2m | WPM 25.0 | accuracy 96.2%",
      "Errors 4 | Backspace 3",
    ]);
  });
});

function appContext(
  overrides: Partial<BuildTargetContext> = {},
): BuildTargetContext {
  return {
    ...baseAppContext(),
    ...overrides,
  };
}

function baseAppContext(): BuildTargetContext {
  return {
    records: [],
    plan: testPlan(),
    library: testLibrary(),
  };
}

function statsRecords() {
  return [
    defaultSessionRecord({
      started_at: "2026-06-05T03:00:00.000Z",
      mode: "words",
      daily_run_id: "run-1",
      module: "programming_basics",
      duration_ms: 60_000,
      active_ms: 60_000,
      idle_ms: 0,
      target_len: 160,
      correct_chars: 150,
      typed_len: 160,
      accuracy: 93.75,
      wpm: 40,
      error_count: 4,
      backspace_count: 2,
      token_stats: [
        {
          token: "pending",
          kind: "word",
          start_delay_ms: 100,
          duration_ms: 400,
          errors: 2,
        },
      ],
    }),
    defaultSessionRecord({
      started_at: "2026-06-05T04:00:00.000Z",
      mode: "code",
      module: "code_practice",
      duration_ms: 60_000,
      active_ms: 60_000,
      idle_ms: 0,
      target_len: 100,
      correct_chars: 100,
      typed_len: 100,
      accuracy: 100,
      wpm: 20,
      error_count: 1,
      backspace_count: 1,
      token_stats: [
        {
          token: "=>",
          kind: "symbol",
          start_delay_ms: 100,
          duration_ms: 500,
          errors: 2,
        },
      ],
    }),
  ];
}

function testPlan(): PracticePlan {
  return {
    focus_words: ["selected", "pending"],
    focus_symbols: ["=>", "!=="],
    focus_code: ["selected"],
    focus_keys: [";"],
    advice: [],
    recommended_mode: "mixed",
    has_recent_history: true,
  };
}

function lesson(
  id: string,
  module: PracticeLesson["module"],
  text: string,
): PracticeLesson {
  return {
    id,
    kind: module === "foundation_input" ? "foundation" : "common_words",
    module,
    category: module === "foundation_input" ? "foundation_mix" : "everyday_mix",
    mix_profile: "comprehensive",
    estimated_minutes: 4,
    target: {
      mode: "words",
      text,
      source: `test:${id}`,
    },
    reason_zh: "",
    reason_en: "",
  };
}

function testLibrary(): ContentLibrary {
  const foundationDrillIds = [
    "home-row",
    "top-row",
    "bottom-row",
    "number-row",
    "punctuation-edges",
    "left-hand",
    "right-hand",
    "index-fingers",
    "middle-fingers",
    "ring-fingers",
    "pinky-fingers",
    "horizontal-rolls",
    "vertical-ladders",
    "diagonal-crossovers",
    "english-transitions",
    "capitalization",
  ];
  return {
    warmup: ["asdf jkl;", "fdsa ;lkj", "a;sldkfj", "jkl; asdf"],
    foundation_drills: foundationDrillIds.map((id) => ({
      id,
      title_zh: id,
      title_en: id,
      hint_zh: "",
      hint_en: "",
      items: [`${id} line 1`, `${id} line 2`, `${id} line 3`],
    })),
    word_chunks: ["per form ance", "select ed pending"],
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
      ],
    },
    everyday_words: {
      sources: [],
      entries: [
        {
          word: "today",
          rank: 100,
          range: "200",
          level: "high_school",
          translation_zh: "今天",
          source_id: "test",
        },
        {
          word: "practice",
          rank: 500,
          range: "1000",
          level: "cet4",
          translation_zh: "练习",
          source_id: "test",
        },
      ],
    },
    everyday_sentences: {
      sources: [],
      entries: [
        {
          text: "Today we practice.",
          translation_zh: "今天我们练习。",
          level: "cet4",
          length: "short",
          source_id: "test",
          source_title: "Test sentences",
        },
      ],
    },
    everyday_articles: {
      sources: [],
      entries: [
        {
          title: "Practice",
          level: "cet4",
          length: "short",
          source_id: "test",
          paragraphs: [
            {
              text: "Practice makes typing easier.",
              translation_zh: "练习会让打字更容易。",
            },
          ],
        },
      ],
    },
    everyday_word_decomposition: {
      sources: [],
      entries: [
        {
          word: "practice",
          parts: ["prac", "tice"],
          translation_zh: "练习",
          level: "cet4",
          source_id: "test",
        },
      ],
    },
    programming_words: [
      "enabled",
      "visible",
      "archived",
      "configuration",
      "initialization",
      "authorization",
      "authentication",
      "compatibility",
      "serialization",
      "synchronization",
      "subscription",
      "preference",
      "receipt",
      "variant",
      "registry",
      "release",
    ].map((word) => ({ word, note_zh: "" })),
    code_snippets: [
      {
        language: "typescript",
        framework: "react",
        project: "test",
        level: "function",
        source: "test",
        text: "function selectedValue() {\n  return selected;\n}",
      },
    ],
    long_words: [
      {
        word: "serialization",
        parts: ["serial", "ization"],
        aliases: [],
        domain: "programming",
        tier: 3,
        source_id: "test",
      },
    ],
  };
}

function dailySettings(
  overrides: Partial<EverydayEnglishSettings> = {},
): EverydayEnglishSettings {
  return {
    word_range: "1000",
    word_count: 20,
    word_repeats: 1,
    sentence_level: "cet4",
    sentence_length: "mixed",
    sentence_count: 5,
    article_level: "cet4",
    article_length: "short",
    decomposition_level: "cet4",
    decomposition_word_count: 10,
    decomposition_part_repeats: 3,
    decomposition_word_repeats: 3,
    include_phrases: true,
    ...overrides,
  };
}

function codeMenuLibrary(): ContentLibrary {
  return {
    ...testLibrary(),
    code_snippets: [
      {
        language: "typescript",
        framework: "react",
        project: "test",
        level: "block",
        difficulty: "easy",
        source: "test:block",
        text: "if (selected) {\n  return selected;\n}",
      },
      {
        language: "typescript",
        framework: "react",
        project: "test",
        level: "function",
        difficulty: "medium",
        source: "test:function",
        text: "function selectedValue() {\n  return selected;\n}",
      },
      {
        language: "typescript",
        framework: "react",
        project: "test",
        level: "file",
        difficulty: "hard",
        source: "test:file",
        text: "import { selected } from './selected';\n\nexport const value = selected;\n",
      },
      {
        language: "rust",
        framework: "none",
        project: "test",
        level: "block",
        difficulty: "easy",
        source: "test:rust-block",
        text: "if selected {\n    return selected;\n}",
      },
    ],
  };
}

describe("custom library menus", () => {
  const sampleLibrary = {
    version: 1 as const,
    slug: "kaoyan",
    name: "考研英语",
    created_at: "2026-06-11T00:00:00.000Z",
    words: [
      { id: "w1", text: "abandon", kind: "word" as const, meaning_zh: "v. 放弃", source: "dict" as const },
      { id: "w2", text: "machine learning", kind: "phrase" as const, source: "manual" as const },
    ],
    sentences: [{ id: "s1", text: "Hello there.", translation_zh: "你好。" }],
    articles: [],
  };

  function libraryState(): OpenTuiAppState {
    const base = createOpenTuiInitialState("zh", { customLibraries: [sampleLibrary] });
    return { ...base, route: { screen: "submenu", menu: "custom", selected_index: 0 } };
  }

  test("custom submenu lists libraries plus create and manage entries", () => {
    const items = openTuiMenuItems(libraryState());
    expect(items.map((item) => item.id)).toEqual([
      "library_open_kaoyan",
      "library_new",
      "library_manage",
    ]);
    expect(items[0]?.label).toBe("考研英语");
  });

  test("opening a library shows per-kind practice items, empty kinds hidden", () => {
    const opened = activateOpenTuiMenuItem(libraryState(), "library_open_kaoyan", appContext());
    expect(opened.route).toMatchObject({ screen: "library_menu", slug: "kaoyan" });
    const items = openTuiMenuItems(opened);
    expect(items.map((item) => item.id)).toEqual([
      "library_kind_kaoyan:words",
      "library_kind_kaoyan:phrases",
      "library_kind_kaoyan:sentences",
      "library_kind_kaoyan:mix",
    ]);
  });

  test("selecting a kind starts practice from library content", () => {
    const opened = activateOpenTuiMenuItem(libraryState(), "library_open_kaoyan", appContext());
    const running = activateOpenTuiMenuItem(opened, "library_kind_kaoyan:words", appContext());
    expect(running.route.screen).toBe("running");
    if (running.route.screen === "running") {
      expect(running.route.target.text).toContain("abandon");
      expect(running.route.target.source).toBe("keyloop:library:kaoyan:words");
    }
  });

  test("create and manage entries route to their screens", () => {
    const create = activateOpenTuiMenuItem(libraryState(), "library_new", appContext());
    expect(create.route).toEqual({ screen: "library_create", name: "" });
    const manage = activateOpenTuiMenuItem(libraryState(), "library_manage", appContext());
    expect(manage.route).toEqual({ screen: "library_manage", selected_index: 0 });
  });
});

describe("comprehensive module toggles", () => {
  const flatItem = { kind: "module_code" as const, label: "", value: "" };

  test("toggling a module off removes it from enabledModules", () => {
    const base = createOpenTuiInitialState("zh");
    const state = {
      ...base,
      route: { screen: "settings" as const, view: "menu" as const, selected_index: 0 },
    };
    const result = reduceFlatSettingsItem(state, flatItem, 0, 1, {
      ...appContext(),
      language: "zh",
    });
    expect(result.state.enabledModules).toEqual([
      "foundation_input",
      "everyday_english",
      "programming_basics",
    ]);
  });

  test("last enabled module cannot be turned off", () => {
    const base = createOpenTuiInitialState("zh");
    const state = {
      ...base,
      enabledModules: ["code_practice" as const],
      route: { screen: "settings" as const, view: "menu" as const, selected_index: 0 },
    };
    const result = reduceFlatSettingsItem(state, flatItem, 0, 1, {
      ...appContext(),
      language: "zh",
    });
    expect(result.state.enabledModules).toEqual(["code_practice"]);
  });

  test("disabled modules flow into the stage plan", () => {
    const base = createOpenTuiInitialState("zh");
    const state = {
      ...base,
      enabledModules: ["foundation_input" as const, "everyday_english" as const],
    };
    const planState = activateOpenTuiMenuItem(state, "comprehensive", appContext());
    if (planState.route.screen !== "stage_plan") {
      throw new Error("expected stage_plan route");
    }
    const forms = planState.route.plan.lessons.map((lesson) => lesson.id.split(":")[1]);
    expect(forms).not.toContain("code");
  });
});

describe("main goal settings items", () => {
  test("shows the goal toggle off and hides detail items when no goal is set", () => {
    const items = openTuiFlatSettingsItems(createOpenTuiInitialState("zh"));
    expect(items.find((item) => item.kind === "goal_enabled")?.value).toBe("关");
    expect(items.find((item) => item.kind === "goal_form")).toBeUndefined();
    expect(items.find((item) => item.kind === "goal_target_wpm")).toBeUndefined();
    expect(items.find((item) => item.kind === "goal_deadline")).toBeUndefined();
  });

  test("shows form/target/deadline detail items when a goal is set", () => {
    const state = {
      ...createOpenTuiInitialState("zh"),
      mainGoal: {
        form: "code" as const,
        target_wpm: 50,
        deadline: "2026-09-14",
        created_at: "2026-06-15T00:00:00Z",
      },
    };
    const items = openTuiFlatSettingsItems(state);
    expect(items.find((item) => item.kind === "goal_enabled")?.value).toBe("开");
    expect(items.find((item) => item.kind === "goal_form")?.value).toBe("代码");
    expect(items.find((item) => item.kind === "goal_target_wpm")?.value).toBe("50");
    expect(items.find((item) => item.kind === "goal_deadline")?.value).toBe("2026-09-14");
  });
});

describe("main goal settings reducer", () => {
  const NOW = new Date("2026-06-15T00:00:00.000Z");
  const settingsState = () => ({
    ...createOpenTuiInitialState("zh"),
    route: { screen: "settings" as const, view: "menu" as const, selected_index: 0 },
  });
  const goalItem = (
    kind: "goal_enabled" | "goal_form" | "goal_target_wpm" | "goal_deadline",
  ) => ({ kind, label: "", value: "" }) as const;
  const ctx = () => ({ ...appContext(), language: "zh" as const, now: NOW });
  const goalWith = (overrides: Record<string, unknown>) => ({
    ...settingsState(),
    mainGoal: {
      form: "code" as const,
      target_wpm: 35,
      deadline: "2026-09-13",
      created_at: "2026-06-15T00:00:00.000Z",
      ...overrides,
    },
  });

  test("enabling the goal creates a default code goal anchored at now", () => {
    const result = reduceFlatSettingsItem(settingsState(), goalItem("goal_enabled"), 0, 1, ctx());
    expect(result.state.mainGoal).toEqual({
      form: "code",
      target_wpm: 35,
      deadline: "2026-09-13",
      created_at: "2026-06-15T00:00:00.000Z",
    });
  });

  test("disabling an existing goal clears it", () => {
    const result = reduceFlatSettingsItem(goalWith({}), goalItem("goal_enabled"), 0, 1, ctx());
    expect(result.state.mainGoal).toBeUndefined();
  });

  test("cycling the goal form resets target and anchor but keeps the deadline", () => {
    const state = goalWith({ created_at: "2026-05-01T00:00:00.000Z" });
    const result = reduceFlatSettingsItem(state, goalItem("goal_form"), 1, 1, ctx());
    expect(result.state.mainGoal?.form).toBe("keys");
    expect(result.state.mainGoal?.target_wpm).toBe(45);
    expect(result.state.mainGoal?.created_at).toBe("2026-06-15T00:00:00.000Z");
    expect(result.state.mainGoal?.deadline).toBe("2026-09-13");
  });

  test("cycling target wpm steps by 5 and clamps at the lower bound", () => {
    expect(
      reduceFlatSettingsItem(goalWith({ target_wpm: 35 }), goalItem("goal_target_wpm"), 1, 1, ctx())
        .state.mainGoal?.target_wpm,
    ).toBe(40);
    expect(
      reduceFlatSettingsItem(goalWith({ target_wpm: 35 }), goalItem("goal_target_wpm"), 1, -1, ctx())
        .state.mainGoal?.target_wpm,
    ).toBe(30);
    expect(
      reduceFlatSettingsItem(goalWith({ target_wpm: 10 }), goalItem("goal_target_wpm"), 1, -1, ctx())
        .state.mainGoal?.target_wpm,
    ).toBe(10);
  });

  test("cycling deadline moves through day presets measured from now", () => {
    // deadline 2026-09-13 距 now 正好 90 天（档位 index 2）；+1 → 120 天 → now+120d
    const result = reduceFlatSettingsItem(goalWith({}), goalItem("goal_deadline"), 1, 1, ctx());
    expect(result.state.mainGoal?.deadline).toBe("2026-10-13");
  });
});

describe("goalProgressLines", () => {
  const goal = {
    form: "code" as const,
    target_wpm: 50,
    deadline: "2026-09-14",
    created_at: "2026-06-15T00:00:00.000Z",
  };

  test("on_track shows current→target, ETA, and ideal daily minutes", () => {
    const lines = goalProgressLines(
      goal,
      { phase: "on_track", daily_minutes: 16, current_wpm: 19, projected_date: "2026-09-05" },
      "zh",
    );
    expect(lines[0]).toBe("目标:代码 19→50 · 预计 9/5 · 理想每日 ~16 分");
  });

  test("cold_start tells the user to keep practicing for a precise plan", () => {
    const lines = goalProgressLines(
      goal,
      { phase: "cold_start", daily_minutes: 20, current_wpm: 19 },
      "zh",
    );
    expect(lines[0]).toBe("目标:代码 19→50 · 数据积累中，先练满 7 天给精准计划 · 暂按 ~20 分");
  });

  test("unreachable shows projected wpm and offers ways out", () => {
    const lines = goalProgressLines(
      goal,
      {
        phase: "unreachable",
        daily_minutes: 60,
        current_wpm: 19,
        projected_wpm_at_deadline: 38,
        alternatives: { lower_target_wpm: 38 },
      },
      "zh",
    );
    expect(lines[0]).toBe("目标:代码 19→50 · 按当前节奏期限内约到 38 · 可延期/加量/调目标");
  });

  test("achieved celebrates reaching the target", () => {
    const lines = goalProgressLines(
      goal,
      { phase: "achieved", daily_minutes: 10, current_wpm: 52 },
      "zh",
    );
    expect(lines[0]).toBe("目标:代码 已达成 50 🎉");
  });
});

describe("stage plan goal progress line", () => {
  test("renders the goal line at the very top when a goal is set", () => {
    const goal = {
      form: "code" as const,
      target_wpm: 50,
      deadline: "2026-09-14",
      created_at: "2026-06-15T00:00:00.000Z",
    };
    const state = { ...createOpenTuiInitialState("zh"), mainGoal: goal };
    const planState = activateOpenTuiMenuItem(state, "comprehensive", appContext());
    if (planState.route.screen !== "stage_plan") {
      throw new Error("expected stage_plan route");
    }
    expect(openTuiRouteLines(planState)[0]?.startsWith("目标:代码")).toBe(true);
  });

  test("omits the goal line when no goal is set", () => {
    const planState = activateOpenTuiMenuItem(
      createOpenTuiInitialState("zh"),
      "comprehensive",
      appContext(),
    );
    if (planState.route.screen !== "stage_plan") {
      throw new Error("expected stage_plan route");
    }
    expect(openTuiRouteLines(planState).some((line) => line.startsWith("目标:"))).toBe(false);
  });
});
